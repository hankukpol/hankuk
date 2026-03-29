import SiteContentLinks from "./_components/SiteContentLinks";
import SiteSubTabNav from "./_components/SiteSubTabNav";

export default function AdminSiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">시스템-사이트 설정</h1>
        <p className="mt-1 text-sm text-slate-600">
          사이트 문구, 약관, 기능 활성화, 잠금 안내, 운영 정책을 서브 탭으로 나누어 관리합니다.
        </p>
        <SiteContentLinks />
      </header>

      <SiteSubTabNav />

      {children}
    </div>
  );
}
