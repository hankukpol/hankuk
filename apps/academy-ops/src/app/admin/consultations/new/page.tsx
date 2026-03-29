import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ConsultationForm } from "./consultation-form";

export const dynamic = "force-dynamic";

export default async function NewConsultationPage() {
  const context = await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  // Load staff list (AdminUsers) for the staff selector
  const staffList = await prisma.adminUser
    .findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    })
    .catch(() => [] as { id: string; name: string; role: string }[]);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/consultations" className="transition hover:text-ink">
          상담 관리
        </Link>
        <span>/</span>
        <span className="text-ink">신규 상담 등록</span>
      </nav>

      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        상담 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">신규 상담 등록</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        새 상담 방문 내용을 기록합니다. 학생 검색 후 상담 유형과 내용을 입력하세요.
      </p>

      <div className="mt-8">
        <ConsultationForm
          defaultCounselorName={context.adminUser.name}
          staffList={staffList}
        />
      </div>
    </div>
  );
}
