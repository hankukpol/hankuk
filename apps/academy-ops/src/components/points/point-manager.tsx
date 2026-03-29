"use client";

import { PointType, StudentStatus, StudentType } from "@prisma/client";
import {
  formatMonthLabel,
  formatPoint,
  POINT_TYPE_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/analytics/presentation";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { STUDENT_TYPE_LABEL } from "@/lib/constants";
import { useState, useTransition } from "react";

type PointCandidateRecord = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  perfectAttendance: boolean;
  currentStatus: StudentStatus;
  totalPoints: number;
  alreadyGranted: boolean;
  monthSessionCount: number;
};

type PointLogRecord = {
  id: number;
  examNumber: string;
  studentName: string;
  type: PointType;
  amount: number;
  reason: string;
  grantedAt: string;
  grantedBy: string | null;
};

type PointManagerProps = {
  filters: {
    periodId: number;
    examType: "GONGCHAE" | "GYEONGCHAE";
    year: number;
    month: number;
  };
  candidates: PointCandidateRecord[];
  logs: PointLogRecord[];
};

const ATTENDANCE_POINT_AMOUNT = 10_000;

export function PointManager({ filters, candidates: initialCandidates, logs: initialLogs }: PointManagerProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const logs = initialLogs;
  const [selectedExamNumbers, setSelectedExamNumbers] = useState<string[]>(
    initialCandidates
      .filter((candidate) => candidate.perfectAttendance && !candidate.alreadyGranted)
      .map((candidate) => candidate.examNumber),
  );
  const [manualExamNumber, setManualExamNumber] = useState("");
  const [manualType, setManualType] = useState<PointType>(PointType.MANUAL);
  const [manualAmount, setManualAmount] = useState("10000");
  const [manualReason, setManualReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const completionModal = useActionModalState();

  function setMessage(nextNotice: string | null, nextError: string | null) {
    setNotice(nextNotice);
    setErrorMessage(nextError);
  }

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

  function handleToggle(examNumber: string) {
    setSelectedExamNumbers((current) =>
      current.includes(examNumber)
        ? current.filter((value) => value !== examNumber)
        : [...current, examNumber],
    );
  }

  function refreshPage() {
    window.location.reload();
  }

  function openCompletionModal(title: string, description: string, details: string[] = []) {
    completionModal.openModal({
      badgeLabel: "처리 완료",
      badgeTone: "success",
      title,
      description,
      details,
      confirmLabel: "확인",
      onClose: refreshPage,
    });
  }

  function refreshCandidates() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          periodId: String(filters.periodId),
          examType: filters.examType,
          year: String(filters.year),
          month: String(filters.month),
        });
        const payload = await fetch(`/api/points/attendance-check?${params.toString()}`, {
          cache: "no-store",
        }).then((response) => response.json().then((json) => ({ ok: response.ok, json })));

        if (!payload.ok) {
          throw new Error(payload.json.error ?? "개근 대상 조회에 실패했습니다.");
        }

        const nextCandidates = payload.json.candidates as PointCandidateRecord[];
        setCandidates((current) =>
          current.map((candidate) => {
            const refreshed = nextCandidates.find(
              (nextCandidate) => nextCandidate.examNumber === candidate.examNumber,
            );
            return refreshed ?? candidate;
          }),
        );
        setSelectedExamNumbers(nextCandidates.map((candidate) => candidate.examNumber));
        setMessage("개근 대상자를 다시 계산했습니다.", null);
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "개근 대상 조회에 실패했습니다.",
        );
      }
    });
  }

  function grantAttendancePoints() {
    if (selectedExamNumbers.length === 0) {
      setMessage(null, "개근 포인트를 지급할 대상을 선택하세요.");
      return;
    }

    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson("/api/points/grant", {
          method: "POST",
          body: JSON.stringify({
            entries: selectedExamNumbers.map((examNumber) => ({
              examNumber,
              type: PointType.PERFECT_ATTENDANCE,
              amount: ATTENDANCE_POINT_AMOUNT,
              reason: `${formatMonthLabel(filters.year, filters.month)} 개근 장학`,
              periodId: filters.periodId,
              year: filters.year,
              month: filters.month,
            })),
          }),
        });
        setNotice(null);
        openCompletionModal(
          "개근 포인트 지급 완료",
          "개근 포인트를 지급했습니다.",
          [`대상 학생 ${selectedExamNumbers.length}명`, `${formatMonthLabel(filters.year, filters.month)} 개근 장학`],
        );
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "개근 포인트 지급에 실패했습니다.",
        );
      }
    });
  }

  function grantManualPoint() {
    setMessage(null, null);

    startTransition(async () => {
      try {
        await requestJson("/api/points/grant", {
          method: "POST",
          body: JSON.stringify({
            entries: [
              {
                examNumber: manualExamNumber,
                type: manualType,
                amount: Number(manualAmount),
                reason: manualReason,
                periodId: filters.periodId,
                year: filters.year,
                month: filters.month,
              },
            ],
          }),
        });
        setNotice(null);
        setManualExamNumber("");
        setManualReason("");
        setManualAmount("10000");
        setManualType(PointType.MANUAL);
        openCompletionModal(
          "포인트 지급 완료",
          "포인트를 지급했습니다.",
          [`수험번호 ${manualExamNumber}`, `${POINT_TYPE_LABEL[manualType]} ${formatPoint(Number(manualAmount))}`],
        );
      } catch (error) {
        setMessage(
          null,
          error instanceof Error ? error.message : "포인트 지급에 실패했습니다.",
        );
      }
    });
  }

  function revokePoint(log: PointLogRecord) {
    confirmModal.openModal({
      badgeLabel: "취소 확인",
      badgeTone: "warning",
      title: "포인트 취소 확인",
      description: `${log.studentName}의 포인트(${formatPoint(log.amount)})를 취소하시겠습니까?`,
      details: ["취소 후 지급 이력은 즉시 목록에서 사라집니다."],
      cancelLabel: "취소",
      confirmLabel: "포인트 취소",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null, null);
        startTransition(async () => {
          try {
            await requestJson(`/api/points/${log.id}`, { method: "DELETE" });
            setNotice(null);
            openCompletionModal(
              "포인트 취소 완료",
              "포인트를 취소했습니다.",
              [`${log.studentName} ? ${formatPoint(log.amount)}`],
            );
          } catch (error) {
            setMessage(null, error instanceof Error ? error.message : "포인트 취소에 실패했습니다.");
          }
        });
      },
    });
  }

  const eligibleCandidates = candidates.filter(
    (candidate) => candidate.perfectAttendance && !candidate.alreadyGranted,
  );

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {formatMonthLabel(filters.year, filters.month)} 개근 포인트 자동 판정
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              ABSENT 0회이고 이미 같은 월 개근 포인트를 받지 않은 학생만 자동 대상자로 남습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={refreshCandidates}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
            >
              대상 다시 계산
            </button>
            <button
              type="button"
              onClick={grantAttendancePoints}
              disabled={isPending || eligibleCandidates.length === 0}
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              선택 대상 지급
            </button>
          </div>
        </div>

        {notice ? (
          <div className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
            {notice}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">선택</th>
                <th className="px-4 py-3 text-left font-semibold">수험번호</th>
                <th className="px-4 py-3 text-left font-semibold">이름</th>
                <th className="px-4 py-3 text-left font-semibold">구분</th>
                <th className="px-4 py-3 text-left font-semibold">상태</th>
                <th className="px-4 py-3 text-left font-semibold">응시일수</th>
                <th className="px-4 py-3 text-left font-semibold">누적 포인트</th>
                <th className="px-4 py-3 text-left font-semibold">지급 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate">
                    포인트 대상 데이터가 없습니다.
                  </td>
                </tr>
              ) : null}
              {candidates.map((candidate) => {
                const selectable = candidate.perfectAttendance && !candidate.alreadyGranted;

                return (
                  <tr key={candidate.examNumber}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedExamNumbers.includes(candidate.examNumber)}
                        disabled={!selectable || isPending}
                        onChange={() => handleToggle(candidate.examNumber)}
                      />
                    </td>
                    <td className="px-4 py-3">{candidate.examNumber}</td>
                    <td className="px-4 py-3">{candidate.name}</td>
                    <td className="px-4 py-3">
                      {STUDENT_TYPE_LABEL[candidate.studentType]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[candidate.currentStatus]}`}
                      >
                        {STATUS_LABEL[candidate.currentStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3">{candidate.monthSessionCount}</td>
                    <td className="px-4 py-3">{formatPoint(candidate.totalPoints)}</td>
                    <td className="px-4 py-3">
                      {candidate.alreadyGranted
                        ? "지급 완료"
                        : candidate.perfectAttendance
                          ? "지급 가능"
                          : "대상 아님"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">수동 포인트 지급</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">수험번호</label>
            <input
              value={manualExamNumber}
              onChange={(event) => setManualExamNumber(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              placeholder="예: 240123"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">유형</label>
            <select
              value={manualType}
              onChange={(event) => setManualType(event.target.value as PointType)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            >
              {Object.values(PointType).map((type) => (
                <option key={type} value={type}>
                  {POINT_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">금액</label>
            <input
              type="number"
              min={1}
              value={manualAmount}
              onChange={(event) => setManualAmount(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">사유</label>
            <input
              value={manualReason}
              onChange={(event) => setManualReason(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm"
              placeholder="예: 3월 성적 우수"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={grantManualPoint}
          disabled={isPending}
          className="mt-4 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          수동 지급 실행
        </button>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">포인트 지급 이력</h2>
        <div className="mt-6 overflow-x-auto rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">지급일시</th>
                <th className="px-4 py-3 font-semibold">수험번호</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">유형</th>
                <th className="px-4 py-3 font-semibold">금액</th>
                <th className="px-4 py-3 font-semibold">사유</th>
                <th className="px-4 py-3 font-semibold">지급자</th>
                <th className="px-4 py-3 font-semibold">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate">
                    지급 이력이 없습니다.
                  </td>
                </tr>
              ) : null}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">
                    {new Date(log.grantedAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-3">{log.examNumber}</td>
                  <td className="px-4 py-3">{log.studentName}</td>
                  <td className="px-4 py-3">{POINT_TYPE_LABEL[log.type]}</td>
                  <td className="px-4 py-3">{formatPoint(log.amount)}</td>
                  <td className="px-4 py-3">{log.reason}</td>
                  <td className="px-4 py-3">{log.grantedBy ?? "-"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => revokePoint(log)}
                      className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-40"
                    >
                      취소
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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