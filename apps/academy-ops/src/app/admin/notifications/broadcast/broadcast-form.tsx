"use client";

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type TemplateOption = {
  id: string;
  type: string;
  channel: string;
  description: string;
  content: string;
};

type CohortOption = {
  id: string;
  name: string;
  examCategory: string;
  startDate: string;
  endDate: string;
};

type RecipientGroup =
  | "all_active"
  | "cohort"
  | "exam_category"
  | "overdue_installment"
  | "absent_3plus"
  | "custom";

type CountResult = {
  count: number;
  missingNumbers: string[];
};

type BroadcastResult = {
  sent: number;
  failed: number;
  skipped: number;
};

// ─── Kakao Bubble Preview ─────────────────────────────────────────────────────
function KakaoBubblePreview({ content }: { content: string }) {
  const rendered = content
    .replace(/\{studentName\}/g, "홍길동")
    .replace(/\{name\}/g, "홍길동")
    .replace(/\{paymentAmount\}/g, "400,000")
    .replace(/\{paymentMethod\}/g, "현금")
    .replace(/\{courseName\}/g, "27년 1차 대비 종합반 52기")
    .replace(/\{enrollmentPeriod\}/g, "2026-01-03 ~ 2026-12-31")
    .replace(/\{refundAmount\}/g, "200,000")
    .replace(/\{[^}]+\}/g, "...");

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-yellow-900">
        알림
      </div>
      <div className="max-w-xs">
        <p className="mb-1 text-xs font-semibold text-ink">학원 안내</p>
        <div className="rounded-[18px] rounded-tl-sm bg-yellow-400 px-4 py-3 shadow-sm">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-yellow-900">
            {rendered || "(템플릿 내용 없음)"}
          </pre>
        </div>
        <p className="mt-1 text-right text-[10px] text-slate">카카오 알림톡 미리보기</p>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  initialRecipientGroup?: RecipientGroup;
  initialCohortId?: string;
  templates: TemplateOption[];
  cohorts: CohortOption[];
};

