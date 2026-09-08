"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { ExamImportPreview, ExamImportResult, ExamImportSelection } from "@/lib/exam-import-types";
import { ExamImportHistory } from "@/components/exams/import/ExamImportHistory";

type Props = {
  divisionSlug: string;
  category: ExamImportSelection["category"];
  examTypes: { id: string; name: string }[];
  onImported?: (result: ExamImportResult) => void;
  onBusyChange?: (busy: boolean) => void;
  onShowScores?: () => void;
  onDeleted?: () => void;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
type FileKey = "scoreFile" | "analysisFile";

export function ExamImportWizard({ divisionSlug, category, examTypes, onImported, onBusyChange, onShowScores, onDeleted }: Props) {
  const router = useRouter();
  const id = useId();
  const files = useRef<Record<FileKey, File | null>>({ scoreFile: null, analysisFile: null });
  const scoreInput = useRef<HTMLInputElement>(null);
  const analysisInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const mounted = useRef(true);
  const [fileNames, setFileNames] = useState({ scoreFile: "", analysisFile: "" });
  const [examTypeId, setExamTypeId] = useState("");
  const [topic, setTopic] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<ExamImportPreview | null>(null);
  const [result, setResult] = useState<ExamImportResult | null>(null);
  const [pending, setPending] = useState<"preview" | "confirm" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    const scoreElement = scoreInput.current;
    const analysisElement = analysisInput.current;
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      files.current = { scoreFile: null, analysisFile: null };
      if (scoreElement) scoreElement.value = "";
      if (analysisElement) analysisElement.value = "";
    };
  }, []);

  const busy = pending !== null || historyBusy;
  const validTopic = category !== "MORNING" || (topic.trim().length > 0 && topic.trim().length <= 200);
  const canPreview = !!fileNames.scoreFile && !!fileNames.analysisFile && validTopic && examTypes.length > 0;
  const canConfirm = canPreview && !!preview?.canConfirm && !!preview.examTypeId
    && preview.category === category && preview.reproduction.mismatches.length === 0
    && preview.errors.length === 0 && (!preview.existing || overwrite);

  function clearFiles() {
    files.current = { scoreFile: null, analysisFile: null };
    if (scoreInput.current) scoreInput.current.value = "";
    if (analysisInput.current) analysisInput.current.value = "";
    setFileNames({ scoreFile: "", analysisFile: "" });
  }

  function invalidate() {
    generation.current++;
    request.current?.abort();
    request.current = null;
    locked.current = false;
    setPending(null);
    onBusyChange?.(false);
    setPreview(null);
    setOverwrite(false);
    setResult(null);
    setError("");
  }

  function reset() {
    invalidate();
    clearFiles();
    setExamTypeId("");
    setTopic("");
  }

  function chooseFile(key: FileKey, event: ChangeEvent<HTMLInputElement>) {
    invalidate();
    const file = event.target.files?.[0] ?? null;
    files.current[key] = null;
    setFileNames((names) => ({ ...names, [key]: "" }));
    if (!file) return;
    if (file.size === 0 || file.size > MAX_FILE_BYTES || !/\.xls$/i.test(file.name)) {
      event.target.value = "";
      setError("비어 있지 않은 Excel 파일(.xls)을 선택해 주세요. 파일별 최대 크기는 5MB입니다.");
      return;
    }
    files.current[key] = file;
    setFileNames((names) => ({ ...names, [key]: file.name }));
  }

  async function submit(mode: "preview" | "confirm") {
    // The ref closes the gap before React renders the disabled button.
    if (busy || locked.current || (mode === "confirm" ? !canConfirm : !canPreview)) return;
    const { scoreFile, analysisFile } = files.current;
    if (!scoreFile || !analysisFile) return;
    locked.current = true;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const currentGeneration = ++generation.current;
    const isCurrent = () => mounted.current && generation.current === currentGeneration && !controller.signal.aborted;
    setPending(mode);
    onBusyChange?.(true);
    setError("");
    if (mode === "preview") {
      setPreview(null);
      setOverwrite(false);
    }

    // Never keep a parsed workbook or upload payload in component state.
    const body = new FormData();
    body.set("scoreFile", scoreFile);
    body.set("analysisFile", analysisFile);
    body.set("category", category);
    const selectedType = mode === "confirm" ? preview?.examTypeId : examTypeId;
    if (selectedType) body.set("examTypeId", selectedType);
    if (category === "MORNING" && topic.trim()) body.set("topic", topic.trim());
    body.set("overwrite", String(mode === "confirm" && !!preview?.existing && overwrite));

    try {
      const response = await fetch(`/api/${encodeURIComponent(divisionSlug)}/exam-imports${mode === "preview" ? "/preview" : ""}`, {
        method: "POST", body, signal: controller.signal,
      });
      const data = await response.json() as { preview?: ExamImportPreview; result?: ExamImportResult; error?: string };
      if (!isCurrent()) return;
      if (!response.ok) {
        // API validation messages are Korean. Do not surface raw infrastructure errors.
        throw new Error(typeof data.error === "string" && /[가-힣]/.test(data.error)
          ? data.error : "요청을 처리하지 못했습니다. 파일과 시험 설정을 확인하고 다시 미리보기를 실행해 주세요.");
      }
      if (mode === "preview") {
        if (!data.preview) throw new Error("미리보기 응답을 확인하지 못했습니다. 다시 시도해 주세요.");
        setPreview(data.preview);
      } else {
        if (!data.result) throw new Error("저장 결과를 확인하지 못했습니다. 입력 화면에서 저장 여부를 확인하고 다시 미리보기를 실행해 주세요.");
        setResult(data.result);
        setPreview(null);
        setOverwrite(false);
        clearFiles();
        setTopic("");
        setHistoryVersion((version) => version + 1);
        router.refresh();
        onImported?.(data.result);
      }
    } catch (cause) {
      if (!isCurrent()) return;
      setError(cause instanceof Error && /[가-힣]/.test(cause.message)
        ? cause.message : "서버 연결을 확인해 주세요. 저장 요청 중이었다면 입력 화면에서 저장 여부를 확인한 뒤 다시 미리보기를 실행해 주세요.");
      // A failed confirmation may have reached the server; never retry a stale overwrite.
      if (mode === "confirm") {
        setPreview(null);
        setOverwrite(false);
      }
    } finally {
      body.delete("scoreFile");
      body.delete("analysisFile");
      if (isCurrent()) {
        request.current = null;
        locked.current = false;
        setPending(null);
        onBusyChange?.(false);
      }
    }
  }

  return (
    <div className="admin-flat-page" aria-busy={busy}>
      <section className="admin-section space-y-4">
        <h2 className="admin-section-title">채점 파일 가져오기</h2>
        <p className="admin-help">같은 시험의 채점표와 문항분석표를 선택하세요. 파일별 최대 5MB이며, 미리보기 후 확정해야 성적에 반영됩니다.</p>
        <p className="admin-help">시험은 파일의 시험일자로 구분합니다. 아침 시험은 통합된 시험 종류에서 파일의 과목을 찾습니다.</p>
        <details>
          <summary className="admin-button">첫 가져오기 전 준비사항</summary>
          <ol className="admin-help list-decimal space-y-2 pl-5">
            <li>시험 설정의 과목별 문항 수와 배점이 가져올 파일과 일치하는지 확인합니다.</li>
            <li>서로 선택하는 과목은 같은 택1 그룹으로 지정합니다.</li>
            <li>같은 시험지를 사용하는 아침 시험 종류는 하나로 통합하고, 필요한 과목을 등록한 뒤 중복 종류는 비활성화합니다.</li>
            <li>학생 학번을 채점 시스템의 수험번호 5자리와 일치시킵니다.</li>
          </ol>
        </details>
        {examTypes.length === 0 && <p className="admin-notice admin-notice-warning">활성 시험 종류가 없습니다. 시험 설정에서 시험 종류와 과목을 등록한 후 이용해 주세요.</p>}
        <fieldset disabled={busy} className="grid min-w-0 gap-4 md:grid-cols-2">
          <legend className="sr-only">가져올 파일과 시험 정보</legend>
          <label className="flex min-w-0 flex-col gap-2" htmlFor={`${id}-score`}>
            <span className="admin-label">채점표</span>
            <input ref={scoreInput} id={`${id}-score`} type="file" accept=".xls" className="w-full min-w-0" onChange={(event) => chooseFile("scoreFile", event)} />
          </label>
          <label className="flex min-w-0 flex-col gap-2" htmlFor={`${id}-analysis`}>
            <span className="admin-label">문항분석표</span>
            <input ref={analysisInput} id={`${id}-analysis`} type="file" accept=".xls" className="w-full min-w-0" onChange={(event) => chooseFile("analysisFile", event)} />
          </label>
          <label className="flex min-w-0 flex-col gap-2" htmlFor={`${id}-type`}>
            <span className="admin-label">시험 종류</span>
            <select id={`${id}-type`} value={examTypeId} onChange={(event) => { invalidate(); setExamTypeId(event.target.value); }}>
              <option value="">파일에서 자동 선택</option>
              {examTypes.map((examType) => <option key={examType.id} value={examType.id}>{examType.name}</option>)}
            </select>
          </label>
          {category === "MORNING" && (
            <label className="flex min-w-0 flex-col gap-2" htmlFor={`${id}-topic`}>
              <span className="admin-label">진도 라벨 (필수)</span>
              <input id={`${id}-topic`} type="text" required maxLength={200} value={topic} placeholder="예: 총론 3강" aria-describedby={`${id}-topic-help`} onChange={(event) => { invalidate(); setTopic(event.target.value); }} />
              <span id={`${id}-topic-help`} className="admin-help">매 가져오기마다 이번 시험의 진도를 입력해 주세요.</span>
            </label>
          )}
        </fieldset>
        <p className="admin-help">파일·시험 종류·진도를 변경하면 미리보기를 다시 실행해 주세요.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`admin-button${preview ? "" : " admin-button-primary"}`} disabled={busy || !canPreview} onClick={() => void submit("preview")}>
            {pending === "preview" ? "미리보기 확인 중…" : preview ? "미리보기 다시 실행" : "미리보기"}
          </button>
          <button type="button" className="admin-button" disabled={pending === "confirm" || historyBusy} onClick={reset}>초기화</button>
        </div>
      </section>
      {error && <p role="alert" className="admin-notice admin-notice-danger break-words">{error}</p>}
      {pending && <p role="status" className="admin-help">{pending === "preview" ? "두 파일의 문항과 점수를 대조하고 있습니다." : "파일을 다시 검증하고 성적을 저장하고 있습니다. 완료될 때까지 기다려 주세요."}</p>}
      {result && (
        <section className="admin-section space-y-4">
          <p role="status" className="admin-notice admin-notice-success">{result.examDate} 성적 {result.importedCount}명 가져오기를 완료했습니다.</p>
          {onShowScores && <button type="button" className="admin-button" onClick={onShowScores}>입력 화면에서 성적 확인</button>}
        </section>
      )}
      {preview && <>
        <PreviewDetails preview={preview} />
        <section className="admin-section space-y-4">
          {preview.existing && (
            <div className="admin-notice admin-notice-warning space-y-2">
              <p>같은 시험의 가져오기 기록이 있습니다. 확정하면 기존 기록과 성적을 덮어씁니다.</p>
              <label className="flex items-start gap-2 py-2">
                <input type="checkbox" checked={overwrite} disabled={busy} onChange={(event) => setOverwrite(event.target.checked)} />
                <span>기존 기록과 성적을 덮어쓰는 데 동의합니다.</span>
              </label>
            </div>
          )}
          {!preview.canConfirm && <p className="admin-help">확정할 수 없는 항목이 있습니다. 파일과 시험 설정을 확인한 뒤 다시 미리보기를 실행해 주세요.</p>}
          <button type="button" className="admin-button admin-button-primary" disabled={busy || !canConfirm} onClick={() => void submit("confirm")}>
            {pending === "confirm" ? "성적 저장 중…" : "가져오기 확정"}
          </button>
        </section>
      </>}
      <ExamImportHistory
        key={divisionSlug}
        divisionSlug={divisionSlug}
        examTypeId={examTypeId || preview?.examTypeId || result?.examTypeId || undefined}
        refreshKey={historyVersion}
        disabled={pending !== null}
        onBusyChange={(value) => { setHistoryBusy(value); onBusyChange?.(value || pending !== null); }}
        onDeleted={() => { invalidate(); router.refresh(); onDeleted?.(); }}
      />
    </div>
  );
}

