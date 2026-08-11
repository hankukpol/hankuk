export type DifficultyLevel = "VERY_EASY" | "EASY" | "NORMAL" | "HARD" | "VERY_HARD";

export interface ResultSubjectAnswer {
  questionNumber: number;
  selectedAnswer: number;
  isCorrect: boolean;
  correctAnswer: number | null;
  correctRate: number;
  difficultyLevel: "EASY" | "NORMAL" | "HARD" | "VERY_HARD";
}

export interface ResultScore {
  subjectId: number;
  subjectName: string;
  questionCount: number;
  pointPerQuestion: number;
  correctCount: number;
  rawScore: number;
  maxScore: number;
  bonusScore: number;
  finalScore: number;
  isCutoff: boolean;
  cutoffScore: number;
  rank: number | null;
  percentile: number | null;
  totalParticipants: number;
  difficulty: DifficultyLevel | null;
  answers: ResultSubjectAnswer[];
}

export interface ResultSubjectCorrectRateSummary {
  subjectId: number;
  subjectName: string;
  averageCorrectRate: number | null;
  hardestQuestion: number | null;
  hardestRate: number | null;
  easiestQuestion: number | null;
  easiestRate: number | null;
  myCorrectOnHard: number;
  myWrongOnEasy: number;
}

export interface ResultResponse {
  features: {
    finalPredictionEnabled: boolean;
  };
  pending?: {
    isPending: boolean;
    message: string;
  };
  submission: {
    id: number;
    isOwner: boolean;
    examId: number;
    examName: string;
    examYear: number;
    examRound: number;
    examType: "PUBLIC" | "CAREER" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";
    regionId: number;
    regionName: string;
    gender: "MALE" | "FEMALE";
    examNumber: string | null;
    totalScore: number;
    finalScore: number;
    scoringStatus: "PENDING" | "SCORED";
    isSuspicious: boolean;
    suspicionStatus: "CLEAR" | "REVIEW" | "EXCLUDED";
    rankingWithheld: boolean;
    bonusType: "NONE" | "VETERAN_5" | "VETERAN_10" | "HERO_3" | "HERO_5";
    bonusRate: number;
    certificateBonus: number;
    createdAt: string;
    editCount: number;
    maxEditLimit: number;
  };
  scores: ResultScore[];
  subjectCorrectRateSummaries: ResultSubjectCorrectRateSummary[];
  analysisSummary: {
    examType: "PUBLIC" | "CAREER" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";
    subjects: Array<{
      subjectId: number;
      subjectName: string;
      myScore: number;
      maxScore: number;
      myRank: number | null;
      totalParticipants: number;
      correctCount: number;
      questionCount: number;
      topPercent: number | null;
      percentile: number | null;
      percentileAvailable: boolean;
      averageScore: number;
      highestScore: number;
      lowestScore: number;
      top10Average: number;
      top30Average: number;
    }>;
    total: {
      myScore: number;
      maxScore: number;
      myRank: number | null;
      totalParticipants: number;
      correctCount: number;
      questionCount: number;
      topPercent: number | null;
      percentile: number | null;
      percentileAvailable: boolean;
      averageScore: number;
      highestScore: number;
      lowestScore: number;
      top10Average: number;
      top30Average: number;
    };
  };
  participantStatus: {
    currentRank: number | null;
    totalParticipants: number;
    topPercent: number | null;
    percentile: number | null;
    percentileAvailable: boolean;
    lastUpdated: string;
  };
  bonusApplication?: {
    status: "NONE" | "APPLIED" | "NOT_APPLIED" | "PENDING";
    reason:
      | "NONE"
      | "APPLIED_STANDARD"
      | "APPLIED_APPLICANT_EXCEPTION"
      | "CUTOFF"
      | "BELOW_MIN_RECRUIT_COUNT"
      | "MISSING_APPLICANT_COUNT";
    declaredRate: number;
    effectiveRate: number;
    minRecruitCount: number | null;
    message: string | null;
  } | null;
  statistics: {
    totalParticipants: number;
    totalRank: number | null;
    topPercent: number | null;
    totalPercentile: number | null;
    percentileAvailable: boolean;
    hasCutoff: boolean;
    rankingBasis: "ALL_PARTICIPANTS" | "NON_CUTOFF_PARTICIPANTS";
    cutoffSubjects: Array<{
      subjectName: string;
      rawScore: number;
      maxScore: number;
      cutoffScore: number;
    }>;
    bonusScore: number;
  };
}
