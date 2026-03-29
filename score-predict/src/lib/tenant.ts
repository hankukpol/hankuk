export type TenantType = "fire" | "police";

export const TENANT_HEADER = "x-hankuk-division";
export const TENANT_COOKIE = "hankuk_division";
export const TENANT_TYPES: TenantType[] = ["police", "fire"];
export const DEFAULT_TENANT_TYPE: TenantType =
  process.env.NEXT_PUBLIC_TENANT_TYPE === "police" ? "police" : "fire";

export interface TenantConfig {
  type: TenantType;
  siteTitle: string;
  siteDescription: string;
  footerDisclaimer: string;
  authMode: "phone" | "username";
  loginIdentifierLabel: string;
  loginIdentifierPlaceholder: string;
  loginErrorMessage: string;
  forgotPasswordLabel: string;
  registerFields: {
    contactPhone: boolean;
    email: boolean;
    username: boolean;
  };
  examTypeLabels: Record<string, string>;
  examCategory: string;
  features: {
    preRegistration: boolean;
    certificateBonus: boolean;
    totalCutoff: boolean;
    visitorTracker: boolean;
    genderSplitRecruitment: boolean;
    recoveryCode: boolean;
    adminLoginLink: boolean;
  };
}

const FIRE_CONFIG: TenantConfig = {
  type: "fire",
  siteTitle: "소방 합격예측",
  siteDescription: "소방공무원 채용시험 OMR 채점 및 합격 가능성 분석 서비스",
  footerDisclaimer:
    "최종 발표 결과는 소방청 및 시도소방본부의 공식 공고를 반드시 확인해 주세요.",
  authMode: "phone",
  loginIdentifierLabel: "휴대전화",
  loginIdentifierPlaceholder: "010-1234-5678",
  loginErrorMessage: "휴대전화 또는 비밀번호가 올바르지 않습니다.",
  forgotPasswordLabel: "복구코드로 비밀번호 재설정",
  registerFields: {
    contactPhone: false,
    email: false,
    username: false,
  },
  examTypeLabels: {
    PUBLIC: "공채",
    CAREER_RESCUE: "구조 경채",
    CAREER_ACADEMIC: "소방학과 경채",
    CAREER_EMT: "구급 경채",
  },
  examCategory: "소방 1차",
  features: {
    preRegistration: false,
    certificateBonus: true,
    totalCutoff: true,
    visitorTracker: false,
    genderSplitRecruitment: true,
    recoveryCode: true,
    adminLoginLink: false,
  },
};

const POLICE_CONFIG: TenantConfig = {
  type: "police",
  siteTitle: "한국경찰학원 합격예측",
  siteDescription: "경찰 채용 필기시험 OMR 채점 및 합격 가능성 분석 서비스",
  footerDisclaimer:
    "최종 발표 결과는 경찰청 및 시도경찰청의 공식 공고를 반드시 확인해 주세요.",
  authMode: "username",
  loginIdentifierLabel: "아이디",
  loginIdentifierPlaceholder: "아이디를 입력해 주세요",
  loginErrorMessage: "아이디 또는 비밀번호가 올바르지 않습니다.",
  forgotPasswordLabel: "비밀번호 찾기",
  registerFields: {
    contactPhone: true,
    email: true,
    username: true,
  },
  examTypeLabels: {
    PUBLIC: "공채",
    CAREER: "경행경채",
  },
  examCategory: "경찰 1차",
  features: {
    preRegistration: true,
    certificateBonus: false,
    totalCutoff: false,
    visitorTracker: true,
    genderSplitRecruitment: false,
    recoveryCode: false,
    adminLoginLink: true,
  },
};

function readBrowserCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  const entry = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

export function normalizeTenantType(value: string | null | undefined): TenantType | null {
  if (value === "police" || value === "fire") {
    return value;
  }

  return null;
}

export function parseTenantTypeFromPathname(pathname: string | null | undefined): TenantType | null {
  if (!pathname) {
    return null;
  }

  const match = pathname.match(/^\/(police|fire)(?=\/|$)/);
  return match ? normalizeTenantType(match[1]) : null;
}

export function stripTenantPrefix(pathname: string): string {
  const nextPath = pathname.replace(/^\/(?:police|fire)(?=\/|$)/, "");
  return nextPath === "" ? "/" : nextPath;
}

export function withTenantPrefix(pathname: string, tenant: TenantType): string {
  const sanitized = pathname === "" ? "/" : pathname;
  const stripped = stripTenantPrefix(sanitized);
  return stripped === "/" ? `/${tenant}` : `/${tenant}${stripped}`;
}

export function getTenantConfigByType(type: TenantType): TenantConfig {
  return type === "police" ? POLICE_CONFIG : FIRE_CONFIG;
}

export function getTenantType(): TenantType {
  if (typeof window === "undefined") {
    return DEFAULT_TENANT_TYPE;
  }

  return (
    parseTenantTypeFromPathname(window.location.pathname) ??
    normalizeTenantType(readBrowserCookie(TENANT_COOKIE)) ??
    DEFAULT_TENANT_TYPE
  );
}

export function getTenantConfig(): TenantConfig {
  return getTenantConfigByType(getTenantType());
}
