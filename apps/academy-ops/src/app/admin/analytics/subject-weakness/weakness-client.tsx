"use client";

import { useState } from "react";
import Link from "next/link";
import type { SubjectWeaknessData, WeaknessStudent } from "./page";

type Props = {
  subjectData: SubjectWeaknessData[];
};

function SeverityBadge({ severity }: { severity: WeaknessStudent["severity"] }) {
  const cls =
    severity === "심각"
      ? "bg-red-50 border-red-200 text-red-700"
      : severity === "주의"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-yellow-50 border-yellow-200 text-yellow-800";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {severity}
    </span>
  );
}

function SeverityDot({ severity }: { severity: WeaknessStudent["severity"] }) {
  const cls =
    severity === "심각"
      ? "bg-red-500"
      : severity === "주의"
        ? "bg-amber-400"
        : "bg-yellow-400";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function SubjectCard({
  data,
  isExpanded,
  onToggle,
  selectedStudents,
  onSelectStudent,
  onSelectAll,
}: {
  data: SubjectWeaknessData;
  isExpanded: boolean;
  onToggle: () => void;
  selectedStudents: Set<string>;
  onSelectStudent: (examNumber: string) => void;
  onSelectAll: (examNumbers: string[], select: boolean) => void;
}) {
  const weakRate =
    data.totalStudentCount > 0
      ? Math.round((data.weakStudentCount / data.totalStudentCount) * 100)
      : 0;

  const severityCounts = {
    심각: data.students.filter((s) => s.severity === "심각").length,
    주의: data.students.filter((s) => s.severity === "주의").length,
    경계: data.students.filter((s) => s.severity === "경계").length,
  };

  const allSelected =
    data.students.length > 0 &&
    data.students.every((s) => selectedStudents.has(s.examNumber));

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
      {/* Card Header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-6 text-left hover:bg-mist/30"
      >
        <div className="flex items-center gap-4">
          <div>
            <h3 className="text-lg font-semibold text-ink">{data.subjectLabel}</h3>
            <div className="mt-1 flex items-center gap-4 text-sm text-slate">
              <span>취약 학생 <strong className="text-ink">{data.weakStudentCount}명</strong></span>
              <span>전체 {data.totalStudentCount}명</span>
              <span>취약율 {weakRate}%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Severity counts */}
          <div className="hidden items-center gap-3 sm:flex">
            {severityCounts["심각"] > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
                <SeverityDot severity="심각" />
                심각 {severityCounts["심각"]}명
              </span>
            )}
            {severityCounts["주의"] > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <SeverityDot severity="주의" />
                주의 {severityCounts["주의"]}명
              </span>
            )}
            {severityCounts["경계"] > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-yellow-700">
                <SeverityDot severity="경계" />
                경계 {severityCounts["경계"]}명
              </span>
            )}
          </div>

          {/* Avg score */}
          <div className="text-right">
            <p className="text-xs text-slate">과목 평균</p>
            <p
              className={`text-xl font-bold ${
                data.avgScore >= 70
                  ? "text-forest"
                  : data.avgScore >= 60
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {data.avgScore.toFixed(1)}점
            </p>
          </div>

          {/* Expand icon */}
          <span className="text-slate transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : undefined }}>
            ▼
          </span>
        </div>
      </button>

      {/* Expanded Student Table */}
      {isExpanded && (
        <div className="border-t border-ink/10 p-6">
          {data.students.length === 0 ? (
            <p className="text-sm text-slate">해당 기준의 취약 학생이 없습니다.</p>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">
                  취약 학생 목록 ({data.students.length}명)
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectAll(
                        data.students.map((s) => s.examNumber),
                        !allSelected,
                      )
                    }
                    className="text-xs font-medium text-forest hover:underline"
                  >
                    {allSelected ? "전체 해제" : "전체 선택"}
                  </button>
                  {selectedStudents.size > 0 && (
                    <Link
                      href={`/admin/counseling/new?students=${[...selectedStudents].join(",")}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-ember/80"
                    >
                      면담 대상 선정 ({selectedStudents.size}명)
                    </Link>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left text-xs font-semibold text-slate">
                      <th className="pb-2 pr-3 w-8">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) =>
                            onSelectAll(
                              data.students.map((s) => s.examNumber),
                              e.target.checked,
                            )
                          }
                          className="rounded"
                        />
                      </th>
                      <th className="pb-2 pr-4">학번</th>
                      <th className="pb-2 pr-4">이름</th>
                      <th className="pb-2 pr-4 text-right">과목 평균</th>
                      <th className="pb-2 pr-4 text-right">전체 평균</th>
                      <th className="pb-2 pr-4 text-right">차이</th>
                      <th className="pb-2">심각도</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {data.students.map((student) => (
                      <tr key={student.examNumber} className="hover:bg-mist/40">
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            checked={selectedStudents.has(student.examNumber)}
                            onChange={() => onSelectStudent(student.examNumber)}
                            className="rounded"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Link
                            href={`/admin/students/${student.examNumber}`}
                            className="font-mono text-xs font-medium text-forest hover:underline"
                          >
                            {student.examNumber}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 font-medium text-ink">
                          <Link
                            href={`/admin/students/${student.examNumber}`}
                            className="hover:text-forest hover:underline"
                          >
                            {student.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <span
                            className={`font-mono font-semibold ${
                              student.avgInSubject < 50
                                ? "text-red-600"
                                : student.avgInSubject < 60
                                  ? "text-amber-600"
                                  : "text-yellow-600"
                            }`}
                          >
                            {student.avgInSubject.toFixed(1)}점
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-slate">
                          {student.overallAvg.toFixed(1)}점
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          <span
                            className={student.diff < 0 ? "text-red-600" : "text-forest"}
                          >
                            {student.diff > 0 ? "+" : ""}
                            {student.diff.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-2">
                          <SeverityBadge severity={student.severity} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function WeaknessClient({ subjectData }: Props) {
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());

  const toggleSubject = (subject: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  };

  const handleSelectStudent = (examNumber: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(examNumber)) next.delete(examNumber);
      else next.add(examNumber);
      return next;
    });
  };

  const handleSelectAll = (examNumbers: string[], select: boolean) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      for (const en of examNumbers) {
        if (select) next.add(en);
        else next.delete(en);
      }
      return next;
    });
  };

  const totalWeakCount = subjectData.reduce((s, d) => s + d.weakStudentCount, 0);
  const criticalCount = subjectData.reduce(
    (s, d) => s + d.students.filter((st) => st.severity === "심각").length,
    0,
  );

  if (subjectData.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
        <p className="text-sm font-medium text-ink">데이터 없음</p>
        <p className="mt-1 text-xs text-slate">선택한 기간에 해당하는 성적 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary KPI */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">분석 과목 수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{subjectData.length}</p>
        </div>
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">심각 학생</p>
          <p className="mt-2 text-3xl font-bold text-red-700">{criticalCount}</p>
        </div>
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">총 취약 케이스</p>
          <p className="mt-2 text-3xl font-bold text-amber-800">{totalWeakCount}</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">선택된 면담 대상</p>
          <p className="mt-2 text-3xl font-bold text-forest">{selectedStudents.size}</p>
          {selectedStudents.size > 0 && (
            <Link
              href={`/admin/counseling/new?students=${[...selectedStudents].join(",")}`}
              className="mt-2 inline-flex items-center text-xs font-semibold text-ember hover:underline"
            >
              면담 신청 →
            </Link>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-ink/10 bg-white px-5 py-3">
        <span className="text-xs font-semibold text-slate">심각도 기준:</span>
        <span className="flex items-center gap-1.5 text-xs text-red-600">
          <SeverityDot severity="심각" />
          심각 &lt; 50점
        </span>
        <span className="flex items-center gap-1.5 text-xs text-amber-700">
          <SeverityDot severity="주의" />
          주의 50~60점
        </span>
        <span className="flex items-center gap-1.5 text-xs text-yellow-700">
          <SeverityDot severity="경계" />
          경계 60~70점 (코호트 평균 -10점 이상)
        </span>
      </div>

      {/* Subject Cards */}
      <div className="space-y-4">
        {subjectData.map((data) => (
          <SubjectCard
            key={data.subject}
            data={data}
            isExpanded={expandedSubjects.has(data.subject)}
            onToggle={() => toggleSubject(data.subject)}
            selectedStudents={selectedStudents}
            onSelectStudent={handleSelectStudent}
            onSelectAll={handleSelectAll}
          />
        ))}
      </div>
    </div>
  );
}
