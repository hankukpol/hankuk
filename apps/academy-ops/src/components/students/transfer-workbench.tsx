"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { EXAM_TYPE_LABEL, STUDENT_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type TransferCounts = {
  scores: number;
  enrollments: number;
  absenceNotes: number;
  counselingRecords: number;
  counselingAppointments: number;
  pointLogs: number;
  weeklyStatusSnapshots: number;
  studentAnswers: number;
  wrongNoteBookmarks: number;
  notifications: number;
};

type TransferPreview = {
  sourceStudent: {
    examNumber: string;
    name: string;
    phone: string | null;
    generation: number | null;
    className: string | null;
    examType: "GONGCHAE" | "GYEONGCHAE";
    studentType: "NEW" | "EXISTING";
    onlineId: string | null;
    registeredAt: string | null;
    note: string | null;
    isActive: boolean;
    notificationConsent: boolean;
    currentStatus: string;
  };
  targetStudent: {
    examNumber: string;
    name: string;
    isActive: boolean;
  } | null;
  counts: TransferCounts;
  totalLinkedCount: number;
  canTransfer: boolean;
  conflictReason: string | null;
};

const COUNT_LABELS: Array<{ key: keyof TransferCounts; label: string }> = [
  { key: "scores", label: "성적" },
  { key: "enrollments", label: "수강 등록" },
  { key: "absenceNotes", label: "사유서" },
  { key: "counselingRecords", label: "상담 기록" },
  { key: "counselingAppointments", label: "상담 일정" },
  { key: "pointLogs", label: "포인트" },
  { key: "weeklyStatusSnapshots", label: "주간 상태 스냅샷" },
  { key: "studentAnswers", label: "학생 답안" },
  { key: "wrongNoteBookmarks", label: "오답 북마크" },
  { key: "notifications", label: "알림 이력" },
];