function PreviewDetails({ preview }: { preview: ExamImportPreview }) {
  return <>
    <section className="admin-section space-y-4">
      <h2 className="admin-section-title">시험 정보 미리보기</h2>
      <dl className="grid gap-4 md:grid-cols-2">
        {[
          ["시험일자", preview.examDate],
          ["구분", preview.category === "MORNING" ? "아침 모의고사" : "정기 모의고사"],
          ["시험 종류", preview.examTypeName ?? "선택 필요"],
          ["과목", preview.subjectNames.join(", ") || "확인 필요"],
          ["응시인원", `${preview.cohortSize}명`],
          ["문항 수", `${preview.itemCount}문항`],
          ["만점", `${preview.fullScore}점`],
        ].map(([label, value]) => <div key={label} className="space-y-2 min-w-0"><dt className="admin-label">{label}</dt><dd className="break-words">{value}</dd></div>)}
      </dl>
      {preview.errors.length > 0 && <ul className="admin-notice admin-notice-danger space-y-2" role="alert">{preview.errors.map((message, i) => <li key={i} className="break-words">{message}</li>)}</ul>}
    </section>
    <section className="admin-section space-y-4">
      <h2 className="admin-section-title">블록과 과목 매핑</h2>
      <div className="admin-table-frame" role="region" aria-label="블록과 과목 매핑 결과" tabIndex={0}>
        <table><thead><tr><th scope="col">블록</th><th scope="col">과목</th><th scope="col">문항 수</th></tr></thead>
          <tbody>{preview.mappings.map((mapping, i) => <tr key={i}><td>{mapping.blockIndex + 1}</td><td className="admin-table-name">{mapping.subjectName}</td><td>{mapping.itemCount}</td></tr>)}</tbody>
        </table>
      </div>
      {preview.mappings.length === 0 && <p className="admin-help">매핑 결과가 없습니다.</p>}
    </section>
    <section className="admin-section space-y-4">
      <h2 className="admin-section-title">점수 재현 검증</h2>
      <p className={`admin-notice ${preview.reproduction.mismatches.length ? "admin-notice-danger" : "admin-notice-success"}`}>
        일치 {preview.reproduction.matchedCount}명 / 불일치 {preview.reproduction.mismatches.length}건
        {preview.reproduction.mismatches.length > 0 && ". 배점 설정과 과목 매핑을 확인해 주세요. 불일치를 해결하기 전에는 확정할 수 없습니다."}
      </p>
      {preview.reproduction.mismatches.length > 0 && <div className="admin-table-frame" role="region" aria-label="점수 불일치 목록" tabIndex={0}>
        <table><thead><tr><th scope="col">원본 행</th><th scope="col">과목</th><th scope="col">채점표 점수</th><th scope="col">재현 점수</th><th scope="col">원인</th></tr></thead>
          <tbody>{preview.reproduction.mismatches.map((row, i) => <tr key={i}><td>{row.sourceRow}</td><td className="admin-table-name">{row.subjectName}</td><td>{row.expected ?? "없음"}</td><td>{row.actual}</td><td>{row.reason}</td></tr>)}</tbody>
        </table>
      </div>}
    </section>
    <section className="admin-section space-y-4">
      <h2 className="admin-section-title">학생 매칭</h2>
      <p>자동 매칭 {preview.matching.matched}명 / 미매칭 {preview.matching.unmatched}명 / 형식 오류 {preview.matching.invalid}건</p>
      <p className="admin-help">미매칭 응시자는 자습반 학생 성적으로 저장되지 않습니다.</p>
      {preview.invalidRows.length > 0 ? <div className="admin-table-frame" role="region" aria-label="형식 오류 목록" tabIndex={0}>
        <table><thead><tr><th scope="col">원본 행</th><th scope="col">형식 오류 사유</th></tr></thead>
          <tbody>{preview.invalidRows.map((row, i) => <tr key={i}><td>{row.sourceRow}</td><td>{row.reason}</td></tr>)}</tbody>
        </table>
      </div> : <p className="admin-help">형식 오류가 없습니다.</p>}
    </section>
    <section className="admin-section space-y-4">
      <h2 className="admin-section-title">일부 미응시·결시 목록</h2>
      {preview.partialRows.length > 0 ? <div className="admin-table-frame" role="region" aria-label="일부 미응시 및 결시 목록" tabIndex={0}>
        <table><thead><tr><th scope="col">원본 행</th><th scope="col">학생</th><th scope="col">상태</th><th scope="col">응시 과목</th></tr></thead>
          <tbody>{preview.partialRows.map((row, i) => <tr key={i}><td>{row.sourceRow}</td><td className="admin-table-name">{row.studentName ?? "미매칭 응시자"}</td><td>{row.absent ? "결시" : "일부 미응시"}</td><td>{row.subjectNames.join(", ") || "없음"}</td></tr>)}</tbody>
        </table>
      </div> : <p className="admin-help">일부 미응시·결시가 없습니다.</p>}
    </section>
  </>;
}
