export type ExamType = 'police' | 'fire';

export type AgeBracket = 'A' | 'B' | 'C' | 'D';

export interface Member {
  id: string;
  name: string;
  phone: string;
  gender: 'male' | 'female';
  series: string;
  region: string;
  score?: number;
  age?: number;
  interviewExperience?: boolean | null;
  preAssignedGroup?: number;
}

export interface PenaltyWeights {
  gender: number;
  ageBracket: number;
  region: number;
  series: number;
  score: number;
  interviewExperience: number;
}

export interface GroupSettings {
  examType: ExamType;
  groupSize: {
    min: number;
    max: number;
  };
  genderRatio: {
    mode: 'auto' | 'manual';
    maleRatio?: number;
    femaleRatio?: number;
  };
  forceAssignRules: ForceAssignRule[];
  usePreAssignment: boolean;
  penaltyWeights: PenaltyWeights;
  pairRequiredSeries: string[]; // 0명 또는 2명 이상 배치해야 하는 직렬
}

export interface ForceAssignRule {
  id: string;
  series: string;
  countPerGroup: number;
}

export interface StudyGroup {
  groupNumber: number;
  members: Member[];
}

export interface OptimizationMetrics {
  totalPenalty: number;
  iterations: number;
  swapsPerformed: number;
  penaltyBreakdown: PenaltyWeights;
}

export interface AssignmentResult {
  groups: StudyGroup[];
  warnings: string[];
  metrics?: OptimizationMetrics;
  lockedMemberIds?: string[];
}

export interface ExamConfig {
  examType: ExamType;
  label: string;
  seriesList: string[];
  defaultSettings: GroupSettings;
}
