"use client";
import { useEffect, useState } from "react";
import { AdminTabs } from "@/components/ui/AdminTabs";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import { MobileDisclosure } from "@/components/ui/MobileDisclosure";
import { defaultMorningAnalysisRange } from "@/lib/morning-exam-analysis-schemas";
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
  const [date, setDate] = useState(initial.examDate ?? "");
  const [range, setRange] = useState({
    ...defaultMorningAnalysisRange(),
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
  const cohortRoot = preview ? root : `${root}/analysis`;
  const old =
    mode === "student"
      ? `/${division}/student/exams?${new URLSearchParams(kind === "morning" ? { morningType: selected?.id ?? "", morningFrom: range.from, morningTo: range.to } : { analysisSession: `${selected?.id}:${selectedDate}` })}`
      : studentId
        ? `/${division}/admin/exams/students/${studentId}?${navigation}`
        : `/${division}/admin/exams?${new URLSearchParams({ tab: kind, view: "analysis", examTypeId: selected?.id ?? "", ...(kind === "morning" ? range : { examDate: selectedDate }) })}`;
  function shortcutRange(which: "today" | "week" | "month") {
    const today = defaultMorningAnalysisRange().to;
    const d = new Date(`${today}T00:00:00Z`);
    const weekday = d.getUTCDay() || 7;
    return {
      from:
        which === "today"
          ? today
          : which === "month"
            ? `${today.slice(0, 7)}-01`
            : new Date(d.getTime() - (weekday - 1) * 86400000)
                .toISOString()
                .slice(0, 10),
      to: today,
    };
  }
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
            {studentId ? "개인 성적 분석" : "전체 성적 분석"}
            {preview ? " 미리보기" : ""}
          </h1>
        )}
        <div className="admin-workspace-toolbar">
          {preview && <p className="admin-help">로컬 테스트 데이터</p>}
          <div className="flex flex-wrap gap-4">
            {preview ? (
              <a className="admin-text-action" href={old}>
                성적 분석 보기
              </a>
            ) : (
              mode === "admin" && (
                <a
                  className="admin-text-action"
                  href={`/${division}/admin/exams?tab=${kind}`}
                >
                  성적 입력·가져오기
                </a>
              )
            )}
            {mode === "admin" && (
              <a className="admin-text-action" href={`${root}/learning`}>
                진도·학습 분석 설정
              </a>
            )}
            {mode === "admin" && studentId && (
              <a
                className="admin-text-action"
                href={`${cohortRoot}?${navigation}`}
              >
                전체 분석
              </a>
            )}
          </div>
        </div>
        {!embeddedKind && (
          <AdminTabs
            variant={mode === "student" ? "secondary" : "primary"}
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
          <p className="admin-help">
            현재 전체 응시자 분석입니다. 개인 점수와 문항별 정오를 보려면
            아래에서 학생을 선택하세요.
          </p>
        )}
        <MobileDisclosure title="시험·학생 조회 조건">
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
            <label className="admin-label">
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
            </label>
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
                <label className="admin-label">
                  조회 월
                  <input
                    type="month"
                    aria-label="아침 모의고사 조회 월"
                    value={range.to.slice(0, 7)}
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
                <fieldset className={styles.quickPeriod}>
                  <legend className="admin-label">빠른 기간</legend>
                  <div className={styles.segmented}>
                    {(["today", "week", "month"] as const).map((v, i) => {
                      const target = shortcutRange(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={
                            range.from === target.from && range.to === target.to
                          }
                          onClick={() => setRange(target)}
                        >
                          {["오늘", "이번 주", "이번 달"][i]}
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
    </LearningProvider>
  );
}
