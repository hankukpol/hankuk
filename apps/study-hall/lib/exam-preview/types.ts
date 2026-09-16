import type { RegularStudentReport, RegularCohortAnalysis } from '@/lib/exam-analysis-types';
import type { MorningStudentReport, MorningCohortAnalysis } from '@/lib/morning-exam-analysis-types';

export type Comparison = {
  sessionId: string; date: string; subjectId: string; subjectName: string; topic: string | null;
  fullScore: number | null; my: number | null; internal: number | null; external: number | null;
  top10: number | null; top30: number | null; internalCount: number; externalCount: number | null;
  externalFileCount: number; internalRank: number | null; externalRank: number | null;
};
export type PreviewItem = {
  id: string; sessionId: string; date: string; subjectId: string; subjectName: string; itemNo: number;
  answerKey: string; answer: string | null; correct: boolean | null; points: number;
  externalRate: number | null; internalRate: number | null; responseCount: number;
  choices: Record<string, number>; mostCommonWrong: string | null;
};
export type PreviewData = {
  isPreview?: boolean;
  kind: 'regular' | 'morning'; scope: 'student' | 'cohort'; examType: { id: string; name: string };
  student: { id: string; name: string; studentNumber: string } | null;
  range: { from: string; to: string }; dates: string[];
  subjects: { id: string; name: string }[]; comparisons: Comparison[]; items: PreviewItem[];
  easyThreshold: number;
  legacyResults?: {id:string;date:string|null;total:number|null;rank:number|null;notes:string|null;scores:Record<string,number|null>}[];
  totalHistory?: ReturnType<typeof import('./total-history').totalHistory>;
  regular?: RegularStudentReport;
  peerOverallRanks?: (number | null)[]; morning?: MorningStudentReport;
  regularCohort?: RegularCohortAnalysis; morningCohort?: MorningCohortAnalysis;
  records: { id: string; date: string | null; subject: string; score: number | null; fullScore: number | null; source: string }[];
  counseling?: { from: string; to: string; present: number; tardy: number; absent: number; other: number; submitted: number; notSubmitted: number; rented: number };
};
