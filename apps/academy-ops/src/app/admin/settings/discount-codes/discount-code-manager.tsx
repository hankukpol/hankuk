"use client";

import { CodeType, DiscountType } from "@prisma/client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import type { CodeStatRow, RecentUsageRow } from "@/app/api/settings/discount-codes/stats/route";

type DiscountCodeRecord = {
  id: number;
  code: string;
  type: CodeType;
  discountType: DiscountType;
  discountValue: number;
  maxUsage: number | null;
  usageCount: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
  staff: { name: string } | null;
};

const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  RATE: "비율(%)",
  FIXED: "정액(원)",
};

type CodeStat = {
  usageCount: number;
  totalDiscountAmount: number;
};

type DiscountCodeManagerProps = {
  initialCodes: DiscountCodeRecord[];
  codeStats?: Record<number, CodeStat>;
};

const CODE_TYPE_LABELS: Record<CodeType, string> = {
  REFERRAL: "추천인",
  ENROLLMENT: "등록",
  CAMPAIGN: "캠페인",
};

const CODE_TYPE_COLORS: Record<CodeType, string> = {
  REFERRAL: "text-purple-700 bg-purple-50",
  ENROLLMENT: "text-blue-700 bg-blue-50",
  CAMPAIGN: "text-amber-700 bg-amber-50",
};

type FormState = {
  code: string;
  type: CodeType;
  discountType: DiscountType;
  discountValue: string;
  maxUsage: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
};

