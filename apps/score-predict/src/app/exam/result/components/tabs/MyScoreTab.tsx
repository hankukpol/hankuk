"use client";

import AnswerChangeImpact from "@/app/exam/result/components/AnswerChangeImpact";
import GradeAnalysisTable from "@/app/exam/result/components/GradeAnalysisTable";
import ParticipantStatus from "@/app/exam/result/components/ParticipantStatus";
import type { ResultResponse } from "@/app/exam/result/types";

interface MyScoreTabProps {
  result: ResultResponse;
}

export default function MyScoreTab({ result }: MyScoreTabProps) {
  return (
    <div className="space-y-6">
      <GradeAnalysisTable result={result} />
      <AnswerChangeImpact submissionId={result.submission.id} />
      <ParticipantStatus participantStatus={result.participantStatus} />
    </div>
  );
}
