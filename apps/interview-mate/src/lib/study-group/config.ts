import { ExamConfig, GroupSettings, PenaltyWeights } from './types';

const defaultGenderRatio: GroupSettings['genderRatio'] = {
  mode: 'auto',
};

export const DEFAULT_PENALTY_WEIGHTS: PenaltyWeights = {
  gender: 2.5,
  ageBracket: 2.0,
  region: 4.0,
  series: 1.0,
  score: 1.5,
  interviewExperience: 1.5,
};

function createDefaultSettings(examType: 'police' | 'fire'): GroupSettings {
  return {
    examType,
    groupSize: { min: 8, max: 10 },
    genderRatio: { ...defaultGenderRatio },
    forceAssignRules: [],
    usePreAssignment: true,
    penaltyWeights: { ...DEFAULT_PENALTY_WEIGHTS },
    pairRequiredSeries: [],
  };
}

export const POLICE_CONFIG: ExamConfig = {
  examType: 'police',
  label: '경찰',
  seriesList: ['일반', '경채', '101경비단', '경행', '법무회계', '사이버', '인사'],
  defaultSettings: createDefaultSettings('police'),
};

export const FIRE_CONFIG: ExamConfig = {
  examType: 'fire',
  label: '소방',
  seriesList: ['공채', '구급', '구조', '학과', '화학', '정보통신'],
  defaultSettings: createDefaultSettings('fire'),
};

export function getConfig(examType: 'police' | 'fire'): ExamConfig {
  return examType === 'police' ? POLICE_CONFIG : FIRE_CONFIG;
}
