"use client";

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type CohortOption = {
  id: string;
  name: string;
  examCategory: string;
  startDate: string;
  endDate: string;
};

type TargetMode = "student" | "cohort" | "all_active";

type NotificationTypeOption = {
  value: string;
  label: string;
  requiresMessage: boolean;
  description: string;
};

type PreviewRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  message: string;
  state: "ready" | "excluded";
  exclusionReason: string | null;
};

type PreviewResult = {
  rows: PreviewRow[];
  readyCount: number;
  excludedCount: number;
  missingExamNumbers: string[];
  messageSamples: string[];
};

type SendResult = {
  sentCount: number;
  failedCount: number;
  skippedCount: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_OPTIONS: NotificationTypeOption[] = [
  {
    value: "PAYMENT_COMPLETE",
    label: "수납 완료 안내",
    requiresMessage: false,
    description: "납부금액, 결제수단이 포함된 수납 완료 알림",
  },
  {
    value: "ENROLLMENT_COMPLETE",
    label: "수강 등록 안내",
    requiresMessage: false,
    description: "강좌명, 수강기간이 포함된 수강 등록 완료 알림",
  },
  {
    value: "REFUND_COMPLETE",
    label: "환불 처리 안내",
    requiresMessage: false,
    description: "환불금액이 포함된 환불 처리 완료 알림",
  },
  {
    value: "NOTICE",
    label: "공지사항 (자유 문구)",
    requiresMessage: true,
    description: "직접 입력한 내용으로 발송하는 일반 공지",
  },
];

// ─── Kakao Bubble Preview ─────────────────────────────────────────────────────
function KakaoBubblePreview({ message, studentName }: { message: string; studentName: string }) {
  const rendered = message
    .replace(/\{studentName\}/g, studentName)
    .replace(/\{name\}/g, studentName)
    .replace(/\{paymentAmount\}/g, "400,000")
    .replace(/\{paymentMethod\}/g, "현금")
    .replace(/\{courseName\}/g, "27년 1차 대비 종합반 52기")
    .replace(/\{enrollmentPeriod\}/g, "2026-01-03 ~ 2026-12-31")
    .replace(/\{refundAmount\}/g, "200,000")
    .replace(/\{[^}]+\}/g, "...");

  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-yellow-900">
        알림
      </div>
      {/* Bubble */}
      <div className="max-w-xs">
        <p className="mb-1 text-xs font-semibold text-ink">학원 안내</p>
        <div className="rounded-[18px] rounded-tl-sm bg-yellow-400 px-4 py-3 shadow-sm">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-yellow-900">
            {rendered || "(미리보기 없음)"}
          </pre>
        </div>
        <p className="mt-1 text-right text-[10px] text-slate">알림톡 미리보기</p>
      </div>
    </div>
  );
}

// ─── Student Search ───────────────────────────────────────────────────────────
function StudentSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-ink">
        학번 / 이름 검색
        <span className="ml-2 text-xs font-normal text-slate">(여러 명은 줄바꿈으로 구분)</span>
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={"학번 또는 이름을 입력하세요\n예) 2401001\n예) 홍길동"}
        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/40 focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember"
      />
      <p className="mt-1 text-xs text-slate">
        * 입력한 값으로 학번 일치 검색 후 발송합니다
      </p>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  cohorts: CohortOption[];
};

