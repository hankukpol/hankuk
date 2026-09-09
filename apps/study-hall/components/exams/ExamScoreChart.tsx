"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  PortalEmptyState,
  PortalSectionHeader,
} from "@/components/student-view/StudentPortalUi";
import type { StudentExamResultItem } from "@/lib/services/exam.service";

type ChartResult = Omit<StudentExamResultItem, "examRound"> & { examRound?: number };

type ExamScoreChartProps = {
  results: ChartResult[];
};

const COLORS = Array.from({ length: 6 }, (_, index) => `var(--admin-chart-${index + 1})`);

function buildChartLabel(result: ChartResult) {
  const dateLabel = result.examDate
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).format(new Date(result.examDate))
    : "";

  return dateLabel || (result.examRound != null ? `${result.examRound}회차` : "시험일 없음");
}

export function ExamScoreChart({ results }: ExamScoreChartProps) {
  const examTypeGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        examTypeId: string;
        examTypeName: string;
        results: ChartResult[];
      }
    >();

    for (const result of results) {
      const current = map.get(result.examTypeId);

      if (current) {
        current.results.push(result);
        continue;
      }

      map.set(result.examTypeId, {
        examTypeId: result.examTypeId,
        examTypeName: result.examTypeName,
        results: [result],
      });
    }

    return Array.from(map.values()).map((group) => ({
      ...group,
      results: [...group.results].sort((left, right) => {
        const leftKey = `${left.examDate ?? ""}-${String(left.examRound ?? 0).padStart(3, "0")}`;
        const rightKey = `${right.examDate ?? ""}-${String(right.examRound ?? 0).padStart(3, "0")}`;
        return leftKey.localeCompare(rightKey);
      }),
    }));
  }, [results]);

  const [selectedExamTypeId, setSelectedExamTypeId] = useState(
    examTypeGroups[0]?.examTypeId ?? "",
  );

  const selectedGroup =
    examTypeGroups.find((group) => group.examTypeId === selectedExamTypeId) ??
    examTypeGroups[0] ??
    null;

  const chartData = useMemo(() => {
    if (!selectedGroup) {
      return [];
    }

    return selectedGroup.results.map((result) => {
      const subjectEntries = Object.fromEntries(
        result.subjects.map((subject) => [subject.name, subject.score]),
      );

      return {
        label: buildChartLabel(result),
        totalScore: result.totalScore,
        ...subjectEntries,
      };
    });
  }, [selectedGroup]);

  const subjects = selectedGroup?.results[0]?.subjects ?? [];

  if (results.length === 0) {
    return (
      <PortalEmptyState
        title="성적 차트를 표시할 데이터가 없습니다."
        description="등록된 시험 결과가 생기면 과목별 추이 차트를 여기에서 확인할 수 있습니다."
      />
    );
  }

  return (
    <section className="admin-section">
      <PortalSectionHeader
        title="성적 추이 차트"
        description="시험 종류별로 과목 점수와 총점 변화를 비교할 수 있습니다."
      />

      {/* DESIGN.md 5.6 — 시험 종류 고르기는 탐색이 아니라 데이터 필터이므로 조건 선택 버튼이다.
          시험 종류 이름은 길이를 미리 알 수 없어 -auto 를 함께 준다.
          8절에 따라 학생 화면도 같은 규격을 쓴다. 화면별로 갈라 두면 같은 컨트롤이 두 모양이 된다. */}
      <div className="admin-choice-group mt-5">
        {examTypeGroups.map((group) => {
          const isSelected = (selectedGroup?.examTypeId ?? "") === group.examTypeId;

          return (
            <button
              key={group.examTypeId}
              type="button"
              aria-pressed={isSelected}
              title={group.examTypeName}
              onClick={() => setSelectedExamTypeId(group.examTypeId)}
              className="admin-choice-button admin-choice-button-auto"
            >
              {group.examTypeName}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <div className="h-[320px] md:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 18, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--admin-grid)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--admin-text-muted)", fontSize: "var(--admin-type-caption)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--admin-grid)" }}
              />
              <YAxis
                tick={{ fill: "var(--admin-text-muted)", fontSize: "var(--admin-type-caption)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--admin-grid)" }}
              />
              <YAxis
                yAxisId="total"
                orientation="right"
                tick={{ fill: "var(--admin-text-muted)", fontSize: "var(--admin-type-caption)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--admin-grid)" }}
              />
              <Tooltip />
              <Legend />
              {subjects.map((subject, index) => (
                <Line
                  key={subject.subjectId}
                  type="monotone"
                  dataKey={subject.name}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="totalScore"
                yAxisId="total"
                stroke="var(--admin-text)"
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name="총점"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