// ─── Main Component ───────────────────────────────────────────────────────────
export function BroadcastForm({
  initialRecipientGroup = "all_active",
  initialCohortId = "",
  templates,
  cohorts,
}: Props) {
  // Template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Recipient group
  const [recipientGroup, setRecipientGroup] = useState<RecipientGroup>(initialRecipientGroup);
  const [selectedCohortId, setSelectedCohortId] = useState<string>(initialCohortId);
  const [selectedExamCategory, setSelectedExamCategory] = useState<string>("GONGCHAE");
  const [customExamNumbers, setCustomExamNumbers] = useState<string>("");

  // Count
  const [countResult, setCountResult] = useState<CountResult | null>(null);
  const [isCounting, setIsCounting] = useState<boolean>(false);

  // Send
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<BroadcastResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirm modal
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  // Build payload
  const buildPayload = useCallback(() => {
    const customNumbers =
      recipientGroup === "custom"
        ? customExamNumbers
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    return {
      templateId: selectedTemplateId,
      recipientGroup,
      cohortId: recipientGroup === "cohort" ? selectedCohortId : undefined,
      examCategory: recipientGroup === "exam_category" ? selectedExamCategory : undefined,
      examNumbers: customNumbers,
    };
  }, [
    selectedTemplateId,
    recipientGroup,
    selectedCohortId,
    selectedExamCategory,
    customExamNumbers,
  ]);

  // Validate
  const validate = useCallback((): string | null => {
    if (!selectedTemplateId) return "템플릿을 선택해 주세요.";
    if (recipientGroup === "cohort" && !selectedCohortId) return "기수를 선택해 주세요.";
    if (recipientGroup === "custom") {
      const nums = customExamNumbers
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (nums.length === 0) return "학번을 입력해 주세요.";
    }
    return null;
  }, [selectedTemplateId, recipientGroup, selectedCohortId, customExamNumbers]);

  // Count recipients
  const handleCount = useCallback(async () => {
    const err = validate();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setIsCounting(true);
    setCountResult(null);

    try {
      const res = await fetch("/api/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), countOnly: true }),
      });

      const json = (await res.json()) as { error?: string } & Partial<CountResult>;

      if (!res.ok || json.error) {
        setErrorMessage(json.error ?? "수신자 조회 실패");
        return;
      }

      setCountResult({
        count: json.count ?? 0,
        missingNumbers: json.missingNumbers ?? [],
      });
    } catch {
      setErrorMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setIsCounting(false);
    }
  }, [validate, buildPayload]);

  // Send
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
      const res = await fetch("/api/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), countOnly: false }),
      });

      const json = (await res.json()) as { error?: string } & Partial<BroadcastResult>;

      if (!res.ok || json.error) {
        setErrorMessage(json.error ?? "발송 실패");
        return;
      }

      setSendResult({
        sent: json.sent ?? 0,
        failed: json.failed ?? 0,
        skipped: json.skipped ?? 0,
      });
      setCountResult(null);
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
          <p className="font-semibold text-forest">일괄 발송 완료</p>
          <div className="mt-3 flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-slate">성공</p>
              <p className="text-2xl font-bold text-forest">{sendResult.sent}건</p>
            </div>
            <div>
              <p className="text-xs text-slate">실패</p>
              <p
                className={`text-2xl font-bold ${sendResult.failed > 0 ? "text-red-600" : "text-ink"}`}
              >
                {sendResult.failed}건
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">제외</p>
              <p className="text-2xl font-bold text-ink">{sendResult.skipped}건</p>
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
        {/* Section 1: Template Selection */}
        <div className="border-b border-ink/10 p-6 sm:p-8">
          <h2 className="mb-4 text-base font-semibold text-ink">1. 알림 템플릿 선택</h2>
          {templates.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              등록된 알림 템플릿이 없습니다. 먼저 템플릿을 등록해 주세요.
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <label
                  key={template.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                    selectedTemplateId === template.id
                      ? "border-ember/40 bg-ember/5"
                      : "border-ink/10 hover:border-ember/30 hover:bg-ember/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="templateId"
                    value={template.id}
                    checked={selectedTemplateId === template.id}
                    onChange={() => setSelectedTemplateId(template.id)}
                    className="mt-0.5 accent-ember"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{template.type}</p>
                      <span className="inline-flex rounded-full border border-ink/10 px-2 py-0.5 text-xs text-slate">
                        {template.channel}
                      </span>
                    </div>
                    {template.description && (
                      <p className="mt-0.5 text-xs text-slate">{template.description}</p>
                    )}
                    <p className="mt-1 line-clamp-2 text-xs text-slate/70">{template.content}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Recipient Group */}
        <div className="border-b border-ink/10 p-6 sm:p-8">
          <h2 className="mb-4 text-base font-semibold text-ink">2. 수신 대상 그룹</h2>
          <div className="space-y-3">
            {/* All active students */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5">
              <input
                type="radio"
                name="recipientGroup"
                value="all_active"
                checked={recipientGroup === "all_active"}
                onChange={() => setRecipientGroup("all_active")}
                className="mt-0.5 accent-ember"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">재원생 전체</p>
                <p className="text-xs text-slate">
                  수신 동의한 활성 재원생 전원 (CourseEnrollment ACTIVE)
                </p>
              </div>
            </label>

            {/* By cohort */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5">
              <input
                type="radio"
                name="recipientGroup"
                value="cohort"
                checked={recipientGroup === "cohort"}
                onChange={() => setRecipientGroup("cohort")}
                className="mt-0.5 accent-ember"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">기수별</p>
                <p className="text-xs text-slate">선택한 기수에 재원 중인 학생</p>
                {recipientGroup === "cohort" && (
                  <div className="mt-3">
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

            {/* By exam category */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5">
              <input
                type="radio"
                name="recipientGroup"
                value="exam_category"
                checked={recipientGroup === "exam_category"}
                onChange={() => setRecipientGroup("exam_category")}
                className="mt-0.5 accent-ember"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">직렬별</p>
                <p className="text-xs text-slate">공채 또는 경채 수강생 전체</p>
                {recipientGroup === "exam_category" && (
                  <div className="mt-3">
                    <select
                      value={selectedExamCategory}
                      onChange={(e) => setSelectedExamCategory(e.target.value)}
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember"
                    >
                      <option value="GONGCHAE">공채 (GONGCHAE)</option>
                      <option value="GYEONGCHAE">경채 (GYEONGCHAE)</option>
                    </select>
                  </div>
                )}
              </div>
            </label>

            {/* Overdue installment students */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5">
              <input
                type="radio"
                name="recipientGroup"
                value="overdue_installment"
                checked={recipientGroup === "overdue_installment"}
                onChange={() => setRecipientGroup("overdue_installment")}
                className="mt-0.5 accent-ember"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">분납 미납 학생</p>
                <p className="text-xs text-slate">
                  납부 기한이 지난 분납 미납 건이 있는 재원생 (수신 동의 필터 포함)
                </p>
              </div>
            </label>

            {/* Absent 3+ times in last 30 days */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5">
              <input
                type="radio"
                name="recipientGroup"
                value="absent_3plus"
                checked={recipientGroup === "absent_3plus"}
                onChange={() => setRecipientGroup("absent_3plus")}
                className="mt-0.5 accent-ember"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">결석 3회 이상 (최근 30일)</p>
                <p className="text-xs text-slate">
                  최근 30일 내 무단 결시가 3회 이상인 재원생 (수신 동의 필터 포함)
                </p>
              </div>
            </label>

            {/* Custom exam numbers */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 p-4 transition hover:border-ember/30 hover:bg-ember/5">
              <input
                type="radio"
                name="recipientGroup"
                value="custom"
                checked={recipientGroup === "custom"}
                onChange={() => setRecipientGroup("custom")}
                className="mt-0.5 accent-ember"
              />
              <div className="flex-1">
                <p className="font-medium text-ink">직접 입력 (학번)</p>
                <p className="text-xs text-slate">쉼표 또는 줄바꿈으로 구분하여 학번 직접 입력</p>
                {recipientGroup === "custom" && (
                  <div className="mt-3">
                    <textarea
                      value={customExamNumbers}
                      onChange={(e) => setCustomExamNumbers(e.target.value)}
                      rows={4}
                      placeholder={"학번을 입력하세요 (쉼표 또는 줄바꿈으로 구분)\n예) 2401001, 2401002\n또는 줄바꿈으로 구분"}
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm placeholder:text-slate/40 focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember"
                    />
                  </div>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Section 3: Template Preview */}
        {selectedTemplate && (
          <div className="border-b border-ink/10 p-6 sm:p-8">
            <h2 className="mb-4 text-base font-semibold text-ink">3. 템플릿 미리보기</h2>
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6">
              <p className="mb-4 text-xs font-medium text-yellow-700">카카오 알림톡 미리보기</p>
              <KakaoBubblePreview content={selectedTemplate.content} />
            </div>
            <div className="mt-3 rounded-2xl border border-ink/5 bg-mist/50 px-4 py-3">
              <p className="text-xs text-slate">
                변수 예시: {"{studentName}"} → 학생명, {"{paymentAmount}"} → 납부금액 등
              </p>
            </div>
          </div>
        )}

        {/* Section 4: Count & Send */}
        <div className="p-6 sm:p-8">
          <h2 className="mb-4 text-base font-semibold text-ink">
            {selectedTemplate ? "4." : "3."} 수신자 확인 및 발송
          </h2>

          {/* Count button */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleCount}
              disabled={isCounting || isSending}
              className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ember hover:text-ember disabled:opacity-50"
            >
              {isCounting ? "조회 중..." : "수신자 수 조회"}
            </button>

            {countResult && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-forest/30 bg-forest/10 px-4 py-2 text-center">
                  <p className="text-xs text-slate">발송 대상</p>
                  <p className="text-lg font-bold text-forest">{countResult.count}명</p>
                </div>
                {countResult.missingNumbers.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2">
                    <p className="text-xs text-amber-800">
                      미조회 학번: {countResult.missingNumbers.slice(0, 5).join(", ")}
                      {countResult.missingNumbers.length > 5
                        ? ` 외 ${countResult.missingNumbers.length - 5}건`
                        : ""}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Send button */}
          <div className="mt-6 flex items-center justify-between">
            <div>
              {countResult && (
                <p className="text-sm text-slate">
                  <span className="font-semibold text-forest">{countResult.count}명</span>에게
                  발송됩니다.
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
              disabled={isSending || isCounting}
              className="inline-flex items-center rounded-full bg-ember px-8 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
            >
              {isSending ? "발송 중..." : "일괄 발송"}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Confirm Modal ──────────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
            <h3 className="text-lg font-semibold text-ink">일괄 발송 확인</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate">
              템플릿:{" "}
              <span className="font-semibold text-ink">
                {selectedTemplate?.type ?? selectedTemplateId}
              </span>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              수신 대상:{" "}
              <span className="font-semibold text-ink">
                {recipientGroup === "all_active"
                  ? "재원생 전체"
                  : recipientGroup === "cohort"
                    ? `기수: ${cohorts.find((c) => c.id === selectedCohortId)?.name ?? selectedCohortId}`
                    : recipientGroup === "exam_category"
                      ? `직렬: ${selectedExamCategory === "GONGCHAE" ? "공채" : "경채"}`
                      : recipientGroup === "overdue_installment"
                        ? "분납 미납 학생"
                        : recipientGroup === "absent_3plus"
                          ? "결석 3회 이상 (최근 30일)"
                          : "직접 입력 학번"}
              </span>
            </p>
            {countResult && (
              <p className="mt-1 text-sm leading-relaxed text-slate">
                예상 발송:{" "}
                <span className="font-semibold text-forest">{countResult.count}명</span>
              </p>
            )}
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-800">
                발송 후 취소할 수 없습니다. 수신 동의하지 않은 학생은 자동으로 제외됩니다.
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
