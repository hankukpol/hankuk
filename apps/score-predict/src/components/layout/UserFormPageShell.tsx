import type { ReactNode } from "react";

interface UserFormPageShellProps {
  title: string;
  description?: ReactNode;
  /** 회원가입처럼 입력 항목이 많은 화면만 넓은 컬럼을 사용한다. */
  width?: "default" | "wide";
  children: ReactNode;
}

/**
 * 로그인·회원가입·계정 찾기 같은 사용자 폼 화면의 공통 셸.
 *
 * 합격예측 데이터 화면(`exam/*`)과 같은 `user-content-frame` 기준선 위에서
 * 좁은 중앙 컬럼만 사용한다. 상단 여백 100px과 `user-page-title`은
 * 시험 화면 레이아웃(`src/app/exam/layout.tsx`)과 동일한 값이다.
 * 사용자 화면 규칙에 따라 폼을 둥근 테두리 카드로 감싸지 않고,
 * 제목과 본문은 구분선 하나로만 나눈다.
 */
export default function UserFormPageShell({
  title,
  description,
  width = "default",
  children,
}: UserFormPageShellProps) {
  return (
    <main className="pb-16">
      <div className="user-content-frame pt-[100px]">
        <div
          className={`mx-auto w-full ${width === "wide" ? "max-w-[560px]" : "max-w-[480px]"}`}
        >
          <h1 className="user-page-title">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          ) : null}
          <div className="mt-6 border-t border-slate-200 pt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