export function TransferWorkbench() {
  const [fromExamNumber, setFromExamNumber] = useState("");
  const [toExamNumber, setToExamNumber] = useState("");
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const completionModal = useActionModalState();

  const normalizedFrom = fromExamNumber.trim();
  const normalizedTo = toExamNumber.trim();
  const previewMatchesInput =
    preview?.sourceStudent.examNumber === normalizedFrom && normalizedTo.length > 0;

  const previewRows = useMemo(
    () =>
      preview
        ? COUNT_LABELS.map(({ key, label }) => ({
            key,
            label,
            count: preview.counts[key],
          }))
        : [],
    [preview],
  );

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "요청 처리에 실패했습니다.");
    }

    return payload;
  }

  function resetMessages() {
    setNotice(null);
    setErrorMessage(null);
  }

  function loadPreview() {
    resetMessages();
    setConfirmed(false);

    startTransition(async () => {
      try {
        const params = new URLSearchParams({ fromExamNumber: normalizedFrom });
        if (normalizedTo) {
          params.set("toExamNumber", normalizedTo);
        }
        const result = await requestJson(`/api/students/transfer?${params.toString()}`);
        setPreview(result);
      } catch (error) {
        setPreview(null);
        setErrorMessage(
          error instanceof Error ? error.message : "수험번호 이전 미리보기에 실패했습니다.",
        );
      }
    });
  }

  function executeTransfer() {
    if (!preview || !previewMatchesInput) {
      setErrorMessage("먼저 현재 입력값으로 미리보기를 다시 실행해 주세요.");
      return;
    }

    if (!preview.canTransfer) {
      setErrorMessage(preview.conflictReason ?? "이전할 수 없는 상태입니다.");
      return;
    }

    if (!confirmed) {
      setErrorMessage("데이터 이전 확인 체크를 먼저 해 주세요.");
      return;
    }

    confirmModal.openModal({
      badgeLabel: "이전 확인",
      badgeTone: "warning",
      title: "수험번호 이전",
      description: `${preview.sourceStudent.name} (${preview.sourceStudent.examNumber}) 학생 데이터를 ${normalizedTo}로 이전합니다. 계속하시겠습니까?`,
      details: ["기존 학생 기록은 유지되며, 새 수험번호로 계정이 이전됩니다."],
      cancelLabel: "취소",
      confirmLabel: "이전",
      onConfirm: () => {
        confirmModal.closeModal();
        resetMessages();

        startTransition(async () => {
          try {
            const result = await requestJson("/api/students/transfer", {
              method: "POST",
              body: JSON.stringify({
                fromExamNumber: normalizedFrom,
                toExamNumber: normalizedTo,
              }),
            });

            setNotice(null);
            completionModal.openModal({
              badgeLabel: "이전 완료",
              badgeTone: "success",
              title: "수험번호 이전 완료",
              description: "수험번호 이전이 완료되었습니다.",
              details: [`새 수험번호: ${result.toExamNumber}`],
              confirmLabel: "확인",
            });
            setPreview(null);
            setFromExamNumber("");
            setToExamNumber("");
            setConfirmed(false);
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : "수험번호 이전에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">수험번호 이전 도구</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
              잘못 등록된 수험번호의 학생 레코드와 연결 데이터를 새 수험번호로 이전합니다.
              기존 학생은 비활성화되고, 성적·출결·사유서·상담·포인트·알림 이력이 함께 이동합니다.
            </p>
          </div>
          <Link
            href="/admin/students"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30"
          >
            수강생 목록
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">기존 수험번호</label>
            <input
              value={fromExamNumber}
              onChange={(event) => setFromExamNumber(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="예: G20250001"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">새 수험번호</label>
            <input
              value={toExamNumber}
              onChange={(event) => setToExamNumber(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="예: G20259999"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadPreview}
            disabled={isPending || !normalizedFrom}
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-forest/30 hover:text-forest disabled:cursor-not-allowed disabled:opacity-40"
          >
            미리보기
          </button>
          <button
            type="button"
            onClick={executeTransfer}
            disabled={
              isPending ||
              !preview ||
              !previewMatchesInput ||
              !preview.canTransfer ||
              !confirmed
            }
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            이전 실행
          </button>
        </div>

        {notice ? (
          <div className="mt-5 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
            {notice}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </section>

      {preview ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">이전 미리보기</h2>
              <p className="mt-2 text-sm text-slate">
                {preview.sourceStudent.name} ({preview.sourceStudent.examNumber}) → {normalizedTo || "새 수험번호 입력 필요"}
              </p>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                preview.canTransfer
                  ? "border-forest/20 bg-forest/10 text-forest"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {preview.canTransfer ? "이전 가능" : preview.conflictReason ?? "이전 불가"}
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-xs text-slate">학생명</p>
              <p className="mt-2 text-base font-semibold">{preview.sourceStudent.name}</p>
              <p className="mt-1 text-sm text-slate">{EXAM_TYPE_LABEL[preview.sourceStudent.examType]}</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-xs text-slate">기수 / 반</p>
              <p className="mt-2 text-base font-semibold">
                {preview.sourceStudent.generation ?? "-"}기 · {preview.sourceStudent.className ?? "-"}
              </p>
              <p className="mt-1 text-sm text-slate">{STUDENT_TYPE_LABEL[preview.sourceStudent.studentType]}</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-xs text-slate">연락처</p>
              <p className="mt-2 text-base font-semibold">{preview.sourceStudent.phone ?? "-"}</p>
              <p className="mt-1 text-sm text-slate">온라인 ID: {preview.sourceStudent.onlineId ?? "-"}</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-xs text-slate">연결 데이터 합계</p>
              <p className="mt-2 text-base font-semibold">{preview.totalLinkedCount}건</p>
              <p className="mt-1 text-sm text-slate">
                등록일 {preview.sourceStudent.registeredAt ? formatDate(preview.sourceStudent.registeredAt) : "-"}
              </p>
            </article>
          </div>

          <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">항목</th>
                  <th className="px-4 py-3 font-semibold">이전 건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {previewRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3 tabular-nums">{row.count}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.targetStudent ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              새 수험번호 {preview.targetStudent.examNumber}는 이미 {preview.targetStudent.name} 학생이 사용 중입니다.
            </div>
          ) : null}

          <label className="mt-6 inline-flex items-start gap-3 text-sm text-slate">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={!preview.canTransfer}
              className="mt-1"
            />
            <span>
              기존 학생은 비활성화되고, 연결 데이터가 새 수험번호로 이전되는 것을 확인했습니다.
            </span>
          </label>
        </section>
      ) : null}
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
      <ActionModal
        open={Boolean(completionModal.modal)}
        badgeLabel={completionModal.modal?.badgeLabel ?? ""}
        badgeTone={completionModal.modal?.badgeTone}
        title={completionModal.modal?.title ?? ""}
        description={completionModal.modal?.description ?? ""}
        details={completionModal.modal?.details ?? []}
        confirmLabel={completionModal.modal?.confirmLabel ?? "확인"}
        onClose={completionModal.closeModal}
        onConfirm={completionModal.modal?.onConfirm}
      />
    </div>
  );
}