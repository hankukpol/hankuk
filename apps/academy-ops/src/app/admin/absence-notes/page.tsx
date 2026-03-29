import {
  AbsenceCategory,
  AbsenceStatus,
  AdminRole,
} from "@prisma/client";
import { AbsenceNoteFilterPresetControls } from "@/components/absence-notes/absence-note-filter-preset-controls";
import { AbsenceNoteManager } from "@/components/absence-notes/absence-note-manager";
import { AbsenceNotesListClient } from "@/app/admin/absence-notes/absence-notes-list-client";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  getAnalyticsContext,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { listAbsencePolicies } from "@/lib/absence-policies/service";
import {
  ABSENCE_CATEGORY_LABEL,
  EXAM_TYPE_LABEL,
} from "@/lib/constants";
import {
  getAbsenceNoteDashboard,
  listAbsenceNotes,
} from "@/lib/absence-notes/service";
import { todayDateInputValue } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { NON_PLACEHOLDER_STUDENT_FILTER } from "@/lib/students/placeholder";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: AbsenceStatus.PENDING, label: "대기" },
  { value: AbsenceStatus.APPROVED, label: "승인" },
  { value: AbsenceStatus.REJECTED, label: "반려" },
] as const;

const ABSENCE_POLICY_SETTINGS_HREF = "/admin/settings/absence-policies";

