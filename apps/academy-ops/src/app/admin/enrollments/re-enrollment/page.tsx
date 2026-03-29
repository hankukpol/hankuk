import Link from "next/link";
import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(date: Date | null | undefined): string {
  if (!date) return "-";
  return date
    .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, "-")
    .replace(/\.$/, "");
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function getCourseName(enrollment: {
  cohort: { name: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
}): string {
  if (enrollment.specialLecture) return enrollment.specialLecture.name;
  if (enrollment.product) return enrollment.product.name;
  if (enrollment.cohort) return enrollment.cohort.name;
  return "-";
}

// ─── Types ─────────────────────────────────────────────────────────────────

type EnrollmentRow = {
  id: string;
  examNumber: string;
  startDate: Date;
  endDate: Date | null;
  status: EnrollmentStatus;
  student: {
    name: string;
    phone: string | null;
  };
  cohort: { name: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
};

type TabKey = "expiring" | "completed" | "absent";

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
      {label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate">
      <svg
        className="mb-4 h-12 w-12 opacity-30"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

function StudentCell({ examNumber, name }: { examNumber: string; name: string }) {
  return (
    <td className="px-5 py-4">
      <Link
        href={`/admin/students/${examNumber}`}
        className="font-semibold text-ink hover:text-ember hover:underline"
      >
        {name}
      </Link>
      <div className="mt-0.5 font-mono text-xs text-slate">{examNumber}</div>
    </td>
  );
}

function ActionCell({ examNumber }: { examNumber: string }) {
  return (
    <td className="px-5 py-4 text-center">
      <Link
        href={`/admin/enrollments/new?studentId=${examNumber}`}
        className="inline-flex items-center gap-1 rounded-lg border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-semibold text-ember transition-colors hover:bg-ember/20"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        수강 신규 등록
      </Link>
    </td>
  );
}

function PhoneCell({ phone }: { phone: string | null }) {
  if (!phone) {
    return <td className="px-5 py-4 font-mono text-xs text-ink/30">-</td>;
  }
  return (
    <td className="px-5 py-4">
      <a
        href={`tel:${phone}`}
        className="inline-flex items-center gap-1 font-mono text-xs text-slate hover:text-ember"
        title="전화 연결"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 15z" />
        </svg>
        {phone}
      </a>
    </td>
  );
}

// ─── Tab: 만료 예정 ────────────────────────────────────────────────────────

function ExpiringTable({ rows, now }: { rows: EnrollmentRow[]; now: Date }) {
  if (rows.length === 0) {
    return <EmptyState message="30일 이내 만료 예정인 수강생이 없습니다." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink/10 bg-mist">
            {["이름 / 학번", "연락처", "수강 과정", "만료일", "D-day", "액션"].map((h) => (
              <th
                key={h}
                className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((enr, idx) => {
            const daysLeft = enr.endDate ? daysBetween(now, enr.endDate) : null;
            const isAlt = idx % 2 === 1;

            let ddayBadge = { label: "만료일 없음", cls: "bg-ink/5 text-slate border-ink/10" };
            if (daysLeft !== null) {
              if (daysLeft <= 0) ddayBadge = { label: "D+0", cls: "bg-red-50 text-red-700 border-red-200" };
              else if (daysLeft <= 7) ddayBadge = { label: `D-${daysLeft}`, cls: "bg-red-50 text-red-700 border-red-200" };
              else if (daysLeft <= 14) ddayBadge = { label: `D-${daysLeft}`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
              else ddayBadge = { label: `D-${daysLeft}`, cls: "bg-ink/5 text-slate border-ink/10" };
            }

            return (
              <tr
                key={enr.id}
                className={`border-b border-ink/5 transition-colors hover:bg-forest/5 ${isAlt ? "bg-mist/50" : "bg-white"}`}
              >
                <StudentCell examNumber={enr.examNumber} name={enr.student.name} />
                <PhoneCell phone={enr.student.phone} />
                <td className="px-5 py-4 text-sm text-ink">
                  <Link
                    href={`/admin/enrollments/${enr.id}`}
                    className="hover:text-ember hover:underline"
                  >
                    {getCourseName(enr)}
                  </Link>
                </td>
                <td className="px-5 py-4 text-sm text-slate">{formatDate(enr.endDate)}</td>
                <td className="px-5 py-4">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ddayBadge.cls}`}>
                    {ddayBadge.label}
                  </span>
                </td>
                <ActionCell examNumber={enr.examNumber} />
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate bg-mist/30">
        총 <span className="font-semibold text-ink">{rows.length}</span>건 · 만료일 임박 순
      </div>
    </div>
  );
}

// ─── Tab: 최근 수료 ────────────────────────────────────────────────────────

type CompletedRow = EnrollmentRow & { hasActiveFollowUp: boolean };

function CompletedTable({ rows, now }: { rows: CompletedRow[]; now: Date }) {
  if (rows.length === 0) {
    return <EmptyState message="60일 이내 수료한 학생이 없습니다." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink/10 bg-mist">
            {["이름 / 학번", "연락처", "수료 과정", "수료일", "경과일", "재등록 여부", "액션"].map((h) => (
              <th
                key={h}
                className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((enr, idx) => {
            const daysSince = enr.endDate ? daysBetween(enr.endDate, now) : null;
            const isAlt = idx % 2 === 1;

            return (
              <tr
                key={enr.id}
                className={`border-b border-ink/5 transition-colors hover:bg-forest/5 ${isAlt ? "bg-mist/50" : "bg-white"}`}
              >
                <StudentCell examNumber={enr.examNumber} name={enr.student.name} />
                <PhoneCell phone={enr.student.phone} />
                <td className="px-5 py-4 text-sm text-ink">
                  <Link
                    href={`/admin/enrollments/${enr.id}`}
                    className="hover:text-ember hover:underline"
                  >
                    {getCourseName(enr)}
                  </Link>
                </td>
                <td className="px-5 py-4 text-sm text-slate">{formatDate(enr.endDate)}</td>
                <td className="px-5 py-4">
                  {daysSince !== null ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        daysSince <= 14
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-ink/5 text-slate border-ink/10"
                      }`}
                    >
                      {daysSince}일 전
                    </span>
                  ) : (
                    <span className="text-xs text-ink/40">-</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  {enr.hasActiveFollowUp ? (
                    <span className="rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                      재등록 완료
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      미재등록
                    </span>
                  )}
                </td>
                {enr.hasActiveFollowUp ? (
                  <td className="px-5 py-4 text-center">
                    <span className="text-xs text-slate">-</span>
                  </td>
                ) : (
                  <ActionCell examNumber={enr.examNumber} />
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate bg-mist/30">
        총 <span className="font-semibold text-ink">{rows.length}</span>건 · 수료일 최신 순
      </div>
    </div>
  );
}

// ─── Tab: 장기 부재 ────────────────────────────────────────────────────────

type AbsentRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  lastEnrollmentId: string;
  lastCourseName: string;
  lastEndDate: Date | null;
  daysSince: number;
};

function AbsentTable({ rows }: { rows: AbsentRow[] }) {
  if (rows.length === 0) {
    return <EmptyState message="장기 부재 학생이 없습니다." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink/10 bg-mist">
            {["이름 / 학번", "연락처", "마지막 수강 과정", "종료일", "미등록 기간", "액션"].map((h) => (
              <th
                key={h}
                className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isAlt = idx % 2 === 1;
            const isVeryLong = row.daysSince >= 180;

            return (
              <tr
                key={row.examNumber}
                className={`border-b border-ink/5 transition-colors hover:bg-forest/5 ${isAlt ? "bg-mist/50" : "bg-white"}`}
              >
                <StudentCell examNumber={row.examNumber} name={row.name} />
                <PhoneCell phone={row.phone} />
                <td className="px-5 py-4 text-sm text-ink">
                  <Link
                    href={`/admin/enrollments/${row.lastEnrollmentId}`}
                    className="hover:text-ember hover:underline"
                  >
                    {row.lastCourseName}
                  </Link>
                </td>
                <td className="px-5 py-4 text-sm text-slate">{formatDate(row.lastEndDate)}</td>
                <td className="px-5 py-4">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      isVeryLong
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {row.daysSince}일
                  </span>
                </td>
                <ActionCell examNumber={row.examNumber} />
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate bg-mist/30">
        총 <span className="font-semibold text-ink">{rows.length}</span>건 · 미등록 기간 장기 순
      </div>
    </div>
  );
}

// ─── Tab Nav ───────────────────────────────────────────────────────────────

const TAB_META: { key: TabKey; label: string }[] = [
  { key: "expiring", label: "만료 예정" },
  { key: "completed", label: "최근 수료" },
  { key: "absent", label: "재등록 필요" },
];

function TabNav({
  activeTab,
  counts,
}: {
  activeTab: TabKey;
  counts: Record<TabKey, number>;
}) {
  return (
    <div className="flex gap-1 rounded-2xl border border-ink/10 bg-mist p-1">
      {TAB_META.map(({ key, label }) => {
        const isActive = key === activeTab;
        return (
          <Link
            key={key}
            href={`/admin/enrollments/re-enrollment?tab=${key}`}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-white text-ink shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                isActive ? "bg-ember text-white" : "bg-ink/10 text-slate"
              }`}
            >
              {counts[key]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReEnrollmentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const rawTab = typeof searchParams.tab === "string" ? searchParams.tab : "expiring";
  const activeTab: TabKey =
    rawTab === "completed" || rawTab === "absent" ? rawTab : "expiring";

  const prisma = getPrisma();
  const now = new Date();

  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // ── 1. 만료 예정 (ACTIVE, endDate within 30 days) ─────────────────────
  const expiringRaw = await prisma.courseEnrollment.findMany({
    where: {
      status: EnrollmentStatus.ACTIVE,
      endDate: {
        gte: now,
        lte: thirtyDaysLater,
      },
    },
    include: {
      student: { select: { name: true, phone: true } },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { endDate: "asc" },
    take: 200,
  });

  const expiringRows: EnrollmentRow[] = expiringRaw.map((e) => ({
    id: e.id,
    examNumber: e.examNumber,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
    student: { name: e.student.name, phone: e.student.phone ?? null },
    cohort: e.cohort,
    product: e.product,
    specialLecture: e.specialLecture,
  }));

  // ── 2. 최근 수료 (COMPLETED, endDate within 60 days) ──────────────────
  const completedRaw = await prisma.courseEnrollment.findMany({
    where: {
      status: EnrollmentStatus.COMPLETED,
      endDate: {
        gte: sixtyDaysAgo,
        lte: now,
      },
    },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          courseEnrollments: {
            where: {
              status: {
                in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PENDING],
              },
            },
            select: { id: true },
            take: 1,
          },
        },
      },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { endDate: "desc" },
    take: 200,
  });

  const completedRows: CompletedRow[] = completedRaw.map((e) => ({
    id: e.id,
    examNumber: e.examNumber,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
    student: { name: e.student.name, phone: e.student.phone ?? null },
    cohort: e.cohort,
    product: e.product,
    specialLecture: e.specialLecture,
    hasActiveFollowUp: e.student.courseEnrollments.length > 0,
  }));

  // ── 3. 장기 부재 (last COMPLETED > 90 days ago, no current active) ────
  // Find students whose most recent completed enrollment ended before ninetyDaysAgo
  // and have no active/pending enrollment now.
  const absentCandidates = await prisma.courseEnrollment.findMany({
    where: {
      status: EnrollmentStatus.COMPLETED,
      endDate: {
        lte: ninetyDaysAgo,
      },
    },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          courseEnrollments: {
            where: {
              status: {
                in: [
                  EnrollmentStatus.ACTIVE,
                  EnrollmentStatus.PENDING,
                  EnrollmentStatus.SUSPENDED,
                ],
              },
            },
            select: { id: true },
            take: 1,
          },
        },
      },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { endDate: "desc" },
    take: 500,
  });

  // Deduplicate by examNumber — keep only the most recent completed enrollment per student
  const seenExamNumbers = new Set<string>();
  const absentRows: AbsentRow[] = [];

  for (const e of absentCandidates) {
    if (seenExamNumbers.has(e.examNumber)) continue;
    if (e.student.courseEnrollments.length > 0) {
      seenExamNumbers.add(e.examNumber);
      continue;
    }
    seenExamNumbers.add(e.examNumber);
    const daysSince = e.endDate ? daysBetween(e.endDate, now) : 0;
    absentRows.push({
      examNumber: e.examNumber,
      name: e.student.name,
      phone: e.student.phone ?? null,
      lastEnrollmentId: e.id,
      lastCourseName: getCourseName(e),
      lastEndDate: e.endDate,
      daysSince,
    });
  }

  // Sort by daysSince desc (longest first)
  absentRows.sort((a, b) => b.daysSince - a.daysSince);

  const counts: Record<TabKey, number> = {
    expiring: expiringRows.length,
    completed: completedRows.length,
    absent: absentRows.length,
  };

  // KPI summary
  const expiringSoon7 = expiringRows.filter(
    (r) => r.endDate && daysBetween(now, r.endDate) <= 7
  ).length;
  const completedNoReturn = completedRows.filter((r) => !r.hasActiveFollowUp).length;

  const kpiCards = [
    {
      label: "7일 이내 만료",
      count: expiringSoon7,
      unit: "명",
      color: "text-red-700",
      bgColor: "bg-red-50",
      borderColor: "border-red-100",
      dotColor: "bg-red-500",
    },
    {
      label: "30일 이내 만료 예정",
      count: expiringRows.length,
      unit: "명",
      color: "text-amber-700",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-100",
      dotColor: "bg-amber-500",
    },
    {
      label: "최근 수료 후 미재등록",
      count: completedNoReturn,
      unit: "명",
      color: "text-slate",
      bgColor: "bg-mist",
      borderColor: "border-ink/10",
      dotColor: "bg-slate",
    },
    {
      label: "장기 미등록 (90일+)",
      count: absentRows.length,
      unit: "명",
      color: "text-forest",
      bgColor: "bg-forest/5",
      borderColor: "border-forest/20",
      dotColor: "bg-forest",
    },
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <SectionBadge label="수강 관리" />
      <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-ink">재등록 관리</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            수강 만료 예정·수료·장기 미등록 학생을 파악하고 재등록 상담을 진행합니다.
          </p>
        </div>
        <Link
          href="/admin/enrollments"
          className="shrink-0 rounded-xl border border-ink/20 bg-white px-4 py-2.5 text-sm font-semibold text-slate hover:bg-mist transition-colors"
        >
          ← 수강 목록으로
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border ${card.borderColor} ${card.bgColor} p-6`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${card.dotColor}`} />
              <span className="text-sm font-medium text-slate">{card.label}</span>
            </div>
            <p className={`mt-3 text-4xl font-bold ${card.color}`}>
              {card.count.toLocaleString()}
              <span className="ml-1 text-base font-medium">{card.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Tab Nav */}
      <div className="mt-8">
        <TabNav activeTab={activeTab} counts={counts} />
      </div>

      {/* Tab Content */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white overflow-hidden shadow-sm">
        {activeTab === "expiring" && (
          <ExpiringTable rows={expiringRows} now={now} />
        )}
        {activeTab === "completed" && (
          <CompletedTable rows={completedRows} now={now} />
        )}
        {activeTab === "absent" && (
          <AbsentTable rows={absentRows} />
        )}
      </div>
    </div>
  );
}
