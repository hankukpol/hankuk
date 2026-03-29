"use client";

import { useState, useCallback } from "react";

type WeeksOption = 4 | 8 | 12 | 16 | "custom";

interface CalcInput {
  startDate: string;
  weeksOption: WeeksOption;
  customWeeks: string;
  tuitionFee: string;
  textbookFee: string;
  refundDate: string;
  cashReceiptNeeded: boolean;
  cashReceiptNote: string;
}

interface CalcResult {
  elapsedDays: number;
  totalDays: number;
  elapsedPercent: number;
  rule: string;
  ruleDetail: string;
  tuitionRefund: number;
  textbookRefund: number;
  totalRefund: number;
  isNoRefund: boolean;
}

function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function calculate(input: CalcInput): CalcResult | null {
  if (!input.startDate || !input.refundDate) return null;

  const weeks =
    input.weeksOption === "custom"
      ? parseInt(input.customWeeks, 10)
      : input.weeksOption;

  if (!weeks || weeks <= 0 || isNaN(weeks)) return null;

  const tuition = parseInt(input.tuitionFee.replace(/,/g, ""), 10);
  if (!tuition || isNaN(tuition) || tuition <= 0) return null;

  const textbook = parseInt(input.textbookFee.replace(/,/g, ""), 10) || 0;

  const start = parseDateUTC(input.startDate);
  const refund = parseDateUTC(input.refundDate);
  const totalDays = weeks * 7;
  const end = new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);

  const elapsedDays = Math.max(0, diffDays(start, refund));
  const elapsedPercent = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;

  let rule: string;
  let ruleDetail: string;
  let tuitionRefund: number;
  let isNoRefund = false;

  if (elapsedPercent < 100 / 3) {
    // less than 1/3
    rule = "수업 1/3 미경과";
    ruleDetail = "수강 기간의 1/3이 경과하지 않았습니다. 수강료 전액 환불 대상입니다.";
    tuitionRefund = tuition;
  } else if (elapsedPercent < 50) {
    // 1/3 ~ 1/2
    rule = "수업 1/3 ~ 1/2 경과";
    ruleDetail = "수강 기간의 1/3 이상 ~ 1/2 미만이 경과했습니다. 수강료의 2/3를 환불합니다.";
    tuitionRefund = Math.floor((tuition * 2) / 3);
  } else {
    // 1/2 or more
    rule = "수업 1/2 이상 경과";
    ruleDetail = "수강 기간의 1/2 이상이 경과했습니다. 환불 불가 기간입니다.";
    tuitionRefund = 0;
    isNoRefund = true;
  }

  return {
    elapsedDays,
    totalDays,
    elapsedPercent,
    rule,
    ruleDetail,
    tuitionRefund,
    textbookRefund: 0, // 교재비는 환불 없음
    totalRefund: tuitionRefund,
    isNoRefund,
  };
}

function formatWon(n: number): string {
  return n.toLocaleString("ko-KR");
}

function formatInputNumber(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return parseInt(digits, 10).toLocaleString("ko-KR");
}

