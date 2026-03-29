import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { InstructorEditForm } from "./instructor-edit-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function InstructorEditPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.DIRECTOR);
  const { id } = await params;

  const instructor = await getPrisma().instructor.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      subject: true,
      phone: true,
      email: true,
      bankName: true,
      bankAccount: true,
      bankHolder: true,
      isActive: true,
    },
  });

  if (!instructor) notFound();

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/settings/instructors" className="hover:text-ink">
          강사 목록
        </Link>
        <span>/</span>
        <Link href={`/admin/settings/instructors/${id}`} className="hover:text-ink">
          {instructor.name}
        </Link>
        <span>/</span>
        <span className="text-ink">수정</span>
      </nav>

      <div className="mt-4 inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        강사 관리
      </div>

      <div className="mt-5 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{instructor.name} 수정</h1>
          <p className="mt-1 text-sm text-slate">강사 기본 정보 및 정산 계좌를 수정합니다.</p>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
            instructor.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {instructor.isActive ? "재직중" : "퇴직"}
        </span>
      </div>

      <InstructorEditForm instructor={instructor} />
    </div>
  );
}
