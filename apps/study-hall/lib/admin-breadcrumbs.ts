/**
 * 관리자 화면 위치 표시(브레드크럼)의 메뉴 아래 단계 이름.
 * 메뉴(사이드바)까지는 AdminSidebar 의 목록이 원본이고, 여기에는 메뉴 아래 하위 화면만 적는다.
 * 경로는 `/[division]/admin/` 뒤의 상대 경로다. href 는 같은 기준의 상대 경로이며 없으면 링크가 아니다.
 */

export type BreadcrumbStep = { label: string; href?: string };

// 설정 경로 탭(SettingsPageShell 의 SETTINGS_TABS)과 같은 이름이다.
const SETTINGS_STEPS: Record<string, string> = {
  "settings/templates": "설정 템플릿",
  "settings/general": "기본 정보",
  "settings/features": "기능",
  "settings/periods": "교시",
  "settings/rules": "운영 규칙",
  "settings/tuition": "등록 금액",
  "settings/seats": "자습실·좌석",
  "settings/exams": "시험 템플릿",
  "settings/exam-schedules": "시험 일정",
  "settings/exam-analysis": "성적 분석 기준",
  "points/rules": "상벌점 규칙",
  staff: "직원",
};

const RULES: Array<{ pattern: RegExp; steps: (match: RegExpMatchArray) => BreadcrumbStep[] }> = [
  { pattern: /^settings\/rules\/arrivals$/, steps: () => [{ label: "운영 규칙", href: "settings/rules" }, { label: "등원 설정" }] },
  { pattern: /^(settings\/[a-z-]+|points\/rules|staff)$/, steps: (m) => (SETTINGS_STEPS[m[1]] ? [{ label: SETTINGS_STEPS[m[1]] }] : []) },
  { pattern: /^students\/new$/, steps: () => [{ label: "학생 등록" }] },
  { pattern: /^students\/([^/]+)\/report$/, steps: (m) => [{ label: "학생 상세", href: `students/${m[1]}` }, { label: "상담 자료" }] },
  { pattern: /^students\/([^/]+)\/interviews$/, steps: (m) => [{ label: "학생 상세", href: `students/${m[1]}` }, { label: "면담 일지" }] },
  { pattern: /^students\/([^/]+)$/, steps: () => [{ label: "학생 상세" }] },
  { pattern: /^exams$/, steps: () => [{ label: "성적 입력" }] },
  { pattern: /^attendance\/import$/, steps: () => [{ label: "누적시험 응시 여부 가져오기" }] },
  { pattern: /^exams\/(?:preview\/)?analysis$|^exams\/preview$/, steps: () => [{ label: "성적 분석" }] },
  { pattern: /^exams\/(preview\/)?students\/[^/]+$/, steps: (m) => [{ label: "성적 분석", href: m[1] ? "exams/preview" : "exams/analysis" }, { label: "개인 분석" }] },
  { pattern: /^exams\/(?:preview\/)?learning$/, steps: () => [{ label: "성적 분석 기준" }] },
];

/** 메뉴 아래 단계. 메뉴 첫 화면이거나 모르는 경로면 빈 배열. */
export function breadcrumbSteps(relativePath: string): BreadcrumbStep[] {
  const path = relativePath.replace(/^\/+|\/+$/g, "");
  for (const rule of RULES) {
    const match = path.match(rule.pattern);
    if (match) return rule.steps(match);
  }
  return [];
}
