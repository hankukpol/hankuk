"use client";

import { useState } from "react";

export type TimelineInstallment = {
  id: string;
  seq: number;
  amount: number;
  dueDate: string | null; // ISO string
  paidAt: string | null; // ISO string
  courseName: string;
  isOverdue: boolean;
  isUpcoming: boolean;
};

type Props = {
  installments: TimelineInstallment[];
};

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatFullDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function PaymentTimeline({ installments }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (installments.length === 0) return null;

  // Sort by dueDate ascending (null dates go last)
  const sorted = [...installments].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const activeInst = activeId ? sorted.find((i) => i.id === activeId) ?? null : null;

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
          Payment Timeline
        </p>
        <h2 className="mt-1 text-xl font-semibold">납부 진행 타임라인</h2>
        <p className="mt-1 text-xs text-slate">각 회차를 클릭하면 상세 정보를 확인할 수 있습니다.</p>
      </div>

      {/* Horizontal scrollable timeline */}
      <div className="overflow-x-auto pb-2">
        <div className="relative flex min-w-max items-start gap-0">
          {sorted.map((inst, index) => {
            const isPaid = inst.paidAt !== null;
            const isActive = activeId === inst.id;
            const isLast = index === sorted.length - 1;

            // Determine node style
            let nodeClass = "";
            let lineClass = "";
            if (isPaid) {
              nodeClass =
                "bg-forest border-forest text-white" + (isActive ? " ring-2 ring-forest/40" : "");
              lineClass = "bg-forest/30";
            } else if (inst.isOverdue) {
              nodeClass =
                "bg-red-500 border-red-500 text-white" + (isActive ? " ring-2 ring-red-300" : "");
              lineClass = "bg-ink/10";
            } else if (inst.isUpcoming) {
              nodeClass =
                "bg-amber-500 border-amber-500 text-white" +
                (isActive ? " ring-2 ring-amber-300" : "");
              lineClass = "bg-ink/10";
            } else {
              nodeClass =
                "bg-white border-ink/20 text-slate" + (isActive ? " ring-2 ring-ink/20" : "");
              lineClass = "bg-ink/10";
            }

            return (
              <div key={inst.id} className="flex items-start">
                {/* Node + label column */}
                <div className="flex flex-col items-center" style={{ width: 80 }}>
                  {/* Date label above */}
                  <p className="mb-1.5 text-center text-[10px] font-medium leading-tight text-slate">
                    {inst.dueDate ? formatShortDate(inst.dueDate) : "미정"}
                  </p>

                  {/* Circle button */}
                  <button
                    type="button"
                    onClick={() => setActiveId(isActive ? null : inst.id)}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition ${nodeClass}`}
                    aria-label={`${inst.seq}회차 상세 보기`}
                  >
                    {isPaid ? (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : inst.isOverdue ? (
                      "!"
                    ) : (
                      inst.seq
                    )}
                  </button>

                  {/* Amount label below */}
                  <p className="mt-1.5 text-center text-[10px] font-semibold leading-tight text-ink">
                    {formatAmount(inst.amount)}
                  </p>
                  <p className="mt-0.5 text-center text-[9px] leading-tight text-slate truncate w-full px-1">
                    {inst.courseName.length > 6
                      ? inst.courseName.slice(0, 6) + "…"
                      : inst.courseName}
                  </p>
                </div>

                {/* Connecting line (not after last) */}
                {!isLast && (
                  <div className="mt-[22px] flex-none" style={{ width: 32, height: 4 }}>
                    <div
                      className={`h-1 w-full rounded-full ${isPaid ? "bg-forest/40" : "bg-ink/10"} ${!isPaid ? "border-t-2 border-dashed border-ink/15 bg-transparent" : ""}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail popover card */}
      {activeInst && (
        <div className="mt-4 rounded-[20px] border border-ink/10 bg-mist px-4 py-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">{activeInst.seq}회차 납부</p>
                {activeInst.paidAt ? (
                  <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                    납부 완료
                  </span>
                ) : activeInst.isOverdue ? (
                  <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    연체
                  </span>
                ) : activeInst.isUpcoming ? (
                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    7일 내 예정
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                    납부 예정
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate">강좌: {activeInst.courseName}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="mt-0.5 flex-shrink-0 rounded-full p-1 text-slate transition hover:bg-ink/5"
              aria-label="닫기"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-[14px] bg-white px-3 py-2.5">
              <p className="text-[10px] text-slate">납부 금액</p>
              <p className="mt-1 text-sm font-bold text-ink">{formatAmount(activeInst.amount)}</p>
            </div>
            <div className="rounded-[14px] bg-white px-3 py-2.5">
              <p className="text-[10px] text-slate">납부 예정일</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {activeInst.dueDate ? formatFullDate(activeInst.dueDate) : "미정"}
              </p>
            </div>
            {activeInst.paidAt && (
              <div className="rounded-[14px] border border-forest/20 bg-forest/5 px-3 py-2.5">
                <p className="text-[10px] text-slate">납부 완료일</p>
                <p className="mt-1 text-sm font-semibold text-forest">
                  {formatFullDate(activeInst.paidAt)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-forest" />
          납부 완료
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
          연체
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
          7일 내 예정
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-ink/20 bg-white" />
          납부 예정
        </span>
      </div>
    </div>
  );
}
