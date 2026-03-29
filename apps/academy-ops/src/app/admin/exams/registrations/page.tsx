import Link from "next/link";
import { AdminRole, ExamEventType, ExamDivision } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const EVENT_TYPE_LABEL: Record<ExamEventType, string> = {
  MORNING: "아침모의고사",
  MONTHLY: "월말평가",
  SPECIAL: "특강모의고사",
  EXTERNAL: "외부모의고사",
};

const EVENT_TYPE_COLOR: Record<ExamEventType, string> = {
  MORNING: "bg-ember/10 text-ember border-ember/20",
  MONTHLY: "bg-forest/10 text-forest border-forest/20",
  SPECIAL: "bg-blue-50 text-blue-700 border-blue-200",
  EXTERNAL: "bg-purple-50 text-purple-700 border-purple-200",
};

const DIVISION_LABEL: Record<ExamDivision, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

type PageProps = {
  searchParams: Promise<{ type?: string; month?: string; paid?: string }>;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ExamRegistrationsHubPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { type, month, paid } = await searchParams;
  const prisma = getPrisma();

  // Build filter
  const eventTypeFilter =
    type && Object.values(ExamEventType).includes(type as ExamEventType)
      ? (type as ExamEventType)
      : undefined;

  let monthStart: Date | undefined;
  let monthEnd: Date | undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    monthStart = new Date(y, m - 1, 1);
    monthEnd = new Date(y, m, 1); // exclusive
  }

  const paidFilter =
    paid === "true" ? true : paid === "false" ? false : undefined;

  const registrations = await prisma.examRegistration.findMany({
    where: {
      cancelledAt: null,
      ...(paidFilter !== undefined && { isPaid: paidFilter }),
      examEvent: {
        ...(eventTypeFilter && { eventType: eventTypeFilter }),
        ...(monthStart && monthEnd && {
          examDate: { gte: monthStart, lt: monthEnd },
        }),
      },
    },
    include: {
      examEvent: {
        select: {
          id: true,
          title: true,
          eventType: true,
          examDate: true,
          registrationFee: true,
        },
      },
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
    },
    orderBy: [{ examEvent: { examDate: "desc" } }, { registeredAt: "asc" }],
  });

  // KPI
  const totalCount = registrations.length;
  const paidCount = registrations.filter((r) => r.isPaid).length;
  const unpaidCount = totalCount - paidCount;
  const totalRevenue = registrations.reduce((s, r) => s + r.paidAmount, 0);

  // Build month options from available data (last 12 months)
  const now = new Date();
  const monthOptions: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    monthOptions.push(`${y}-${m}`);
  }

  function buildHref(overrides: { type?: string; month?: string; paid?: string }) {
    const params = new URLSearchParams();
    const t = overrides.type !== undefined ? overrides.type : type ?? "";
    const mo = overrides.month !== undefined ? overrides.month : month ?? "";
    const p = overrides.paid !== undefined ? overrides.paid : paid ?? "";
    if (t) params.set("type", t);
    if (mo) params.set("month", mo);
    if (p) params.set("paid", p);
    const qs = params.toString();
    return `/admin/exams/registrations${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
            시험 접수
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">모의고사 접수 현황</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            전체 시험 유형에 걸친 접수 현황을 통합 조회합니다.
          </p>
        </div>
        <Link
          href="/admin/exams"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:text-ink"
        >
          ← 시험 관리
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            총 접수
          </p>
          <p className="mt-3 text-2xl font-bold text-ink">{totalCount.toLocaleString()}명</p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">
            납부 완료
          </p>
          <p className="mt-3 text-2xl font-bold text-forest">{paidCount.toLocaleString()}명</p>
        </div>
        <div
          className={`rounded-[24px] border p-5 shadow-panel ${
            unpaidCount > 0
              ? "border-amber-200 bg-amber-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-wide ${
              unpaidCount > 0 ? "text-amber-700" : "text-slate"
            }`}
          >
            납부 미완료
          </p>
          <p
            className={`mt-3 text-2xl font-bold ${
              unpaidCount > 0 ? "text-amber-700" : "text-ink"
            }`}
          >
            {unpaidCount.toLocaleString()}명
          </p>
        </div>
        <div className="rounded-[24px] border border-ember/20 bg-ember/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-ember">
            수납 총액
          </p>
          <p className="mt-3 text-2xl font-bold text-ember">
            {totalRevenue.toLocaleString("ko-KR")}원
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-8 flex flex-wrap gap-3">
        {/* Type filter */}
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref({ type: "" })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              !eventTypeFilter
                ? "border-ink bg-ink text-white"
                : "border-ink/10 text-slate hover:border-ink/30 hover:text-ink"
            }`}
          >
            전체
          </Link>
          {(Object.values(ExamEventType) as ExamEventType[]).map((t) => (
            <Link
              key={t}
              href={buildHref({ type: t })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                eventTypeFilter === t
                  ? "border-ember bg-ember text-white"
                  : "border-ink/10 text-slate hover:border-ink/30 hover:text-ink"
              }`}
            >
              {EVENT_TYPE_LABEL[t]}
            </Link>
          ))}
        </div>

        {/* Month filter */}
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref({ month: "" })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              !month
                ? "border-ink bg-ink text-white"
                : "border-ink/10 text-slate hover:border-ink/30 hover:text-ink"
            }`}
          >
            전체 월
          </Link>
          {monthOptions.map((mo) => (
            <Link
              key={mo}
              href={buildHref({ month: mo })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                month === mo
                  ? "border-forest bg-forest text-white"
                  : "border-ink/10 text-slate hover:border-ink/30 hover:text-ink"
              }`}
            >
              {mo}
            </Link>
          ))}
        </div>

        {/* Paid filter */}
        <div className="flex gap-1.5">
          <Link
            href={buildHref({ paid: "" })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              paid === undefined || paid === ""
                ? "border-ink bg-ink text-white"
                : "border-ink/10 text-slate hover:border-ink/30 hover:text-ink"
            }`}
          >
            전체
          </Link>
          <Link
            href={buildHref({ paid: "true" })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              paid === "true"
                ? "border-forest bg-forest text-white"
                : "border-ink/10 text-slate hover:border-ink/30 hover:text-ink"
            }`}
          >
            납부완료
          </Link>
          <Link
            href={buildHref({ paid: "false" })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              paid === "false"
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-ink/10 text-slate hover:border-ink/30 hover:text-ink"
            }`}
          >
            미납
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="mt-6">
        {registrations.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-16 text-center text-sm text-slate">
            조건에 맞는 접수 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/60">
                  {[
                    "#",
                    "이름",
                    "학번",
                    "연락처",
                    "시험명",
                    "시험일",
                    "유형",
                    "구분",
                    "납부",
                    "참가비",
                    "납부금액",
                    "좌석번호",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {registrations.map((reg, i) => {
                  const isStudent = !!reg.student;
                  const displayName =
                    reg.student?.name ?? reg.externalName ?? "-";
                  const displayPhone =
                    reg.student?.phone ?? reg.externalPhone ?? "-";

                  return (
                    <tr key={reg.id} className="transition hover:bg-mist/30">
                      <td className="px-4 py-3 tabular-nums text-xs text-slate">
                        {i + 1}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                        {isStudent ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="transition hover:text-forest hover:underline"
                          >
                            {displayName}
                          </Link>
                        ) : (
                          <span>
                            {displayName}
                            <span className="ml-1 rounded-full bg-slate/10 px-1.5 py-0.5 text-xs text-slate">
                              외부
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs text-slate">
                        {reg.examNumber ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {displayPhone}
                      </td>
                      <td className="max-w-[180px] px-4 py-3 text-sm text-ink">
                        <Link
                          href={`/admin/exams/${
                            reg.examEvent.eventType === "MORNING"
                              ? "morning"
                              : reg.examEvent.eventType === "MONTHLY"
                                ? `monthly/${reg.examEventId}`
                                : reg.examEvent.eventType === "SPECIAL"
                                  ? `special/${reg.examEventId}`
                                  : "external"
                          }`}
                          className="truncate block transition hover:text-forest hover:underline"
                        >
                          {reg.examEvent.title}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {formatDate(reg.examEvent.examDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${EVENT_TYPE_COLOR[reg.examEvent.eventType]}`}
                        >
                          {EVENT_TYPE_LABEL[reg.examEvent.eventType]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {DIVISION_LABEL[reg.division]}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            reg.isPaid
                              ? "bg-forest/10 text-forest"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {reg.isPaid ? "납부" : "미납"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-xs text-slate">
                        {reg.examEvent.registrationFee > 0
                          ? `${reg.examEvent.registrationFee.toLocaleString("ko-KR")}원`
                          : "무료"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-xs">
                        {reg.isPaid && reg.paidAmount > 0 ? (
                          <span className="font-semibold text-forest">
                            {reg.paidAmount.toLocaleString("ko-KR")}원
                          </span>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs text-slate">
                        {reg.seatNumber ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/10 bg-forest text-white">
                  <td className="px-4 py-3 font-bold" colSpan={2}>
                    합계
                  </td>
                  <td colSpan={6} className="px-4 py-3 text-sm">
                    총 {totalCount}명 · 납부 {paidCount}명 · 미납 {unpaidCount}명
                  </td>
                  <td colSpan={2} />
                  <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums">
                    {totalRevenue.toLocaleString("ko-KR")}원
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
