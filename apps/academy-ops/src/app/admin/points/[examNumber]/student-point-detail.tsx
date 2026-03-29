"use client";

import { useState, useTransition } from "react";
import type { PointType } from "@prisma/client";

type LogRow = {
  id: number;
  type: PointType;
  amount: number;
  reason: string;
  grantedAt: string;
  grantedBy: string | null;
};

const POINT_TYPE_COLOR: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "border-forest/30 bg-forest/10 text-forest",
  SCORE_EXCELLENCE: "border-sky-200 bg-sky-50 text-sky-700",
  ESSAY_EXCELLENCE: "border-amber-200 bg-amber-50 text-amber-700",
  MANUAL: "border-ember/30 bg-ember/10 text-ember",
  USE_PAYMENT: "border-red-200 bg-red-50 text-red-700",
  USE_RENTAL: "border-red-200 bg-red-50 text-red-700",
  ADJUST: "border-slate/20 bg-slate/10 text-slate",
  EXPIRE: "border-ink/20 bg-ink/5 text-slate",
  REFUND_CANCEL: "border-purple-200 bg-purple-50 text-purple-700",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json()) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "요청에 실패했습니다.");
  }

  return payload as T;
}

export function StudentPointDetail({
  examNumber,
  initialLogs,
  initialBalance,
  pointTypeLabelMap,
}: {
  examNumber: string;
  initialLogs: LogRow[];
  initialBalance: number;
  pointTypeLabelMap: Record<PointType, string>;
}) {
  const [logs, setLogs] = useState<LogRow[]>(initialLogs);
  const [balance, setBalance] = useState<number>(initialBalance);
  const [mode, setMode] = useState<"grant" | "deduct">("grant");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    type ResponseShape = {
      student: { name: string; examNumber: string; phone: string | null };
      balance: number;
      logs: Array<{
        id: number;
        type: PointType;
        amount: number;
        reason: string;
        grantedAt: string;
        grantedBy: string | null;
      }>;
    };

    const response = await requestJson<ResponseShape>(
      `/api/points/student/${encodeURIComponent(examNumber)}`,
    );

    setBalance(response.balance);
    setLogs(
      response.logs.map((log) => ({
        id: log.id,
        type: log.type,
        amount: log.amount,
        reason: log.reason,
        grantedAt:
          typeof log.grantedAt === "string"
            ? log.grantedAt
            : new Date(log.grantedAt).toISOString(),
        grantedBy: log.grantedBy,
      })),
    );
  }

  function handleSubmit() {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("금액은 1 이상의 숫자여야 합니다.");
      return;
    }

    if (!reason.trim()) {
      setError("사유를 입력해 주세요.");
      return;
    }

    setError(null);
    setSuccess(null);

    const finalAmount = mode === "deduct" ? -numericAmount : numericAmount;

    startTransition(async () => {
      try {
        await requestJson("/api/points/adjust", {
          method: "POST",
          body: JSON.stringify({
            examNumber,
            amount: finalAmount,
            reason: reason.trim(),
          }),
        });

        await refresh();
        setAmount("");
        setReason("");
        setSuccess(
          `${mode === "grant" ? "지급" : "차감"} 완료: ${Math.abs(finalAmount).toLocaleString()}P`,
        );
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "처리에 실패했습니다.");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            포인트 이력 <span className="ml-1 text-sm font-normal text-slate">({logs.length}건)</span>
          </h2>
        </div>

        {logs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate">포인트 이력이 없습니다.</div>
        ) : (
          <div className="divide-y divide-ink/5">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-4 px-6 py-4">
                <div
                  className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full border ${
                    log.amount >= 0 ? "border-forest/40 bg-forest/20" : "border-red-300 bg-red-100"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        POINT_TYPE_COLOR[log.type] ?? "border-ink/10 bg-ink/5 text-slate"
                      }`}
                    >
                      {pointTypeLabelMap[log.type] ?? log.type}
                    </span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        log.amount >= 0 ? "text-forest" : "text-red-600"
                      }`}
                    >
                      {log.amount >= 0 ? "+" : ""}
                      {log.amount.toLocaleString()}P
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink">{log.reason}</p>
                  <p className="mt-0.5 text-xs text-slate">
                    {new Date(log.grantedAt).toLocaleString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {log.grantedBy ? ` · ${log.grantedBy}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="self-start rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">포인트 조정</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex w-full overflow-hidden rounded-xl border border-ink/10">
            <button
              onClick={() => {
                setMode("grant");
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === "grant" ? "bg-forest text-white" : "bg-white text-slate hover:bg-mist"
              }`}
            >
              지급
            </button>
            <button
              onClick={() => {
                setMode("deduct");
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === "deduct" ? "bg-red-600 text-white" : "bg-white text-slate hover:bg-mist"
              }`}
            >
              차감
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">금액 (P)</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="예: 500"
              className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">사유</label>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="포인트 조정 사유"
              className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40"
            />
          </div>

          {mode === "deduct" && Number(amount) > 0 && balance < Number(amount) ? (
            <p className="text-xs text-amber-600">
              현재 잔액({balance.toLocaleString()}P)이 차감 금액보다 적습니다.
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm font-medium text-forest">{success}</p> : null}

          <button
            onClick={handleSubmit}
            disabled={isPending || !amount || !reason.trim()}
            className={`w-full rounded-full py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
              mode === "deduct" ? "bg-red-600 hover:bg-red-700" : "bg-forest hover:bg-forest/90"
            }`}
          >
            {isPending
              ? "처리 중…"
              : mode === "grant"
                ? `${amount ? Number(amount).toLocaleString() : "0"}P 지급`
                : `${amount ? Number(amount).toLocaleString() : "0"}P 차감`}
          </button>
        </div>
      </div>
    </div>
  );
}
