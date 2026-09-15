import Link from "next/link";

export function RulesSettingsNavigation({ divisionSlug, active }: {
  divisionSlug: string;
  active: "rules" | "policy" | "arrivals";
}) {
  const items = [
    { id: "rules", label: "기준·상벌점", suffix: "" },
    { id: "policy", label: "관리규정·휴대폰", suffix: "?section=policy" },
    { id: "arrivals", label: "등원·기기 승인", suffix: "/arrivals" },
  ];
  return <nav aria-label="운영 규칙 메뉴" className="flex flex-wrap gap-2">
    {items.map(item => <Link key={item.id}
      className={`admin-button ${active === item.id ? "admin-button-primary" : "admin-button-secondary"}`}
      aria-current={active === item.id ? "page" : undefined}
      href={`/${divisionSlug}/admin/settings/rules${item.suffix}`}>{item.label}</Link>)}
  </nav>;
}
