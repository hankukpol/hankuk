"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import type { ExamImportHistoryRow } from "@/lib/exam-import-types";

type DeleteResult = { removedStudents: number; keptManualScores: number };
type Props = {
  divisionSlug: string;
  examTypeId?: string;
  refreshKey?: number;
  disabled?: boolean;
  onDeleted?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

function importTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시각 정보 없음" : date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export function ExamImportHistory({ divisionSlug, examTypeId, refreshKey = 0, disabled = false, onDeleted, onBusyChange }: Props) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const base = `/api/${encodeURIComponent(divisionSlug)}/exam-imports`;
  const url = examTypeId ? `${base}?${new URLSearchParams({ examTypeId })}` : base;
  const [reload, setReload] = useState(0);
  const [listing, setListing] = useState<{ url: string; rows?: ExamImportHistoryRow[]; error?: string }>({ url });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DeleteResult | null>(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const deleteRequest = useRef<AbortController | null>(null);
  const currentUrl = useRef(url);
  currentUrl.current = url;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; deleteRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setListing({ url });
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("history request failed");
        const data = await response.json() as { history?: ExamImportHistoryRow[] };
        if (!Array.isArray(data.history)) throw new Error("invalid history response");
        if (!controller.signal.aborted) setListing({ url, rows: data.history });
      } catch {
        if (!controller.signal.aborted) setListing({ url, error: "가져오기 이력을 불러오지 못했습니다. 다시 조회해 주세요." });
      }
    })();
    return () => controller.abort();
  }, [url, refreshKey, reload]);

  async function remove(row: ExamImportHistoryRow) {
    if (disabled || lock.current || currentUrl.current !== url) return;
    lock.current = true;
    setDeletingId(row.sessionId);
    setError("");
    setResult(null);
    onBusyChange?.(true);
    const controller = new AbortController();
    deleteRequest.current = controller;
    const isCurrent = () => mounted.current && !controller.signal.aborted && currentUrl.current === url;
    try {
      const accepted = await confirm({
        title: "가져오기 삭제",
        description: `${row.examDate.slice(0, 10)} ${row.examTypeName}${row.primarySubjectName ? ` · ${row.primarySubjectName}` : ""}. 이 시험의 성적·문항 기록이 모두 지워집니다 (대상 학생 ${row.matchedStudentCount}명). 수기 입력분과 구분할 수 없는 성적은 보존합니다.`,
        confirmLabel: "가져오기 삭제", cancelLabel: "취소", variant: "danger",
      });
      if (!accepted || !isCurrent()) return;
      const response = await fetch(`${base}/${encodeURIComponent(row.sessionId)}`, { method: "DELETE", signal: controller.signal });
      const data = await response.json() as { result?: DeleteResult };
      if (!isCurrent()) return;
      if (!response.ok || !data.result || !Number.isInteger(data.result.removedStudents) || !Number.isInteger(data.result.keptManualScores)) {
        throw new Error("delete failed");
      }
      setResult(data.result);
      setListing((current) => ({ ...current, rows: current.rows?.filter((entry) => entry.sessionId !== row.sessionId) }));
      setReload((version) => version + 1);
      onDeleted?.();
    } catch {
      if (isCurrent()) {
        setError("삭제 결과를 확인하지 못했습니다. 이력을 다시 조회해 삭제 여부를 확인한 뒤 진행해 주세요.");
        setReload((version) => version + 1);
      }
    } finally {
      if (mounted.current) {
        lock.current = false;
        deleteRequest.current = null;
        setDeletingId(null);
        onBusyChange?.(false);
      }
    }
  }

  const current = listing.url === url ? listing : { url };
  return <section className="admin-section" aria-busy={deletingId !== null || (!current.rows && !current.error)}>
    <div className="admin-workspace-toolbar">
      <div><h2 className="admin-section-title">가져오기 이력</h2><p className="admin-help">{examTypeId ? "선택한 시험 종류의 이력입니다." : "전체 시험 종류의 이력입니다."} 가져온 시각은 한국 시간 기준입니다.</p></div>
      <button type="button" className="admin-button" disabled={disabled || deletingId !== null} onClick={() => setReload((version) => version + 1)}>이력 새로고침</button>
    </div>
    {result && <p role="status" className={`admin-notice ${result.keptManualScores ? "admin-notice-warning" : "admin-notice-success"}`}>가져오기를 삭제했습니다. 대상 학생 {result.removedStudents}명, 보존된 수기 성적 {result.keptManualScores}건.{result.keptManualScores > 0 && " 수기 입력분과 구분할 수 없는 성적은 삭제하지 않았습니다. 입력 화면에서 확인해 주세요."}</p>}
    {error && <p role="alert" className="admin-notice admin-notice-danger">{error}</p>}
    {deletingId && <p role="status" className="admin-help">삭제 확인 또는 처리 중입니다. 완료될 때까지 기다려 주세요.</p>}
    {current.error ? <div className="admin-notice admin-notice-danger" role="alert"><p>{current.error}</p><button type="button" className="admin-button" disabled={disabled || deletingId !== null} onClick={() => setReload((version) => version + 1)}>다시 조회</button></div>
      : !current.rows ? <p className="admin-help" role="status">가져오기 이력을 불러오는 중입니다.</p>
      : current.rows.length === 0 ? <p className="admin-empty-state">아직 가져온 시험이 없습니다. 새 학기 첫 시험의 채점표와 문항분석표를 가져오면 이력이 표시됩니다.</p>
      : <div className="admin-table-frame" role="region" aria-label="가져오기 이력 목록" tabIndex={0}>
        <table><thead><tr>{["시험일", "종류", "과목", "진도", "문항 수", "외부 응시", "매칭 학생", "가져온 사람", "시각", "삭제"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{current.rows.map((row) => <tr key={row.sessionId}>
            <td>{row.examDate.slice(0, 10)}</td><td className="admin-table-name">{row.examTypeName}</td><td>{row.primarySubjectName ?? "전체 과목"}</td><td>{row.topic || "진도 없음"}</td>
            <td>{row.itemCount}</td><td>{row.externalCohortSize}명</td><td>{row.matchedStudentCount}명</td><td className="admin-table-name">{row.importedByName ?? "정보 없음"}</td><td>{importTime(row.importedAt)}</td>
            <td><button type="button" className="admin-button admin-button-danger-outline admin-button-compact" disabled={disabled || deletingId !== null} aria-label={`${row.examDate.slice(0, 10)} ${row.examTypeName} 가져오기 삭제`} onClick={() => void remove(row)}>삭제</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    {confirmDialog}
  </section>;
}
