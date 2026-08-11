export type ExamOperationStageKey =
  | "RELEASED"
  | "ANSWER_INPUT"
  | "PRE_REGISTRATION"
  | "CLOSED";

export interface ExamOperationStage {
  key: ExamOperationStageKey;
  label: string;
  description: string;
}

export function resolveExamOperationStage(params: {
  preRegistrationEnabled: boolean;
  answerInputEnabled: boolean;
  latestReleaseNumber: number | null;
}): ExamOperationStage {
  if (params.latestReleaseNumber !== null) {
    return {
      key: "RELEASED",
      label: `${params.latestReleaseNumber}차 표본 집계 공개`,
      description: "관리자가 발표한 최신 표본 집계를 확인할 수 있습니다.",
    };
  }

  if (params.answerInputEnabled) {
    return {
      key: "ANSWER_INPUT",
      label: "답안 입력 진행 중",
      description: "OMR 답안을 입력하면 채점 결과와 표본 분석을 확인할 수 있습니다.",
    };
  }

  if (params.preRegistrationEnabled) {
    return {
      key: "PRE_REGISTRATION",
      label: "응시정보 사전등록",
      description: "시험 당일 빠른 채점을 위해 응시지역과 수험번호를 미리 등록해 주세요.",
    };
  }

  return {
    key: "CLOSED",
    label: "운영 준비 중",
    description: "현재 시험 운영 기능이 닫혀 있습니다. 공지사항에서 오픈 일정을 확인해 주세요.",
  };
}

export function getExamOperationWarnings(params: {
  examDate: Date | null;
  now?: Date;
  preRegistrationEnabled: boolean;
  answerInputEnabled: boolean;
  resultEnabled: boolean;
  latestReleaseNumber: number | null;
}): string[] {
  const warnings: string[] = [];
  const now = params.now ?? new Date();

  if (!params.preRegistrationEnabled && !params.answerInputEnabled) {
    warnings.push("사전등록과 답안 입력이 모두 꺼져 있습니다.");
  }

  if (params.examDate && now.getTime() >= params.examDate.getTime() && !params.answerInputEnabled) {
    warnings.push("시험일이 시작됐지만 답안 입력이 꺼져 있습니다.");
  }

  if (params.latestReleaseNumber !== null && !params.resultEnabled) {
    warnings.push("표본 집계가 발표됐지만 성적 분석 화면이 닫혀 있습니다.");
  }

  return warnings;
}

export function resolveLandingHeroCopy(params: {
  serviceName: "경찰" | "소방";
  operationStage: ExamOperationStage;
  answerInputEnabled: boolean;
  preRegistrationEnabled: boolean;
  isAuthenticated: boolean;
  hasSubmission: boolean;
  fallbackTitle: string;
  fallbackSubtitle: string;
}) {
  const { serviceName, operationStage } = params;

  if (params.answerInputEnabled && !params.hasSubmission) {
    return {
      title: `${serviceName} 필기시험 빠른 채점`,
      subtitle: "OMR 답안을 입력하면 정확한 점수와 과락 여부, 문항별 정답률, 지역별 표본 순위를 확인할 수 있습니다.",
      primaryText: params.isAuthenticated ? "빠른 채점 시작" : "로그인 후 빠른 채점",
      secondaryText: params.isAuthenticated ? "이용 안내" : "회원가입",
    };
  }

  if (params.hasSubmission) {
    return {
      title: `${serviceName} 필기시험 성적 분석`,
      subtitle: "내 점수와 과락 여부, 문항별 분석, 본 서비스 참여자 기준 지역 표본 순위를 확인하세요.",
      primaryText: "내 성적 확인",
      secondaryText: operationStage.key === "RELEASED" ? "최신 표본 집계" : "답안 수정",
    };
  }

  if (params.preRegistrationEnabled) {
    return {
      title: `${serviceName} 필기시험 응시정보 사전등록`,
      subtitle: "시험 당일 빠른 채점을 위해 응시지역과 수험번호를 미리 등록해 주세요.",
      primaryText: params.isAuthenticated ? "응시정보 사전등록" : "로그인 후 사전등록",
      secondaryText: params.isAuthenticated ? "이용 안내" : "회원가입",
    };
  }

  if (operationStage.key === "RELEASED") {
    return {
      title: `${operationStage.label}`,
      subtitle: "현재 활성 지역의 발표 표본 수와 표본 1배수 지점을 확인할 수 있습니다.",
      primaryText: params.isAuthenticated ? "최신 집계 확인" : "로그인 후 내 성적 확인",
      secondaryText: params.isAuthenticated ? "공지사항" : "회원가입",
    };
  }

  return {
    title: params.fallbackTitle,
    subtitle: params.fallbackSubtitle,
    primaryText: params.isAuthenticated ? "풀서비스 확인" : "로그인 후 확인",
    secondaryText: params.isAuthenticated ? "공지사항" : "회원가입",
  };
}
