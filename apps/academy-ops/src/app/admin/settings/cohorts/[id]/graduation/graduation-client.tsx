"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type EnrollmentRow = {
  id: string;
  examNumber: string;
  studentName: string | null;
  studentPhone: string | null;
  status: "ACTIVE" | "PENDING";
  createdAt: string;
  finalFee: number;
};

type Props = {
  cohortId: string;
  cohortName: string;
  enrollments: EnrollmentRow[];
  activeCount: number;
};

type Step = "checklist" | "confirm" | "done";

type GraduateResult = {
  cohortName: string;
  graduatedCount: number;
  withdrawnCount: number;
};

export function GraduationClient({ cohortId, cohortName, enrollments, activeCount }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("checklist");
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(enrollments.map((e) => e.examNumber)),
  );
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<GraduateResult | null>(null);

  // Batch graduation modal state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isBatchPending, startBatchTransition] = useTransition();

  const graduateCount = checked.size;
  const withdrawCount = enrollments.length - checked.size;

  function toggleAll(value: boolean) {
    if (value) {
      setChecked(new Set(enrollments.map((e) => e.examNumber)));
    } else {
      setChecked(new Set());
    }
  }

  function toggleOne(examNumber: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(examNumber)) {
        next.delete(examNumber);
      } else {
        next.add(examNumber);
      }
      return next;
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/cohorts/${cohortId}/graduate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            graduateExamNumbers: Array.from(checked),
          }),
          cache: "no-store",
        });
        const payload = await res.json() as { data?: GraduateResult; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "수료 처리 실패");
        setResult(payload.data ?? null);
        setStep("done");
        toast.success(`${cohortName} 수료 처리 완료`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "수료 처리 중 오류가 발생했습니다.");
      }
    });
  }

  function handleBatchGraduate() {
    startBatchTransition(async () => {
      try {
        const res = await fetch(`/api/cohorts/${cohortId}/graduate-all`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sendNotification: false }),
          cache: "no-store",
        });
        const payload = await res.json() as { data?: { completedCount: number }; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "일괄 수료 처리 실패");
        const count = payload.data?.completedCount ?? 0;
        setShowBatchModal(false);
        toast.success(`${count}명 수료 처리 완료`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "일괄 수료 처리 중 오류가 발생했습니다.");
      }
    });
  }

  if (step === "done" && result) {
    return (
      <div className="mt-8 space-y-6">
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-forest/10">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1F4D3A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-forest">수료 처리 완료</h2>
          <p className="mt-2 text-sm text-slate">{result.cohortName} 기수 종료 처리가 완료되었습니다.</p>
          <div className="mt-6 inline-grid grid-cols-2 gap-4 text-left">
            <div className="rounded-[20px] border border-forest/20 bg-white px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">수료</p>
              <p className="mt-1 text-3xl font-bold text-forest tabular-nums">{result.graduatedCount}</p>
              <p className="mt-0.5 text-xs text-slate">명 수료 처리됨</p>
            </div>
            <div className="rounded-[20px] border border-red-200 bg-white px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">퇴원</p>
              <p className="mt-1 text-3xl font-bold text-red-600 tabular-nums">{result.withdrawnCount}</p>
              <p className="mt-0.5 text-xs text-slate">명 퇴원 처리됨</p>
            </div>
          </div>
          <div className="mt-8 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => router.push(`/admin/settings/cohorts/${cohortId}`)}
              className="inline-flex items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-mist"
            >
              기수 상세 보기
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/cohorts")}
              className="inline-flex items-center rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90"
            >
              기수 현황 대시보드
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="mt-8 space-y-6">
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-amber-900">수료 처리 확인</h2>
          <p className="mt-2 text-sm text-amber-800">
            아래 내용을 확인하고 진행하세요. 이 작업은 되돌릴 수 없습니다.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[20px] border border-amber-200 bg-white p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">대상 기수</p>
              <p className="mt-2 text-base font-bold text-ink">{cohortName}</p>
            </div>
            <div className="rounded-[20px] border border-forest/20 bg-white p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">수료 처리</p>
              <p className="mt-2 text-3xl font-bold text-forest tabular-nums">{graduateCount}명</p>
              <p className="mt-0.5 text-xs text-slate">COMPLETED 상태로 변경</p>
            </div>
            <div className="rounded-[20px] border border-red-200 bg-white p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">퇴원 처리</p>
              <p className="mt-2 text-3xl font-bold text-red-600 tabular-nums">{withdrawCount}명</p>
              <p className="mt-0.5 text-xs text-slate">WITHDRAWN 상태로 변경</p>
            </div>
          </div>

          <div className="mt-5 rounded-[16px] border border-amber-300 bg-amber-100/50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-800">처리 후 변경 사항:</p>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
              <li>· 기수 상태가 <strong>비활성(isActive = false)</strong>으로 변경됩니다</li>
              <li>· 체크된 학생은 <strong>수료(COMPLETED)</strong>, 미체크 학생은 <strong>퇴원(WITHDRAWN)</strong> 처리됩니다</li>
              <li>· 대기자(WAITING) 학생은 처리 대상에서 제외됩니다</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setStep("checklist")}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-mist disabled:opacity-50"
            >
              목록으로 돌아가기
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending || graduateCount === 0 && withdrawCount === 0}
              className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  처리 중...
                </>
              ) : (
                "확인 — 기수 종료 처리"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // step === "checklist"
  const allChecked = checked.size === enrollments.length;
  const noneChecked = checked.size === 0;

  return (
    <div className="mt-8 space-y-6">
      {/* Batch graduation quick action */}
      {activeCount > 0 && (
        <div className="flex items-center justify-between rounded-[24px] border border-forest/20 bg-forest/5 px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-forest">전체 수료 일괄 처리</p>
            <p className="mt-0.5 text-xs text-forest/70">
              수강 중인 학생 {activeCount}명을 선택 없이 모두 수료 처리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowBatchModal(true)}
            disabled={activeCount === 0}
            className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            수강 중 학생 {activeCount}명 전체 수료 처리
          </button>
        </div>
      )}

      {/* Batch graduation confirm modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-ink/10 bg-white p-7 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">전체 수료 처리 확인</h2>
            <p className="mt-3 text-sm text-slate">
              총 <strong className="text-ink">{activeCount}명</strong>을 수료 처리합니다.
              이 작업은 되돌릴 수 없습니다.
            </p>
            <p className="mt-2 text-xs text-slate">
              · ACTIVE 상태 학생만 COMPLETED로 변경됩니다.<br />
              · PENDING / WAITING 학생은 변경되지 않습니다.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                disabled={isBatchPending}
                className="inline-flex items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-mist disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleBatchGraduate}
                disabled={isBatchPending}
                className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBatchPending ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    처리 중...
                  </>
                ) : (
                  "확인"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">수료 대상 선택</h2>
            <p className="mt-1 text-xs text-slate">
              체크한 학생은 <strong>수료(COMPLETED)</strong>, 체크 해제된 학생은 <strong>퇴원(WITHDRAWN)</strong>으로 처리됩니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate">
              <strong className="text-forest">{graduateCount}</strong>명 수료 ·{" "}
              <strong className="text-red-600">{withdrawCount}</strong>명 퇴원
            </span>
          </div>
        </div>

        {enrollments.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 px-5 py-10 text-center text-sm text-slate">
            수료 처리할 재원생이 없습니다.
          </div>
        ) : (
          <>
            {/* Select all / deselect all */}
            <div className="mt-5 flex items-center gap-3 rounded-[16px] border border-ink/10 bg-mist/50 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && !noneChecked;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-ink/20 text-forest accent-[#1F4D3A]"
                />
                전체 선택 ({enrollments.length}명)
              </label>
              <span className="text-xs text-slate">|</span>
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="text-xs font-medium text-forest underline hover:text-forest/80"
              >
                모두 수료
              </button>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="text-xs font-medium text-red-600 underline hover:text-red-500"
              >
                모두 퇴원
              </button>
            </div>

            {/* Student list */}
            <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/5 text-sm">
                <thead>
                  <tr>
                    {["", "이름", "학번", "연락처", "수강료", "등록일", "결과"].map((h, i) => (
                      <th
                        key={i}
                        className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {enrollments.map((e) => {
                    const isGraduate = checked.has(e.examNumber);
                    return (
                      <tr
                        key={e.id}
                        onClick={() => toggleOne(e.examNumber)}
                        className={`cursor-pointer transition ${
                          isGraduate ? "bg-forest/3 hover:bg-forest/5" : "bg-red-50/40 hover:bg-red-50"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isGraduate}
                            onChange={() => toggleOne(e.examNumber)}
                            onClick={(ev) => ev.stopPropagation()}
                            className="h-4 w-4 rounded border-ink/20 accent-[#1F4D3A]"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                          {e.studentName ?? "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate text-xs">{e.examNumber}</td>
                        <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                          {e.studentPhone ?? "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate text-xs whitespace-nowrap">
                          {e.finalFee.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                          {e.createdAt.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              isGraduate
                                ? "border-forest/20 bg-forest/10 text-forest"
                                : "border-red-200 bg-red-50 text-red-600"
                            }`}
                          >
                            {isGraduate ? "수료" : "퇴원"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() =>
              (window.location.href = `/admin/settings/cohorts/${cohortId}`)
            }
            className="inline-flex items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-mist"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => setStep("confirm")}
            disabled={enrollments.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            기수 종료 처리 진행 &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
