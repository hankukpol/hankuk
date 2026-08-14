"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type FeatureKey = "preRegistration" | "answerInput" | "result" | "analysis" | "finalPrediction" | "comments" | "notices" | "faq";
type Phase = "PRE_REGISTRATION" | "SCORING_OPEN" | "ANALYSIS_OPEN" | "FINAL_OPEN" | "CLOSED";
type OperationResponse = {
  operation: {
    exam: { id: number; name: string; year: number; round: number; examDate: string } | null;
    state: { version: number; activeCampaignId: number | null; featureOverrides: Partial<Record<FeatureKey, boolean>> } | null;
    phase: Phase;
    phaseLabel: string;
    features: Record<FeatureKey, boolean>;
    source: string;
    warnings: string[];
  };
  campaigns: Array<{ id: number; name: string; publishedVersion: number }>;
  presets: Array<{ phase: Phase; label: string; features: Record<FeatureKey, boolean> }>;
};

const FEATURE_LABELS: Record<FeatureKey, string> = {
  preRegistration: "사전등록",
  answerInput: "답안 입력",
  result: "성적 결과",
  analysis: "표본 분석",
  finalPrediction: "최종예측",
  comments: "실시간 댓글",
  notices: "공지사항",
  faq: "FAQ",
};

export default function ExamOperationConsole() {
  const [data, setData] = useState<OperationResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("CLOSED");
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<FeatureKey, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/exam-operation", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "운영 상태를 불러오지 못했습니다.");
    setData(result); setPhase(result.operation.phase); setCampaignId(result.operation.state?.activeCampaignId ?? null); setOverrides(result.operation.state?.featureOverrides ?? {});
  }, []);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);

  const previewFeatures = useMemo(() => {
    const preset = data?.presets.find((item) => item.phase === phase)?.features;
    return preset ? { ...preset, ...overrides } : null;
  }, [data, phase, overrides]);

  async function apply() {
    if (!data?.operation.exam || !window.confirm("선택한 운영 단계와 대표 캠페인을 즉시 공개 상태에 반영하시겠습니까?")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/exam-operation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase, activeCampaignId: campaignId, featureOverrides: overrides, expectedVersion: data.operation.state?.version ?? null, note: "관리자 운영 콘솔 전환" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "운영 단계 변경에 실패했습니다.");
      await load(); setMessage("운영 단계와 대표 캠페인이 반영되었습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "운영 단계 변경에 실패했습니다."); } finally { setBusy(false); }
  }

  if (!data) return <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{message || "회차 운영 상태를 불러오는 중입니다..."}</section>;
  const exam = data.operation.exam;
  return <section className="mb-5 rounded-xl border border-service-200 bg-white p-5">
    <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-service-700">회차 운영 콘솔</p><h2 className="mt-1 text-xl font-bold text-slate-950">{exam ? `${exam.year}년 ${exam.round}차 · ${exam.name}` : "활성 시험 없음"}</h2><p className="mt-1 text-sm text-slate-600">운영 단계를 전환하면 학생 메뉴와 직접 접근 API가 같은 회차 기준으로 함께 바뀝니다.</p></div><Link href="/admin/promotions" className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">프로모션 관리</Link></div>
    {data.operation.warnings.map((warning) => <div key={warning} className="mt-3 rounded-lg border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950">{warning}</div>)}
    {message ? <div className="mt-3 rounded-lg border-l-2 border-service-600 bg-service-50 px-3 py-2 text-sm text-service-950">{message}</div> : null}
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>운영 단계</span><select className="min-h-11 rounded-md border border-slate-300 bg-white px-3" value={phase} onChange={(event) => { setPhase(event.target.value as Phase); setOverrides({}); }}>{data.presets.map((preset) => <option key={preset.phase} value={preset.phase}>{preset.label}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>대표 프로모션</span><select className="min-h-11 rounded-md border border-slate-300 bg-white px-3" value={campaignId ?? ""} onChange={(event) => setCampaignId(event.target.value ? Number(event.target.value) : null)}><option value="">기본 서비스 홈 사용</option>{data.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · 게시 v{campaign.publishedVersion}</option>)}</select></label></div>
    <div className="mt-5"><h3 className="text-sm font-semibold text-slate-900">변경 결과 미리보기</h3><div className="mt-2 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">{previewFeatures ? (Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => <div key={key} className="flex items-center justify-between bg-white px-3 py-2.5 text-sm"><span className="text-slate-700">{FEATURE_LABELS[key]}</span><span className={`font-semibold ${previewFeatures[key] ? "text-emerald-700" : "text-slate-400"}`}>{previewFeatures[key] ? "공개" : "비공개"}</span></div>) : null}</div></div>
    <details className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">고급 기능 재정의</summary><div className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => <label key={key} className="grid gap-1 text-sm text-slate-700"><span>{FEATURE_LABELS[key]}</span><select className="min-h-11 rounded-md border border-slate-300 bg-white px-2" value={overrides[key] === undefined ? "PRESET" : overrides[key] ? "ON" : "OFF"} onChange={(event) => setOverrides((current) => { if (event.target.value === "PRESET") return Object.fromEntries(Object.entries(current).filter(([entry]) => entry !== key)) as Partial<Record<FeatureKey, boolean>>; return { ...current, [key]: event.target.value === "ON" }; })}><option value="PRESET">프리셋 사용</option><option value="ON">강제 공개</option><option value="OFF">강제 비공개</option></select></label>)}</div></details>
    <div className="mt-4 flex justify-end"><button type="button" className="inline-flex min-h-11 items-center justify-center rounded-md bg-service-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-service-800 disabled:opacity-50" disabled={busy || !exam} onClick={() => void apply()}>{busy ? "적용 중..." : "운영 단계 적용"}</button></div>
  </section>;
}