// ─── Main Component ───────────────────────────────────────────────────────────
export function NotificationSendForm({ cohorts }: Props) {
  // Form state
  const [targetMode, setTargetMode] = useState<TargetMode>("student");
  const [studentInput, setStudentInput] = useState<string>("");
  const [selectedCohortId, setSelectedCohortId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("NOTICE");
  const [customMessage, setCustomMessage] = useState<string>("");

  // Preview state
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);

  // Send state
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirm modal
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  const selectedTypeOption = TYPE_OPTIONS.find((o) => o.value === selectedType);
  const needsMessage = selectedTypeOption?.requiresMessage ?? false;

  // Determine message template for preview
  const getPreviewMessage = useCallback(() => {
    if (selectedType === "NOTICE") {
      return customMessage.trim()
        ? `[학원 안내] {studentName}님께 운영 공지를 전달드립니다.\n\n${customMessage.trim()}`
        : "[학원 안내] {studentName}님께 운영 공지를 전달드립니다.";
    }
    if (selectedType === "PAYMENT_COMPLETE") {
      return "[학원 안내] {studentName}님, 수납이 완료되었습니다.\n\n납부금액: {paymentAmount}원\n결제수단: {paymentMethod}\n\n문의: 학원 연락처는 관리자에게 문의해 주세요.";
    }
    if (selectedType === "ENROLLMENT_COMPLETE") {
      return "[학원 안내] {studentName}님, 수강 등록이 완료되었습니다.\n\n강좌명: {courseName}\n수강기간: {enrollmentPeriod}\n\n문의: 학원 연락처는 관리자에게 문의해 주세요.";
    }
    if (selectedType === "REFUND_COMPLETE") {
      return "[학원 안내] {studentName}님, 환불 처리가 완료되었습니다.\n\n환불금액: {refundAmount}원\n\n문의: 학원 연락처는 관리자에게 문의해 주세요.";
    }
    return "";
  }, [selectedType, customMessage]);

  // Build API payload
  const buildPayload = useCallback(
    (preview: boolean) => {
      const examNumbers =
        targetMode === "student"
          ? studentInput
              .split(/[\n,]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      const cohortId = targetMode === "cohort" ? selectedCohortId : undefined;

      return {
        preview,
        type: selectedType,
        message: needsMessage ? customMessage.trim() : undefined,
        target: targetMode,
        examNumbers,
        cohortId,
      };
    },
    [targetMode, studentInput, selectedCohortId, selectedType, needsMessage, customMessage],
  );

  // Validate before preview/send
  const validate = useCallback((): string | null => {
    if (targetMode === "student") {
      const lines = studentInput
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length === 0) return "학번 또는 이름을 입력해 주세요.";
    }
    if (targetMode === "cohort" && !selectedCohortId) {
      return "기수를 선택해 주세요.";
    }
    if (needsMessage && !customMessage.trim()) {
      return "공지사항 내용을 입력해 주세요.";
    }
    return null;
  }, [targetMode, studentInput, selectedCohortId, needsMessage, customMessage]);

  // Preview handler
  const handlePreview = useCallback(async () => {
    const err = validate();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setIsPreviewing(true);
    setPreview(null);
    setSendResult(null);

    try {
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(true)),
      });

      const json = await res.json() as { error?: string } & Partial<PreviewResult>;

      if (!res.ok || json.error) {
        setErrorMessage(json.error ?? "미리보기 실패");
        return;
      }

      setPreview({
        rows: json.rows ?? [],
        readyCount: json.readyCount ?? 0,
        excludedCount: json.excludedCount ?? 0,
        missingExamNumbers: json.missingExamNumbers ?? [],
        messageSamples: json.messageSamples ?? [],
      });
    } catch {
      setErrorMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setIsPreviewing(false);
    }
  }, [validate, buildPayload]);

  // Send handler
  const handleSend = useCallback(async () => {
    setShowConfirm(false);
    const err = validate();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setIsSending(true);
    setSendResult(null);

    try {
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(false)),
      });

      const json = await res.json() as { error?: string } & Partial<SendResult>;

      if (!res.ok || json.error) {
        setErrorMessage(json.error ?? "발송 실패");
        return;
      }

      setSendResult({
        sentCount: json.sentCount ?? 0,
        failedCount: json.failedCount ?? 0,
        skippedCount: json.skippedCount ?? 0,
      });
      setPreview(null);
    } catch {
      setErrorMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setIsSending(false);
    }
  }, [validate, buildPayload]);

  return (
    <div className="space-y-6">
      {/* ─── Send Result Banner ─────────────────────────────────────────────── */}
      {sendResult && (
        <div className="rounded-[28px] border border-forest/30 bg-forest/10 p-6">
          <p className="font-semibold text-forest">발송 완료</p>
          <div className="mt-3 flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-slate">성공</p>
              <p className="text-2xl font-bold text-forest">{sendResult.sentCount}건</p>
            </div>
            <div>
              <p className="text-xs text-slate">실패</p>
              <p
                className={`text-2xl font-bold ${sendResult.failedCount > 0 ? "text-red-600" : "text-ink"}`}
              >
                {sendResult.failedCount}건
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">제외</p>
              <p className="text-2xl font-bold text-ink">{sendResult.skippedCount}건</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSendResult(null)}
            className="mt-4 text-sm text-slate underline hover:text-ink"
          >
            닫기
          </button>
        </div>
      )}

      {/* ─── Error Banner ───────────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-4">
          <p className="text-sm font-medium text-red-700">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="mt-1 text-xs text-red-500 underline"
          >
            닫기
          </button>
        </div>
      )}

      {/* ─── Main Card ──────────────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white">
        {/* Section 1: Target */}
        <div className="border-b border-ink/10 p-6 sm:p-8">
          <h2 className="mb-4 text-base font-semibold text-ink">1. 수신 대상</h2>
          <div className="space-y-3">
            {/* Radio buttons */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5">
              <input
                type="radio"
                name="targetMode"
                value="student"
                checked={targetMode === "student"}
                onChange={() => setTargetMode("student")}
                className="mt-0.5 accent-ember"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">개별 학생</p>
                <p className="text-xs text-slate">학번 또는 이름으로 특정 학생에게 발송</p>
                {targetMode === "student" && (
                  <div className="mt-4">
                    <StudentSearch value={studentInput} onChange={setStudentInput} />
                  </div>
                )}
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5">
              <input
                type="radio"
                name="targetMode"
                value="cohort"
                checked={targetMode === "cohort"}
                onChange={() => setTargetMode("cohort")}
                className="mt-0.5 accent-ember"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">기수 전체</p>
                <p className="text-xs text-slate">선택한 기수에 재원 중인 전원에게 발송</p>
                {targetMode === "cohort" && (
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-ink">기수 선택</label>
                    <select
                      value={selectedCohortId}
                      onChange={(e) => setSelectedCohortId(e.target.value)}
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember"
                    >
                      <option value="">-- 기수를 선택하세요 --</option>
                      {cohorts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.examCategory})
                        </option>
                      ))}
                    </select>
                    {cohorts.length === 0 && (
                      <p className="mt-2 text-xs text-slate">활성 기수가 없습니다.</p>
                    )}
                  </div>
                )}
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5">
              <input
                type="radio"
                name="targetMode"
                value="all_active"
                checked={targetMode === "all_active"}
                onChange={() => setTargetMode("all_active")}
                className="mt-0.5 accent-ember"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">재원생 전체</p>
                <p className="text-xs text-slate">수신 동의한 모든 재원생에게 발송</p>
              </div>
            </label>
          </div>
        </div>

        {/* Section 2: Message Type */}
        <div className="border-b border-ink/10 p-6 sm:p-8">
          <h2 className="mb-4 text-base font-semibold text-ink">2. 메시지 유형</h2>
          <div className="space-y-3">
            {TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5"
              >
                <input
                  type="radio"
                  name="notificationType"
                  value={opt.value}
                  checked={selectedType === opt.value}
                  onChange={() => setSelectedType(opt.value)}
                  className="mt-0.5 accent-ember"
                />
                <div className="flex-1">
                  <p className="font-medium text-ink">{opt.label}</p>
                  <p className="text-xs text-slate">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Custom message for NOTICE */}
          {needsMessage && (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-ink">
                공지 내용
                <span className="ml-2 text-xs font-normal text-red-500">필수</span>
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={5}
                maxLength={500}
                placeholder="학생에게 전달할 공지 내용을 입력하세요."
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/40 focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember"
              />
              <p className="mt-1 text-right text-xs text-slate">
                {customMessage.length} / 500자
              </p>
            </div>
          )}
        </div>

        {/* Section 3: Preview */}
        <div className="border-b border-ink/10 p-6 sm:p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">3. 미리보기</h2>
            <button
              type="button"
              onClick={handlePreview}
              disabled={isPreviewing}
              className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ember hover:text-ember disabled:opacity-50"
            >
              {isPreviewing ? "조회 중..." : "대상 조회 및 미리보기"}
            </button>
          </div>

          {/* Kakao bubble preview */}
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6">
            <p className="mb-4 text-xs font-medium text-yellow-700">카카오 알림톡 미리보기</p>
            <KakaoBubblePreview
              message={getPreviewMessage()}
              studentName="홍길동"
            />
          </div>

          {/* Preview result */}
          {preview && (
            <div className="mt-6 space-y-4">
              {/* Stats */}
              <div className="flex flex-wrap gap-4">
                <div className="rounded-2xl border border-forest/30 bg-forest/10 px-5 py-3 text-center">
                  <p className="text-xs text-slate">발송 대상</p>
                  <p className="text-2xl font-bold text-forest">{preview.readyCount}명</p>
                </div>
                <div className="rounded-2xl border border-ink/10 bg-ink/5 px-5 py-3 text-center">
                  <p className="text-xs text-slate">제외</p>
                  <p className="text-2xl font-bold text-ink">{preview.excludedCount}명</p>
                </div>
              </div>

              {/* Missing exam numbers */}
              {preview.missingExamNumbers.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-medium text-amber-800">
                    찾을 수 없는 학번: {preview.missingExamNumbers.join(", ")}
                  </p>
                </div>
              )}

              {/* Preview rows table */}
              {preview.rows.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border border-ink/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 bg-mist text-left">
                        <th className="px-4 py-3 font-semibold text-slate">학번</th>
                        <th className="px-4 py-3 font-semibold text-slate">이름</th>
                        <th className="px-4 py-3 font-semibold text-slate">연락처</th>
                        <th className="px-4 py-3 font-semibold text-slate">상태</th>
                        <th className="px-4 py-3 font-semibold text-slate">제외 사유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 20).map((row) => (
                        <tr
                          key={row.examNumber}
                          className={`border-b border-ink/5 ${row.state === "excluded" ? "opacity-50" : ""}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-slate">
                            {row.examNumber}
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={`/admin/students/${row.examNumber}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-ink hover:underline"
                            >
                              {row.name}
                            </a>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate">
                            {row.phone ?? "-"}
                          </td>
                          <td className="px-4 py-3">
                            {row.state === "ready" ? (
                              <span className="inline-flex rounded-full border border-forest/30 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                                발송
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-2 py-0.5 text-xs font-medium text-slate">
                                제외
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate">
                            {row.exclusionReason ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 20 && (
                    <p className="px-4 py-3 text-xs text-slate">
                      외 {preview.rows.length - 20}명 더보기 생략
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 4: Send Button */}
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              {preview && (
                <p className="text-sm text-slate">
                  <span className="font-semibold text-forest">{preview.readyCount}명</span>에게
                  발송됩니다.
                  {preview.excludedCount > 0 && (
                    <span className="ml-1 text-slate">
                      ({preview.excludedCount}명 제외)
                    </span>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                const err = validate();
                if (err) {
                  setErrorMessage(err);
                  return;
                }
                setErrorMessage(null);
                setShowConfirm(true);
              }}
              disabled={isSending}
              className="inline-flex items-center rounded-full bg-ember px-8 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
            >
              {isSending ? "발송 중..." : "발송 확인"}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Confirm Modal ──────────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
            <h3 className="text-lg font-semibold text-ink">알림 발송 확인</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate">
              선택한 유형:{" "}
              <span className="font-semibold text-ink">
                {selectedTypeOption?.label ?? selectedType}
              </span>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              발송 대상:{" "}
              <span className="font-semibold text-ink">
                {targetMode === "student"
                  ? "개별 학생"
                  : targetMode === "cohort"
                    ? `기수: ${cohorts.find((c) => c.id === selectedCohortId)?.name ?? selectedCohortId}`
                    : "재원생 전체"}
              </span>
            </p>
            {preview && (
              <p className="mt-1 text-sm leading-relaxed text-slate">
                예상 발송:{" "}
                <span className="font-semibold text-forest">{preview.readyCount}명</span>
              </p>
            )}
            <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-800">
                발송 후 취소할 수 없습니다. 신중하게 확인해 주세요.
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-full border border-ink/20 bg-white py-3 text-sm font-medium text-ink transition hover:border-ink/40"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSend}
                className="flex-1 rounded-full bg-ember py-3 text-sm font-semibold text-white transition hover:bg-ember/90"
              >
                발송
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
