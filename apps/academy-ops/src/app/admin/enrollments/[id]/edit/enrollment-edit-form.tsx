"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EnrollmentStatus,
  EnrollSource,
  CourseType,
} from "@prisma/client";
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLL_SOURCE_LABEL,
} from "@/lib/constants";

type CohortOption = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type Props = {
  enrollmentId: string;
  initialStatus: EnrollmentStatus;
  initialCohortId: string | null;
  initialEndDate: string;
  initialDiscountAmount: number;
  initialFinalFee: number;
  initialEnrollSource: EnrollSource | null;
  initialNote: string;
  courseType: CourseType;
  cohorts: CohortOption[];
};

const EDITABLE_STATUSES: EnrollmentStatus[] = [
  "PENDING",
  "ACTIVE",
  "WAITING",
  "SUSPENDED",
  "COMPLETED",
  "WITHDRAWN",
  "CANCELLED",
];

const ENROLL_SOURCES: (EnrollSource | "")[] = [
  "",
  "VISIT",
  "PHONE",
  "ONLINE",
  "REFERRAL",
  "SNS",
  "OTHER",
];

export function EnrollmentEditForm({
  enrollmentId,
  initialStatus,
  initialCohortId,
  initialEndDate,
  initialDiscountAmount,
  initialFinalFee,
  initialEnrollSource,
  initialNote,
  courseType,
  cohorts,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [status, setStatus] = useState<EnrollmentStatus>(initialStatus);
  const [cohortId, setCohortId] = useState<string>(initialCohortId ?? "");
  const [endDate, setEndDate] = useState<string>(initialEndDate);
  const [discountAmount, setDiscountAmount] = useState<string>(
    String(initialDiscountAmount),
  );
  const [finalFee, setFinalFee] = useState<string>(String(initialFinalFee));
  const [enrollSource, setEnrollSource] = useState<EnrollSource | "">(
    initialEnrollSource ?? "",
  );
  const [note, setNote] = useState<string>(initialNote);
  const [error, setError] = useState<string | null>(null);

  const isComprehensive = courseType === "COMPREHENSIVE";

  function handleCancel() {
    router.push(`/admin/enrollments/${enrollmentId}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const discountNum = parseInt(discountAmount, 10);
    const finalFeeNum = parseInt(finalFee, 10);

    if (isNaN(discountNum) || discountNum < 0) {
      setError("할인 금액은 0 이상의 숫자여야 합니다.");
      return;
    }
    if (isNaN(finalFeeNum) || finalFeeNum < 0) {
      setError("최종 수강료는 0 이상의 숫자여야 합니다.");
      return;
    }

    startTransition(async () => {
      const body: Record<string, unknown> = {
        status,
        endDate: endDate || null,
        discountAmount: discountNum,
        finalFee: finalFeeNum,
        enrollSource: enrollSource || null,
        note,
      };

      if (isComprehensive) {
        body.cohortId = cohortId || null;
      }

      const res = await fetch(`/api/enrollments/${enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "수정 실패");
        return;
      }

      router.push(`/admin/enrollments/${enrollmentId}`);
      router.refresh();
    });
  }

  const labelClass = "mb-1.5 block text-xs font-semibold text-slate";
  const inputClass =
    "w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30";
  const selectClass =
    "w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 상태 */}
      <div>
        <label className={labelClass}>수강 상태 *</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as EnrollmentStatus)}
          className={selectClass}
          required
        >
          {EDITABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ENROLLMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {/* 기수 (종합반만) */}
      {isComprehensive && (
        <div>
          <label className={labelClass}>기수 (반)</label>
          {cohorts.length === 0 ? (
            <p className="rounded-2xl border border-ink/10 bg-mist/40 px-4 py-3 text-sm text-slate">
              활성화된 기수가 없습니다.
            </p>
          ) : (
            <select
              value={cohortId}
              onChange={(e) => setCohortId(e.target.value)}
              className={selectClass}
            >
              <option value="">-- 기수 미배정 --</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* 수강 종료일 */}
      <div>
        <label className={labelClass}>수강 종료일</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* 할인 금액 */}
      <div>
        <label className={labelClass}>할인 금액 (원)</label>
        <input
          type="number"
          min={0}
          step={1000}
          value={discountAmount}
          onChange={(e) => setDiscountAmount(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* 최종 수강료 */}
      <div>
        <label className={labelClass}>최종 수강료 (원) *</label>
        <input
          type="number"
          min={0}
          step={1000}
          value={finalFee}
          onChange={(e) => setFinalFee(e.target.value)}
          className={inputClass}
          required
        />
      </div>

      {/* 등록 경로 */}
      <div>
        <label className={labelClass}>등록 경로</label>
        <select
          value={enrollSource}
          onChange={(e) => setEnrollSource(e.target.value as EnrollSource | "")}
          className={selectClass}
        >
          {ENROLL_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "-- 미선택 --" : ENROLL_SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {/* 메모 */}
      <div>
        <label className={labelClass}>메모</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="관리자 메모 (선택)"
          className="w-full resize-y rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      {/* 버튼 */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="inline-flex items-center rounded-full border border-ink/10 px-6 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}
