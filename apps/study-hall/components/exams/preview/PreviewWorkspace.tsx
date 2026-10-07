"use client";
import { useEffect, useRef, useState } from "react";
import { AdminTabs } from "@/components/ui/AdminTabs";
import { ExamRouteTabs } from "@/components/exams/ExamRouteTabs";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import { MobileDisclosure } from "@/components/ui/MobileDisclosure";
import { recentMorningAnalysisRange } from "@/lib/morning-exam-analysis-schemas";
import { defaultKindDecision } from "@/lib/exam-preview/selection";
import type { PreviewData } from "@/lib/exam-preview/types";
import { PreviewReport } from "./PreviewReport";
import styles from "./preview.module.css";
import { LearningProvider } from "./LearningProvider";

type Props = {
  division: string;
  mode: "admin" | "student";
  studentId?: string;
  types: { id: string; name: string; category: string }[];
  students: { id: string; name: string; studentNumber: string }[];
  initial: Record<string, string>;
  preview?: boolean;
  embeddedKind?: "regular" | "morning";
};
export function PreviewWorkspace({
  division,
  mode,
  studentId,
  types,
  students,
  initial,
  preview = true,
  embeddedKind,
}: Props) {
  const [kind, setKind] = useState<"regular" | "morning">(
    embeddedKind ?? (initial.kind === "morning" ? "morning" : "regular"),
  );
  const [typeId, setTypeId] = useState(initial.examTypeId ?? "");
  // 성적 분석 3차: 반 전체 / 학생별(학생을 골라 개인 분석을 연다). 개인 분석 화면에서는 쓰지 않는다.
  const [view, setView] = useState<"cohort" | "students">(initial.view === "students" ? "students" : "cohort");
  const [studentQuery, setStudentQuery] = useState("");
  const [date, setDate] = useState(initial.examDate ?? "");
  const [range, setRange] = useState({
    ...recentMorningAnalysisRange(),
    ...(initial.from && initial.to
      ? { from: initial.from, to: initial.to }
      : {}),
  });
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data?: PreviewData;
    error?: string;
  }>();
  const choices = types.filter(
    (t) => t.category === (kind === "morning" ? "MORNING" : "REGULAR"),
  );
  const selected = choices.find((t) => t.id === typeId) ?? choices[0];
  const params = new URLSearchParams({
    examTypeId: selected?.id ?? "",
    ...(studentId ? { studentId } : {}),
    ...(kind === "morning" ? range : date ? { examDate: date } : {}),
  }).toString();
  const key = `${kind}:${params}:${retry}`;
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    void fetch(
      `/api/${encodeURIComponent(division)}/${preview ? "exam-analysis-preview" : "exam-analysis"}/${kind}?${params}`,
      { signal: abort.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw Error(body.error || "자료를 불러오지 못했습니다.");
        return body as PreviewData;
      })
      .then((data) => {
        if (!abort.signal.aborted) setResponse({ key, data });
      })
      .catch((error) => {
        if (!abort.signal.aborted) setResponse({ key, error: error.message });
      });
    return () => abort.abort();
  }, [division, kind, params, key, selected, preview]);
  const current = response?.key === key ? response : undefined;
  // 주소에 시험 구분이 없으면 성적이 있는 시험을 먼저 연다. 정기 성적이 없는 학원에서 첫 화면이 비지 않게 한다.
  const autoKind = useRef(!embeddedKind && !initial.kind);
  useEffect(() => {
    if (!autoKind.current) return;
    if (kind !== "regular") { autoKind.current = false; return; }
    const decision = defaultKindDecision({
      hasMorningType: types.some((t) => t.category === "MORNING"),
      hasRegularType: Boolean(selected),
      regular: { loaded: Boolean(current), error: Boolean(current?.error), examDates: current?.data?.dates.length ?? 0 },
    });
    if (decision === "wait") return;
    autoKind.current = false;
    if (decision === "morning") setKind("morning");
  }, [kind, types, selected, current]);
  const selectedDate = current?.data?.range.to ?? date;
  const availableDates = current?.data?.dates ?? [];
  const months = Array.from(new Set(availableDates.map((d) => d.slice(0, 7))))
    .sort()
    .reverse();
  const monthDates = availableDates
    .filter((d) => d.startsWith(selectedDate.slice(0, 7)))
    .sort()
    .reverse();
  const monthLabel = (value: string) =>
    `${value.slice(0, 4)}년 ${Number(value.slice(5, 7))}월`;
  const navigation = new URLSearchParams({
    kind,
    examTypeId: selected?.id ?? "",
    ...(kind === "morning" ? range : { examDate: selectedDate }),
  }).toString();
  const root = `/${division}/admin/exams${preview ? "/preview" : ""}`;
  const old =
    mode === "student"
      ? `/${division}/student/exams?${new URLSearchParams(kind === "morning" ? { morningType: selected?.id ?? "", morningFrom: range.from, morningTo: range.to } : { analysisSession: `${selected?.id}:${selectedDate}` })}`
      : studentId
        ? `/${division}/admin/exams/students/${studentId}?${navigation}`
        : `/${division}/admin/exams?${new URLSearchParams({ tab: kind, view: "analysis", examTypeId: selected?.id ?? "", ...(kind === "morning" ? range : { examDate: selectedDate }) })}`;
  return (
    <LearningProvider
      key={division + studentId}
      division={division}
      studentId={studentId}
      preview={preview}
    >
      <div className="admin-flat-page">
        {mode === "admin" && !embeddedKind && (
          <h1 className="admin-page-title">
            시험 성적{preview ? " 미리보기" : ""}
          </h1>
        )}
        {preview && <p className="admin-help">로컬 테스트 데이터</p>}
        {mode === "admin" ? (
          <ExamRouteTabs division={division} active="analysis" />
        ) : preview ? (
          <a className="admin-text-action" href={old}>성적 분석 보기</a>
        ) : null}
        {/* 학생 화면은 1차 학생 메뉴 아래에 분석 항목 2차 탭이 오므로, 시험 구분까지 탭이면
            2차 탭 줄이 두 겹이 된다(DESIGN.md §5.5). 학생은 선택 칩, 관리자는 1차 폴더 탭을 쓴다. */}
        {!embeddedKind && mode === "student" && (
          <div className="admin-choice-group" aria-label="시험 구분">
            {([
              { id: "regular", label: "정기 모의고사" },
              { id: "morning", label: "아침 모의고사" },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                className="admin-choice-button admin-choice-button-auto"
                aria-pressed={kind === option.id}
                onClick={() => {
                  setKind(option.id);
                  setTypeId("");
                  setDate("");
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {!embeddedKind && mode === "admin" && (
          <AdminTabs
            variant="secondary"
            label="시험 구분"
            idPrefix="preview-kind"
            panelId="preview-result"
            items={[
              { id: "regular", label: "정기 모의고사" },
              { id: "morning", label: "아침 모의고사" },
            ]}
            activeId={kind}
            onChange={(v) => {
              setKind(v);
              setTypeId("");
              setDate("");
            }}
          />
        )}
        {mode === "admin" && !studentId && (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <AdminTabs
              variant="secondary"
              className="admin-subtabs-underline"
              label="분석 범위"
              idPrefix="analysis-view"
              panelId="analysis-view-panel"
              items={[
                { id: "cohort", label: "반 전체" },
                { id: "students", label: <>학생별 <span className="tabular-nums">({students.length})</span></> },
              ]}
              activeId={view}
              onChange={(id) => setView(id)}
            />
            {!preview && (
              <a className="admin-text-action" href={`/${division}/admin/settings/exam-analysis`}>
                성적 분석 기준 설정
              </a>
            )}
          </div>
        )}
        {mode === "admin" && !studentId && view === "students" && (
          <section id="analysis-view-panel" role="tabpanel" aria-labelledby="analysis-view-students" className="admin-section">
            <div className="admin-filter-bar">
              <label className="admin-label">
                학생 검색
                <input type="search" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="이름 또는 수험번호" />
              </label>
            </div>
            <div className="admin-table-frame">
              <table aria-label="학생별 개인 분석">
                <thead><tr><th>수험번호</th><th>이름</th><th>개인 분석</th></tr></thead>
                <tbody>
                  {students
                    .filter((s) => !studentQuery.trim() || s.name.includes(studentQuery.trim()) || s.studentNumber.includes(studentQuery.trim()))
                    .map((s) => (
                      <tr key={s.id}>
                        <td className="tabular-nums">{s.studentNumber}</td>
                        <td className="admin-table-name">
                          <a className="admin-table-link" href={`${root}/students/${encodeURIComponent(s.id)}?${navigation}`}>{s.name}</a>
                        </td>
                        <td>
                          <a className="admin-button admin-button-compact" href={`${root}/students/${encodeURIComponent(s.id)}?${navigation}`}>열기</a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <div hidden={mode === "admin" && !studentId && view === "students"}>
        <MobileDisclosure title={mode === "admin" ? "시험·학생 조회 조건" : "조회 조건"}>
          <div className={`admin-filter-bar ${styles.filterFrame}`}>
            {mode === "admin" && (
              <label className="admin-label">
                학생 선택
                <StudentSearchCombobox
                  students={students}
                  value={studentId ?? ""}
                  onChange={(id) => {
                    if (id)
                      window.location.assign(
                        `${root}/students/${encodeURIComponent(id)}?${navigation}`,
                      );
                  }}
                  placeholder="이름 또는 수험번호 검색"
                />
              </label>
            )}
            {/* 학생은 고를 것이 하나뿐이면 시험 종류를 보여 주지 않는다(운영자 요청 2026-10-07: 조작 요소 줄이기). */}
            {(mode === "admin" || choices.length > 1) && <label className="admin-label">
              시험 종류
              <select
                value={selected?.id ?? ""}
                onChange={(e) => {
                  setTypeId(e.target.value);
                  setDate("");
                }}
              >
                {choices.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>}
            {kind === "regular" ? (
              <>
                <label className="admin-label">
                  시험 월
                  <select
                    aria-label="시험 월"
                    value={selectedDate.slice(0, 7)}
                    onChange={(e) =>
                      setDate(
                        availableDates
                          .filter((d) => d.startsWith(e.target.value))
                          .sort()
                          .reverse()[0] ?? "",
                      )
                    }
                  >
                    {!months.includes(selectedDate.slice(0, 7)) && (
                      <option value={selectedDate.slice(0, 7)}>
                        {selectedDate
                          ? monthLabel(selectedDate) + " (시험 없음)"
                          : "등록된 시험 없음"}
                      </option>
                    )}
                    {months.map((m) => (
                      <option value={m} key={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
                {monthDates.length > 1 && (
                  <label className="admin-label">
                    해당 월 시험 ({monthDates.length}회)
                    <select
                      aria-label="해당 월 시험"
                      value={selectedDate}
                      onChange={(e) => setDate(e.target.value)}
                    >
                      {monthDates.map((d) => (
                        <option value={d} key={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <>
                {/* 학생은 빠른 기간(최근 4·8·12주)만 고른다. 날짜 직접 지정은 관리자 화면에 둔다. */}
                {mode === "admin" && <>
                <label className="admin-label">
                  월별 선택
                  <input
                    type="month"
                    aria-label="아침 모의고사 조회 월"
                    value={
                      range.from === `${range.to.slice(0, 7)}-01` &&
                      range.to === `${range.to.slice(0, 7)}-${new Date(Date.UTC(Number(range.to.slice(0, 4)), Number(range.to.slice(5, 7)), 0)).getUTCDate()}`
                        ? range.to.slice(0, 7)
                        : ""
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!/^\d{4}-\d{2}$/.test(value)) return;
                      const [year, month] = value.split("-").map(Number);
                      const last = new Date(
                        Date.UTC(year, month, 0),
                      ).getUTCDate();
                      setRange({ from: `${value}-01`, to: `${value}-${last}` });
                    }}
                  />
                </label>
                <label className="admin-label">
                  시작일
                  <input
                    type="date"
                    value={range.from}
                    onChange={(e) =>
                      setRange({ ...range, from: e.target.value })
                    }
                  />
                </label>
                <label className="admin-label">
                  종료일
                  <input
                    type="date"
                    value={range.to}
                    onChange={(e) => setRange({ ...range, to: e.target.value })}
                  />
                </label>
                </>}
                <fieldset className={styles.quickPeriod}>
                  <legend className="admin-label">빠른 기간</legend>
                  <div className={styles.segmented}>
                    {([4, 8, 12] as const).map((weeks) => {
                      const target = recentMorningAnalysisRange(weeks);
                      return (
                        <button
                          key={weeks}
                          type="button"
                          aria-pressed={
                            range.from === target.from && range.to === target.to
                          }
                          onClick={() => setRange(target)}
                        >
                          최근 {weeks}주
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            )}
          </div>
        </MobileDisclosure>
        <div
          id="preview-result"
          role={embeddedKind ? undefined : "tabpanel"}
          aria-labelledby={embeddedKind ? undefined : `preview-kind-${kind}`}
          aria-busy={Boolean(selected && !current)}
        >
          {!selected ? (
            <p className="admin-empty-state">등록된 시험 종류가 없습니다.</p>
          ) : current?.error ? (
            <div role="alert" className="admin-notice admin-notice-danger">
              <p>{current.error}</p>
              <button
                className="admin-button"
                onClick={() => setRetry((v) => v + 1)}
              >
                다시 시도
              </button>
            </div>
          ) : current?.data ? (
            <PreviewReport
              key={`${kind}:${selected.id}:${studentId ?? "cohort"}`}
              data={current.data}
              mode={mode}
              division={division}
              query={navigation}
            />
          ) : (
            <p role="status" className="admin-help">
              성적 분석을 불러오는 중입니다.
            </p>
          )}
        </div>
        </div>
      </div>
    </LearningProvider>
  );
}
