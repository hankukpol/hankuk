import Link from "next/link";
import { AdminRole, EnrollmentStatus, Prisma } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ActiveStudentRow = Prisma.StudentGetPayload<{
  select: {
    examNumber: true;
    name: true;
    phone: true;
    courseEnrollments: {
      select: {
        id: true;
        cohort: { select: { name: true } };
        product: { select: { name: true } };
        specialLecture: { select: { name: true } };
        contract: { select: { id: true; privacyConsentedAt: true } };
      };
    };
  };
}>;

type PrivacyAuditRow = Prisma.AuditLogGetPayload<{
  select: {
    id: true;
    action: true;
    targetType: true;
    targetId: true;
    createdAt: true;
    admin: { select: { name: true; email: true } };
  };
}>;

function pct(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildCourseName(enrollment: ActiveStudentRow["courseEnrollments"][number]) {
  return enrollment.cohort?.name ?? enrollment.product?.name ?? enrollment.specialLecture?.name ?? "수강 과정";
}

function buildCsv(rows: Array<{ examNumber: string; name: string; phone: string; courseSummary: string; consentStatus: string; consentedAt: string }>) {
  const header = ["학번", "이름", "연락처", "수강내역", "법적 동의 상태", "동의 기록 시각"];
  const escape = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return [header, ...rows.map((row) => [row.examNumber, row.name, row.phone, row.courseSummary, row.consentStatus, row.consentedAt])]
    .map((cells) => cells.map(escape).join(","))
    .join("\r\n");
}

export default async function PrivacyCompliancePage() {
  const context = await requireAdminContext(AdminRole.DIRECTOR);
  const academyId = resolveVisibleAcademyId(context);
  const prisma = getPrisma();
  const now = new Date();

  const months: { label: string; year: number; month: number }[] = [];
  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    months.push({
      label: `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    });
  }
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const activeEnrollmentWhere = applyAcademyScope(
    { status: EnrollmentStatus.ACTIVE },
    academyId,
  ) as Prisma.CourseEnrollmentWhereInput;

  const [activeStudents, recentConsentRecords, rawPrivacyAuditLogs] = await Promise.all([
    prisma.student.findMany({
      where: {
        courseEnrollments: { some: activeEnrollmentWhere },
      },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        courseEnrollments: {
          where: activeEnrollmentWhere,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            cohort: { select: { name: true } },
            product: { select: { name: true } },
            specialLecture: { select: { name: true } },
            contract: { select: { id: true, privacyConsentedAt: true } },
          },
        },
      },
      orderBy: { examNumber: "asc" },
    }) as Promise<ActiveStudentRow[]>,
    prisma.courseContract.findMany({
      where: {
        privacyConsentedAt: { gte: sixMonthsAgo },
        enrollment: { is: activeEnrollmentWhere },
      },
      select: {
        id: true,
        privacyConsentedAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [{ action: { contains: "PRIVACY" } }, { action: { contains: "CONSENT" } }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        admin: { select: { name: true, email: true } },
      },
    }) as Promise<PrivacyAuditRow[]>,
  ]);

  const activeContractIds = new Set(
    activeStudents.flatMap((student) =>
      student.courseEnrollments
        .map((enrollment) => enrollment.contract?.id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const privacyAuditLogs = rawPrivacyAuditLogs
    .filter((log) => log.targetType !== "CourseContract" || activeContractIds.has(log.targetId))
    .slice(0, 30);

  const missingConsentStudents = activeStudents.filter((student) =>
    student.courseEnrollments.some((enrollment) => !enrollment.contract?.privacyConsentedAt),
  );
  const consentCompleteStudents = activeStudents.filter((student) =>
    student.courseEnrollments.every((enrollment) => Boolean(enrollment.contract?.privacyConsentedAt)),
  );

  const monthlyMap = new Map<string, number>();
  for (const record of recentConsentRecords) {
    if (!record.privacyConsentedAt) continue;
    const date = new Date(record.privacyConsentedAt);
    const key = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
  }

  const chartData = months.map((month) => ({
    label: month.label,
    count: monthlyMap.get(month.label) ?? 0,
  }));
  const maxChartValue = Math.max(1, ...chartData.map((item) => item.count));
  const consentRate = pct(consentCompleteStudents.length, activeStudents.length);

  const csvRows = activeStudents.map((student) => {
    const courseSummary = student.courseEnrollments.map((enrollment) => buildCourseName(enrollment)).join(" / ");
    const consentTimes = student.courseEnrollments
      .map((enrollment) => enrollment.contract?.privacyConsentedAt)
      .filter((value): value is Date => Boolean(value));
    const latestConsent = consentTimes.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    return {
      examNumber: student.examNumber,
      name: student.name,
      phone: student.phone ?? "",
      courseSummary,
      consentStatus: student.courseEnrollments.every((enrollment) => Boolean(enrollment.contract?.privacyConsentedAt))
        ? "완료"
        : "기록 필요",
      consentedAt: latestConsent ? formatDateTime(latestConsent) : "",
    };
  });

  const csvData = `\uFEFF${buildCsv(csvRows)}`;

  return (
    <div className="p-8 sm:p-10">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin" className="transition hover:text-ink">
          홈
        </Link>
        <span>/</span>
        <Link href="/admin/settings" className="transition hover:text-ink">
          설정
        </Link>
        <span>/</span>
        <span className="text-ink">개인정보 보호 현황</span>
      </nav>

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        개인정보 보호
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">개인정보 보호 현황</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            활성 수강 계약서 기준으로 필수 개인정보 수집·이용 동의 기록을 모니터링합니다. 알림 수신 동의와 분리된 법적 동의 현황입니다.
          </p>
        </div>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvData)}`}
          download="privacy_consent_status.csv"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
        >
          활성 수강생 동의 현황 CSV
        </a>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="활성 수강생" value={`${activeStudents.length.toLocaleString()}명`} />
        <StatCard label="동의 기록 완료" value={`${consentCompleteStudents.length.toLocaleString()}명`} accent="forest" />
        <StatCard label="동의 기록 필요" value={`${missingConsentStudents.length.toLocaleString()}명`} accent="amber" />
        <StatCard label="처리율" value={`${consentRate}%`} accent="ember" />
      </div>

      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">활성 수강생 동의 커버리지</h2>
          <span className="text-sm font-semibold text-forest">{consentRate}%</span>
        </div>
        <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-mist">
          <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${consentRate}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate">
          <span>동의 완료 {consentCompleteStudents.length.toLocaleString()}명</span>
          <span>기록 필요 {missingConsentStudents.length.toLocaleString()}명</span>
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold">월별 동의 기록 추이 (최근 6개월)</h2>
        <p className="mt-1 text-xs text-slate">계약서의 privacyConsentedAt 기준</p>
        <div className="mt-6 flex h-40 items-end gap-3">
          {chartData.map((item) => {
            const percent = (item.count / maxChartValue) * 100;
            return (
              <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-xs font-semibold text-ink">{item.count}</div>
                <div className="flex h-28 w-full items-end rounded-2xl bg-mist/60 px-2 pb-2">
                  <div className="w-full rounded-xl bg-forest transition-all" style={{ height: `${percent}%` }} />
                </div>
                <div className="text-[11px] text-slate">{item.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">동의 기록 필요 수강생</h2>
            <p className="mt-1 text-xs text-slate">활성 수강 중 계약서 필수 동의 기록이 비어 있는 학생</p>
          </div>
          <Link href="/admin/enrollments/contracts?consent=missing" className="text-sm font-medium text-ember transition hover:text-ember/80">
            계약서 허브에서 보기 →
          </Link>
        </div>

        {missingConsentStudents.length === 0 ? (
          <div className="mt-5 rounded-[20px] border border-dashed border-forest/20 bg-forest/5 px-5 py-8 text-center text-sm text-forest">
            현재 지점 기준으로 필수 동의 기록이 누락된 활성 수강생이 없습니다.
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[20px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/70 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-ink">학생</th>
                  <th className="px-4 py-3 font-semibold text-ink">연락처</th>
                  <th className="px-4 py-3 font-semibold text-ink">누락 수강내역</th>
                  <th className="px-4 py-3 font-semibold text-ink">바로가기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {missingConsentStudents.slice(0, 50).map((student) => {
                  const missingEnrollments = student.courseEnrollments.filter(
                    (enrollment) => !enrollment.contract?.privacyConsentedAt,
                  );
                  const firstMissingEnrollment = missingEnrollments[0];

                  return (
                    <tr key={student.examNumber}>
                      <td className="px-4 py-3">
                        <Link href={`/admin/students/${student.examNumber}`} className="font-semibold text-ink transition hover:text-ember">
                          {student.name}
                        </Link>
                        <div className="mt-1 text-xs text-slate">{student.examNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-slate">{student.phone ?? "-"}</td>
                      <td className="px-4 py-3 text-slate">{missingEnrollments.map((enrollment) => buildCourseName(enrollment)).join(" / ")}</td>
                      <td className="px-4 py-3">
                        {firstMissingEnrollment ? (
                          <Link
                            href={`/admin/enrollments/${firstMissingEnrollment.id}/contract`}
                            className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                          >
                            계약서 열기
                          </Link>
                        ) : (
                          <span className="text-xs text-slate">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">개인정보 처리 감사 로그</h2>
            <p className="mt-1 text-xs text-slate">최근 {privacyAuditLogs.length}건</p>
          </div>
        </div>

        {privacyAuditLogs.length === 0 ? (
          <div className="mt-5 rounded-[20px] border border-dashed border-ink/10 px-5 py-8 text-center text-sm text-slate">
            개인정보 관련 감사 로그가 없습니다.
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[20px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/70 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-ink">시각</th>
                  <th className="px-4 py-3 font-semibold text-ink">작업</th>
                  <th className="px-4 py-3 font-semibold text-ink">담당자</th>
                  <th className="px-4 py-3 font-semibold text-ink">대상</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {privacyAuditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-slate">{formatDateTime(log.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-ink">{log.action}</td>
                    <td className="px-4 py-3 text-slate">{log.admin.name ?? log.admin.email}</td>
                    <td className="px-4 py-3 text-slate">{log.targetType} / {log.targetId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent = "slate" }: { label: string; value: string; accent?: "slate" | "forest" | "amber" | "ember" }) {
  const accentClass =
    accent === "forest"
      ? "text-forest border-forest/20 bg-forest/5"
      : accent === "amber"
        ? "text-amber-700 border-amber-200 bg-amber-50"
        : accent === "ember"
          ? "text-ember border-ember/20 bg-ember/5"
          : "text-ink border-ink/10 bg-white";

  return (
    <div className={`rounded-[28px] border p-6 shadow-panel ${accentClass}`}>
      <p className="text-xs font-medium uppercase tracking-widest text-slate">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
