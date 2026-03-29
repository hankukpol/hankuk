"use client";

import Link from "next/link";
import { Subject } from "@prisma/client";
import { toast } from "sonner";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { SUBJECT_LABEL } from "@/lib/constants";
import { toDateInputValue } from "@/lib/format";
import { useRef, useState, useTransition } from "react";

type CounselingRecord = {
  id: number;
  examNumber: string;
  counselorName: string;
  content: string;
  recommendation: string | null;
  counseledAt: string;
  nextSchedule: string | null;
};

type CounselingPanelProps = {
  examNumber: string;
  defaultCounselorName: string;
  targetScores: Partial<Record<Subject, number>>;
  subjects: Subject[];
  records: CounselingRecord[];
};

function Spinner() {
  return (
    <svg
      className="mr-1.5 inline-block h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

/**
 * 개별 면담 기록 카드 컴포넌트
 *
 * 기존 기능: 수정 저장, 삭제
 * 추가 기능: 학생 변경 (잘못 등록된 경우 수험번호 교체)
 *   - 카드 하단 토글 버튼으로 표시/숨김
 *   - 변경 후 해당 기록은 현재 학생 패널에서 제거됨
 *     (다른 학생으로 이전되므로 현재 목록에 남아있으면 안 됨)
 */
function RecordCard({
  record,
  isPending,
  onDelete,
  onUpdate,
  onChangeStudent,
}: {
  record: CounselingRecord;
  isPending: boolean;
  onDelete: (id: number) => void;
  onUpdate: (id: number, formData: FormData) => void;
  onChangeStudent: (id: number, newExamNumber: string) => void;
}) {
  // 학생 변경 섹션 표시 여부 (기본 숨김, 필요할 때만 노출)
  const [showChangeStudent, setShowChangeStudent] = useState(false);
  const [newExamNumber, setNewExamNumber] = useState("");
  const confirmModal = useActionModalState();
  const formRef = useRef<HTMLFormElement | null>(null);

  useSubmitShortcut({
    containerRef: formRef,
    enabled: !isPending,
    onSubmit: () => {
      if (formRef.current) {
        onUpdate(record.id, new FormData(formRef.current));
      }
    },
  });

  return (
    <form ref={formRef} className="rounded-[24px] border border-ink/10 bg-mist p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium">담당 강사</label>
          <input
            name="counselorName"
            defaultValue={record.counselorName}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">면담 일자</label>
          <input
            type="date"
            name="counseledAt"
            defaultValue={toDateInputValue(record.counseledAt)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
          />
        </div>
        <div className="xl:col-span-2">
          <label className="mb-2 block text-sm font-medium">다음 면담 일정</label>
          <input
            type="date"
            name="nextSchedule"
            defaultValue={toDateInputValue(record.nextSchedule)}
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
          />
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium">면담 내용</label>
        <textarea
          name="content"
          rows={3}
          defaultValue={record.content}
          className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
        />
      </div>
      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium">추천 학습 방향</label>
        <textarea
          name="recommendation"
          rows={2}
          defaultValue={record.recommendation ?? ""}
          className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
        />
      </div>
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          onClick={() => onDelete(record.id)}
          disabled={isPending}
          className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending && <Spinner />}
          삭제
        </button>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/counseling/${record.id}`}
            target="_blank"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            상세 보기
          </Link>
          <button
            type="button"
            onClick={() => {
              if (formRef.current) {
                onUpdate(record.id, new FormData(formRef.current));
              }
            }}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending && <Spinner />}
            수정 저장
          </button>
        </div>
      </div>

      {/* 학생 변경 섹션 */}
      <div className="mt-4 border-t border-ink/10 pt-4">
        <button
          type="button"
          onClick={() => setShowChangeStudent((v) => !v)}
          className="text-xs font-semibold text-slate hover:text-ember"
        >
          {showChangeStudent ? "▲ 학생 변경 닫기" : "▼ 학생 변경 (잘못 등록된 경우)"}
        </button>

        {showChangeStudent ? (
          <div className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-2 block text-xs font-medium text-slate">
                현재: <span className="font-semibold text-ink">{record.examNumber}</span>
                <span className="ml-2">→ 변경할 수험번호</span>
              </label>
              <input
                type="text"
                value={newExamNumber}
                onChange={(e) => setNewExamNumber(e.target.value)}
                placeholder="새 수험번호 입력"
                className="w-full rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={isPending || !newExamNumber.trim()}
              onClick={() => {
                confirmModal.openModal({
                  badgeLabel: "변경 확인",
                  badgeTone: "warning",
                  title: "학생 변경",
                  description: `이 면담 기록의 학생을 "${newExamNumber}"으로 변경하시겠습니까?`,
                  details: ["변경 후 이 면담 기록은 새 학생 계정으로 연결됩니다."],
                  cancelLabel: "취소",
                  confirmLabel: "변경",
                  onConfirm: () => {
                    confirmModal.closeModal();
                    onChangeStudent(record.id, newExamNumber);
                    setNewExamNumber("");
                    setShowChangeStudent(false);
                  },
                });
              }}
              className="inline-flex items-center rounded-full bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <Spinner />}
              학생 변경
            </button>
          </div>
        ) : null}
      </div>
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </form>
  );
}

export function CounselingPanel({
  examNumber,
  defaultCounselorName,
  targetScores: initialTargetScores,
  subjects,
  records: initialRecords,
}: CounselingPanelProps) {
  const [records, setRecords] = useState<CounselingRecord[]>(initialRecords);
  const [targetScores, setTargetScores] = useState<Record<string, string>>(
    Object.fromEntries(
      subjects.map((subject) => [subject, initialTargetScores[subject]?.toString() ?? ""]),
    ),
  );
  const [counselorName, setCounselorName] = useState(defaultCounselorName);
  const [content, setContent] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [counseledAt, setCounseledAt] = useState(toDateInputValue(new Date()));
  const [nextSchedule, setNextSchedule] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const targetSectionRef = useRef<HTMLElement | null>(null);
  const createRecordSectionRef = useRef<HTMLElement | null>(null);

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "요청에 실패했습니다.");
    }

    return payload;
  }

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNotice(nextNotice);
    setErrorMessage(nextError);
  }

  function saveTargets() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson(`/api/students/${examNumber}/targets`, {
          method: "PUT",
          body: JSON.stringify({ targetScores }),
        });

        setNotice("목표 점수를 저장했습니다.");
        toast.success("목표 점수를 저장했습니다.");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "목표 점수 저장에 실패했습니다.";
        setMessage(null, msg);
        toast.error(msg);
      }
    });
  }

  function createRecord() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const { record } = await requestJson("/api/counseling", {
          method: "POST",
          body: JSON.stringify({
            examNumber,
            counselorName,
            content,
            recommendation,
            counseledAt,
            nextSchedule: nextSchedule || null,
          }),
        });

        // 폼 초기화
        setContent("");
        setRecommendation("");
        setNextSchedule("");

        // 목록 앞에 추가
        setRecords((prev) => [record, ...prev]);
        setNotice("면담 기록을 저장했습니다.");
        toast.success("면담 기록을 저장했습니다.");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "면담 기록 저장에 실패했습니다.";
        setMessage(null, msg);
        toast.error(msg);
      }
    });
  }

  function deleteRecord(recordId: number) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: "면담 기록 삭제",
      description: "이 면담 기록을 삭제하시겠습니까?",
      details: ["삭제 후에는 되돌릴 수 없으며 통계에도 반영됩니다."],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);

        startTransition(async () => {
          try {
            await requestJson(`/api/counseling/${recordId}`, { method: "DELETE" });
            setRecords((prev) => prev.filter((r) => r.id !== recordId));
            setNotice("면담 기록을 삭제했습니다.");
            toast.success("면담 기록을 삭제했습니다.");
          } catch (error) {
            const msg = error instanceof Error ? error.message : "면담 기록 삭제에 실패했습니다.";
            setMessage(null, msg);
            toast.error(msg);
          }
        });
      },
    });
  }

  function updateRecord(recordId: number, formData: FormData) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const { record } = await requestJson(`/api/counseling/${recordId}`, {
          method: "PUT",
          body: JSON.stringify({
            counselorName: String(formData.get("counselorName") ?? ""),
            content: String(formData.get("content") ?? ""),
            recommendation: String(formData.get("recommendation") ?? ""),
            counseledAt: String(formData.get("counseledAt") ?? ""),
            nextSchedule: String(formData.get("nextSchedule") ?? "") || null,
          }),
        });

        setRecords((prev) => prev.map((r) => (r.id === recordId ? record : r)));
        setNotice("면담 기록을 수정했습니다.");
        toast.success("면담 기록을 수정했습니다.");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "면담 기록 수정에 실패했습니다.";
        setMessage(null, msg);
        toast.error(msg);
      }
    });
  }

  /**
   * 면담 기록의 수험번호를 변경한다.
   *
   * 이 패널은 특정 학생(examNumber)에 고정되어 있으므로,
   * 다른 학생으로 이전된 기록은 현재 목록에서 제거한다.
   * (새 수험번호의 학생 패널을 열면 해당 기록이 보임)
   */
  function changeStudent(recordId: number, newExamNumber: string) {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const { record } = await requestJson(`/api/counseling/${recordId}`, {
          method: "PUT",
          body: JSON.stringify({ action: "changeStudent", newExamNumber }),
        });

        // 다른 학생으로 이전됐으므로 현재 패널 목록에서 제거
        setRecords((prev) => prev.filter((r) => r.id !== recordId));
        const successMsg = `면담 기록(#${recordId})을 수험번호 "${record.examNumber}"으로 이전했습니다. 이 학생의 목록에서는 제거됩니다.`;
        setNotice(successMsg);
        toast.success(`면담 기록을 "${record.examNumber}"으로 이전했습니다.`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "학생 변경에 실패했습니다.";
        setMessage(null, msg);
        toast.error(msg);
      }
    });
  }

  useSubmitShortcut({
    containerRef: targetSectionRef,
    enabled: !isPending,
    onSubmit: saveTargets,
  });

  useSubmitShortcut({
    containerRef: createRecordSectionRef,
    enabled: !isPending,
    onSubmit: createRecord,
  });

  return (
    <div className="space-y-8">
      {notice ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <section ref={targetSectionRef} className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">과목별 목표 점수</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              목표 점수는 개인 분석 레이더와 면담 달성률 계산에 바로 반영됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={saveTargets}
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {isPending && <Spinner />}
            목표 저장
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <div key={subject}>
              <label className="mb-2 block text-sm font-medium">{SUBJECT_LABEL[subject]}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={targetScores[subject] ?? ""}
                onChange={(event) =>
                  setTargetScores((current) => ({
                    ...current,
                    [subject]: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              />
            </div>
          ))}
        </div>
      </section>

      <section ref={createRecordSectionRef} className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">면담 기록 입력</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              저장 즉시 아래 이력 목록에 반영됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            인쇄 / PDF
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">담당 강사</label>
            <input
              value={counselorName}
              onChange={(event) => setCounselorName(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">면담 일자</label>
            <input
              type="date"
              value={counseledAt}
              onChange={(event) => setCounseledAt(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium">다음 면담 일정</label>
            <input
              type="date"
              value={nextSchedule}
              onChange={(event) => setNextSchedule(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">면담 내용</label>
          <textarea
            rows={4}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
          />
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">추천 학습 방향</label>
          <textarea
            rows={3}
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value)}
            className="w-full rounded-3xl border border-ink/10 px-4 py-3 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={createRecord}
          disabled={isPending}
          className="mt-4 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          {isPending && <Spinner />}
          면담 기록 저장
        </button>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">과거 면담 이력</h2>
        <div className="mt-6 space-y-4">
          {records.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              저장된 면담 기록이 없습니다.
            </div>
          ) : null}
          {records.map((record) => (
            <RecordCard
              key={record.id}
              record={record}
              isPending={isPending}
              onDelete={deleteRecord}
              onUpdate={updateRecord}
              onChangeStudent={changeStudent}
            />
          ))}
        </div>
      </section>
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}