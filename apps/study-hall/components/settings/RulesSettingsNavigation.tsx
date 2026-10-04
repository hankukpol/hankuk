import Link from "next/link";

/** 운영 규칙의 2단 메뉴. 다른 2차 메뉴와 같은 회색 트랙 선택 칩이다(DESIGN.md 0절). 그 아래 화면 안 구분은 밑줄 탭이다. */
export function RulesSettingsNavigation({ divisionSlug, active }: {
  divisionSlug: string;
  active: "rules" | "policy" | "arrivals";
}) {
  const items = [
    { id: "rules", label: "기준·상벌점", suffix: "" },
    { id: "policy", label: "관리규정·휴대폰", suffix: "?section=policy" },
    { id: "arrivals", label: "등원·기기 승인", suffix: "/arrivals" },
  ];
  return <nav aria-label="운영 규칙 메뉴" className="admin-subtabs admin-subtabs-scroll">
    {items.map(item => <Link key={item.id}
      className="admin-subtab"
      aria-current={active === item.id ? "page" : undefined}
      href={`/${divisionSlug}/admin/settings/rules${item.suffix}`}>{item.label}</Link>)}
  </nav>;
}
