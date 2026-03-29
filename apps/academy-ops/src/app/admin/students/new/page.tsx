import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { NewStudentForm } from "./new-student-form";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/students" className="transition hover:text-ink">
          수강생 목록
        </Link>
        <span>/</span>
        <span className="text-ink">신규 등록</span>
      </nav>

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-02 Students · New
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수강생 신규 등록</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        새 수강생의 학번, 이름, 연락처를 포함한 기본 정보를 입력하여 등록합니다. 학번은 학원에서
        부여하는 고유 번호입니다.
      </p>

      <div className="mt-8">
        <NewStudentForm />
      </div>
    </div>
  );
}
