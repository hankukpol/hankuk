import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { ExamCreateForm } from "./exam-create-form";

export const dynamic = "force-dynamic";

export default async function ExamNewPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <div>
        <Link
          href="/admin/exams"
          className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
        >
          <span>&larr;</span>
          <span>시험 목록으로</span>
        </Link>
      </div>

      {/* Page header */}
      <div className="mt-4">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          Exam Registration
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">새 시험 등록</h1>
        <p className="mt-4 max-w-2xl text-sm leading-8 text-slate sm:text-base">
          월말평가, 특강모의고사, 외부모의고사를 등록합니다. 시험 유형을 먼저 선택하세요.
        </p>
      </div>

      {/* Form */}
      <div className="mt-8 max-w-2xl">
        <ExamCreateForm />
      </div>
    </div>
  );
}
