"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ExamTypeItem } from "@/lib/services/exam.service";
import type { RegularSessionListItem } from "@/lib/exam-analysis-types";
import { defaultMorningAnalysisRange, morningAnalysisRangeSchema } from "@/lib/morning-exam-analysis-schemas";

type Kind = "regular" | "morning";

function useList<T>(url: string) {
  const [state, setState] = useState<{ url: string; data?: T; error?: string }>({ url });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ url });
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("request failed");
        const data = await response.json() as T;
        if (!controller.signal.aborted) setState({ url, data });
      } catch {
        if (!controller.signal.aborted) setState({ url, error: "내보내기 목록을 불러오지 못했습니다. 다시 시도해 주세요." });
      }
    })();
    return () => controller.abort();
  }, [url, attempt]);
  return { ...(state.url === url ? state : { url }), retry: () => setAttempt((value) => value + 1) };
}

function ListStatus({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div role="alert" className="admin-notice admin-notice-danger"><p>{error}</p><button className="admin-button" type="button" onClick={retry}>다시 시도</button></div> : <p role="status" className="admin-help">내보내기 목록을 불러오는 중입니다.</p>;
}

function DownloadFile({ url, filename, disabled = false }: { url: string; filename: string; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const blobs = useRef(new Set<string>());
  useEffect(() => {
    const urls = blobs.current;
    return () => {
      request.current?.abort();
      urls.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
      urls.clear();
    };
  }, []);
  async function download() {
    if (disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setMessage(""); setError(false);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setError(true);
        setMessage(response.status === 404 || response.status === 204 ? "선택한 조건에 내보낼 분석 자료가 없습니다." : "파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (!blob.size || response.status === 204) { setMessage("선택한 조건에 내보낼 분석 자료가 없습니다."); return; }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") && !contentType.includes("application/octet-stream")) throw new Error("unexpected file type");
      const blobUrl = URL.createObjectURL(blob);
      blobs.current.add(blobUrl);
      const anchor = document.createElement("a");
      anchor.href = blobUrl; anchor.download = filename;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally {
        anchor.remove();
        // Let the browser consume the click before releasing the blob.
        setTimeout(() => { if (blobs.current.delete(blobUrl)) URL.revokeObjectURL(blobUrl); }, 1000);
      }
      setMessage("엑셀 다운로드를 시작했습니다.");
    } catch {
      if (!controller.signal.aborted) { setError(true); setMessage("파일을 내려받지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    } finally {
      if (!controller.signal.aborted) { setPending(false); request.current = null; }
    }
  }
  return <div className="space-y-4"><button className="admin-button admin-button-primary" type="button" disabled={disabled || pending} onClick={() => void download()}>{pending ? "엑셀 파일 준비 중…" : error ? "엑셀 다운로드 다시 시도" : "엑셀 다운로드"}</button>{message && <p role={error ? "alert" : "status"} className={error ? "admin-notice admin-notice-danger" : "admin-help"}>{message}</p>}</div>;
}

function RegularExport({ base, examTypeId }: { base: string; examTypeId: string }) {
  const id = useId();
  const request = useList<{ sessions: RegularSessionListItem[] }>(`${base}/exams/analysis/sessions?${new URLSearchParams({ examTypeId })}`);
  const [date, setDate] = useState("");
  if (!request.data) return <ListStatus {...request} />;
  const sessions = [...request.data.sessions].sort((left, right) => right.examDate.localeCompare(left.examDate));
  if (!sessions.length) return <p className="admin-empty-state">가져온 정기 시험이 없습니다. 성적 관리에서 채점표와 문항분석표를 먼저 가져와 주세요.</p>;
  const selected = sessions.find((entry) => entry.examDate === date) ?? sessions[0];
  const query = new URLSearchParams({ kind: "regular", examTypeId, examDate: selected.examDate });
  return <div className="space-y-4"><div className="admin-filter-bar"><label className="admin-label" htmlFor={id}>시험 날짜</label><select id={id} value={selected.examDate} onChange={(event) => setDate(event.target.value)}>{sessions.map((entry) => <option key={entry.sessionId} value={entry.examDate}>{entry.examDate} · 반 {entry.participantCount}명</option>)}</select></div><DownloadFile key={query.toString()} url={`${base}/reports/exam-analysis?${query}`} filename={`정기_성적분석_${selected.examDate}.xlsx`} /></div>;
}

function MorningExport({ base, examTypeId }: { base: string; examTypeId: string }) {
  const id = useId();
  const [range, setRange] = useState(defaultMorningAnalysisRange);
  const valid = morningAnalysisRangeSchema.safeParse(range).success;
  const query = new URLSearchParams({ kind: "morning", examTypeId, ...range });
  return <div className="space-y-4"><div className="admin-filter-bar"><label className="admin-label" htmlFor={`${id}-from`}>시작일</label><input id={`${id}-from`} type="date" required value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /><label className="admin-label" htmlFor={`${id}-to`}>종료일</label><input id={`${id}-to`} type="date" required value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></div>
    <p className="admin-help">기본 기간은 오늘을 포함한 최근 84일입니다. 시작일과 종료일의 차이는 최대 92일입니다.</p>
    {!valid && <p role="alert" className="admin-notice admin-notice-danger">날짜를 확인해 주세요. 시작일부터 종료일까지 날짜 차이 92일 이내로 선택해 주세요.</p>}
    <DownloadFile key={query.toString()} disabled={!valid} url={`${base}/reports/exam-analysis?${query}`} filename={`아침_성적분석_${range.from}_${range.to}.xlsx`} />
  </div>;
}

function ExportSelection({ base, kind }: { base: string; kind: Kind }) {
  const id = useId();
  const request = useList<{ examTypes: ExamTypeItem[] }>(`${base}/exam-types`);
  const [typeId, setTypeId] = useState("");
  if (!request.data) return <ListStatus {...request} />;
  // Include inactive types so historical imported results remain exportable.
  const types = request.data.examTypes.filter((type) => type.category === (kind === "regular" ? "REGULAR" : "MORNING"));
  const selected = types.find((type) => type.id === typeId) ?? types[0];
  if (!selected) return <p className="admin-empty-state">내보낼 {kind === "regular" ? "정기" : "아침"} 시험 종류가 없습니다.</p>;
  return <div className="space-y-4"><div className="admin-filter-bar"><label className="admin-label" htmlFor={id}>시험 종류</label><select id={id} value={selected.id} onChange={(event) => setTypeId(event.target.value)}>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>{kind === "regular" ? <RegularExport key={selected.id} base={base} examTypeId={selected.id} /> : <MorningExport key={selected.id} base={base} examTypeId={selected.id} />}</div>;
}

export function ExamAnalysisExport({ divisionSlug }: { divisionSlug: string }) {
  const id = useId();
  const [kind, setKind] = useState<Kind>("regular");
  return <section className="admin-section"><h2 className="admin-section-title">성적 분석 내보내기</h2><p className="admin-help">정기는 시험 날짜별, 아침은 조회 기간별 분석을 엑셀로 내려받습니다.</p><div className="admin-filter-bar"><label className="admin-label" htmlFor={id}>분석 구분</label><select id={id} value={kind} onChange={(event) => setKind(event.target.value as Kind)}><option value="regular">정기 모의고사</option><option value="morning">아침 모의고사</option></select></div><ExportSelection key={`${divisionSlug}:${kind}`} base={`/api/${encodeURIComponent(divisionSlug)}`} kind={kind} /></section>;
}
