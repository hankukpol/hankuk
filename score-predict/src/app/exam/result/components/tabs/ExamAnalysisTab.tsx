"use client";

import ScoreDistributionChart from "@/app/exam/result/components/ScoreDistributionChart";
import SubjectComparisonChart from "@/app/exam/result/components/SubjectComparisonChart";
import WrongRateTop5 from "@/app/exam/result/components/WrongRateTop5";
import type { ResultResponse } from "@/app/exam/result/types";

interface ExamAnalysisTabProps {
  result: ResultResponse;
}

export default function ExamAnalysisTab({ result }: ExamAnalysisTabProps) {
  return (
    <div className="space-y-6">
      <SubjectComparisonChart submissionId={result.submission.id} />
      <WrongRateTop5
        submissionId={result.submission.id}
        subjectOptions={result.scores.map((score) => ({
          subjectId: score.subjectId,
          subjectName: score.subjectName,
        }))}
      />
      <ScoreDistributionChart submissionId={result.submission.id} />
    </div>
  );
}
