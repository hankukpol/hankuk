"use client";

import { ExamType, ProspectSource, ProspectStage } from "@prisma/client";
import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ActionModal } from "@/components/ui/action-modal";
import { ProspectFunnel, type FunnelStage } from "@/components/analytics/prospect-funnel";
import type { ProspectRow } from "./page";

const SOURCE_LABELS: Record<ProspectSource, string> = {
  WALK_IN: "내방",
  PHONE: "전화",
  SNS: "SNS",
  REFERRAL: "추천",
  OTHER: "기타",
};

const STAGE_LABELS: Record<ProspectStage, string> = {
  INQUIRY: "문의",
  VISITING: "내방상담",
  DECIDING: "검토중",
  REGISTERED: "등록완료",
  DROPPED: "이탈",
};

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const STAGE_BADGE_CLASS: Record<ProspectStage, string> = {
  INQUIRY: "bg-slate-100 text-slate-600 border-slate-200",
  VISITING: "bg-blue-50 text-blue-700 border-blue-200",
  DECIDING: "bg-amber-50 text-amber-700 border-amber-200",
  REGISTERED: "bg-forest/10 text-forest border-forest/20",
  DROPPED: "bg-red-50 text-red-700 border-red-200",
};

// Next stage to advance to (quick-convert button)
const NEXT_STAGE: Partial<Record<ProspectStage, ProspectStage>> = {
  INQUIRY: ProspectStage.VISITING,
  VISITING: ProspectStage.DECIDING,
  DECIDING: ProspectStage.REGISTERED,
};

const NEXT_STAGE_LABEL: Partial<Record<ProspectStage, string>> = {
  INQUIRY: "내방상담",
  VISITING: "검토중",
  DECIDING: "등록완료",
};

// Months for picker
function buildMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  // Show 6 months back + current + 1 future
  for (let delta = -6; delta <= 1; delta++) {
    const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    opts.push({ value, label });
  }
  return opts;
}

