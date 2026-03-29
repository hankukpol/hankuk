import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { NoticeForm } from "../notice-form";

export const dynamic = "force-dynamic";

export default async function NewNoticePage() {
  await requireAdminContext(AdminRole.TEACHER);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/notices" className="hover:text-ink">
          학생 공지
        </Link>
        <span>/</span>
        <span className="text-ink">새 공지 작성</span>
      </nav>

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-19 Student Notices
      </div>
      <h1 className="mt-5 text-3xl font-semibold">새 공지 작성</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생 포털에 노출될 새 공지사항을 작성합니다. 저장 후 별도로 게시 처리해야 학생에게
        공개됩니다.
      </p>

      <div className="mt-8">
        <NoticeForm />
      </div>
    </div>
  );
}
