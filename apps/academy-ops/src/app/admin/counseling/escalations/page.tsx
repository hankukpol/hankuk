import Link from "next/link";
import { AdminRole, StudentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EscalationButton } from "./escalation-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<StudentStatus, string> = {
  NORMAL: "정상",
  WARNING_1: "경고 1단계",
  WARNING_2: "경고 2단계",
  DROPOUT: "제적",
};

const STATUS_BADGE: Record<StudentStatus, string> = {
  NORMAL: "border-slate-200 bg-slate-50 text-slate-600",
  WARNING_1: "border-amber-200 bg-amber-50 text-amber-700",
  WARNING_2: "border-orange-200 bg-orange-50 text-orange-700",
  DROPOUT: "border-red-200 bg-red-50 text-red-600",
};

const ESCALATION_PREFIX = "[ESCALATED]";

function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function EscalationsPage() {
  const context = await requireAdminContext(AdminRole.MANAGER);
  const prisma = getPrisma();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Students at WARNING_2 or DROPOUT
  const riskStudents = await prisma.student.findMany({
    where: {
      currentStatus: { in: [StudentStatus.WARNING_2, StudentStatus.DROPOUT] },
      isActive: true,
    },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      currentStatus: true,
      statusUpdatedAt: true,
      counselingRecords: {
        orderBy: { counseledAt: "desc" },
        take: 5,
        select: {
          id: true,
          counseledAt: true,
          counselorName: true,
          content: true,
        },
      },
    },
    orderBy: { statusUpdatedAt: "asc" },
  });

  type StudentWithEscalation = {
    examNumber: string;
    name: string;
    phone: string | null;
    currentStatus: StudentStatus;
    daysInWarning: number | null;
    lastCounselingDate: Date | null;
    lastCounselorName: string | null;
    hasRecentEscalation: boolean;
    lastEscalationContent: string | null;
  };

  const processed: StudentWithEscalation[] = riskStudents.map((s) => {
    const latestRecord = s.counselingRecords[0] ?? null;
    const recentEscalation = s.counselingRecords.find(
      (r) => r.content.startsWith(ESCALATION_PREFIX) && r.counseledAt >= thirtyDaysAgo,
    );
    const hasRecentEscalation = recentEscalation !== undefined;
    const daysInWarning = s.statusUpdatedAt ? diffDays(s.statusUpdatedAt, now) : null;

    return {
      examNumber: s.examNumber,
      name: s.name,
      phone: s.phone,
      currentStatus: s.currentStatus,
      daysInWarning,
      lastCounselingDate: latestRecord?.counseledAt ?? null,
      lastCounselorName: latestRecord?.counselorName ?? null,
      hasRecentEscalation,
      lastEscalationContent: recentEscalation?.content ?? null,
    };
  });

  const pending = processed.filter((s) => !s.hasRecentEscalation);
  const inProgress = processed.filter((s) => s.hasRecentEscalation);

  const counselorName = context.adminUser.name;

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-700">
          위험 관리
        </div>
        <h1 className="mt-5 text-3xl font-semibold">위험 학생 에스컬레이션</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          경고 2단계 및 제적 상태 학생을 관리합니다. 최근 30일 이내 에스컬레이션 기록이 없는 학생은
          에스컬레이션 대상으로 표시됩니다.
        </p>
        <div className="mt-4">
          <Link
            prefetch={false}
            href="/admin/counseling"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate transition hover:text-ember"
          >
            <span>←</span>
            <span>면담 허브로</span>
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <article
          className={`rounded-[28px] border p-6 ${
            riskStudents.length > 0 ? "border-red-200 bg-red-50" : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">위험 학생 총계</p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              riskStudents.length > 0 ? "text-red-600" : ""
            }`}
          >
            {riskStudents.length}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">경고 2단계 + 제적 학생</p>
        </article>

        <article
          className={`rounded-[28px] border p-6 ${
            pending.length > 0 ? "border-orange-200 bg-orange-50" : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">에스컬레이션 대상</p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              pending.length > 0 ? "text-orange-600" : ""
            }`}
          >
            {pending.length}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">30일 내 에스컬레이션 기록 없음</p>
        </article>

        <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <p className="text-sm text-slate">처리 중</p>
          <p className="mt-3 text-3xl font-semibold text-forest">
            {inProgress.length}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">30일 내 에스컬레이션 기록 있음</p>
        </article>
      </div>

      {/* Pending section */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-semibold">에스컬레이션 대상</h2>
          <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-0.5 text-xs font-semibold text-orange-700">
            {pending.length}명
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            에스컬레이션이 필요한 학생이 없습니다. 모든 위험 학생이 처리 중입니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
            <div className="hidden border-b border-ink/10 bg-mist/60 px-6 py-3 sm:grid sm:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] sm:gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">학생</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">상태</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">경과일</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">마지막 면담</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">담당자</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">조치</span>
            </div>

            <div className="divide-y divide-ink/10">
              {pending.map((s) => (
                <div
                  key={s.examNumber}
                  className="grid gap-4 px-6 py-4 sm:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] sm:items-center"
                >
                  <div>
                    <Link
                      prefetch={false}
                      href={`/admin/students/${s.examNumber}`}
                      className="font-semibold text-ink transition hover:text-ember"
                    >
                      {s.name}
                    </Link>
                    <p className="text-xs text-slate">{s.examNumber}</p>
                    {s.phone && <p className="text-xs text-slate">{s.phone}</p>}
                  </div>

                  <div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[s.currentStatus]}`}
                    >
                      {STATUS_LABEL[s.currentStatus]}
                    </span>
                  </div>

                  <div>
                    {s.daysInWarning !== null ? (
                      <p
                        className={`text-sm font-medium ${
                          s.daysInWarning >= 14 ? "text-red-600" : "text-ink"
                        }`}
                      >
                        {s.daysInWarning}일
                      </p>
                    ) : (
                      <p className="text-sm text-slate">-</p>
                    )}
                  </div>

                  <div>
                    {s.lastCounselingDate ? (
                      <p className="text-sm text-ink">
                        {s.lastCounselingDate.toLocaleDateString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </p>
                    ) : (
                      <p className="text-sm text-slate">기록 없음</p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-ink">{s.lastCounselorName ?? "-"}</p>
                  </div>

                  <div>
                    <EscalationButton
                      target={{
                        examNumber: s.examNumber,
                        name: s.name,
                        currentStatus: s.currentStatus,
                      }}
                      defaultCounselorName={counselorName}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* In-progress section */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-semibold">처리 중</h2>
          <span className="rounded-full border border-forest/20 bg-forest/10 px-3 py-0.5 text-xs font-semibold text-forest">
            {inProgress.length}명
          </span>
        </div>

        {inProgress.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            처리 중인 에스컬레이션이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-forest/20 bg-white">
            <div className="hidden border-b border-ink/10 bg-mist/60 px-6 py-3 sm:grid sm:grid-cols-[1.5fr_1fr_1fr_1fr_minmax(0,2fr)] sm:gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">학생</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">상태</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">경과일</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">담당자</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate">에스컬레이션 내용</span>
            </div>

            <div className="divide-y divide-ink/10">
              {inProgress.map((s) => (
                <div
                  key={s.examNumber}
                  className="grid gap-4 px-6 py-4 sm:grid-cols-[1.5fr_1fr_1fr_1fr_minmax(0,2fr)] sm:items-center"
                >
                  <div>
                    <Link
                      prefetch={false}
                      href={`/admin/students/${s.examNumber}`}
                      className="font-semibold text-ink transition hover:text-ember"
                    >
                      {s.name}
                    </Link>
                    <p className="text-xs text-slate">{s.examNumber}</p>
                  </div>

                  <div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[s.currentStatus]}`}
                    >
                      {STATUS_LABEL[s.currentStatus]}
                    </span>
                  </div>

                  <div>
                    {s.daysInWarning !== null ? (
                      <p className="text-sm font-medium text-ink">{s.daysInWarning}일</p>
                    ) : (
                      <p className="text-sm text-slate">-</p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-ink">{s.lastCounselorName ?? "-"}</p>
                  </div>

                  <div>
                    {s.lastEscalationContent ? (
                      <p
                        className="truncate text-sm text-forest"
                        title={s.lastEscalationContent}
                      >
                        {s.lastEscalationContent.length > 60
                          ? s.lastEscalationContent.slice(0, 60) + "…"
                          : s.lastEscalationContent}
                      </p>
                    ) : (
                      <p className="text-sm text-slate">-</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
