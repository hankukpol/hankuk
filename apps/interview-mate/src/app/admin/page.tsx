import Link from "next/link";
import { redirect } from "next/navigation";

import { hasAdminSession, isAdminPasswordConfigured } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { SectionCard } from "@/components/ui/section-card";

function AdminAccessCard({
  title,
  description,
  body,
}: {
  title: string;
  description: string;
  body: string;
}) {
  return (
    <main className="admin-container">
      <SectionCard title={title} description={description}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">{body}</p>
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

export default function AdminPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <AdminAccessCard
        title="관리자 비밀번호 미설정"
        description="환경변수 `ADMIN_PASSWORD`가 있어야 관리자 페이지를 사용할 수 있습니다."
        body="`.env.local` 또는 배포 환경변수에 `ADMIN_PASSWORD`를 추가한 뒤 다시 접속하세요. 세션 서명을 분리하려면 `ADMIN_SESSION_SECRET`도 함께 설정하는 편이 안전합니다."
      />
    );
  }

  if (!hasAdminSession()) {
    redirect("/admin/login");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AdminDashboard adminKey="" />
    </main>
  );
}