export function RefundCalculatorClient() {
  const [input, setInput] = useState<CalcInput>({
    startDate: "",
    weeksOption: 4,
    customWeeks: "",
    tuitionFee: "",
    textbookFee: "",
    refundDate: getTodayString(),
    cashReceiptNeeded: false,
    cashReceiptNote: "",
  });

  const [result, setResult] = useState<CalcResult | null>(null);
  const [copied, setCopied] = useState(false);

  const update = useCallback(
    <K extends keyof CalcInput>(key: K, value: CalcInput[K]) => {
      setInput((prev) => ({ ...prev, [key]: value }));
      // Clear result on input change
      setResult(null);
    },
    [],
  );

  function handleCalculate() {
    const res = calculate(input);
    setResult(res);
  }

  function buildSummaryText(res: CalcResult): string {
    const tuition = parseInt(input.tuitionFee.replace(/,/g, ""), 10) || 0;
    const textbook = parseInt(input.textbookFee.replace(/,/g, ""), 10) || 0;
    const weeks =
      input.weeksOption === "custom"
        ? `${input.customWeeks}주`
        : `${input.weeksOption}주`;

    const lines = [
      "[ 학원법 환불 계산 결과 ]",
      `수강 시작일: ${input.startDate}`,
      `수강 기간: ${weeks} (총 ${res.totalDays}일)`,
      `수강료: ${formatWon(tuition)}원`,
      textbook > 0 ? `교재비: ${formatWon(textbook)}원` : null,
      `환불 신청일: ${input.refundDate}`,
      `경과: ${res.elapsedDays}일 (${res.elapsedPercent.toFixed(1)}%)`,
      `적용 규정: ${res.rule}`,
      `수강료 환불액: ${formatWon(res.tuitionRefund)}원`,
      textbook > 0 ? `교재비: 환불 없음` : null,
      `최종 환불 예상액: ${formatWon(res.totalRefund)}원`,
      input.cashReceiptNeeded && input.cashReceiptNote
        ? `현금영수증 비고: ${input.cashReceiptNote}`
        : null,
    ].filter(Boolean);

    return lines.join("\n");
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildSummaryText(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  const tuition = parseInt(input.tuitionFee.replace(/,/g, ""), 10) || 0;
  const textbook = parseInt(input.textbookFee.replace(/,/g, ""), 10) || 0;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Input form */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold text-ink">입력 정보</h2>
        <div className="mt-5 space-y-5">
          {/* Start date */}
          <div>
            <label className="block text-sm font-medium text-ink">
              수강 시작일
            </label>
            <input
              type="date"
              value={input.startDate}
              onChange={(e) => update("startDate", e.target.value)}
              className="mt-1.5 block w-full rounded-[12px] border border-ink/20 px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-ink">
              수강 기간
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {([4, 8, 12, 16] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => update("weeksOption", w)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                    input.weeksOption === w
                      ? "border-ember bg-ember text-white"
                      : "border-ink/20 text-slate hover:border-ink/40 hover:text-ink"
                  }`}
                >
                  {w}주
                </button>
              ))}
              <button
                type="button"
                onClick={() => update("weeksOption", "custom")}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  input.weeksOption === "custom"
                    ? "border-ember bg-ember text-white"
                    : "border-ink/20 text-slate hover:border-ink/40 hover:text-ink"
                }`}
              >
                직접 입력
              </button>
            </div>
            {input.weeksOption === "custom" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={52}
                  placeholder="주 수 입력"
                  value={input.customWeeks}
                  onChange={(e) => update("customWeeks", e.target.value)}
                  className="w-32 rounded-[12px] border border-ink/20 px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
                />
                <span className="text-sm text-slate">주</span>
              </div>
            )}
          </div>

          {/* Tuition fee */}
          <div>
            <label className="block text-sm font-medium text-ink">
              총 수강료
            </label>
            <div className="relative mt-1.5">
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={input.tuitionFee}
                onChange={(e) =>
                  update("tuitionFee", formatInputNumber(e.target.value))
                }
                className="block w-full rounded-[12px] border border-ink/20 py-2 pl-3 pr-10 text-sm text-ink focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate">
                원
              </span>
            </div>
          </div>

          {/* Textbook fee */}
          <div>
            <label className="block text-sm font-medium text-ink">
              교재비{" "}
              <span className="ml-1 text-xs font-normal text-slate">
                (선택, 환불 제외)
              </span>
            </label>
            <div className="relative mt-1.5">
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={input.textbookFee}
                onChange={(e) =>
                  update("textbookFee", formatInputNumber(e.target.value))
                }
                className="block w-full rounded-[12px] border border-ink/20 py-2 pl-3 pr-10 text-sm text-ink focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate">
                원
              </span>
            </div>
          </div>

          {/* Refund date */}
          <div>
            <label className="block text-sm font-medium text-ink">
              환불 신청일
            </label>
            <input
              type="date"
              value={input.refundDate}
              onChange={(e) => update("refundDate", e.target.value)}
              className="mt-1.5 block w-full rounded-[12px] border border-ink/20 px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
            />
          </div>

          {/* Cash receipt */}
          <div className="rounded-[16px] border border-ink/10 bg-mist/50 p-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={input.cashReceiptNeeded}
                onChange={(e) =>
                  update("cashReceiptNeeded", e.target.checked)
                }
                className="h-4 w-4 rounded border-ink/30 text-ember accent-ember"
              />
              <span className="text-sm font-medium text-ink">
                현금영수증 발행 필요
              </span>
            </label>
            {input.cashReceiptNeeded && (
              <input
                type="text"
                placeholder="비고 (예: 소득공제, 010-XXXX-XXXX)"
                value={input.cashReceiptNote}
                onChange={(e) => update("cashReceiptNote", e.target.value)}
                className="mt-3 block w-full rounded-[10px] border border-ink/20 px-3 py-2 text-sm text-ink placeholder-slate/50 focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
              />
            )}
          </div>

          {/* Calculate button */}
          <button
            type="button"
            onClick={handleCalculate}
            className="w-full rounded-[14px] bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 active:scale-[0.99]"
          >
            계산하기
          </button>
        </div>
      </div>

      {/* Result panel */}
      <div>
        {!result ? (
          <div className="flex h-full min-h-[300px] items-center justify-center rounded-[28px] border border-dashed border-ink/15 bg-white/50 px-6 text-center">
            <div>
              <p className="text-2xl">📋</p>
              <p className="mt-2 text-sm text-slate">
                좌측 양식을 입력하고
                <br />
                계산하기 버튼을 누르세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">계산 결과</h2>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
              >
                {copied ? "복사됨!" : "복사"}
              </button>
            </div>

            {/* Warning */}
            {result.isNoRefund && (
              <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-semibold text-red-700">
                  환불 불가 기간입니다
                </p>
                <p className="mt-0.5 text-xs text-red-600">
                  수강 기간의 1/2 이상이 경과하여 학원법상 환불이 불가합니다.
                </p>
              </div>
            )}

            {/* Elapsed progress */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-slate">
                <span>경과 기간</span>
                <span className="tabular-nums font-medium text-ink">
                  {result.elapsedDays}일 / {result.totalDays}일
                </span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-3 rounded-full transition-all ${
                    result.elapsedPercent >= 50
                      ? "bg-red-500"
                      : result.elapsedPercent >= 100 / 3
                        ? "bg-amber-500"
                        : "bg-forest"
                  }`}
                  style={{
                    width: `${Math.min(100, result.elapsedPercent)}%`,
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate/70">
                <span>0%</span>
                <span>1/3 ({(100 / 3).toFixed(0)}%)</span>
                <span>1/2 (50%)</span>
                <span>100%</span>
              </div>
              <p className="mt-2 text-xs tabular-nums text-slate">
                경과율:{" "}
                <span className="font-semibold text-ink">
                  {result.elapsedPercent.toFixed(1)}%
                </span>
              </p>
            </div>

            {/* Rule applied */}
            <div className="mt-5 rounded-[14px] border border-ink/10 bg-mist/60 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate">
                적용 규정
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {result.rule}
              </p>
              <p className="mt-1 text-xs text-slate">{result.ruleDetail}</p>
            </div>

            {/* Fee breakdown */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between rounded-[12px] bg-mist/40 px-4 py-3 text-sm">
                <span className="text-slate">수강료 원금</span>
                <span className="tabular-nums font-medium text-ink">
                  {formatWon(tuition)}원
                </span>
              </div>
              <div className="flex items-center justify-between rounded-[12px] bg-mist/40 px-4 py-3 text-sm">
                <span className="text-slate">수강료 환불액</span>
                <span
                  className={`tabular-nums font-semibold ${
                    result.tuitionRefund === 0
                      ? "text-red-600"
                      : "text-forest"
                  }`}
                >
                  {formatWon(result.tuitionRefund)}원
                </span>
              </div>
              {textbook > 0 && (
                <div className="flex items-center justify-between rounded-[12px] bg-mist/40 px-4 py-3 text-sm">
                  <span className="text-slate">교재비</span>
                  <span className="tabular-nums text-slate">
                    환불 없음
                    <span className="ml-2 text-xs">
                      ({formatWon(textbook)}원)
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* Total */}
            <div
              className={`mt-5 rounded-[16px] border-2 px-5 py-4 ${
                result.isNoRefund
                  ? "border-red-200 bg-red-50"
                  : "border-forest/20 bg-forest/5"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate">
                최종 환불 예상액
              </p>
              <p
                className={`mt-1 text-3xl font-bold tabular-nums ${
                  result.isNoRefund ? "text-red-600" : "text-forest"
                }`}
              >
                {formatWon(result.totalRefund)}
                <span className="ml-1 text-base font-normal">원</span>
              </p>
              {!result.isNoRefund && textbook > 0 && (
                <p className="mt-1 text-xs text-slate">
                  교재비 {formatWon(textbook)}원은 환불 제외
                </p>
              )}
            </div>

            {/* Cash receipt note */}
            {input.cashReceiptNeeded && (
              <div className="mt-4 flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                <span className="mt-0.5">!</span>
                <div>
                  <span className="font-semibold">현금영수증 발행 필요</span>
                  {input.cashReceiptNote && (
                    <p className="mt-0.5 text-amber-600">
                      {input.cashReceiptNote}
                    </p>
                  )}
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-slate/70">
              * 학원법 제18조 기준. 실제 환불액은 약정, 분할납부 등에 따라
              다를 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