export default async function AdminAbsenceNotesPage({ searchParams }: PageProps) {
  const [, { periods, selectedPeriod, examType }] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    getAnalyticsContext(searchParams),
  ]);

  const defaultSubmittedDate = todayDateInputValue();
  const selectedStatus = readStringParam(searchParams, "status") ?? "ALL";
  const selectedCategory = readStringParam(searchParams, "absenceCategory") ?? "ALL";
  const search = readStringParam(searchParams, "search") ?? "";
  const submittedFrom =
    readStringParam(searchParams, "submittedFrom") ?? defaultSubmittedDate;
  const submittedTo =
    readStringParam(searchParams, "submittedTo") ?? defaultSubmittedDate;

  const [notes, students, dashboard, policies] = await Promise.all([
    selectedPeriod
      ? listAbsenceNotes({
          periodId: selectedPeriod.id,
          examType,
          status:
            selectedStatus === "ALL"
              ? undefined
              : (selectedStatus as AbsenceStatus),
          absenceCategory:
            selectedCategory === "ALL"
              ? undefined
              : (selectedCategory as AbsenceCategory),
          search,
          submittedFrom: submittedFrom || undefined,
          submittedTo: submittedTo || undefined,
        })
      : Promise.resolve([]),
    getPrisma().student.findMany({
      where: {
        AND: [NON_PLACEHOLDER_STUDENT_FILTER, { examType, isActive: true }],
      },
      select: { examNumber: true, name: true, currentStatus: true },
      orderBy: { examNumber: "asc" },
    }),
    selectedPeriod
      ? getAbsenceNoteDashboard(selectedPeriod.id, examType)
      : Promise.resolve(null),
    listAbsencePolicies(),
  ]);

  const sessionOptions =
    selectedPeriod?.sessions
      .filter((session) => session.examType === examType && !session.isCancelled)
      .map((session) => ({
        id: session.id,
        examDate: session.examDate.toISOString(),
        subject: session.subject,
        week: session.week,
      })) ?? [];

  const policyOptions = policies.map((policy) => ({
    id: policy.id,
    name: policy.name,
    absenceCategory: policy.absenceCategory,
    attendCountsAsAttendance: policy.attendCountsAsAttendance,
    attendGrantsPerfectAttendance: policy.attendGrantsPerfectAttendance,
    isActive: policy.isActive,
    sortOrder: policy.sortOrder,
  }));

  const activePolicyCount = policyOptions.filter((policy) => policy.isActive).length;

  const exportParams = new URLSearchParams();
  if (selectedPeriod) {
    exportParams.set("periodId", String(selectedPeriod.id));
  }
  exportParams.set("examType", examType);
  if (selectedStatus !== "ALL") {
    exportParams.set("status", selectedStatus);
  }
  if (selectedCategory !== "ALL") {
    exportParams.set("absenceCategory", selectedCategory);
  }
  if (search) {
    exportParams.set("search", search);
  }
  if (submittedFrom) {
    exportParams.set("submittedFrom", submittedFrom);
  }
  if (submittedTo) {
    exportParams.set("submittedTo", submittedTo);
  }
  const exportUrl = `/api/absence-notes/export?${exportParams.toString()}`;

  const mappedNotes = notes.map((note) => ({
    ...note,
    submittedAt: note.submittedAt ? note.submittedAt.toISOString() : null,
    approvedAt: note.approvedAt ? note.approvedAt.toISOString() : null,
    session: {
      ...note.session,
      examDate: note.session.examDate.toISOString(),
    },
    attachments: (note.attachments ?? []).map((attachment) => ({
      ...attachment,
      createdAt: attachment.createdAt.toISOString(),
    })),
  }));

  const summaryCards = [
    {
      key: "pending",
      label: "검토 대기",
      value: dashboard?.pending ?? 0,
      help: "승인 또는 반려 처리가 필요한 사유서",
      className: "border-amber-200 bg-amber-50/80",
      valueClassName: "text-amber-700",
      unitClassName: "text-amber-600",
    },
    {
      key: "approved",
      label: "오늘 승인",
      value: dashboard?.approvedToday ?? 0,
      help: "오늘 처리된 승인 건수",
      className: "border-ink/10 bg-mist/70",
      valueClassName: "text-ink",
      unitClassName: "text-slate",
    },
    {
      key: "rejected",
      label: "반려",
      value: dashboard?.rejected ?? 0,
      help: "재검토가 필요한 사유서",
      className: "border-red-100 bg-red-50/70",
      valueClassName: "text-red-700",
      unitClassName: "text-red-500",
    },
    {
      key: "total",
      label: "기간 합계",
      value: dashboard?.total ?? 0,
      help:
        dashboard && Object.keys(dashboard.categoryBreakdown).length > 0
          ? Object.entries(dashboard.categoryBreakdown)
              .map(([category, count]) => {
                const label =
                  ABSENCE_CATEGORY_LABEL[category as AbsenceCategory] ?? category;
                return `${label} ${count}`;
              })
              .join(" · ")
          : "등록된 사유서 집계가 없습니다.",
      className: "border-ink/10 bg-white",
      valueClassName: "text-ink",
      unitClassName: "text-slate",
    },
  ] as const;

  const utilityCards = [
    {
      key: "policy",
      title: "사유 정책 설정",
      caption: "설정",
      href: ABSENCE_POLICY_SETTINGS_HREF,
      className: "border-amber-200 bg-amber-50/70 hover:bg-amber-50",
      textClassName: "text-amber-700",
      captionClassName: "text-amber-700/80",
    },
    {
      key: "export",
      title: "Excel 내보내기",
      caption: "내보내기",
      href: exportUrl,
      className: "border-ink/10 bg-white hover:bg-mist/60",
      textClassName: "text-ink",
      captionClassName: "text-slate",
    },
    {
      key: "review",
      title: "사유서 조회 및 검토로 이동",
      caption: "이동",
      href: "#absence-review",
      className: "border-sky-200 bg-sky-50/70 hover:bg-sky-50",
      textClassName: "text-sky-800",
      captionClassName: "text-sky-700/80",
    },
  ] as const;

  const selectedStatusLabel =
    STATUS_OPTIONS.find((option) => option.value === selectedStatus)?.label ?? "전체";
  const selectedCategoryLabel =
    selectedCategory === "ALL"
      ? "전체"
      : ABSENCE_CATEGORY_LABEL[selectedCategory as AbsenceCategory];

  return (
    <div className="p-8 sm:p-10">
      <div className="max-w-4xl">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          사유서 관리
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">
          사유서 등록 중심으로 흐름을 다시 정리했습니다.
        </h1>
        <p className="mt-4 text-sm leading-8 text-slate sm:text-base">
          상단에는 처리 현황을 두고, 바로 아래에서 사유서를 먼저 등록할 수 있게 배치했습니다.
          조회와 검토는 아래 별도 구역으로 내려서 등록 흐름을 막지 않도록 정리했습니다.
        </p>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article
            key={card.key}
            className={`rounded-[24px] border p-5 ${card.className}`}
          >
            <p className="text-sm text-slate">{card.label}</p>
            <p className={`mt-3 text-3xl font-semibold ${card.valueClassName}`}>
              {card.value}
              <span className={`ml-1 text-base font-normal ${card.unitClassName}`}>
                건
              </span>
            </p>
            <p className="mt-2 text-xs leading-6 text-slate">{card.help}</p>
          </article>
        ))}
      </section>

      <section className="mt-8">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6">
          <div>
            <h2 className="text-2xl font-semibold text-ink">사유서 등록</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
              신규 사유서를 바로 입력하는 구역입니다. 등록 후 검토가 필요하면 아래 조회 및
              검토 구역으로 바로 이동할 수 있습니다.
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {utilityCards.map((card) => (
              <a
                key={card.key}
                href={card.href}
                className={`rounded-[24px] border p-5 transition ${card.className}`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.16em] ${card.captionClassName}`}
                >
                  {card.caption}
                </p>
                <p
                  className={`mt-3 text-base font-semibold leading-6 ${card.textClassName}`}
                >
                  {card.title}
                </p>
              </a>
            ))}
            <article className="rounded-[24px] border border-sky-200 bg-sky-50/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                현재 작업 범위
              </p>
              <p className="mt-3 text-base font-semibold leading-6 text-ink">
                {selectedPeriod?.name ?? "기간을 먼저 선택하세요"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate">
                <span>{EXAM_TYPE_LABEL[examType]}</span>
                <span>활성 사유 정책 {activePolicyCount}개</span>
              </div>
            </article>
          </div>

          <div className="mt-6">
            <AbsenceNoteManager
              students={students}
              sessions={sessionOptions}
              policies={policyOptions}
              notes={[]}
              settingsHref={ABSENCE_POLICY_SETTINGS_HREF}
              showReviewSection={false}
              showGuidanceSection={false}
            />
          </div>
        </section>
      </section>

      <section
        id="absence-review"
        className="mt-8 rounded-[32px] border border-ink/10 bg-white p-6 scroll-mt-24"
      >
        <div>
          <h2 className="text-2xl font-semibold text-ink">사유서 조회 및 검토</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            왼쪽에서는 조회 조건만 조정하고, 오른쪽에서는 조회된 사유서를 검토합니다.
            필터 변경과 승인·반려 작업이 서로 섞이지 않도록 역할을 분리했습니다.
          </p>
        </div>

        <div className="mt-6 grid items-stretch gap-6 xl:grid-cols-2">
          <section className="flex h-full flex-col rounded-[28px] border border-ink/10 bg-mist p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-ink">사유서 조회</h3>
                <p className="mt-1 text-sm text-slate">
                  기간과 상태를 먼저 좁혀서 검토 대상을 찾습니다.
                </p>
              </div>
              <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                {notes.length > 0 ? `${notes.length}건` : "조회 대기"}
              </span>
            </div>

            <AbsenceNoteFilterPresetControls
              formId="absence-note-filter-form"
              storageKey="absence-note-review-filters"
              fieldNames={[
                "periodId",
                "examType",
                "status",
                "absenceCategory",
                "submittedFrom",
                "submittedTo",
                "search",
              ]}
              anchor="absence-review"
            />

            <form id="absence-note-filter-form" className="mt-5 flex flex-1 flex-col">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">시험 기간</label>
                  <select
                    name="periodId"
                    defaultValue={selectedPeriod?.id ? String(selectedPeriod.id) : ""}
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  >
                    {periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">직렬</label>
                  <select
                    name="examType"
                    defaultValue={examType}
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  >
                    <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
                    <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">상태</label>
                  <select
                    name="status"
                    defaultValue={selectedStatus}
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">사유 유형</label>
                  <select
                    name="absenceCategory"
                    defaultValue={selectedCategory}
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  >
                    <option value="ALL">전체</option>
                    {Object.values(AbsenceCategory).map((category) => (
                      <option key={category} value={category}>
                        {ABSENCE_CATEGORY_LABEL[category]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium">제출일 범위</label>
                  <DateRangePicker
                    fromName="submittedFrom"
                    toName="submittedTo"
                    defaultFrom={submittedFrom}
                    defaultTo={submittedTo}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium">수험번호 / 이름</label>
                  <input
                    type="text"
                    name="search"
                    defaultValue={search}
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                    placeholder="검색"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                <div className="rounded-[20px] border border-ink/10 bg-white px-4 py-3 text-sm text-slate">
                  <p className="font-semibold text-ink">현재 조회 조건</p>
                  <p className="mt-2">{selectedPeriod?.name ?? "기간을 먼저 선택하세요"}</p>
                  <p className="mt-1">{EXAM_TYPE_LABEL[examType]}</p>
                  <p className="mt-1">상태 {selectedStatusLabel}</p>
                  <p className="mt-1">사유 {selectedCategoryLabel}</p>
                </div>
                <div className="grid gap-2 self-end">
                  <a
                    href={exportUrl}
                    className="inline-flex items-center justify-center rounded-full border border-ink/10 bg-white px-4 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                  >
                    Excel 내보내기
                  </a>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-forest"
                  >
                    조회
                  </button>
                </div>
              </div>
            </form>
          </section>

          <div className="h-full">
            <section className="rounded-[28px] border border-ink/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-ink">사유서 검토</h3>
                  <p className="mt-1 text-sm text-slate">
                    대기 사유서를 선택해 일괄 승인 또는 반려 처리할 수 있습니다.
                  </p>
                </div>
              </div>
              <AbsenceNotesListClient notes={mappedNotes} />
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
