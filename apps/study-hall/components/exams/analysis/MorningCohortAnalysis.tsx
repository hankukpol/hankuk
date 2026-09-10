"use client";

import { useEffect, useId, useState } from "react";
import type { MorningCohortAnalysis as Analysis } from "@/lib/morning-exam-analysis-types";
import { defaultMorningAnalysisRange, morningAnalysisRangeSchema } from "@/lib/morning-exam-analysis-schemas";
import type { ExamTypeItem } from "@/lib/services/exam.service";
import { SubjectHeatmap } from "./charts/SubjectHeatmap";
import { TrendLines } from "./charts/TrendLines";
import { StudentSearchField } from "@/components/ui/StudentSearchField";
import { hasStudentSearchQuery, matchesStudentSearch } from "@/lib/student-search";

const number = (value: number | null | undefined, suffix = "") => value == null || !Number.isFinite(value) ? "집계 불가" : `${Number(value.toFixed(1))}${suffix}`;

function useAnalysisRequest<T>(url: string) {
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

export function MorningCohortAnalysis({ divisionSlug, examTypes, initialSelection = {}, view }: { divisionSlug: string; examTypes: ExamTypeItem[]; initialSelection?:Record<string,string>; view: CohortView }) {
  const id = useId();
  const types = examTypes.filter((type) => type.category === "MORNING");
  const [selectedId, setSelectedId] = useState(initialSelection.examTypeId || types[0]?.id || "");
  const [range, setRange] = useState(() => morningAnalysisRangeSchema.safeParse(initialSelection).success ? {from:initialSelection.from,to:initialSelection.to} : defaultMorningAnalysisRange());
  const [draft, setDraft] = useState(range);
  const [error, setError] = useState("");
  const selected = types.find((type) => type.id === selectedId) ?? types[0];
  if (!selected) return <p className="admin-empty-state">분석할 아침 시험 종류가 없습니다.</p>;
  const query = new URLSearchParams({ examTypeId: selected.id, ...range }).toString();
  return <div className="admin-flat-page">
    <form className="admin-filter-bar" onSubmit={(event) => {
      event.preventDefault();
      const parsed = morningAnalysisRangeSchema.safeParse(draft);
      if (!parsed.success) { setError("시작일과 종료일을 확인해 주세요. 조회 기간은 날짜 차이 92일 이내여야 합니다."); return; }
      setError(""); setRange(draft);
    }}>
      <label className="admin-label" htmlFor={`${id}-type`}>시험 종류</label><select id={`${id}-type`} value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
      <label className="admin-label" htmlFor={`${id}-from`}>시작일</label><input id={`${id}-from`} type="date" required value={draft.from} max={draft.to} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
      <label className="admin-label" htmlFor={`${id}-to`}>종료일</label><input id={`${id}-to`} type="date" required value={draft.to} min={draft.from} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
      <button className="admin-button admin-button-primary" type="submit">분석 조회</button>
    </form>
    {error && <p role="alert" className="admin-notice admin-notice-danger">{error}</p>}
    <p className="admin-help">조회 기간 {range.from} ~ {range.to}. 기본은 오늘 하루이며, 시작일을 옮기면 과거 회차까지 함께 봅니다.</p>
    <CohortReport key={`${divisionSlug}:${query}`} base={`/api/${encodeURIComponent(divisionSlug)}/morning-exams/analysis`} query={query} view={view} />
  </div>;
}


function CohortReport({ base, query, view }: { base: string; query: string; view: CohortView }) {
  const request = useAnalysisRequest<{ analysis: Analysis }>(`${base}?${query}`);
  const [studentQuery, setStudentQuery] = useState("");

  const setStudent = (selected: {id:string;name:string} | null) => { if(selected) window.location.assign(base.replace('/api/', '/').replace('/morning-exams/analysis','/admin/exams').replace('/exams/analysis','/admin/exams') + '/students/' + encodeURIComponent(selected.id) + '?kind=morning&' + query); };
  if (!request.data) return <RequestStatus {...request} />;
  const analysis = request.data.analysis;
  const minimum = analysis.settings.morning.movingAverageSessions;
  const numberById = new Map(analysis.studentSubjects.map((row) => [row.studentId, row.studentNumber]));
  const matches = (row: { studentId: string; name: string }) => matchesStudentSearch({ name: row.name, studentNumber: numberById.get(row.studentId) ?? null }, studentQuery);
  const searching = hasStudentSearchQuery(studentQuery);
  const declines = analysis.declines.filter(matches);
  const lowAttendance = analysis.lowAttendance.filter(matches);
  const studentSubjects = analysis.studentSubjects.filter(matches);
  const searchedStudentCount = new Set(studentSubjects.map((row) => row.studentId)).size;
  return <div className="admin-flat-page">
    <h2 className="admin-section-title">{analysis.examType.name} 반 분석</h2>
    <p className="admin-help">가져온 시험 {analysis.sessionCount}건 · 이동평균 최근 {minimum}회 · 추세 최근 {analysis.settings.morning.trendWindowSessions}회 응시 기준</p>
    {view === "cohort" && <section className="admin-section"><h3 className="admin-section-title">날짜·과목별 비교</h3><SubjectHeatmap heatmap={analysis.heatmap} subjects={analysis.subjects} /></section>}
    {view === "cohort" && <section className="admin-section"><h3 className="admin-section-title">과목별 반 추세</h3>
      {!analysis.subjectTrends.length && <p className="admin-empty-state">선택한 기간에 과목별 시험 기록이 없습니다.</p>}
      {analysis.subjectTrends.map((subject) => {
        const attended = subject.series.filter((point) => point.internalAvg != null).length;
        return <details className="admin-disclosure" key={subject.subjectId}><summary>{subject.name} · 응시 {attended}회</summary><div className="admin-disclosure-body">{attended < minimum ? <p className="admin-empty-state">이 과목은 반 응시 자료가 아직 {attended}회입니다. {minimum}회부터 추세를 표시합니다.</p> : <TrendLines label={`${subject.name} 반 평균과 외부 평균`} columns={[{ key: "internal", label: "반 평균" }, { key: "external", label: "외부 평균" }]} rows={subject.series.map((point) => ({ date: point.date, values: { internal: point.internalAvg, external: point.externalAvg } }))} />}</div></details>;
      })}
    </section>}
    {view === "cohort" && <section className="admin-section"><h3 className="admin-section-title">날짜별 반 오답 TOP5</h3>
      <details className="admin-disclosure"><summary>시험일 {analysis.dailyWrongTop.length}건 보기</summary><div className="admin-disclosure-body">
      {!analysis.dailyWrongTop.length ? <p className="admin-empty-state">매칭된 학생의 문항 응답이 없습니다.</p> : [...analysis.dailyWrongTop].sort((left, right) => right.date.localeCompare(left.date) || left.subjectId.localeCompare(right.subjectId)).map((day) => <details className="admin-disclosure" key={`${day.date}:${day.subjectId}`}><summary>{day.date} {day.subjectName}</summary><div className="admin-disclosure-body">{!day.items.length ? <p className="admin-empty-state">매칭된 학생이 없습니다.</p> : <div className="admin-table-frame"><table><thead><tr>{["번호", "정답", "반 정답률", "외부 정답률"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{day.items.map((item) => <tr key={item.itemNo}><td>{item.itemNo}</td><td>{item.answerKey}</td><td>{number(item.internalCorrectRatePct, "%")}</td><td>{number(item.externalCorrectRatePct, "%")}</td></tr>)}</tbody></table></div>}</div></details>)}
    </div></details></section>}
    {view === "students" && <div className="admin-filter-bar"><StudentSearchField label="학생 검색" value={studentQuery} onChange={setStudentQuery} hint={searching ? `${searchedStudentCount}명 표시` : "이름을 누르면 개인 분석을 엽니다."} /></div>}
    {view === "students" && <section className="admin-section"><h3 className="admin-section-title">과목별 하락 감지</h3>
      {analysis.insufficientSample && <p className="admin-empty-state">판정에 필요한 응시 회차가 부족합니다.</p>}
      {declines.length ? <div className="admin-table-frame"><table><thead><tr><th scope="col">이름</th><th scope="col">과목</th><th scope="col">사유</th></tr></thead><tbody>{declines.map((row) => <tr key={`${row.studentId}:${row.subjectId}`} onClick={() => setStudent({ id: row.studentId, name: row.name })}><td className="admin-table-name"><button type="button" className="admin-table-link" onClick={() => setStudent({ id: row.studentId, name: row.name })}>{row.name}</button></td><td>{row.subjectName}</td><td>{row.flags.map((flag) => flag.detail).join(" · ")}</td></tr>)}</tbody></table></div> : !analysis.insufficientSample && <p className="admin-help">{searching ? "검색과 일치하는 학생이 없습니다." : "감지된 과목별 하락 신호가 없습니다."}</p>}
    </section>}
    {view === "students" && <section className="admin-section"><h3 className="admin-section-title">응시율 확인 대상</h3><p className="admin-help">설정된 응시율 기준 {analysis.settings.morning.attendanceRatePercent}% 미만인 학생입니다.</p>{!lowAttendance.length ? <p className="admin-help">{searching ? "검색과 일치하는 학생이 없습니다." : "응시율 확인 대상이 없습니다."}</p> : <div className="admin-table-frame"><table><thead><tr>{["이름", "응시", "예정", "응시율"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{lowAttendance.map((row) => <tr key={row.studentId}><td className="admin-table-name"><button type="button" className="admin-table-link" onClick={() => setStudent({ id: row.studentId, name: row.name })}>{row.name}</button></td><td>{row.attended}회</td><td>{row.expected}회</td><td>{number(row.ratePercent, "%")}</td></tr>)}</tbody></table></div>}</section>}
    {view === "students" && <section className="admin-section"><h3 className="admin-section-title">학생·과목별 응시 현황</h3>{!studentSubjects.length ? <p className="admin-empty-state">{searching ? "검색과 일치하는 학생이 없습니다." : "매칭된 학생이 없습니다."}</p> : <div className="admin-table-frame"><table><thead><tr>{["이름", "과목", "응시 / 예정", "응시율", "판정 상태"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{studentSubjects.map((row) => <tr key={`${row.studentId}:${row.subjectId}`}><td className="admin-table-name"><button type="button" className="admin-table-link" onClick={() => setStudent({ id: row.studentId, name: row.name })}>{row.name}</button></td><td>{row.subjectName}</td><td>{row.attended} / {row.expected}회</td><td>{number(row.attendanceRatePercent, "%")}</td><td>{row.attendanceRatePercent != null && row.attendanceRatePercent < analysis.settings.morning.attendanceRatePercent ? "응시율 부족" : row.insufficientSample ? `${row.requiredSessions}회부터 판정` : "판정 가능"}</td></tr>)}</tbody></table></div>}</section>}
    {view === "cohort" && <section className="admin-section"><h3 className="admin-section-title">단원별 반 평균</h3>{!analysis.topics.length ? <p className="admin-empty-state">진도 라벨이 입력된 시험이 없습니다.</p> : <div className="admin-table-frame"><table><thead><tr>{["단원", "과목", "시험 수", "반 평균", "외부 평균"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{analysis.topics.map((topic) => <tr key={`${topic.subjectId}:${topic.topic}`}><td className="admin-table-name">{topic.topic}</td><td>{topic.subjectName}</td><td>{topic.count}회</td><td>{number(topic.internalAvg)}</td><td>{number(topic.externalAvg)}</td></tr>)}</tbody></table></div>}</section>}
  </div>;
}
