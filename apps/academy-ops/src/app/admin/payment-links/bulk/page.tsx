import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { BulkLinkForm } from "./bulk-link-form";

export const dynamic = "force-dynamic";

export default async function BulkPaymentLinkPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const db = getPrisma();

  const [rawCourses, rawCohorts] = await Promise.all([
    db.course.findMany({
      where: { isActive: true },
      select: { id: true, name: true, tuitionFee: true },
      orderBy: { name: "asc" },
    }),
    db.cohort.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        examCategory: true,
        startDate: true,
        endDate: true,
        enrollments: {
          where: { status: { in: ["ACTIVE", "PENDING"] } },
          select: { examNumber: true, student: { select: { name: true } } },
        },
      },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const courses = rawCourses.map((c) => ({
    id: c.id,
    name: c.name,
    tuitionFee: c.tuitionFee ?? 0,
  }));

  const cohorts = rawCohorts.map((c) => ({
    id: c.id,
    name: c.name,
    examCategory: c.examCategory,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    students: c.enrollments.map((e) => ({
      examNumber: e.examNumber,
      name: e.student.name,
    })),
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/payments/links" className="transition hover:text-ember">
          결제 링크
        </Link>
        <span>/</span>
        <span className="text-ink">일괄 생성</span>
      </nav>

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">결제 링크 일괄 생성</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        여러 학생에게 동일한 조건의 결제 링크를 한 번에 생성합니다. 기수 선택 또는 학번을
        직접 입력하여 대상 학생을 지정하세요.
      </p>

      <div className="mt-8">
        <BulkLinkForm courses={courses} cohorts={cohorts} />
      </div>
    </div>
  );
}
