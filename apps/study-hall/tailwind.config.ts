import type { Config } from "tailwindcss";

/**
 * 디자인 토큰은 app/globals.css 의 --admin-* 변수 한 곳에서만 정의한다.
 * 여기서는 기존 마크업이 쓰는 Tailwind 팔레트를 그 토큰에 연결만 한다.
 * 자세한 규칙은 DESIGN.md 참고.
 */
const token = (name: string) => `rgb(var(--admin-${name}-rgb) / <alpha-value>)`;

/** 중립 회색 계열 → 면·선·글자 토큰 */
const neutralScale = {
  50: token("surface-soft"),
  100: token("surface-muted"),
  200: token("line-soft"),
  300: token("line"),
  400: token("text-muted"),
  500: token("text-muted"),
  600: token("text-muted"),
  700: token("text-secondary"),
  800: token("sidebar-hover"),
  900: token("text"),
  950: token("text"),
};

/** 파랑 계열 → 직렬 강조색 토큰 */
const accentScale = {
  50: token("accent-soft"),
  100: token("accent-tint"),
  200: token("accent-line"),
  300: token("accent-line"),
  400: token("accent"),
  500: token("accent"),
  600: token("accent"),
  700: token("accent-hover"),
  800: token("accent-hover"),
  900: token("accent-hover"),
};

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // 상태색 클래스 문자열이 lib/*-meta.ts 에서 만들어진다. 빠지면 조용히 생성되지 않는다.
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-pretendard)",
          "Pretendard",
          "Apple SD Gothic Neo",
          "Malgun Gothic",
          "sans-serif",
        ],
      },
      fontSize: {
        // DESIGN.md 3절 타입 규격에 기존 유틸을 매핑한다.
        // 표 본문 13px, 일반 본문 15px, 섹션 제목 16px, 페이지·모달 제목 20px.
        xs: ["var(--admin-type-caption)", { lineHeight: "1.5" }],
        sm: ["var(--admin-type-body)", { lineHeight: "1.5" }],
        base: ["var(--admin-type-body)", { lineHeight: "1.5" }],
        lg: ["var(--admin-type-section)", { lineHeight: "1.3" }],
        xl: ["var(--admin-type-section)", { lineHeight: "1.3" }],
        "2xl": ["var(--admin-type-title)", { lineHeight: "1.3" }],
        "3xl": ["var(--admin-type-title)", { lineHeight: "1.3" }],
        "4xl": ["32px", { lineHeight: "1.2" }],
        "5xl": ["32px", { lineHeight: "1.2" }],
      },
      fontWeight: {
        // DESIGN.md 3절 — 굵기는 본문 400 / 강조 600 / 제목 700 세 단계뿐이다.
        // 기존 마크업의 medium(500)·extrabold(800)을 이 세 단계로 흡수한다.
        normal: "400",
        medium: "600",
        semibold: "600",
        bold: "700",
        extrabold: "700",
        black: "700",
      },
      letterSpacing: {
        tight: "0",
        tighter: "0",
        normal: "0",
        wide: "0",
        wider: "0",
        widest: "0",
      },
      borderRadius: {
        // 모서리는 8px 하나. 표·탭·드로어는 rounded-none 으로 명시한다.
        DEFAULT: "var(--admin-radius)",
        sm: "var(--admin-radius)",
        md: "var(--admin-radius)",
        lg: "var(--admin-radius)",
        xl: "var(--admin-radius)",
        "2xl": "var(--admin-radius)",
        "3xl": "var(--admin-radius)",
      },
      boxShadow: {
        // 모달·작업 메뉴 전용. 일반 섹션과 카드에는 그림자를 쓰지 않는다.
        dialog: "var(--admin-dialog-shadow)",
        card: "none",
        "card-hover": "none",
        header: "none",
      },
      colors: {
        background: "var(--admin-surface)",
        foreground: "var(--admin-text)",

        // 디자인 토큰 직접 접근용
        admin: {
          surface: token("surface"),
          "surface-soft": token("surface-soft"),
          "surface-muted": token("surface-muted"),
          "surface-strong": token("surface-strong"),
          line: token("line"),
          "line-soft": token("line-soft"),
          grid: token("grid"),
          text: token("text"),
          "text-secondary": token("text-secondary"),
          "text-muted": token("text-muted"),
          "text-disabled": token("text-disabled"),
          accent: token("accent"),
          "accent-hover": token("accent-hover"),
          "accent-soft": token("accent-soft"),
          "accent-tint": token("accent-tint"),
          "accent-line": token("accent-line"),

          // 상태색: 업무 의미가 있어 강조색으로 치환하지 않는다 (DESIGN.md 2절)
          danger: token("danger"),
          "danger-soft": token("danger-soft"),
          "danger-line": token("danger-line"),
          warning: token("warning"),
          "warning-soft": token("warning-soft"),
          "warning-line": token("warning-line"),
          success: token("success"),
          "success-soft": token("success-soft"),
          "success-line": token("success-line"),
        },

        // 기존 마크업 호환: 중립·강조 계열을 토큰으로 연결
        slate: neutralScale,
        gray: neutralScale,
        zinc: neutralScale,
        neutral: neutralScale,
        blue: accentScale,
        indigo: accentScale,
        sky: accentScale,

        // 직렬 색상 fallback (DB 미설정 시)
        police: {
          DEFAULT: "#1B4FBB",
          light: "#EBF0FB",
          dark: "#0D2D6B",
        },
        fire: {
          DEFAULT: "#C55A11",
          light: "#FEF3EC",
          dark: "#7A3608",
        },
        // 출결 상태색: 업무 의미가 있으므로 강조색으로 치환하지 않는다.
        attend: {
          present: "#16A34A",
          tardy: "#CA8A04",
          absent: "#DC2626",
          excused: "#2563EB",
          holiday: "#6B7280",
          unprocessed: "#F97316",
        },
        warn: {
          1: "#EAB308",
          2: "#F97316",
          interview: "#DC2626",
          withdraw: "#7F1D1D",
        },
      },
    },
  },
  plugins: [],
};
export default config;
