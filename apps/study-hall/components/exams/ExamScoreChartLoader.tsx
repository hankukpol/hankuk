"use client";

import dynamic from "next/dynamic";
import { ChartNoAxesColumn } from "lucide-react";
import { useState } from "react";

import {
  PortalSectionHeader,
  portalSectionClass,
} from "@/components/student-view/StudentPortalUi";
import type { StudentExamResultItem } from "@/lib/services/exam.service";

type ExamScoreChartLoaderProps = {
  results: StudentExamResultItem[];
};

const ExamScoreChart = dynamic(
  () => import("@/components/exams/ExamScoreChart").then((mod) => mod.ExamScoreChart),
  {
    ssr: false,
    loading: () => (
      <div className="mt-5 rounded-lg border border-admin-line bg-white p-5">
        <div className="h-48 animate-pulse rounded-lg bg-admin-surface-soft" />
      </div>
    ),
  },
);

export function ExamScoreChartLoader({ results }: ExamScoreChartLoaderProps) {
  const [isChartVisible, setIsChartVisible] = useState(false);

  return (
    <section className={portalSectionClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PortalSectionHeader
          title="성적 추이 차트"
          description="직접 열 때만 차트를 로드해서 첫 화면 진입 속도를 우선 확보합니다."
          icon={<ChartNoAxesColumn className="h-5 w-5" />}
        />
        <button
          type="button"
          onClick={() => setIsChartVisible((current) => !current)}
          className="admin-button"
        >
          {isChartVisible ? "차트 숨기기" : "차트 보기"}
        </button>
      </div>

      {isChartVisible ? (
        <div className="mt-5">
          <ExamScoreChart results={results} />
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-admin-line bg-admin-surface-soft px-5 py-8 text-[13px] text-admin-text-muted">
          차트는 필요할 때만 로드됩니다.
        </div>
      )}
    </section>
  );
}
