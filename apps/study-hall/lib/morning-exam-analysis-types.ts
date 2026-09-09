import type { ExamAnalysisSettings } from './exam-analysis-settings';
import type { AnalysisRank, AnalysisSubject, RegularRawSource } from './exam-analysis-types';
import type { itemDiagnostics } from './exam-analysis-meta';
export type MorningRange = { from: string; to: string };
export type MorningFlag = { kind: 'lowAttendance' | 'consecutiveDrops' | 'classGap' | 'ownAverageDrop'; detail: string };
export type MorningWeeklyRank = { studentId: string; weekYear: number; weekNumber: number; rank: number; count: number };
export type MorningChoiceEvidence = { divisionId: string; examTypeId: string; studentId: string; subjectId: string; examDate: string };
export type MorningRawSource = Omit<RegularRawSource, 'targets' | 'students' | 'examTypes'> & {
 examTypes: Array<RegularRawSource['examTypes'][number] & { studyTrack?: string | null }>;
 students: Array<RegularRawSource['students'][number] & { studyTrack?: string | null; status?: string }>;
 choiceEvidence?: MorningChoiceEvidence[]; weeklyRankings: MorningWeeklyRank[];
};
export type MorningRawBundle = MorningRawSource & { examTypeId: string; range: MorningRange; settings: ExamAnalysisSettings };
export type MorningSubjectSummary = { subjectId: string; name: string; average: number | null; internalAvg: number | null; externalAvg: number | null; gap: number | null; stdDev: number | null; slope: number | null; consecutiveDrops: number; flags: MorningFlag[]; attended: number; expected: number; attendanceRatePercent: number | null; insufficientSample: boolean; requiredSessions: number; series: Array<{ date: string; score: number; ma: number; classMa: number | null; topic: string | null }> };
export type MorningTopicAverage = { topic: string; subjectId: string; subjectName: string; count: number; internalAvg: number | null; externalAvg: number | null };
export type MorningCohortAnalysis = {
 examType: { id: string; name: string }; subjects: AnalysisSubject[]; subjectDefinitions: AnalysisSubject[]; range: MorningRange; settings: ExamAnalysisSettings; sessionCount: number;
 heatmap: Array<{ date: string; subjectId: string; internalAvg: number | null; externalAvg: number | null; count: number; topic: string | null }>;
 subjectTrends: Array<{ subjectId: string; name: string; series: Array<{ date: string; internalAvg: number | null; externalAvg: number | null }> }>;
 dailyWrongTop: Array<{ date: string; subjectId: string; subjectName: string; items: Array<{ itemNo: number; answerKey: string; internalCorrectRatePct: number; externalCorrectRatePct: number }> }>;
 declines: Array<{ studentId: string; name: string; subjectId: string; subjectName: string; flags: MorningFlag[] }>;
 lowAttendance: Array<{ studentId: string; name: string; attended: number; expected: number; ratePercent: number }>;
 studentSubjects: Array<MorningSubjectSummary & { studentId: string; name: string; subjectName: string; studentNumber: string }>;
 topics: MorningTopicAverage[]; insufficientSample: boolean;
};
export type MorningStudentReport = {
 student: { id: string; name: string | null; studentNumber: string }; examType: { id: string; name: string }; subjectDefinitions: AnalysisSubject[]; range: MorningRange; settings: ExamAnalysisSettings;
 summary: { average: number | null; externalGap: number | null; internalGap: number | null; attendanceRatePercent: number | null; thisWeekRank: number | null; rankDelta: number | null; attended: number; expected: number };
 subjects: MorningSubjectSummary[];
 topics: Array<{ topic: string; subjectId: string; count: number; myAvg: number | null; internalAvg: number | null; gap: number | null }>;
 dailyItems: Array<{ date: string; subjectId: string; subjectName: string; topic: string | null; easyMissed: ReturnType<typeof itemDiagnostics>['easyMissed']; wrongTop5: ReturnType<typeof itemDiagnostics>['killerTop5']; diagnostics: ReturnType<typeof itemDiagnostics>; external: AnalysisRank }>;
 cumulativeGap: { cumulativeAvg: number; progressAvg: number; gap: number; pairedWeeks: number } | null;
 weeklyRanks: Array<Omit<MorningWeeklyRank, 'studentId'>>;
};
