"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { journalDayLabel, type StudentJournalSummary } from "@/lib/interview-journal";
import type { RecommendedStudent } from "@/lib/interview-recommend";
import type { StudentListItem } from "@/lib/services/student.service";
import { getWarningStageLabel } from "@/lib/student-meta";

type Filter = "all" | "demerit" | "score";

/**
 * 면담 권장 대상 표(운영자 요청 2026-10-07). 벌점 기준에 성적 신호(과락·점수 하락)를 더하고,
 * 왜 권장되는지 "권장 이유" 열에 적는다. 위의 구분은 표 바로 위 세그먼트(건수 포함)다(DESIGN.md 0절 6항).
 */
export function RecommendedStudents({
  rows,
  summaries,
  warnInterview,
  signalsState,
  onOpenJournal,
  onCreate,
}: {
  rows: Array<RecommendedStudent<StudentListItem>>;
  summaries: Map<string, StudentJournalSummary>;
  warnInterview: number;
  signalsState: "loading" | "ready" | "error";
  onOpenJournal: (studentId: string) => void;
  onCreate: (studentId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const demeritCount = rows.filter((row) => row.byDemerit).length;
  const scoreCount = rows.filter((row) => row.byScore).length;
  const visible = rows.filter((row) => filter === "all" || (filter === "demerit" ? row.byDemerit : row.byScore));

  return (
    <>
      <div className="admin-workspace-toolbar">
        <h2 className="admin-section-title">면담 권장 학생 <span className="tabular-nums text-admin-danger">{rows.length}</span></h2>
        <p className="admin-help">
          벌점 {warnInterview}점 이상, 또는 최근 시험에서 과락·점수 하락이 있는 학생
          {signalsState === "loading" ? " · 성적 확인 중" : signalsState === "error" ? " · 성적 신호를 불러오지 못해 벌점 기준만 표시" : ""}
        </p>
      </div>
      <nav className="admin-subtabs" aria-label="권장 이유">
        {([
          { value: "all", label: "전체", count: rows.length },
          { value: "demerit", label: "벌점", count: demeritCount },
          { value: "score", label: "성적", count: scoreCount },
        ] as const).map((option) => (
          <button key={option.value} type="button" className="admin-subtab" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>
            {option.label}
            <span className="ml-2 tabular-nums text-admin-text-muted">{option.count}</span>
          </button>
        ))}
      </nav>
      {visible.length ? (
        <div className="admin-table-frame">
          <table aria-label="면담 권장 학생">
            <thead>
              <tr><th>학생</th><th>권장 이유</th><th>벌점</th><th>경고 단계</th><th>면담</th><th>최근 면담</th><th>작업</th></tr>
            </thead>
            <tbody>
              {visible.map(({ student, demerit, reasons }) => {
                const summary = summaries.get(student.id);
                return (
                  <tr key={student.id}>
                    <td className="admin-table-name">
                      <button type="button" className="admin-table-link" onClick={() => onOpenJournal(student.id)}>{student.name}</button>
                      <span className="admin-help ml-2 tabular-nums">{student.studentNumber}</span>
                    </td>
                    <td className="admin-table-name">
                      {reasons.map((reason, index) => (
                        <span key={index} className={`block ${reason.kind === "decline" ? "text-admin-warning" : "text-admin-danger"}`}>{reason.text}</span>
                      ))}
                    </td>
                    <td className={`admin-table-amount ${demerit >= warnInterview ? "font-semibold text-admin-danger" : ""}`}>{demerit}점</td>
                    <td>{student.warningStageLabel ?? getWarningStageLabel(student.warningStage)}</td>
                    <td className="tabular-nums">{summary ? `${summary.count}회` : "없음"}</td>
                    <td className="tabular-nums">{summary?.lastDate ? journalDayLabel(summary.lastDate) : "–"}</td>
                    <td>
                      <button type="button" onClick={() => onCreate(student.id)} className="admin-button admin-button-compact">
                        <Plus className="h-4 w-4" />면담 기록
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-empty-state">
          <p className="font-semibold">면담 권장 대상이 없습니다.</p>
          <p className="admin-help mt-2">현재 기준 벌점 {warnInterview}점 이상 · 최근 시험 과락·점수 하락</p>
        </div>
      )}
    </>
  );
}
