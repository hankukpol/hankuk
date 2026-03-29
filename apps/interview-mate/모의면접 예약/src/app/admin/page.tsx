import Link from "next/link";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { SectionCard } from "@/components/ui/section-card";

type AdminPageProps = {
  searchParams?: {
    key?: string;
  };
};

export default function AdminPage({ searchParams }: AdminPageProps) {
  const hasKey = Boolean(searchParams?.key);

  if (!hasKey) {
    return (
      <main className="admin-container">
        <SectionCard
          title="관리자 접근 키 필요"
          description="관리자 페이지는 ?key=ADMIN_SECRET 형식으로 접근합니다."
        >
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              아직 실제 인증 로직은 연결하지 않았습니다. 다음 단계에서
              환경변수 `ADMIN_KEY`와 API 검증을 연결합니다.
            </p>
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
              메인으로 돌아가기
            </Link>
          </div>
        </SectionCard>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AdminDashboard adminKey={searchParams?.key ?? ""} />
    </main>
  );
}
