"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { ENROLLMENT_STATUS_COLOR, ENROLLMENT_STATUS_LABEL } from "@/lib/constants";
import type { LectureDetailData } from "./page";

type TabKey = "overview" | "students" | "subjects";

const TAB_CONFIG: { key: TabKey; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "students", label: "수강생" },
  { key: "subjects", label: "과목" },
];

const LECTURE_TYPE_LABEL: Record<string, string> = {
  THEMED: "주제특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접코칭",
};

type Props = {
  lecture: LectureDetailData;
};

export function SpecialLectureDetailClient({ lecture: initialLecture }: Props) {
  const router = useRouter();
  const [lecture, setLecture] = useState<LectureDetailData>(initialLecture);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [showDeactivateModal, setShowDeactivateModal] = useState<boolean>(false);
  const [showActivateModal, setShowActivateModal] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const now = new Date();
  const isEnded = !lecture.isActive || new Date(lecture.endDate) < now;

  const activeEnrollments = lecture.enrollments.filter((e) =>
    ["ACTIVE", "PENDING"].includes(e.status),
  );
  const totalRevenue = lecture.enrollments
    .filter((e) => ["ACTIVE", "PENDING", "COMPLETED"].includes(e.status))
    .reduce((sum, e) => sum + e.finalFee, 0);

  const maxCap = lecture.maxCapacityOffline ?? lecture.maxCapacityLive ?? null;
  const capacityPercent =
    maxCap != null && maxCap > 0 ? Math.min(100, Math.round((activeEnrollments.length / maxCap) * 100)) : null;

  function handleToggleActive(activate: boolean) {
    setActionError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/special-lectures/${lecture.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: activate }),
          cache: "no-store",
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "수정 실패");
        setLecture((prev) => ({ ...prev, isActive: activate }));
        setShowDeactivateModal(false);
        setShowActivateModal(false);
        router.refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "수정 실패");
      }
    });
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 rounded-[20px] border border-ink/10 bg-white p-1.5 w-fit">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-[14px] px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "bg-ember text-white shadow-sm"
                : "text-slate hover:bg-mist hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.key === "students" && (
              <span
                className={`ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  activeTab === tab.key ? "bg-white/20 text-white" : "bg-ink/10 text-slate"
                }`}
              >
                {lecture.enrollments.length}
              </span>
            )}
            {tab.key === "subjects" && (
              <span
                className={`ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  activeTab === tab.key ? "bg-white/20 text-white" : "bg-ink/10 text-slate"
                }`}
              >
                {lecture.subjects.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <div className="mt-6 space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-[28px] border border-ink/10 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate">수강생 (활성)</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {activeEnrollments.length}
                {maxCap != null && (
                  <span className="ml-1 text-base font-normal text-slate">/ {maxCap}명</span>
                )}
              </p>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate">누적 수강료</p>
              <p className="mt-2 text-2xl font-semibold text-ember">
                {totalRevenue.toLocaleString()}원
              </p>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate">상태</p>
              <p className="mt-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${
                    isEnded
                      ? "border-ink/20 bg-ink/5 text-slate"
                      : "border-forest/30 bg-forest/10 text-forest"
                  }`}
                >
                  {isEnded ? "종료" : "진행중"}
                </span>
              </p>
            </div>
          </div>

          {/* Capacity bar */}
          {capacityPercent !== null && (
            <div className="rounded-[28px] border border-ink/10 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">정원 사용률</h2>
                <span className="text-sm font-medium text-slate">
                  {activeEnrollments.length} / {maxCap}명 ({capacityPercent}%)
                </span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    capacityPercent >= 100
                      ? "bg-red-500"
                      : capacityPercent >= 80
                        ? "bg-amber-500"
                        : "bg-forest"
                  }`}
                  style={{ width: `${capacityPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Info card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="text-sm font-semibold text-ink mb-4">강좌 정보</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate">유형</dt>
                <dd className="mt-1 font-medium text-ink">
                  {LECTURE_TYPE_LABEL[lecture.lectureType] ?? lecture.lectureType}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate">시작일</dt>
                <dd className="mt-1 font-medium text-ink">{lecture.startDate.slice(0, 10)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate">종료일</dt>
                <dd className="mt-1 font-medium text-ink">{lecture.endDate.slice(0, 10)}</dd>
              </div>
              {lecture.fullPackagePrice != null && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate">정가</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {lecture.fullPackagePrice.toLocaleString()}원
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate">복합 과목</dt>
                <dd className="mt-1 font-medium text-ink">{lecture.isMultiSubject ? "예" : "아니오"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate">대기 허용</dt>
                <dd className="mt-1 font-medium text-ink">{lecture.waitlistAllowed ? "허용" : "불가"}</dd>
              </div>
            </dl>

            {/* Active/deactivate controls */}
            <div className="mt-6 border-t border-ink/10 pt-5 flex items-center gap-3">
              {actionError && (
                <p className="text-xs text-red-600 mr-auto">{actionError}</p>
              )}
              {lecture.isActive ? (
                <button
                  type="button"
                  onClick={() => setShowDeactivateModal(true)}
                  className="ml-auto inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                >
                  비활성화
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowActivateModal(true)}
                  className="ml-auto inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/20"
                >
                  활성화
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Students tab */}
      {activeTab === "students" && (
        <div className="mt-6">
          {lecture.enrollments.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-14 text-center text-sm text-slate">
              수강 등록된 학생이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
              <table className="min-w-full divide-y divide-ink/5 text-sm">
                <thead>
                  <tr>
                    {["학번", "이름", "연락처", "수강 시작일", "수강료", "상태"].map((h) => (
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
                  {lecture.enrollments.map((e) => {
                    const statusKey = e.status as keyof typeof ENROLLMENT_STATUS_LABEL;
                    return (
                      <tr key={e.id} className="transition hover:bg-mist/20">
                        <td className="px-4 py-3 tabular-nums">
                          <Link
                            href={`/admin/students/${e.examNumber}`}
                            className="font-medium text-forest hover:underline"
                          >
                            {e.examNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                          <Link
                            href={`/admin/students/${e.examNumber}`}
                            className="hover:text-forest hover:underline"
                          >
                            {e.studentName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                          {e.studentPhone ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                          {e.startDate.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-sm text-ink whitespace-nowrap">
                          {e.finalFee.toLocaleString()}원
                          {e.discountAmount > 0 && (
                            <span className="ml-1 text-xs text-slate">
                              (-{e.discountAmount.toLocaleString()})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              ENROLLMENT_STATUS_COLOR[statusKey] ?? "border-ink/20 bg-ink/5 text-slate"
                            }`}
                          >
                            {ENROLLMENT_STATUS_LABEL[statusKey] ?? e.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subjects tab */}
      {activeTab === "subjects" && (
        <div className="mt-6">
          {lecture.subjects.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-14 text-center text-sm text-slate">
              등록된 과목이 없습니다. 과목은 API를 통해 추가할 수 있습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
              <table className="min-w-full divide-y divide-ink/5 text-sm">
                <thead>
                  <tr>
                    {["순서", "과목명", "강사", "수강료", "강사 배분율"].map((h) => (
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
                  {lecture.subjects.map((s) => (
                    <tr key={s.id} className="transition hover:bg-mist/20">
                      <td className="px-4 py-3 tabular-nums text-slate">{s.sortOrder + 1}</td>
                      <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                        {s.subjectName}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink whitespace-nowrap">
                        {s.instructorName}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-sm text-ink whitespace-nowrap">
                        {s.price.toLocaleString()}원
                      </td>
                      <td className="px-4 py-3 tabular-nums text-sm text-ink whitespace-nowrap">
                        {s.instructorRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Deactivate modal */}
      <ActionModal
        open={showDeactivateModal}
        badgeLabel="특강 비활성화"
        badgeTone="warning"
        title="특강을 비활성화합니까?"
        description="비활성화하면 새 수강 등록이 불가능해집니다. 기존 수강생의 등록 내역은 유지됩니다."
        confirmLabel={isPending ? "처리 중..." : "비활성화"}
        cancelLabel="취소"
        confirmTone="danger"
        isPending={isPending}
        onClose={() => {
          if (!isPending) {
            setShowDeactivateModal(false);
            setActionError(null);
          }
        }}
        onConfirm={() => handleToggleActive(false)}
      />

      {/* Activate modal */}
      <ActionModal
        open={showActivateModal}
        badgeLabel="특강 활성화"
        badgeTone="default"
        title="특강을 활성화합니까?"
        description="활성화하면 새 수강 등록이 가능해집니다."
        confirmLabel={isPending ? "처리 중..." : "활성화"}
        cancelLabel="취소"
        confirmTone="default"
        isPending={isPending}
        onClose={() => {
          if (!isPending) {
            setShowActivateModal(false);
            setActionError(null);
          }
        }}
        onConfirm={() => handleToggleActive(true)}
      />
    </>
  );
}
