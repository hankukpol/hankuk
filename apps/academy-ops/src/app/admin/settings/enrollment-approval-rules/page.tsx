"use client";

import { useState, useTransition, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type ThresholdSettings = {
  refundApprovalThreshold: number;
  discountApprovalThreshold: number;
  cashApprovalThreshold: number;
};

// ─── Workflow diagram data ────────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  {
    category: "수강 등록 · 결제",
    color: "sky",
    steps: [
      {
        condition: "수강 등록 (일반)",
        requiredRole: "교무(ACADEMIC_ADMIN) 이상",
        note: null,
      },
      {
        condition: "할인 적용 (기준 금액 이하)",
        requiredRole: "교무(ACADEMIC_ADMIN) 이상",
        note: "discountApprovalThreshold 이하",
      },
      {
        condition: "할인 적용 (기준 금액 초과)",
        requiredRole: "교무(ACADEMIC_ADMIN) 이상 → 실장(MANAGER) 확인",
        note: "discountApprovalThreshold 초과 시 상위 확인 필요",
      },
    ],
  },
  {
    category: "환불 처리",
    color: "red",
    steps: [
      {
        condition: "환불 신청 접수",
        requiredRole: "상담원(COUNSELOR) 이상",
        note: null,
      },
      {
        condition: "환불 처리 (기준 금액 미만)",
        requiredRole: "교무(ACADEMIC_ADMIN) 이상",
        note: "refundApprovalThreshold 미만",
      },
      {
        condition: "환불 처리 (기준 금액 이상)",
        requiredRole: "원장(DIRECTOR) 이상 승인 필수",
        note: "refundApprovalThreshold 이상 → 원장 결재 필요",
      },
    ],
  },
  {
    category: "현금 지급",
    color: "amber",
    steps: [
      {
        condition: "현금 지급 (기준 금액 미만)",
        requiredRole: "실장(MANAGER) 이상",
        note: "cashApprovalThreshold 미만",
      },
      {
        condition: "현금 지급 (기준 금액 이상)",
        requiredRole: "원장(DIRECTOR) 이상 승인 필수",
        note: "cashApprovalThreshold 이상 → 원장 결재 필요",
      },
    ],
  },
];

const COLOR_MAP: Record<
  string,
  { badge: string; bg: string; border: string; text: string; dot: string }
