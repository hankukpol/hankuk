import Link from "next/link";

/**
 * 시험 성적 메뉴의 1차 탭(DESIGN.md 0절 13항). 주소로 바뀌는 탭이라 새로고침해도 같은 화면이 열린다.
 * 성적 입력 = 매일 입력·가져오기, 성적 분석 = 반 전체·학생별·개인 분석. 아침/정기는 각 탭 안의 2차 선택이다.
 */
export function ExamRouteTabs({ division, active }: { division: string; active: "input" | "analysis" }) {
  const items = [
    { id: "input", label: "성적 입력", href: `/${division}/admin/exams` },
    { id: "analysis", label: "성적 분석", href: `/${division}/admin/exams/analysis` },
  ] as const;

  return (
    <nav className="admin-tabs" aria-label="시험 성적 화면">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="admin-tab"
          data-active={item.id === active}
          aria-current={item.id === active ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
