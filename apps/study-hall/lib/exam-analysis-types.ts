import type { ExamAnalysisSettings } from "./exam-analysis-settings";
import type { balanceAssessment, buildDistributionBins, detectRegularDecline, itemDiagnostics } from "./exam-analysis-meta";
import type { ImportAssembly, ImportItem, ImportParticipant, ImportSubject } from "./exam-import-assembler";
import type { StudentExamResultItem } from "./services/exam.service";

export type Viewer = { role: "ADMIN" | "SUPER_ADMIN" | "ASSISTANT" | "STUDENT"; studentId?: string };
export type AnalysisFlag = ReturnType<typeof detectRegularDecline>[number];
export type AnalysisSubject = { id: string; name: string; fullScore: number; itemCount: number; alternateGroup: string | null };
export type AnalysisSession = { id: string; examTypeId: string; examTypeName: string; examDate: string; fullScore: number; itemCount: number; externalCohortSize: number; topic: string | null };
export type AnalysisDistribution = ReturnType<typeof buildDistributionBins>;
export type AnalysisSummary = { average: number | null; top10Avg: number | null; top30Avg: number | null; max: number | null; min: number | null };
export type AnalysisRank = { rank: number | null; count: number; topPercent: number | null; percentile: number | null };
export type RegularSessionListItem = { examDate: string; sessionId: string; participantCount: number };

export type RegularCohortAnalysis = {
  hasPreviousExam?: boolean;
  session: AnalysisSession;
  subjects: AnalysisSubject[];
  external: AnalysisSummary & { distribution: Pick<AnalysisDistribution, "binSize" | "bins">; subjectAverages: Record<string, number | null>; regions: Array<{ code: string; count: number; average: number | null; top10Avg: number | null }> };
  internal: { count: number; average: number | null; max: number | null; min: number | null; stdDev: number | null; subjectAverages: Record<string, number | null>; weakSubjects: Array<{ subjectId: string; name: string; gapVsExternal: number | null; weakCount: number }>; isReliable: boolean };
  classWrongTop: Array<{ subjectId: string; subjectName: string; itemNo: number; position: number; answerKey: string; externalCorrectRatePct: number; internalCorrectRatePct: number; gap: number }>;
  ranking: Array<{ studentId: string; name: string; studentNumber: string; totalScore: number; subjectScores: Record<string, number>; isPartial: boolean; externalRank: number | null; externalTopPercent: number | null; internalRank: number; delta: { total: number; rank: number } | null; flags: AnalysisFlag[] }>;
  declines: Array<{ studentId: string; name: string; flags: AnalysisFlag[] }>;
  partials: Array<{ studentId: string; name: string; missingSubjects: string[] }>;
};

export type RegularStudentReport = {
  hasPreviousExam?: boolean;
  // All session subjects provide choose-one metadata for competitors; stats/items contain only taken subjects.
  session: AnalysisSession; subjects: AnalysisSubject[];
  student: { id: string; name: string | null; studentNumber: string; region: string | null };
  myScore: { total: number; subjectScores: Record<string, number>; isPartial: boolean };
  ranks: { external: AnalysisRank; region: (AnalysisRank & { code: string }) | null; internal: AnalysisRank & { isReliable: boolean } };
  stats: { external: AnalysisSummary; internal: Pick<AnalysisSummary, "average" | "max" | "min">;
    // externalCount is the subject's actual takers, including choose-one cohorts.
    subjects: Array<{ subjectId: string; name: string; my: number; fullScore: number; scoreRate: number; externalAvg: number | null; regionAvg: number | null; internalAvg: number | null; top10Avg: number | null; top30Avg: number | null; externalRank: number | null; externalTopPercent: number | null; externalPercentile: number | null; externalCount?: number; grade: "우수" | "보통" | "취약"; gradeBasis: "scoreRate" | "percentile"; top10Complete?: boolean; top30Complete?: boolean; regionComplete?: boolean }>;
    balance: ReturnType<typeof balanceAssessment>; advice: string[] };
  distribution: AnalysisDistribution;
  items: ReturnType<typeof itemDiagnostics>;
  competitors: Array<{ studentNumber: string; rank: number; total: number; subjectScores: Record<string, number> }>;
  trend: Omit<StudentExamResultItem, "examRound">[];
  target: { targetScore: number; gap: number; gapPercent: number } | null;
  flags: AnalysisFlag[];
};

export type AnalysisSessionRow = { id: string; divisionId: string; examTypeId: string; examDate: string | Date; primarySubjectId: string | null; topic: string | null; fullScore: number; itemCount: number; externalCohortSize: number; externalStats: ImportAssembly["externalStats"] | unknown };
export type AnalysisParticipantRow = Omit<ImportParticipant, "responses"> & { divisionId: string; sessionId: string };
export type AnalysisItemRow = ImportItem & { divisionId: string; sessionId: string };
export type AnalysisResponseRow = ImportParticipant["responses"][number] & { divisionId: string; sessionId: string; studentId: string };
/** Cache only these raw rows. Selection, previous-date resolution and privacy live in the assembler. */
export type RegularRawSource = {
  divisionId: string;
  examTypes: Array<{ id: string; name: string; category: string; subjects: ImportSubject[] }>;
  sessions: AnalysisSessionRow[]; items: AnalysisItemRow[]; participants: AnalysisParticipantRow[]; responses: AnalysisResponseRow[];
  students: Array<{ id: string; divisionId: string; name: string; studentNumber: string }>;
  targets: Array<{ studentId: string; examTypeId: string; targetScore: number }>;
};
// Legacy trend input retains its existing manual-score contract; analysis output omits its round.
export type RegularRawBundle = RegularRawSource & { examTypeId: string; examDate: string; settings: ExamAnalysisSettings; trend?: StudentExamResultItem[] };