const DEFAULT_FORM: FormState = {
  code: "",
  type: CodeType.ENROLLMENT,
  discountType: DiscountType.RATE,
  discountValue: "",
  maxUsage: "",
  validFrom: "",
  validUntil: "",
  isActive: true,
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDiscount(record: DiscountCodeRecord) {
  if (record.discountType === DiscountType.RATE) {
    return `${record.discountValue}%`;
  }
  return `${record.discountValue.toLocaleString()}원`;
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────

type StatsData = {
  totalCodes: number;
  activeCodes: number;
  monthlyUsages: number;
  totalDiscountAmount: number;
  stats: CodeStatRow[];
  recentUsages: RecentUsageRow[];
};

function StatsView() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/discount-codes/stats", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "통계 로드 실패");
      setData(json.data as StatsData);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "통계 로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-load on first render of this component
  if (!loaded && !loading && !error) {
    loadStats();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate">
        통계 데이터를 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4">
        <p className="text-sm font-medium text-red-700">{error}</p>
        <button
          type="button"
          onClick={loadStats}
          className="mt-2 text-xs font-semibold text-red-700 underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* KPI bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 코드 수</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{data.totalCodes}</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">활성 코드</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-forest">{data.activeCodes}</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">이번 달 사용</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{data.monthlyUsages}건</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 할인액</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-ember">
            {data.totalDiscountAmount.toLocaleString()}원
          </p>
        </div>
      </div>

      {/* Per-code stats table */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">코드별 사용 현황</h3>
        <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {["코드명", "할인", "사용/한도", "총 할인액", "사용률", "최근 사용일"].map(
                  (h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {data.stats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate">
                    할인 코드가 없습니다.
                  </td>
                </tr>
              ) : null}
              {data.stats.map((row) => {
                const pct =
                  row.maxUsage != null && row.maxUsage > 0
                    ? Math.min(100, Math.round((row.usageCount / row.maxUsage) * 100))
                    : null;
                const lastUsed = row.recentUsages[0]?.usedAt ?? null;
                const discountLabel =
                  row.discountType === "RATE"
                    ? `${row.discountValue}%`
                    : `${row.discountValue.toLocaleString()}원`;
                return (
                  <tr key={row.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-ink">{row.code}</span>
                        {!row.isActive && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            비활성
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">{discountLabel}</td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {row.usageCount}
                      {row.maxUsage != null ? ` / ${row.maxUsage}` : " / 무제한"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.totalDiscountAmount > 0 ? (
                        <span className="font-medium text-ember">
                          {row.totalDiscountAmount.toLocaleString()}원
                        </span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct >= 90
                                  ? "bg-red-500"
                                  : pct >= 70
                                    ? "bg-amber-500"
                                    : "bg-forest"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-slate">{pct}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate">무제한</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate">
                      {lastUsed ? formatDateTime(lastUsed) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent usages across all codes */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">최근 사용 내역 (전체 10건)</h3>
        <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {["학생명", "학번", "코드", "할인액", "사용일시"].map((h) => (
                  <th
                    key={h}
                    className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {data.recentUsages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate">
                    아직 할인 코드가 사용된 내역이 없습니다.
                  </td>
                </tr>
              ) : null}
              {data.recentUsages.map((u) => (
                <tr key={u.id} className="transition hover:bg-mist/30">
                  <td className="px-4 py-3 font-medium text-ink">
                    <a
                      href={`/admin/students/${u.examNumber}`}
                      className="hover:text-ember hover:underline underline-offset-2"
                    >
                      {u.studentName}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate">{u.examNumber}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-ink">{u.code}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {u.discountAmount > 0 ? (
                      <span className="font-medium text-ember">
                        {u.discountAmount.toLocaleString()}원
                      </span>
                    ) : (
                      <span className="text-slate">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate">{formatDateTime(u.usedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={loadStats}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          새로고침
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DiscountCodeManager({ initialCodes, codeStats = {} }: DiscountCodeManagerProps) {
  const [activeTab, setActiveTab] = useState<"list" | "stats">("list");
  const [codes, setCodes] = useState<DiscountCodeRecord[]>(initialCodes);
  const [filterType, setFilterType] = useState<CodeType | "ALL">("ALL");
  const [filterDiscountType, setFilterDiscountType] = useState<DiscountType | "ALL">("ALL");
  const [filterActive, setFilterActive] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingUsageCount, setEditingUsageCount] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();

  const filteredCodes = codes.filter((c) => {
    if (filterType !== "ALL" && c.type !== filterType) return false;
    if (filterDiscountType !== "ALL" && c.discountType !== filterDiscountType) return false;
    if (filterActive === "ACTIVE" && !c.isActive) return false;
    if (filterActive === "INACTIVE" && c.isActive) return false;
    return true;
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setEditingUsageCount(0);
    setForm(DEFAULT_FORM);
    setErrorMessage(null);
    setIsFormOpen(true);
  }

  function openEdit(record: DiscountCodeRecord) {
    setEditingId(record.id);
    setEditingUsageCount(record.usageCount);
    setForm({
      code: record.code,
      type: record.type,
      discountType: record.discountType,
      discountValue: String(record.discountValue),
      maxUsage: record.maxUsage != null ? String(record.maxUsage) : "",
      validFrom: record.validFrom ? record.validFrom.slice(0, 10) : "",
      validUntil: record.validUntil ? record.validUntil.slice(0, 10) : "",
      isActive: record.isActive,
    });
    setErrorMessage(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setEditingUsageCount(0);
    setForm(DEFAULT_FORM);
    setErrorMessage(null);
  }

  function handleSave() {
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const body = {
          code: form.code.trim().toUpperCase(),
          type: form.type,
          discountType: form.discountType,
          discountValue: form.discountValue === "" ? 0 : Number(form.discountValue),
          maxUsage: form.maxUsage ? Number(form.maxUsage) : null,
          validFrom: form.validFrom || null,
          validUntil: form.validUntil || null,
          isActive: form.isActive,
        };

        if (editingId !== null) {
          const result = await requestJson<{ code: DiscountCodeRecord }>(
            `/api/settings/discount-codes/${editingId}`,
            { method: "PATCH", body: JSON.stringify(body) },
          );
          setCodes((prev) =>
            prev.map((c) => (c.id === editingId ? result.code : c)),
          );
          toast.success("할인 코드를 수정했습니다.");
        } else {
          const result = await requestJson<{ code: DiscountCodeRecord }>(
            "/api/settings/discount-codes",
            { method: "POST", body: JSON.stringify(body) },
          );
          setCodes((prev) => [result.code, ...prev]);
          toast.success("할인 코드를 추가했습니다.");
        }

        closeForm();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  function handleDelete(record: DiscountCodeRecord) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: `할인 코드 삭제: ${record.code}`,
      description: "이 할인 코드를 삭제하시겠습니까? 삭제한 코드는 복구할 수 없습니다.",
      details: [
        `코드: ${record.code}`,
        `유형: ${CODE_TYPE_LABELS[record.type]}`,
        `할인: ${formatDiscount(record)}`,
        `사용 횟수: ${record.usageCount}회`,
      ],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();

        startTransition(async () => {
          try {
            await requestJson<{ ok: true }>(
              `/api/settings/discount-codes/${record.id}`,
              { method: "DELETE" },
            );
            setCodes((prev) => prev.filter((c) => c.id !== record.id));
            toast.success("할인 코드를 삭제했습니다.");
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  const typeFilters: Array<{ value: CodeType | "ALL"; label: string }> = [
    { value: "ALL", label: "전체" },
    { value: CodeType.REFERRAL, label: "추천인" },
    { value: CodeType.ENROLLMENT, label: "등록" },
    { value: CodeType.CAMPAIGN, label: "캠페인" },
  ];

  const discountTypeFilters: Array<{ value: DiscountType | "ALL"; label: string }> = [
    { value: "ALL", label: "전체" },
    { value: DiscountType.RATE, label: "비율(%)" },
    { value: DiscountType.FIXED, label: "정액(원)" },
  ];

  const activeFilters: Array<{ value: "ALL" | "ACTIVE" | "INACTIVE"; label: string }> = [
    { value: "ALL", label: "전체" },
    { value: "ACTIVE", label: "활성" },
    { value: "INACTIVE", label: "비활성" },
  ];

  const canDelete = editingUsageCount === 0;

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-full border border-ink/10 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              activeTab === "list"
                ? "bg-ink text-white shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            코드 목록
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stats")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              activeTab === "stats"
                ? "bg-ink text-white shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            사용 통계
          </button>
        </div>

        {activeTab === "list" && (
          <div className="flex items-center gap-2">
            <a
              href="/admin/settings/discount-codes/new"
              className="inline-flex items-center gap-2 rounded-full border border-ember/30 px-4 py-2 text-sm font-medium text-ember transition hover:border-ember/60 hover:bg-ember/5"
            >
              새 할인코드 등록
            </a>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
            >
              <span>+</span>
              <span>빠른 생성</span>
            </button>
          </div>
        )}
      </div>

      {/* Stats tab */}
      {activeTab === "stats" && <StatsView />}

      {/* List tab */}
      {activeTab === "list" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {/* 코드 유형 필터 */}
            <div className="flex gap-1">
              {typeFilters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilterType(f.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    filterType === f.value
                      ? "bg-ink text-white"
                      : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* 할인 방식 필터 */}
            <div className="flex gap-1">
              {discountTypeFilters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilterDiscountType(f.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    filterDiscountType === f.value
                      ? "bg-forest text-white"
                      : "border border-ink/10 bg-white text-slate hover:border-forest/30"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* 활성 필터 */}
            <div className="flex gap-1">
              {activeFilters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilterActive(f.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    filterActive === f.value
                      ? "bg-ink text-white"
                      : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  {["코드", "유형", "할인 방식", "할인", "사용 횟수", "총 할인액", "유효 기간", "상태", "발급자", "액션"].map(
                    (header) => (
                      <th
                        key={header}
                        className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {filteredCodes.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate">
                      조건에 맞는 할인 코드가 없습니다.
                    </td>
                  </tr>
                ) : null}
                {filteredCodes.map((record) => {
                  const isExpiringSoon =
                    record.validUntil && record.isActive
                      ? (() => {
                          const until = new Date(record.validUntil);
                          until.setHours(23, 59, 59, 999);
                          const now = new Date();
                          const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                          return until >= now && until <= sevenDays;
                        })()
                      : false;
                  const stat = codeStats[record.id];
                  const statUsageCount = stat?.usageCount ?? 0;
                  const statTotalDiscount = stat?.totalDiscountAmount ?? 0;
                  return (
                    <tr key={record.id} className="transition hover:bg-mist/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-ink">{record.code}</span>
                          {isExpiringSoon && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              만료 임박
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${CODE_TYPE_COLORS[record.type]}`}
                        >
                          {CODE_TYPE_LABELS[record.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-ink/10 bg-mist/60 px-2 py-0.5 text-xs text-slate">
                          {DISCOUNT_TYPE_LABELS[record.discountType]}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">
                        {formatDiscount(record)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate">
                        <a
                          href={`/admin/settings/discount-codes/${record.id}`}
                          className="underline-offset-2 hover:underline hover:text-ember"
                        >
                          {statUsageCount}
                          {record.maxUsage != null ? ` / ${record.maxUsage}` : " / 무제한"}
                        </a>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {statTotalDiscount > 0 ? (
                          <span className="font-medium text-ember">
                            {statTotalDiscount.toLocaleString()}원
                          </span>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        <div>{formatDate(record.validFrom)}</div>
                        {record.validUntil ? (
                          <div className={isExpiringSoon ? "font-semibold text-amber-700" : ""}>
                            ~ {formatDate(record.validUntil)}
                          </div>
                        ) : (
                          <div className="text-slate/60">종료일 없음</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            record.isActive
                              ? "bg-green-50 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {record.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate">
                        {record.staff?.name ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`/admin/settings/discount-codes/${record.id}/edit`}
                            className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                          >
                            수정
                          </a>
                          <a
                            href={`/admin/settings/discount-codes/${record.id}`}
                            className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-forest/30 hover:text-forest"
                          >
                            이력
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      <ActionModal
        open={isFormOpen}
        badgeLabel={editingId !== null ? "할인 코드 수정" : "할인 코드 생성"}
        badgeTone="default"
        title={editingId !== null ? "할인 코드 수정" : "새 할인 코드 생성"}
        description={
          editingId !== null
            ? "할인 코드 정보를 수정합니다."
            : "새 할인 코드를 생성합니다. 코드, 할인 방식, 유효 시작일은 필수 항목입니다."
        }
        panelClassName="max-w-lg"
        cancelLabel="취소"
        confirmLabel={
          isPending ? "저장 중..." : editingId !== null ? "수정 저장" : "코드 생성"
        }
        isPending={isPending}
        onClose={closeForm}
        onConfirm={handleSave}
      >
        <div className="space-y-4">
          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {/* 코드 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              코드 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setField("code", e.target.value.toUpperCase())}
              placeholder="예: SUMMER2026"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 font-mono text-sm uppercase outline-none focus:border-ink/30"
            />
          </div>

          {/* 유형 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              유형 <span className="text-red-500">*</span>
            </label>
            <select
              value={form.type}
              onChange={(e) => setField("type", e.target.value as CodeType)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            >
              {(Object.keys(CODE_TYPE_LABELS) as CodeType[]).map((t) => (
                <option key={t} value={t}>
                  {CODE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {/* 할인 방식 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              할인 방식 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="discountType"
                  value={DiscountType.RATE}
                  checked={form.discountType === DiscountType.RATE}
                  onChange={() => setField("discountType", DiscountType.RATE)}
                  className="accent-ember"
                />
                비율 (%)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="discountType"
                  value={DiscountType.FIXED}
                  checked={form.discountType === DiscountType.FIXED}
                  onChange={() => setField("discountType", DiscountType.FIXED)}
                  className="accent-ember"
                />
                정액 (원)
              </label>
            </div>
          </div>

          {/* 할인값 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              할인 값{" "}
              <span className="text-red-500">*</span>
              <span className="ml-1 text-xs font-normal text-slate">
                {form.discountType === DiscountType.RATE ? "(% 입력)" : "(원 입력)"}
              </span>
            </label>
            <input
              type="number"
              min={0}
              value={form.discountValue}
              onChange={(e) => setField("discountValue", e.target.value)}
              placeholder={
                form.discountType === DiscountType.RATE ? "예: 10" : "예: 50000"
              }
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* 최대 사용 횟수 + 유효 시작일 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                최대 사용 횟수
                <span className="ml-1 text-xs font-normal text-slate">(미입력=무제한)</span>
              </label>
              <input
                type="number"
                min={1}
                value={form.maxUsage}
                onChange={(e) => setField("maxUsage", e.target.value)}
                placeholder="예: 100"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                유효 시작일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.validFrom}
                onChange={(e) => setField("validFrom", e.target.value)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {/* 유효 종료일 + 활성 여부 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                유효 종료일
                <span className="ml-1 text-xs font-normal text-slate">(선택)</span>
              </label>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => setField("validUntil", e.target.value)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-ink/10 px-4 py-3 text-sm transition hover:border-ink/30">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setField("isActive", e.target.checked)}
                  className="accent-ember"
                />
                <span className="font-medium">활성</span>
                <span className="text-xs text-slate">(즉시 사용 가능)</span>
              </label>
            </div>
          </div>

          {/* Delete button in edit mode */}
          {editingId !== null ? (
            <div className="border-t border-ink/10 pt-4">
              {canDelete ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    const target = codes.find((c) => c.id === editingId);
                    if (!target) return;
                    closeForm();
                    handleDelete(target);
                  }}
                  className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  코드 삭제
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate">
                  <span className="inline-flex items-center rounded-full border border-ink/10 bg-slate-50 px-3 py-1.5 text-slate/50 line-through">
                    코드 삭제
                  </span>
                  <span>이미 사용된 코드는 삭제할 수 없습니다. 비활성화를 사용하세요.</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </ActionModal>

      {/* Delete confirm modal */}
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
