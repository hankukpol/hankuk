"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EXAM_CATEGORY_LABEL, ENROLLMENT_STATUS_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { CohortOption, TransferPageData } from "./page";

type Props = {
  data: TransferPageData;
};

export function TransferForm({ data }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCohortId, setSelectedCohortId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedCohort: CohortOption | undefined = data.availableCohorts.find(
    (c) => c.id === selectedCohortId,
  );

  const isFull =
    selectedCohort !== undefined &&
    selectedCohort.maxCapacity !== null &&
    selectedCohort.activeCount >= selectedCohort.maxCapacity;

  const isSameCohort = selectedCohortId === data.currentCohortId;

  const statusLabel =
    ENROLLMENT_STATUS_LABEL[
      data.currentStatus as keyof typeof ENROLLMENT_STATUS_LABEL
    ] ?? data.currentStatus;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedCohortId) {
      setError("이동할 기수를 선택해주세요.");
      return;
    }
    if (isSameCohort) {
      setError("현재와 동일한 기수입니다. 다른 기수를 선택해주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/enrollments/${data.enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          ...(reason.trim() ? { note: `반 이동 사유: ${reason.trim()}` } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "반 이동 처리에 실패했습니다.");
        return;
      }
      setSuccess(
        `반 이동이 완료되었습니다. → ${selectedCohort?.name ?? ""}`,
      );
      // Redirect back after short delay so user can see the success message
      setTimeout(() => {
        router.push(`/admin/enrollments/${data.enrollmentId}`);
      }, 1500);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Current info card */}
      <div className="rounded-[24px] border border-ink/10 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate">
          현재 수강 정보
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">
              학생
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {data.studentName}{" "}
              <span className="text-slate">({data.studentExamNumber})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">
              현재 상태
            </dt>
            <dd className="mt-1 font-medium text-ink">{statusLabel}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate">
              현재 기수
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {data.currentCohortName ?? (
                <span className="text-slate">미배정</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Target cohort selector */}
      <div className="rounded-[24px] border border-ink/10 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate">
          이동할 기수 선택
        </h2>

        {data.availableCohorts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink/10 p-4 text-center text-sm text-slate">
            이동 가능한 활성 기수가 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {data.availableCohorts.map((cohort) => {
              const full =
                cohort.maxCapacity !== null &&
                cohort.activeCount >= cohort.maxCapacity;
              const isSelected = selectedCohortId === cohort.id;
              const isCurrent = cohort.id === data.currentCohortId;

              return (
                <label
                  key={cohort.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                    isSelected
                      ? "border-forest bg-forest/5"
                      : "border-ink/10 hover:border-forest/30 hover:bg-mist/50"
                  } ${full && !isSelected ? "opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    name="cohortId"
                    value={cohort.id}
                    checked={isSelected}
                    onChange={() => {
                      setSelectedCohortId(cohort.id);
                      setError(null);
                    }}
                    className="mt-0.5 accent-[#1F4D3A]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{cohort.name}</span>
                      <span className="inline-flex items-center rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-slate">
                        {EXAM_CATEGORY_LABEL[cohort.examCategory]}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          현재
                        </span>
                      )}
                      {full && (
                        <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                          정원 초과
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate">
                      <span>
                        {formatDate(cohort.startDate)} ~{" "}
                        {formatDate(cohort.endDate)}
                      </span>
                      <span>
                        수강생{" "}
                        <strong className="text-ink">
                          {cohort.activeCount}
                        </strong>
                        {cohort.maxCapacity !== null && (
                          <> / {cohort.maxCapacity}명</>
                        )}
                      </span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* Capacity warning */}
        {isFull && selectedCohort && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
            <span>
              선택한 기수(<strong>{selectedCohort.name}</strong>)가 정원(
              {selectedCohort.maxCapacity}명)에 도달했습니다. 이동 후
              해당 기수 정원이 초과될 수 있습니다.
            </span>
          </div>
        )}

        {isSameCohort && selectedCohortId && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>현재 수강 중인 기수와 동일합니다.</span>
          </div>
        )}
      </div>

      {/* Reason field */}
      <div className="rounded-[24px] border border-ink/10 bg-white p-5">
        <label
          htmlFor="transfer-reason"
          className="mb-1.5 block text-sm font-semibold"
        >
          이동 사유{" "}
          <span className="text-xs font-normal text-slate">(선택)</span>
        </label>
        <input
          id="transfer-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 시간표 변경, 레벨 조정, 학생 요청 등"
          maxLength={200}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
        <p className="mt-1.5 text-xs text-slate">
          입력 시 수강 메모 및 감사 로그에 기록됩니다.
        </p>
      </div>

      {/* Error / success */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {success}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={
            isPending ||
            !selectedCohortId ||
            isSameCohort ||
            data.availableCohorts.length === 0 ||
            success !== null
          }
          className="inline-flex items-center rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "처리 중…" : "반 이동 확정"}
        </button>
        <a
          href={`/admin/enrollments/${data.enrollmentId}`}
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          취소
        </a>
      </div>
    </form>
  );
}
