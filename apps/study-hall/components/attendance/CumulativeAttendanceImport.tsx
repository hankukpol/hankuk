"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { ParticipationPreview, ParticipationStatus } from "@/lib/cumulative-attendance";
import styles from "./cumulative-attendance.module.css";

const labels: Record<string, string> = { PRESENT: "응시", TARDY: "지각 응시", ABSENT: "미응시", EXCUSED: "사유 미응시", HOLIDAY: "휴무", HALF_HOLIDAY: "반휴", NOT_APPLICABLE: "해당 없음" };
const evidence = { ANSWER: "답안 확인", BLANK: "답안 없음, 확인 필요", MISSING: "파일에 없음, 확인 필요" };
export function CumulativeAttendanceImport({ divisionSlug }: { divisionSlug: string }) {
  const id = useId();
  const files = useRef<{ scoreFile?: File; analysisFile?: File }>({});
  const request = useRef<AbortController>();
  const locked = useRef(false);
  const [date, setDate] = useState("");
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<ParticipationPreview | null>(null);
  const [selected, setSelected] = useState<Record<string, ParticipationStatus>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ date: string; periodId: string; applied: number; warnings: string[] } | null>(null);
  useEffect(() => () => { request.current?.abort(); files.current = {}; }, []);
  function invalidate() { setPreview(null); setSelected({}); setResult(null); setError(""); }
  function choose(key: "scoreFile" | "analysisFile", element: HTMLInputElement) {
    invalidate();
    const file = element.files?.[0];
    delete files.current[key];
    if (file && (!/\.xls$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024)) {
      element.value = ""; setError("비어 있지 않은 .xls 파일을 5MB 이하로 선택해주세요.");
    } else if (file) files.current[key] = file;
    setReady(!!files.current.scoreFile);
  }
  function select(studentId: string, status: ParticipationStatus | "") {
    setSelected(current => { const next = { ...current }; if (status) next[studentId] = status; else delete next[studentId]; return next; });
  }
  async function submit(mode: "preview" | "confirm") {
    if (locked.current || !files.current.scoreFile) return;
    locked.current = true; setPending(true); setError(""); setResult(null);
    const controller = new AbortController(); request.current = controller;
    const body = new FormData();
    body.set("mode", mode); body.set("date", date); body.set("scoreFile", files.current.scoreFile);
    if (files.current.analysisFile) body.set("analysisFile", files.current.analysisFile);
    if (mode === "confirm" && preview) {
      body.set("token", preview.token);
      body.set("selection", JSON.stringify(Object.entries(selected).map(([studentId, status]) => ({ studentId, status }))));
    }
    try {
      const response = await fetch(`/api/${encodeURIComponent(divisionSlug)}/attendance/cumulative-import`, { method: "POST", body, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
      if (mode === "preview") {
        const next = data.preview as ParticipationPreview;
        if (!next?.token) throw new Error("미리보기 결과를 확인하지 못했습니다.");
        setPreview(next); setDate(next.date);
        setSelected(Object.fromEntries(next.rows.filter(row => row.suggested && !row.currentStatus).map(row => [row.studentId, row.suggested!])));
      } else { setResult(data.result); setPreview(null); setSelected({}); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error && /[가-힣]/.test(cause.message) ? cause.message : "연결 상태를 확인하고 다시 시도해주세요.");
      if (mode === "confirm") { setPreview(null); setSelected({}); }
    } finally { locked.current = false; if (!controller.signal.aborted) setPending(false); }
  }
  const count = Object.keys(selected).length;
  return <section className="admin-section" aria-busy={pending}>
    <h1 className="admin-page-title">누적시험 응시 여부 가져오기</h1>
    <p className="admin-help">누적모의고사 채점표에서 응시 여부를 확인해 아침모의고사 출석부에 반영합니다. 점수·석차·문항 분석은 저장하지 않습니다.</p>
    <fieldset disabled={pending} className="space-y-4">
      <div className="admin-panel">
        <div className="admin-form-row"><label className="admin-form-row-label" htmlFor={`${id}-score`}>모의고사 채점표</label><div className="admin-form-row-control"><input id={`${id}-score`} type="file" accept=".xls" aria-describedby={`${id}-files-help`} onChange={e => choose("scoreFile", e.currentTarget)} /><p id={`${id}-files-help`} className="admin-help">Score·Errata 시트가 있는 .xls 파일, 최대 5MB</p></div></div>
        <div className="admin-form-row"><label className="admin-form-row-label" htmlFor={`${id}-analysis`}>문항분석표 (선택)</label><div className="admin-form-row-control"><input id={`${id}-analysis`} type="file" accept=".xls" aria-describedby={`${id}-date-help`} onChange={e => choose("analysisFile", e.currentTarget)} /><p id={`${id}-date-help`} className="admin-help">시험일자만 읽습니다. 파일 이름의 날짜는 내보낸 날짜일 수 있습니다.</p></div></div>
        <div className="admin-form-row"><label className="admin-form-row-label" htmlFor={`${id}-date`}>시험일</label><div className="admin-form-row-control"><input id={`${id}-date`} type="date" value={date} onChange={e => { invalidate(); setDate(e.target.value); }} /><p className="admin-help">문항분석표가 없으면 실제 시험일을 입력하세요. 첨부하면 파일의 시험일로 확인합니다.</p></div></div>
      </div>
      <button type="button" className="admin-button" disabled={!ready || pending} onClick={() => submit("preview")}>{pending ? "처리 중…" : "응시 여부 미리보기"}</button>
      {preview && <>
        <h2 className="admin-section-title">{preview.date} · {preview.periodName}</h2>
        <p className="admin-help">파일 {preview.fileCount}명 / 학원 미매칭 {preview.unmatchedCount}명 제외 / 선택 {count}명</p>
        <p className="admin-help">답안이 있으면 0점이어도 응시입니다. 답안이 비었거나 파일에 없는 학생은 응시·미응시를 직접 선택하세요. 기존 응시·사유 미응시·휴가는 보존하며, 기존 미응시를 바꾸려면 해당 학생을 선택하세요.</p>
        {preview.unmatchedCount === preview.fileCount && <p className="admin-notice admin-notice-warning">학원 학생과 일치하는 수험번호가 없어 반영할 수 없습니다.</p>}
        <div className="admin-table-frame" role="region" aria-label="누적시험 응시 반영 미리보기" tabIndex={0}>
          <table className={styles.table}><thead><tr>{["학생", "수험번호", "파일 확인", "현재 출석부", "반영할 상태"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{preview.rows.map(row => <tr key={row.studentId}>
              <th scope="row" data-label="학생">{row.name}</th><td data-label="수험번호">{row.studentNumber}</td>
              <td data-label="파일 확인">{evidence[row.evidence]}</td><td data-label="현재 출석부">{labels[row.currentStatus ?? ""] ?? "미처리"}</td>
              <td data-label="반영할 상태">{row.protected ? "기존 기록 유지" : row.suggested ?
                <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`${row.name} 응시 반영`} checked={selected[row.studentId] === "PRESENT"} onChange={e => select(row.studentId, e.target.checked ? "PRESENT" : "")} />응시</label> :
                <select aria-label={`${row.name} 응시 여부`} value={selected[row.studentId] ?? ""} onChange={e => select(row.studentId, e.target.value as ParticipationStatus | "")}><option value="">반영 안 함</option><option value="PRESENT">응시로 확인</option><option value="ABSENT">미응시로 확인</option></select>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!preview.rows.length && <p className="admin-empty-state">이 시험일의 수강 기간에 해당하는 재원 학생이 없습니다.</p>}
        <p className="admin-help">선택한 학생의 출석만 저장하며, 출석에 따른 상벌점은 해당 학원에 적용된 기존 설정으로 계산합니다.</p>
        <button type="button" className="admin-button admin-button-primary" disabled={!count || pending || preview.unmatchedCount === preview.fileCount} onClick={() => submit("confirm")}>{count}명 출석 반영</button>
      </>}
    </fieldset>
    {error && <p className="admin-notice admin-notice-danger" role="alert">{error}</p>}
    {result && <div role="status" className="space-y-2"><p className="admin-notice">{result.date} 아침모의고사 출석 {result.applied}명을 반영했습니다. 성적은 저장하지 않았습니다.</p>{result.warnings.map(warning => <p className="admin-help text-admin-warning" key={warning}>{warning}</p>)}<Link className="admin-text-action" href={`/${divisionSlug}/admin/attendance?date=${result.date}&period=${encodeURIComponent(result.periodId)}`}>해당 날짜 출석부 확인</Link></div>}
  </section>;
}
