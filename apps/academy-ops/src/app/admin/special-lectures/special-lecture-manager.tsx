"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";

type LectureType = "THEMED" | "SINGLE" | "INTERVIEW_COACHING";

const LECTURE_TYPE_LABEL: Record<LectureType, string> = {
  THEMED: "주제특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접코칭",
};

type LectureItem = {
  id: string;
  name: string;
  lectureType: LectureType;
  examCategory: string | null;
  startDate: string;
  endDate: string;
  isMultiSubject: boolean;
  fullPackagePrice: number | null;
  maxCapacityOffline: number | null;
  maxCapacityLive: number | null;
  isActive: boolean;
  createdAt: string;
  enrolledCount: number;
  instructorNames: string[];
};

type Props = {
  initialLectures: LectureItem[];
  thisMonthEnrollCount: number;
  totalEnrollCount: number;
};

type FilterTab = "all" | "active" | "ended";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "active", label: "진행중" },
  { key: "ended", label: "종료" },
];

export function SpecialLectureManager({
  initialLectures,
  thisMonthEnrollCount,
  totalEnrollCount,
}: Props) {
  const router = useRouter();
  const [lectures, setLectures] = useState<LectureItem[]>(initialLectures);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [formName, setFormName] = useState<string>("");
  const [formLectureType, setFormLectureType] = useState<LectureType>("SINGLE");
  const [formStartDate, setFormStartDate] = useState<string>("");
  const [formEndDate, setFormEndDate] = useState<string>("");
  const [formMaxCapacity, setFormMaxCapacity] = useState<string>("");
  const [formFullPackagePrice, setFormFullPackagePrice] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const now = new Date();
  const filtered = lectures.filter((l) => {
    if (activeFilter === "active") return l.isActive && new Date(l.endDate) >= now;
    if (activeFilter === "ended") return !l.isActive || new Date(l.endDate) < now;
    return true;
  });

  const activeCount = lectures.filter((l) => l.isActive && new Date(l.endDate) >= now).length;

  function resetForm() {
    setFormName("");
    setFormLectureType("SINGLE");
    setFormStartDate("");
    setFormEndDate("");
    setFormMaxCapacity("");
    setFormFullPackagePrice("");
    setFormDescription("");
    setFormError(null);
  }

  function handleOpenCreate() {
    resetForm();
    setShowCreateModal(true);
  }

  function handleCloseCreate() {
    if (isPending) return;
    setShowCreateModal(false);
    resetForm();
  }

  function handleCreate() {
    if (!formName.trim()) {
      setFormError("강좌명을 입력하세요.");
      return;
    }
    if (!formStartDate || !formEndDate) {
      setFormError("시작일과 종료일을 입력하세요.");
      return;
    }
    if (formStartDate > formEndDate) {
      setFormError("종료일은 시작일보다 늦어야 합니다.");
      return;
    }
    setFormError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/special-lectures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            lectureType: formLectureType,
            startDate: formStartDate,
            endDate: formEndDate,
            maxCapacityOffline: formMaxCapacity ? Number(formMaxCapacity) : undefined,
            fullPackagePrice: formFullPackagePrice ? Number(formFullPackagePrice) : undefined,
          }),
          cache: "no-store",
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "등록 실패");
        setShowCreateModal(false);
        resetForm();
        router.refresh();
        // Optimistically add the new lecture to state
        const newLecture: LectureItem = {
          id: payload.lecture.id,
          name: payload.lecture.name,
          lectureType: payload.lecture.lectureType,
          examCategory: payload.lecture.examCategory ?? null,
          startDate: payload.lecture.startDate,
          endDate: payload.lecture.endDate,
          isMultiSubject: payload.lecture.isMultiSubject,
          fullPackagePrice: payload.lecture.fullPackagePrice ?? null,
          maxCapacityOffline: payload.lecture.maxCapacityOffline ?? null,
          maxCapacityLive: payload.lecture.maxCapacityLive ?? null,
          isActive: payload.lecture.isActive,
          createdAt: payload.lecture.createdAt,
          enrolledCount: 0,
          instructorNames: [],
        };
        setLectures((prev) => [newLecture, ...prev]);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "등록 실패");
      }
    });
  }

  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">총 특강 수</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{lectures.length}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">진행중</p>
          <p className="mt-2 text-2xl font-semibold text-forest">{activeCount}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">이번 달 수강생</p>
          <p className="mt-2 text-2xl font-semibold text-ember">{thisMonthEnrollCount}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">총 수강생</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{totalEnrollCount}</p>
        </div>
      </div>

      {/* Filter tabs + action button */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-[20px] border border-ink/10 bg-white p-1.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              className={`rounded-[14px] px-4 py-2 text-sm font-medium transition ${
                activeFilter === tab.key
                  ? "bg-ember text-white shadow-sm"
                  : "text-slate hover:bg-mist hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
        >
          신규 특강
        </button>
      </div>

      {/* Table */}
      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-14 text-center text-sm text-slate">
            {activeFilter === "active"
              ? "진행 중인 특강이 없습니다."
              : activeFilter === "ended"
                ? "종료된 특강이 없습니다."
                : "등록된 특강이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  {["강좌명", "유형", "기간", "강사", "수강 현황", "상태", ""].map((h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filtered.map((lecture) => {
                  const isEnded = !lecture.isActive || new Date(lecture.endDate) < now;
                  const maxCap = lecture.maxCapacityOffline ?? lecture.maxCapacityLive;
                  return (
                    <tr
                      key={lecture.id}
                      className="cursor-pointer transition hover:bg-mist/20"
                      onClick={() => router.push(`/admin/special-lectures/${lecture.id}`)}
                    >
                      <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                        {lecture.name}
                        {lecture.isMultiSubject && (
                          <span className="ml-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700">
                            복합
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                        {LECTURE_TYPE_LABEL[lecture.lectureType]}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                        {lecture.startDate.slice(0, 10)} ~ {lecture.endDate.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {lecture.instructorNames.length > 0
                          ? lecture.instructorNames.join(", ")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-sm text-ink whitespace-nowrap">
                        {lecture.enrolledCount}
                        {maxCap != null ? (
                          <span className="text-slate"> / {maxCap}명</span>
                        ) : (
                          <span className="text-slate">명</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            isEnded
                              ? "border-ink/20 bg-ink/5 text-slate"
                              : "border-forest/30 bg-forest/10 text-forest"
                          }`}
                        >
                          {isEnded ? "종료" : "진행중"}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/admin/special-lectures/${lecture.id}`}
                          className="inline-flex rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          상세
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      <ActionModal
        open={showCreateModal}
        badgeLabel="특강 단과"
        badgeTone="warning"
        title="신규 특강 등록"
        description="특강·단과 강좌 기본 정보를 입력합니다. 등록 후 상세 페이지에서 과목과 강사를 추가할 수 있습니다."
        confirmLabel={isPending ? "등록 중..." : "등록"}
        cancelLabel="취소"
        confirmTone="default"
        isPending={isPending}
        onClose={handleCloseCreate}
        onConfirm={handleCreate}
        panelClassName="max-w-lg"
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate mb-1">
              강좌명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="예) 2026 형사법 집중 특강"
              className="w-full rounded-[14px] border border-ink/20 px-4 py-2.5 text-sm text-ink placeholder:text-slate/60 focus:border-ember focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate mb-1">
              유형
            </label>
            <select
              value={formLectureType}
              onChange={(e) => setFormLectureType(e.target.value as LectureType)}
              className="w-full rounded-[14px] border border-ink/20 px-4 py-2.5 text-sm text-ink focus:border-ember focus:outline-none"
            >
              {(Object.keys(LECTURE_TYPE_LABEL) as LectureType[]).map((k) => (
                <option key={k} value={k}>
                  {LECTURE_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate mb-1">
                시작일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className="w-full rounded-[14px] border border-ink/20 px-4 py-2.5 text-sm text-ink focus:border-ember focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate mb-1">
                종료일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className="w-full rounded-[14px] border border-ink/20 px-4 py-2.5 text-sm text-ink focus:border-ember focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate mb-1">
                최대 정원
              </label>
              <input
                type="number"
                min={1}
                value={formMaxCapacity}
                onChange={(e) => setFormMaxCapacity(e.target.value)}
                placeholder="미입력 시 무제한"
                className="w-full rounded-[14px] border border-ink/20 px-4 py-2.5 text-sm text-ink placeholder:text-slate/60 focus:border-ember focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate mb-1">
                정가 (원)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={formFullPackagePrice}
                onChange={(e) => setFormFullPackagePrice(e.target.value)}
                placeholder="예) 150000"
                className="w-full rounded-[14px] border border-ink/20 px-4 py-2.5 text-sm text-ink placeholder:text-slate/60 focus:border-ember focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate mb-1">
              강좌 설명
            </label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              placeholder="수강생에게 안내할 내용을 입력하세요 (선택)"
              className="w-full rounded-[14px] border border-ink/20 px-4 py-2.5 text-sm text-ink placeholder:text-slate/60 focus:border-ember focus:outline-none resize-none"
            />
          </div>
        </div>
      </ActionModal>
    </>
  );
}