> = {
  sky: {
    badge: "bg-sky-100 text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-800",
    dot: "bg-sky-400",
  },
  red: {
    badge: "bg-red-100 text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    dot: "bg-red-400",
  },
  amber: {
    badge: "bg-amber-100 text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    dot: "bg-amber-400",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

function parseFormattedNumber(raw: string): number {
  const stripped = raw.replace(/[^0-9]/g, "");
  return stripped === "" ? 0 : parseInt(stripped, 10);
}

type Field = {
  key: keyof ThresholdSettings;
  label: string;
  description: string;
  approvalRole: string;
};

const FIELDS: Field[] = [
  {
    key: "refundApprovalThreshold",
    label: "환불 승인 기준 금액",
    description: "이 금액 이상 환불 처리 시 원장(DIRECTOR) 승인이 필요합니다.",
    approvalRole: "원장(DIRECTOR) 이상",
  },
  {
    key: "discountApprovalThreshold",
    label: "할인 승인 기준 금액",
    description: "이 금액 초과 할인 적용 시 교무(ACADEMIC_ADMIN) 이상 승인이 필요합니다.",
    approvalRole: "교무(ACADEMIC_ADMIN) 이상",
  },
  {
    key: "cashApprovalThreshold",
    label: "현금 지급 승인 기준",
    description: "이 금액 이상 현금 지급 처리 시 원장(DIRECTOR) 승인이 필요합니다.",
    approvalRole: "원장(DIRECTOR) 이상",
  },
];

// ─── Page (Client Component) ─────────────────────────────────────────────────
export default function EnrollmentApprovalRulesPage() {
  const [form, setForm] = useState<ThresholdSettings>({
    refundApprovalThreshold: 200000,
    discountApprovalThreshold: 50000,
    cashApprovalThreshold: 100000,
  });
  const [displayValues, setDisplayValues] = useState<
    Record<keyof ThresholdSettings, string>
  >({
    refundApprovalThreshold: "200,000",
    discountApprovalThreshold: "50,000",
    cashApprovalThreshold: "100,000",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load current settings on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/approval-thresholds");
        if (!res.ok) throw new Error("설정을 불러오지 못했습니다.");
        const json = (await res.json()) as { data: ThresholdSettings };
        const d = json.data;
        setForm(d);
        setDisplayValues({
          refundApprovalThreshold: formatNumber(d.refundApprovalThreshold),
          discountApprovalThreshold: formatNumber(d.discountApprovalThreshold),
          cashApprovalThreshold: formatNumber(d.cashApprovalThreshold),
        });
      } catch {
        setError("설정 불러오기 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleChange(key: keyof ThresholdSettings, rawValue: string) {
    const numeric = parseFormattedNumber(rawValue);
    setForm((prev) => ({ ...prev, [key]: numeric }));
    setDisplayValues((prev) => ({
      ...prev,
      [key]: rawValue
        .replace(/[^0-9]/g, "")
        .replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    }));
    setSuccess(false);
    setError(null);
  }

  function handleBlur(key: keyof ThresholdSettings) {
    setDisplayValues((prev) => ({
      ...prev,
      [key]: formatNumber(form[key]),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await fetch("/api/settings/approval-thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const responseData = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(responseData.error ?? "저장 실패");
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        시스템 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수강 승인 기준 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강 등록 시 환불·할인·현금 지급 처리에 필요한 상위 결재 기준 금액을 설정합니다.
        설정된 금액 이상(이하) 처리 시 해당 역할 이상의 승인이 필요합니다.
      </p>

      {/* 섹션 1: 금액 기준 설정 폼 */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold text-ink">금액 기준 설정</h2>
        <p className="mt-1 text-sm text-slate">
          기준 금액 이상의 처리 건은 해당 역할 이상의 담당자 승인을 받아야 합니다.
        </p>

        <div className="mt-5 max-w-2xl">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate">
              설정 불러오는 중...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
                  저장되었습니다.
                </div>
              )}

              <div className="overflow-hidden rounded-[28px] border border-ink/10">
                <div className="divide-y divide-ink/10">
                  {FIELDS.map(({ key, label, description, approvalRole }) => (
                    <div key={key} className="px-6 py-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor={key}
                            className="block text-sm font-semibold text-ink"
                          >
                            {label}
                          </label>
                          <p className="mt-1 text-xs text-slate">{description}</p>
                          <span className="mt-1.5 inline-flex rounded-full border border-forest/20 bg-forest/5 px-2 py-0.5 text-xs font-medium text-forest">
                            승인 역할: {approvalRole}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <input
                            id={key}
                            type="text"
                            inputMode="numeric"
                            value={displayValues[key]}
                            onChange={(e) => handleChange(key, e.target.value)}
                            onBlur={() => handleBlur(key)}
                            className="w-36 rounded-xl border border-ink/10 bg-white px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
                          />
                          <span className="shrink-0 text-sm text-slate">원</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4">
                <p className="text-xs font-semibold text-amber-800">설정 안내</p>
                <ul className="mt-2 space-y-1 text-xs text-amber-700">
                  <li>· 환불 기준 금액 이상 환불 처리 시 원장(DIRECTOR) 승인이 필요합니다.</li>
                  <li>
                    · 할인 기준 금액 초과 할인 적용 시 교무 이상(ACADEMIC_ADMIN↑) 승인이
                    필요합니다.
                  </li>
                  <li>· 현금 지급 기준 금액 이상 현금 지급 시 원장(DIRECTOR) 승인이 필요합니다.</li>
                  <li>· 0원으로 설정하면 모든 건에 대해 승인이 필요합니다.</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPending || loading}
                  className="inline-flex items-center rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
                >
                  {isPending ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* 섹션 2: 현재 임계값 요약 */}
      {!loading && (
        <div className="mt-12">
          <h2 className="text-xl font-semibold text-ink">현재 승인 기준 요약</h2>
          <p className="mt-1 text-sm text-slate">
            현재 설정된 금액 기준으로 각 항목의 승인 필요 조건을 요약합니다.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                환불 승인 기준
              </p>
              <p className="mt-2 text-2xl font-bold text-red-700">
                {formatNumber(form.refundApprovalThreshold)}원
              </p>
              <p className="mt-1.5 text-xs text-red-600">이상 → 원장(DIRECTOR) 결재 필요</p>
            </div>
            <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">
                할인 승인 기준
              </p>
              <p className="mt-2 text-2xl font-bold text-sky-700">
                {formatNumber(form.discountApprovalThreshold)}원
              </p>
              <p className="mt-1.5 text-xs text-sky-600">초과 → 교무(ACADEMIC_ADMIN) 확인 필요</p>
            </div>
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                현금 지급 기준
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {formatNumber(form.cashApprovalThreshold)}원
              </p>
              <p className="mt-1.5 text-xs text-amber-600">이상 → 원장(DIRECTOR) 결재 필요</p>
            </div>
          </div>
        </div>
      )}

      {/* 섹션 3: 승인 워크플로우 다이어그램 */}
      <div className="mt-14">
        <h2 className="text-xl font-semibold text-ink">승인 워크플로우</h2>
        <p className="mt-1 text-sm text-slate">
          각 처리 유형별 승인 절차를 단계별로 확인합니다.
        </p>

        <div className="mt-6 space-y-6">
          {WORKFLOW_STEPS.map((section) => {
            const colors = COLOR_MAP[section.color] ?? COLOR_MAP.sky;
            return (
              <div
                key={section.category}
                className={`rounded-[24px] border ${colors.border} ${colors.bg} p-6`}
              >
                <div className="mb-4 flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${colors.badge}`}
                  >
                    {section.category}
                  </span>
                </div>
                <ol className="space-y-3">
                  {section.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span
                        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${colors.dot} text-xs font-bold text-white`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p className={`text-sm font-semibold ${colors.text}`}>
                          {step.condition}
                        </p>
                        <p className="mt-0.5 text-xs text-slate">
                          필요 역할:{" "}
                          <span className="font-semibold text-ink">
                            {step.requiredRole}
                          </span>
                        </p>
                        {step.note && (
                          <p className="mt-0.5 text-xs text-slate/70 italic">
                            {step.note}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>

        {/* 역할 등급 안내 */}
        <div className="mt-6 rounded-[20px] border border-ink/5 bg-mist/60 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">
            역할 등급 순서 (낮음 → 높음)
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {[
              { label: "열람자", level: 0 },
              { label: "강사", level: 1 },
              { label: "상담원", level: 2 },
              { label: "교무", level: 3 },
              { label: "실장", level: 4 },
              { label: "부원장", level: 5 },
              { label: "원장", level: 6 },
              { label: "최고관리자", level: 7 },
            ].map((r) => (
              <span
                key={r.level}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1 font-medium text-ink"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-forest/10 text-[10px] font-bold text-forest">
                  {r.level}
                </span>
                {r.label}
              </span>
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-sm text-slate">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>높은 역할(Lv.)은 낮은 역할의 모든 권한을 포함합니다.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-forest">·</span>
              <span>
                승인 기준 금액 변경은 원장(DIRECTOR) 이상만 가능합니다.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
