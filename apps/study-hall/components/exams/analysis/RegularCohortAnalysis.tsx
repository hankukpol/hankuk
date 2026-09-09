"use client";

import { useEffect, useId, useState } from "react";
import type { RegularCohortAnalysis as Analysis, RegularSessionListItem } from "@/lib/exam-analysis-types";
import type { ExamTypeItem } from "@/lib/services/exam.service";
import { DistributionBars } from "./charts/DistributionBars";

const number = (value: number | null | undefined, suffix = "") => value == null ? "집계 불가" : `${value}${suffix}`;
const delta = (value: number) => value === 0 ? "변동 없음" : `${value > 0 ? "▲" : "▼"} ${Math.abs(value)}`;

function useAnalysisRequest<T>(url: string) {
  const [state, setState] = useState<{ url: string; data?: T; error?: string }>({ url });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ url });
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("분석 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        const data = await response.json() as T;
        if (!controller.signal.aborted) setState({ url, data });
      } catch {
        if (!controller.signal.aborted) setState({ url, error: "분석 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." });
      }
    })();
    return () => controller.abort();
  }, [url, attempt]);
  return { ...(state.url === url ? state : { url }), retry: () => setAttempt((value) => value + 1) };
}

function RequestStatus({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div role="alert" className="admin-notice admin-notice-danger"><p>{error}</p><button type="button" className="admin-button" onClick={retry}>다시 시도</button></div> : <p role="status" className="admin-help">분석 자료를 불러오는 중입니다.</p>;
}


type CohortView = "cohort" | "students";

function CohortSession({ base, examTypeId, examDate, view }: { base: string; examTypeId: string; examDate: string; view: CohortView }) {
  const query = new URLSearchParams({ examTypeId, examDate }).toString();
  const request = useAnalysisRequest<{ analysis: Analysis }>(`${base}?${query}`);

  const setStudent = (selected: {id:string;name:string} | null) => { if(selected) window.location.assign(base.replace('/api/', '/').replace('/morning-exams/analysis','/admin/exams').replace('/exams/analysis','/admin/exams') + '/students/' + encodeURIComponent(selected.id) + '?kind=regular&' + query); };
  if (!request.data) return <RequestStatus {...request} />;
  const analysis = request.data.analysis;
  const hasPreviousExam = analysis.hasPreviousExam ?? analysis.ranking.some((row) => row.delta !== null);
  return <div className="admin-flat-page">
    {view === "students" && <div className="admin-filter-bar"><label className="admin-label">학생 개인 분석<select value="" onChange={event => { const selected = analysis.ranking.find(row => row.studentId === event.target.value); setStudent(selected ? { id: selected.studentId, name: selected.name } : null); }}><option value="">학생을 선택하세요</option>{analysis.ranking.map(row => <option key={row.studentId} value={row.studentId}>{row.name} · {row.studentNumber}</option>)}</select></label><p className="admin-help">학생을 선택하면 최근 6개월 정기 성적과 선택한 시험의 개인 분석을 확인할 수 있습니다.</p></div>}
    <div className="admin-metric-strip">{[["반 응시", `${analysis.internal.count}명`], ["외부 평균", number(analysis.external.average, "점")], ["반 평균", number(analysis.internal.average, "점")], ["반 최고 / 최저", `${number(analysis.internal.max)} / ${number(analysis.internal.min)}`], ["외부 응시", `${analysis.session.externalCohortSize}명`]].map(([label, value]) => <div className="admin-metric-box" key={label}><p className="admin-metric-box-label">{label}</p><p className="admin-metric-box-value">{value}</p></div>)}</div>
    {analysis.internal.count < 10 && <p className="admin-help">반 내 지표는 참고용입니다(응시 {analysis.internal.count}명)</p>}
    {view === "cohort" && <section className="admin-section"><h2 className="admin-section-title">과목별 반·외부 비교</h2><div className="admin-table-frame"><table><thead><tr>{["과목", "반 평균", "외부 평균", "격차 (반 − 외부)", "취약 인원"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{analysis.subjects.map((subject) => {
      const weak = analysis.internal.weakSubjects.find((row) => row.subjectId === subject.id);
      const internal = analysis.internal.subjectAverages[subject.id];
      const external = analysis.external.subjectAverages[subject.id];
      return <tr key={subject.id}><td className="admin-table-name">{subject.name}</td><td>{number(internal)}</td><td>{number(external)}</td><td>{number(internal == null || external == null ? null : Number((internal - external).toFixed(1)))}</td><td>{weak?.weakCount ?? 0}명</td></tr>;
    })}</tbody></table></div></section>}
    {view === "cohort" && <section className="admin-section"><h2 className="admin-section-title">외부 성적 분포</h2><DistributionBars distribution={analysis.external.distribution} /></section>}
    {view === "cohort" && <section className="admin-section"><h2 className="admin-section-title">반 오답률 TOP10</h2>{analysis.classWrongTop.length === 0 ? <p className="admin-empty-state">{analysis.internal.count === 0 ? "매칭된 학생이 없습니다." : "집계할 문항 응답이 없습니다."}</p> : <div className="admin-table-frame"><table><thead><tr>{["과목", "번호", "정답", "반 정답률", "외부 정답률", "격차 (반 − 외부)"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{analysis.classWrongTop.map((item) => <tr key={`${item.subjectId}-${item.itemNo}`}><td className="admin-table-name">{item.subjectName}</td><td>{item.itemNo}</td><td>{item.answerKey}</td><td>{number(item.internalCorrectRatePct, "%")}</td><td>{number(item.externalCorrectRatePct, "%")}</td><td>{number(item.gap, "%p")}</td></tr>)}</tbody></table></div>}</section>}
    {view === "students" && <section className="admin-section"><h2 className="admin-section-title">반 석차표</h2><p className="admin-help">학생 이름을 선택하면 개인 분석을 엽니다. 직전 시험 대비 석차 상승은 ▲, 하락은 ▼로 표시합니다.</p>{analysis.ranking.length === 0 ? <p className="admin-empty-state">이 시험에 매칭된 반 학생이 없습니다.</p> : <div className="admin-table-frame"><table><thead><tr><th scope="col">반 석차</th><th scope="col">이름</th><th scope="col">총점</th>{analysis.subjects.map((subject) => <th scope="col" key={subject.id}>{subject.name}</th>)}<th scope="col">외부 상위%</th><th scope="col">직전 시험 총점</th><th scope="col">직전 시험 석차</th><th scope="col">표시</th></tr></thead><tbody>{analysis.ranking.map((row) => <tr key={row.studentId}><td>{row.internalRank}등</td><td className="admin-table-name"><button type="button" className="admin-table-link" onClick={() => setStudent({ id: row.studentId, name: row.name })}>{row.name}</button></td><td>{row.totalScore}</td>{analysis.subjects.map((subject) => <td key={subject.id}>{row.subjectScores[subject.id] ?? (subject.alternateGroup && analysis.subjects.some((other) => other.alternateGroup === subject.alternateGroup && row.subjectScores[other.id] != null) ? "선택 안 함" : "미응시")}</td>)}<td>{number(row.externalTopPercent, "%")}</td><td>{row.delta ? delta(row.delta.total) : "—"}</td><td>{row.delta ? delta(row.delta.rank) : "—"}</td><td>{row.flags.some((flag) => flag.kind === "totalDrop" || flag.kind === "rankDrop") && <span className="admin-badge">하락</span>} {row.isPartial && <span className="admin-badge">일부 미응시</span>}</td></tr>)}</tbody></table></div>}</section>}
    {view === "students" && <section className="admin-section"><h2 className="admin-section-title">학습 확인 대상</h2>{!hasPreviousExam ? <p className="admin-empty-state">비교할 직전 시험이 없습니다.</p> : analysis.declines.length ? <ul className="admin-help">{analysis.declines.map((row) => <li key={row.studentId}>{row.name}: {row.flags.map((flag) => flag.detail).join(" · ")}</li>)}</ul> : <p className="admin-help">학습 확인 신호가 없습니다.</p>}</section>}
    {view === "students" && <section className="admin-section"><h2 className="admin-section-title">일부 미응시 학생</h2>{analysis.partials.length ? <ul className="admin-help">{analysis.partials.map((row) => <li key={row.studentId}>{row.name}: {row.missingSubjects.join(", ")}</li>)}</ul> : <p className="admin-help">일부 미응시 학생이 없습니다.</p>}</section>}
  </div>;
}

function SessionSelector({ base, examTypeId, initialDate, view }: { base: string; examTypeId: string; initialDate?:string; view: CohortView }) {
  const id = useId();
  const request = useAnalysisRequest<{ sessions: RegularSessionListItem[] }>(`${base}/sessions?${new URLSearchParams({ examTypeId })}`);
  const [examDate, setExamDate] = useState<string | null>(initialDate || null);
  if (!request.data) return <RequestStatus {...request} />;
  const sessions = [...request.data.sessions].sort((left, right) => right.examDate.localeCompare(left.examDate));
  if (!sessions.length) return <p className="admin-empty-state">가져온 정기 시험이 없습니다. 가져오기 탭에서 채점표와 문항분석표를 등록해 주세요.</p>;
  const selected = sessions.find((session) => session.examDate === examDate) ?? sessions[0];
  return <div className="admin-flat-page"><div className="admin-filter-bar"><label className="admin-label" htmlFor={id}>시험 날짜</label><select id={id} value={selected.examDate} onChange={(event) => setExamDate(event.target.value)}>{sessions.map((session) => <option key={session.sessionId} value={session.examDate}>{session.examDate.slice(0, 10)} · 반 {session.participantCount}명</option>)}</select></div><CohortSession key={`${examTypeId}-${selected.examDate}`} base={base} examTypeId={examTypeId} examDate={selected.examDate} view={view} /></div>;
}

export function RegularCohortAnalysis({ divisionSlug, examTypes, initialSelection = {}, view }: { divisionSlug: string; examTypes: ExamTypeItem[]; initialSelection?:Record<string,string>; view: CohortView }) {
  const id = useId();
  const [selectedId, setSelectedId] = useState(initialSelection.examTypeId || examTypes[0]?.id || "");
  const selected = examTypes.find((type) => type.id === selectedId) ?? examTypes[0];
  if (!selected) return <p className="admin-empty-state">분석할 정기 시험 종류가 없습니다.</p>;
  return <div className="admin-flat-page"><div className="admin-filter-bar"><label className="admin-label" htmlFor={id}>시험 종류</label><select id={id} value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{examTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div><SessionSelector initialDate={initialSelection.examDate} key={`${divisionSlug}-${selected.id}`} base={`/api/${encodeURIComponent(divisionSlug)}/exams/analysis`} examTypeId={selected.id} view={view} /></div>;
}
