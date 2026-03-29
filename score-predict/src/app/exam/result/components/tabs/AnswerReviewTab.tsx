"use client";

import AnswerSheet from "@/components/result/AnswerSheet";
import CorrectRateChart from "@/components/result/CorrectRateChart";
import type { ResultResponse } from "@/app/exam/result/types";

interface AnswerReviewTabProps {
  result: ResultResponse;
}

export default function AnswerReviewTab({ result }: AnswerReviewTabProps) {
  const subjects = result.scores.map((score) => ({
    subjectId: score.subjectId,
    subjectName: score.subjectName,
    answers: score.answers,
  }));

  return (
    <div className="space-y-6">
      <CorrectRateChart subjects={subjects} />
      <AnswerSheet subjects={subjects} summaries={result.subjectCorrectRateSummaries} />
    </div>
  );
}
