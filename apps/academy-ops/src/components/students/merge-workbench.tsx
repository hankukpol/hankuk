"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { EXAM_TYPE_LABEL, STUDENT_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type MergeCounts = {
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

type MergeConflictCounts = {
  scores: number;
  enrollments: number;
  absenceNotes: number;
  weeklyStatusSnapshots: number;
  studentAnswers: number;
  wrongNoteBookmarks: number;
};

type MergePreview = {
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
  sourceCounts: MergeCounts;
  targetCounts: MergeCounts;
  conflictCounts: MergeConflictCounts;
  totalSourceLinkedCount: number;
  totalTargetLinkedCount: number;
  totalConflictCount: number;
  warnings: string[];
  canMerge: boolean;
  conflictReason: string | null;
};

const COUNT_LABELS: Array<{ key: keyof MergeCounts; label: string }> = [
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

const CONFLICT_LABELS: Record<keyof MergeConflictCounts, string> = {
  scores: "겹치는 성적",
  enrollments: "겹치는 수강 등록",
  absenceNotes: "겹치는 사유서",
  weeklyStatusSnapshots: "겹치는 주간 상태",
  studentAnswers: "겹치는 학생 답안",
  wrongNoteBookmarks: "겹치는 오답 북마크",
};

export function MergeWorkbench() {
  const [sourceExamNumber, setSourceExamNumber] = useState("");
  const [targetExamNumber, setTargetExamNumber] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const completionModal = useActionModalState();

  const normalizedSource = sourceExamNumber.trim();
  const normalizedTarget = targetExamNumber.trim();
  const previewMatchesInput =
    preview?.sourceStudent.examNumber === normalizedSource &&
    preview?.targetStudent.examNumber === normalizedTarget;

  const countRows = useMemo(
    () =>
      preview
        ? COUNT_LABELS.map(({ key, label }) => ({
            key,
            label,
            sourceCount: preview.sourceCounts[key],
            targetCount: preview.targetCounts[key],
            conflictCount:
              key in preview.conflictCounts
                ? preview.conflictCounts[key as keyof MergeConflictCounts]
                : 0,
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
        const params = new URLSearchParams({
          sourceExamNumber: normalizedSource,
          targetExamNumber: normalizedTarget,
        });
        const result = await requestJson(`/api/students/merge?${params.toString()}`);
        setPreview(result);
      } catch (error) {
        setPreview(null);
        setErrorMessage(
          error instanceof Error ? error.message : "학생 병합 미리보기에 실패했습니다.",
        );
      }
    });
  }

  function executeMerge() {
    if (!preview || !previewMatchesInput) {
      setErrorMessage("현재 입력값으로 미리보기를 다시 실행해 주세요.");
      return;
    }

    if (!preview.canMerge) {
      setErrorMessage(preview.conflictReason ?? "병합할 수 없는 상태입니다.");
      return;
    }

    if (!confirmed) {
      setErrorMessage("병합 확인 체크를 먼저 해 주세요.");
      return;
    }

    confirmModal.openModal({
      badgeLabel: "병합 확인",
      badgeTone: "warning",
      title: "학생 데이터 병합",
      description: `${preview.sourceStudent.name} (${preview.sourceStudent.examNumber}) 학생 데이터를 ${preview.targetStudent.name} (${preview.targetStudent.examNumber}) 계정으로 병합합니다. 계속하시겠습니까?`,
      details: ["기존 학생 정보와 성적 기록은 대상 계정으로 통합되며 되돌릴 수 없습니다."],
      cancelLabel: "취소",
      confirmLabel: "병합",
      onConfirm: () => {
        confirmModal.closeModal();
        resetMessages();

        startTransition(async () => {
          try {
            const result = await requestJson("/api/students/merge", {
              method: "POST",
              body: JSON.stringify({
                sourceExamNumber: normalizedSource,
                targetExamNumber: normalizedTarget,
              }),
            });

            setNotice(null);
            completionModal.openModal({
              badgeLabel: "병합 완료",
              badgeTone: "success",
              title: "학생 병합 완료",
              description: "학생 병합이 완료되었습니다.",
              details: [
                `원본 ${result.sourceExamNumber} → 대상 ${result.targetExamNumber}`,
              ],
              confirmLabel: "확인",
            });
            setPreview(null);
            setSourceExamNumber("");
            setTargetExamNumber("");
            setConfirmed(false);
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "학생 병합에 실패했습니다.");
          }
        });
      },
    });
  }

  function renderStudentCard(title: string, student: MergePreview["sourceStudent"] | MergePreview["targetStudent"]) {
    return (
      <article className="rounded-[24px] border border-ink/10 bg-mist p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">{title}</p>
        <h3 className="mt-3 text-lg font-semibold">{student.name}</h3>
        <p className="mt-1 text-sm text-slate">{student.examNumber}</p>
        <div className="mt-4 grid gap-3 text-sm text-slate sm:grid-cols-2">
          <div>
            <p className="text-xs">직렬 / 구분</p>
            <p className="mt-1 font-medium text-ink">
              {EXAM_TYPE_LABEL[student.examType]} · {STUDENT_TYPE_LABEL[student.studentType]}
            </p>
          </div>
          <div>
            <p className="text-xs">상태</p>
            <p className="mt-1 font-medium text-ink">
              {student.isActive ? "활성" : "비활성"} · {student.currentStatus}
            </p>
          </div>
          <div>
            <p className="text-xs">기수 / 반</p>
            <p className="mt-1 font-medium text-ink">
              {student.generation ?? "-"}기 · {student.className ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-xs">연락처 / 온라인 ID</p>
            <p className="mt-1 font-medium text-ink">
              {student.phone ?? "-"} · {student.onlineId ?? "-"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs">등록일 / 메모</p>
            <p className="mt-1 font-medium text-ink">
              {student.registeredAt ? formatDate(student.registeredAt) : "-"}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate">{student.note ?? "메모 없음"}</p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">학생 병합 도구</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
              같은 학생이 서로 다른 수험번호로 중복 등록된 경우 원본 계정의 연결 데이터를 대상 계정으로 병합합니다.
              겹치는 회차 데이터는 대상 학생 기준으로 정리하고, 병합 후 원본 학생은 비활성 상태로 남습니다.
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
            <label className="mb-2 block text-sm font-medium">원본 수험번호</label>
            <input
              value={sourceExamNumber}
              onChange={(event) => setSourceExamNumber(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="예: G20250001"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">대상 수험번호</label>
            <input
              value={targetExamNumber}
              onChange={(event) => setTargetExamNumber(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="예: G20259999"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadPreview}
            disabled={isPending || !normalizedSource || !normalizedTarget}
            className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-forest/30 hover:text-forest disabled:cursor-not-allowed disabled:opacity-40"
          >
            미리보기
          </button>
          <button
            type="button"
            onClick={executeMerge}
            disabled={
              isPending ||
              !preview ||
              !previewMatchesInput ||
              !preview.canMerge ||
              !confirmed
            }
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            병합 실행
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
        <section className="space-y-6 rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">병합 미리보기</h2>
              <p className="mt-2 text-sm text-slate">
                {preview.sourceStudent.examNumber} → {preview.targetStudent.examNumber}
              </p>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                preview.canMerge
                  ? "border-forest/20 bg-forest/10 text-forest"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {preview.canMerge ? "병합 가능" : preview.conflictReason ?? "병합 불가"}
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {renderStudentCard("원본 학생", preview.sourceStudent)}
            {renderStudentCard("대상 학생", preview.targetStudent)}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-xs text-slate">원본 연결 데이터</p>
              <p className="mt-2 text-2xl font-semibold">{preview.totalSourceLinkedCount}건</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-xs text-slate">대상 기존 데이터</p>
              <p className="mt-2 text-2xl font-semibold">{preview.totalTargetLinkedCount}건</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-xs text-slate">충돌 정리 예상</p>
              <p className="mt-2 text-2xl font-semibold">{preview.totalConflictCount}건</p>
            </article>
          </div>

          {preview.warnings.length > 0 ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <p className="font-semibold">확인 필요</p>
              <ul className="mt-3 space-y-2">
                {preview.warnings.map((warning) => (
                  <li key={warning}>- {warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[24px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">항목</th>
                  <th className="px-4 py-3 font-semibold">원본</th>
                  <th className="px-4 py-3 font-semibold">대상</th>
                  <th className="px-4 py-3 font-semibold">충돌</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {countRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3 tabular-nums">{row.sourceCount}건</td>
                    <td className="px-4 py-3 tabular-nums">{row.targetCount}건</td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {row.conflictCount > 0 && row.key in CONFLICT_LABELS
                        ? `${row.conflictCount}건`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="inline-flex items-start gap-3 text-sm text-slate">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={!preview.canMerge}
              className="mt-1"
            />
            <span>
              원본 학생은 비활성 상태로 남고, 겹치는 데이터는 대상 학생 기준으로 병합 또는 정리되는 것을 확인했습니다.
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