type FormState = {
  name: string;
  phone: string;
  examType: ExamType | "";
  source: ProspectSource;
  stage: ProspectStage;
  note: string;
  visitedAt: string;
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DEFAULT_FORM: FormState = {
  name: "",
  phone: "",
  examType: "",
  source: ProspectSource.WALK_IN,
  stage: ProspectStage.INQUIRY,
  note: "",
  visitedAt: todayIso(),
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청 실패");
  return data as T;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

interface Props {
  initialProspects: ProspectRow[];
  initialMonth: string;
}

export function ProspectManager({ initialProspects, initialMonth }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [prospects, setProspects] = useState<ProspectRow[]>(initialProspects);

  // Funnel data (fetched from API, all-time stage counts)
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);

  // Month filter (URL-synced)
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);

  // Stage / source / search filters (client-side)
  const [filterStage, setFilterStage] = useState<ProspectStage | "ALL">("ALL");
  const [filterSource, setFilterSource] = useState<ProspectSource | "ALL">("ALL");
  const [search, setSearch] = useState("");

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ProspectRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProspectRow | null>(null);
  const [quickConvertTarget, setQuickConvertTarget] = useState<{
    row: ProspectRow;
    nextStage: ProspectStage;
  } | null>(null);

  // Form state
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-dismiss success message after 3 seconds
  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // Fetch funnel data from API
  const fetchFunnel = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/prospects");
      if (!res.ok) return;
      const json = (await res.json()) as { data: { stages: { stage: string; count: number }[] } };
      const raw = json.data.stages;

      // Compute conversion rates (relative to previous non-DROPPED stage)
      const funnelFlow = raw.filter((s) => s.stage !== "DROPPED");
      const built: FunnelStage[] = raw.map((s, i) => {
        const isDropped = s.stage === "DROPPED";
        if (isDropped) {
          return { stage: s.stage, label: STAGE_LABELS[s.stage as ProspectStage] ?? s.stage, count: s.count, conversionRate: null };
        }
        const flowIdx = funnelFlow.findIndex((f) => f.stage === s.stage);
        const prev = flowIdx > 0 ? funnelFlow[flowIdx - 1] : null;
        const rate =
          prev && prev.count > 0
            ? Math.round((s.count / prev.count) * 100)
            : null;
        return {
          stage: s.stage,
          label: STAGE_LABELS[s.stage as ProspectStage] ?? s.stage,
          count: s.count,
          conversionRate: i === 0 ? null : rate,
        };
      });
      setFunnelStages(built);
    } catch {
      // silently ignore fetch errors for funnel
    }
  }, []);

  useEffect(() => {
    void fetchFunnel();
  }, [fetchFunnel]);

  // Month change: update URL
  const handleMonthChange = useCallback(
    (month: string) => {
      setSelectedMonth(month);
      const params = new URLSearchParams(searchParams.toString());
      params.set("month", month);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // Parse selectedMonth for filtering
  const [filterYear, filterMonthNum] = selectedMonth.split("-").map(Number);
  const monthStart = new Date(filterYear, filterMonthNum - 1, 1);
  const monthEnd = new Date(filterYear, filterMonthNum, 1);

  // Prospects within the selected month (by visitedAt)
  const monthProspects = prospects.filter((p) => {
    const d = new Date(p.visitedAt);
    return d >= monthStart && d < monthEnd;
  });

  // Stage counts (for month)
  const stageCounts = (Object.keys(STAGE_LABELS) as ProspectStage[]).reduce(
    (acc, s) => {
      acc[s] = monthProspects.filter((p) => p.stage === s).length;
      return acc;
    },
    {} as Record<ProspectStage, number>,
  );

  // Monthly KPI
  const monthTotal = monthProspects.length;
  const monthRegistered = monthProspects.filter((p) => p.stage === ProspectStage.REGISTERED).length;
  const conversionRate = monthTotal > 0 ? Math.round((monthRegistered / monthTotal) * 100) : 0;

  // Full filtered list (all months when not filtering by source/stage/search, but month filter affects stage-count badges)
  // Table shows all prospects, filtered by stage/source/search across all months
  const filteredProspects = prospects.filter((p) => {
    if (filterStage !== "ALL" && p.stage !== filterStage) return false;
    if (filterSource !== "ALL" && p.source !== filterSource) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !(p.phone ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAdd() {
    setForm({ ...DEFAULT_FORM, visitedAt: todayIso() });
    setErrorMessage(null);
    setShowAddModal(true);
  }

  function openEdit(record: ProspectRow) {
    setForm({
      name: record.name,
      phone: record.phone ?? "",
      examType: (record.examType as ExamType | null) ?? "",
      source: record.source as ProspectSource,
      stage: record.stage as ProspectStage,
      note: record.note ?? "",
      visitedAt: record.visitedAt.slice(0, 10),
    });
    setErrorMessage(null);
    setEditTarget(record);
  }

  function closeAdd() {
    setShowAddModal(false);
    setErrorMessage(null);
  }

  function closeEdit() {
    setEditTarget(null);
    setErrorMessage(null);
  }

  // Patch helper
  async function patchProspect(
    id: string,
    body: Record<string, unknown>,
  ): Promise<ProspectRow> {
    const result = await requestJson<{ data: { prospect: ProspectRow } }>(
      `/api/prospects/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    return result.data.prospect;
  }

  function handleAdd() {
    if (!form.name.trim()) {
      setErrorMessage("이름을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await requestJson<{ data: { prospect: ProspectRow } }>(
          "/api/prospects",
          {
            method: "POST",
            body: JSON.stringify({
              name: form.name.trim(),
              phone: form.phone.trim() || null,
              examType: form.examType || null,
              source: form.source,
              stage: form.stage,
              note: form.note.trim() || null,
              visitedAt: form.visitedAt,
            }),
          },
        );
        setProspects((prev) => [result.data.prospect, ...prev]);
        setSuccessMessage("상담 방문자를 등록했습니다.");
        closeAdd();
        router.refresh();
        void fetchFunnel();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "등록 실패");
      }
    });
  }

  function handleEdit() {
    if (!editTarget) return;
    if (!form.name.trim()) {
      setErrorMessage("이름을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      try {
        const updated = await patchProspect(editTarget.id, {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          examType: form.examType || null,
          source: form.source,
          stage: form.stage,
          note: form.note.trim() || null,
          visitedAt: form.visitedAt,
        });
        setProspects((prev) =>
          prev.map((p) => (p.id === editTarget.id ? updated : p)),
        );
        setSuccessMessage("상담 방문자 정보를 수정했습니다.");
        closeEdit();
        router.refresh();
        void fetchFunnel();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "수정 실패");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await requestJson<{ data: { ok: true } }>(
          `/api/prospects/${deleteTarget.id}`,
          { method: "DELETE" },
        );
        setProspects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        setSuccessMessage("상담 방문자 기록을 삭제했습니다.");
        setDeleteTarget(null);
        void fetchFunnel();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "삭제 실패");
        setDeleteTarget(null);
      }
    });
  }

  function handleQuickConvert() {
    if (!quickConvertTarget) return;
    const { row, nextStage } = quickConvertTarget;
    startTransition(async () => {
      try {
        const updated = await patchProspect(row.id, { stage: nextStage });
        setProspects((prev) =>
          prev.map((p) => (p.id === row.id ? updated : p)),
        );
        setSuccessMessage(
          `"${row.name}" 단계를 ${STAGE_LABELS[nextStage]}으로 변경했습니다.`,
        );
        setQuickConvertTarget(null);
        router.refresh();
        void fetchFunnel();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "단계 변경 실패");
        setQuickConvertTarget(null);
      }
    });
  }

  const monthOptions = buildMonthOptions();

  return (
    <div className="space-y-6">
      {/* Month selector + monthly conversion stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Month picker */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-ink">월별 조회</label>
          <select
            value={selectedMonth}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="rounded-2xl border border-ink/20 px-3 py-2 text-sm outline-none focus:border-forest"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Monthly KPI badges */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-1.5 text-sm">
            <span className="text-slate">이번달 방문</span>
            <span className="font-bold text-ink">{monthTotal}건</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-4 py-1.5 text-sm">
            <span className="text-slate">전환율</span>
            <span className="font-bold text-forest">{conversionRate}%</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/10 px-4 py-1.5 text-sm">
            <span className="text-slate">등록전환</span>
            <span className="font-bold text-ember">{monthRegistered}명</span>
          </div>
        </div>
      </div>

      {/* Funnel visualization */}
      {funnelStages.length > 0 && (
        <ProspectFunnel
          stages={funnelStages}
          activeStage={filterStage === "ALL" ? null : filterStage}
          onStageClick={(stage) =>
            setFilterStage((stage as ProspectStage | null) ?? "ALL")
          }
        />
      )}

      {/* Stage summary badges (based on selected month) */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilterStage("ALL")}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            filterStage === "ALL"
              ? "border-ink/40 bg-ink text-white"
              : "border-ink/10 bg-white text-slate hover:border-ink/20"
          }`}
        >
          전체
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink/10 px-1 text-xs">
            {prospects.length}
          </span>
        </button>
        {(Object.keys(STAGE_LABELS) as ProspectStage[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStage(filterStage === s ? "ALL" : s)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filterStage === s
                ? STAGE_BADGE_CLASS[s]
                : "border-ink/10 bg-white text-slate hover:border-ink/20"
            }`}
          >
            <span>{STAGE_LABELS[s]}</span>
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink/10 px-1 text-xs">
              {stageCounts[s]}
            </span>
          </button>
        ))}
      </div>

      {/* Filter + search bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름·연락처 검색"
            className="w-44 rounded-[12px] border border-ink/20 px-4 py-2 text-sm outline-none focus:border-forest"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setFilterSource("ALL")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filterSource === "ALL"
                  ? "bg-ink text-white"
                  : "border border-ink/10 bg-white text-slate hover:border-ink/30"
              }`}
            >
              전체 경로
            </button>
            {(Object.keys(SOURCE_LABELS) as ProspectSource[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterSource(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterSource === s
                    ? "bg-ink text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
        >
          <span>+</span>
          <span>방문자 등록</span>
        </button>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {successMessage}
        </div>
      )}
      {errorMessage && !showAddModal && !editTarget && !quickConvertTarget && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {[
                  "이름",
                  "연락처",
                  "관심 시험",
                  "방문경로",
                  "단계",
                  "방문일",
                  "메모",
                  "담당자",
                  "작업",
                ].map((header) => (
                  <th
                    key={header}
                    className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {filteredProspects.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-slate"
                  >
                    조건에 맞는 상담 방문자가 없습니다.
                  </td>
                </tr>
              ) : null}
              {filteredProspects.map((record) => {
                const nextStage = NEXT_STAGE[record.stage as ProspectStage];
                const nextLabel = NEXT_STAGE_LABEL[record.stage as ProspectStage];
                return (
                  <tr key={record.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 font-semibold text-ink">
                      <a
                        href={`/admin/prospects/${record.id}`}
                        className="transition hover:text-ember hover:underline"
                      >
                        {record.name}
                      </a>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {record.phone ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {record.examType
                        ? EXAM_TYPE_LABELS[record.examType as ExamType]
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {SOURCE_LABELS[record.source as ProspectSource]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          STAGE_BADGE_CLASS[record.stage as ProspectStage]
                        }`}
                      >
                        {STAGE_LABELS[record.stage as ProspectStage]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                      {formatDate(record.visitedAt)}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-xs text-slate">
                      {record.note ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {record.staff?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {/* Quick stage advance button */}
                        {nextStage && nextLabel ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              setQuickConvertTarget({
                                row: record,
                                nextStage,
                              })
                            }
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              nextStage === ProspectStage.REGISTERED
                                ? "border-forest/30 bg-forest/10 text-forest hover:bg-forest/20"
                                : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                            }`}
                          >
                            → {nextLabel}
                          </button>
                        ) : null}

                        {/* If already REGISTERED, link to enrollment */}
                        {record.stage === ProspectStage.REGISTERED ? (
                          <a
                            href="/admin/enrollments/new"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20"
                          >
                            수강등록
                          </a>
                        ) : null}

                        {/* Edit button */}
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          disabled={isPending}
                          className="inline-flex items-center rounded-full border border-ink/10 px-2.5 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          수정
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer: count */}
        {filteredProspects.length > 0 && (
          <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate">
            총 {filteredProspects.length}건
            {filterStage !== "ALL" || filterSource !== "ALL" || search
              ? " (필터 적용)"
              : ""}
          </div>
        )}
      </div>

      {/* Add Modal */}
      <ActionModal
        open={showAddModal}
        badgeLabel="상담 방문자 등록"
        badgeTone="default"
        title="신규 상담 방문자 등록"
        description="새 상담 방문자를 등록합니다. 이름은 필수 항목입니다."
        panelClassName="max-w-lg"
        cancelLabel="취소"
        confirmLabel={isPending ? "등록 중..." : "등록"}
        isPending={isPending}
        onClose={closeAdd}
        onConfirm={handleAdd}
      >
        <ProspectForm form={form} setField={setField} error={errorMessage} />
      </ActionModal>

      {/* Edit Modal */}
      <ActionModal
        open={!!editTarget}
        badgeLabel="상담 방문자 수정"
        badgeTone="default"
        title="상담 방문자 수정"
        description={`"${editTarget?.name}" 정보를 수정합니다.`}
        panelClassName="max-w-lg"
        cancelLabel="취소"
        confirmLabel={isPending ? "저장 중..." : "수정 저장"}
        isPending={isPending}
        onClose={closeEdit}
        onConfirm={handleEdit}
      >
        <div className="space-y-4">
          <ProspectForm form={form} setField={setField} error={errorMessage} />
          {editTarget && (
            <div className="border-t border-ink/10 pt-4">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const target = editTarget;
                  closeEdit();
                  setDeleteTarget(target);
                }}
                className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                기록 삭제
              </button>
            </div>
          )}
        </div>
      </ActionModal>

      {/* Quick Convert Confirm Modal */}
      <ActionModal
        open={!!quickConvertTarget}
        badgeLabel="단계 변경"
        badgeTone="default"
        title="상담 단계 변경"
        description={
          quickConvertTarget
            ? `"${quickConvertTarget.row.name}" 단계를 ${STAGE_LABELS[quickConvertTarget.row.stage as ProspectStage]}에서 ${STAGE_LABELS[quickConvertTarget.nextStage]}으로 변경합니다.`
            : ""
        }
        details={
          quickConvertTarget
            ? [
                `현재 단계: ${STAGE_LABELS[quickConvertTarget.row.stage as ProspectStage]}`,
                `변경 후: ${STAGE_LABELS[quickConvertTarget.nextStage]}`,
              ]
            : []
        }
        confirmTone={
          quickConvertTarget?.nextStage === ProspectStage.REGISTERED
            ? "default"
            : "default"
        }
        confirmLabel={
          isPending
            ? "변경 중..."
            : quickConvertTarget
              ? `${STAGE_LABELS[quickConvertTarget.nextStage]}으로 변경`
              : "변경"
        }
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setQuickConvertTarget(null)}
        onConfirm={handleQuickConvert}
      />

      {/* Delete Confirm Modal */}
      <ActionModal
        open={!!deleteTarget}
        badgeLabel="삭제 확인"
        badgeTone="warning"
        title="상담 방문자 삭제"
        description={`"${deleteTarget?.name}" 상담 방문자 기록을 삭제합니다. 삭제한 기록은 복구할 수 없습니다.`}
        details={
          deleteTarget
            ? [
                `이름: ${deleteTarget.name}`,
                `단계: ${STAGE_LABELS[deleteTarget.stage as ProspectStage]}`,
                `유입경로: ${SOURCE_LABELS[deleteTarget.source as ProspectSource]}`,
                `방문일: ${formatDate(deleteTarget.visitedAt)}`,
              ]
            : []
        }
        confirmTone="danger"
        confirmLabel="삭제"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function ProspectForm({
  form,
  setField,
  error,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 이름 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          이름 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          placeholder="예: 홍길동"
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
        />
      </div>

      {/* 연락처 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          연락처
          <span className="ml-1 text-xs font-normal text-slate">(선택)</span>
        </label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setField("phone", e.target.value)}
          placeholder="예: 010-1234-5678"
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
        />
      </div>

      {/* 시험유형 + 유입경로 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium">관심 시험</label>
          <select
            value={form.examType}
            onChange={(e) =>
              setField("examType", e.target.value as ExamType | "")
            }
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
          >
            <option value="">선택 안 함</option>
            {(Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            방문경로 <span className="text-red-500">*</span>
          </label>
          <select
            value={form.source}
            onChange={(e) =>
              setField("source", e.target.value as ProspectSource)
            }
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
          >
            {(Object.keys(SOURCE_LABELS) as ProspectSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 단계 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">상담 단계</label>
        <select
          value={form.stage}
          onChange={(e) => setField("stage", e.target.value as ProspectStage)}
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
        >
          {(Object.keys(STAGE_LABELS) as ProspectStage[]).map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        {form.stage === ProspectStage.REGISTERED ? (
          <p className="mt-1.5 text-xs text-forest">
            수강 등록 연결은 수강 등록 메뉴에서 처리하세요.
          </p>
        ) : null}
      </div>

      {/* 방문일 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">방문일</label>
        <input
          type="date"
          value={form.visitedAt}
          onChange={(e) => setField("visitedAt", e.target.value)}
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
        />
      </div>

      {/* 메모 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          메모
          <span className="ml-1 text-xs font-normal text-slate">(선택)</span>
        </label>
        <textarea
          value={form.note}
          onChange={(e) => setField("note", e.target.value)}
          placeholder="상담 내용, 특이사항 등 자유롭게 입력하세요"
          rows={3}
          className="w-full resize-none rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-forest"
        />
      </div>
    </div>
  );
}
