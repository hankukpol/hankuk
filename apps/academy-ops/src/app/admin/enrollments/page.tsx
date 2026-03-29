import Link from "next/link";
import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  EnrollmentList,
  type EnrollmentWithRelations,
} from "@/components/enrollments/enrollment-list";

export const dynamic = "force-dynamic";

export default async function EnrollmentsPage() {
  const ctx = await requireAdminContext(AdminRole.COUNSELOR);

  const now = new Date();
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [enrollments, expiringCount] = await Promise.all([
    getPrisma().courseEnrollment.findMany({
      include: {
        student: { select: { name: true, phone: true } },
        cohort: { select: { name: true, examCategory: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
        contract: { select: { id: true, printedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    getPrisma().courseEnrollment.count({
      where: {
        status: EnrollmentStatus.ACTIVE,
        endDate: {
          lte: sevenDaysLater,
          gte: now,
        },
      },
    }),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold">수강 등록 목록</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/admin/enrollments/expiring"
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
              expiringCount > 0
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-ink/20 bg-white text-slate hover:border-ink/40 hover:text-ink"
            }`}
          >
            {expiringCount > 0 && (
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            )}
            만료 임박 현황{expiringCount > 0 ? ` (${expiringCount}건)` : ""}
          </Link>
          <Link
            href="/admin/enrollments/suspension-dashboard"
            className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
          >
            휴원 현황 보기
          </Link>
          <Link
            href="/admin/enrollments/re-enrollment"
            className="shrink-0 rounded-xl border border-forest/30 bg-forest/10 px-4 py-2.5 text-sm font-semibold text-forest hover:bg-forest/20 transition-colors"
          >
            재등록 관리
          </Link>
          <Link
            href="/admin/enrollments/bulk-status"
            className="shrink-0 rounded-xl border border-forest/30 bg-forest/10 px-4 py-2.5 text-sm font-semibold text-forest hover:bg-forest/20 transition-colors"
          >
            일괄 상태 변경
          </Link>
          <Link
            href="/admin/enrollments/audit"
            className="shrink-0 rounded-xl border border-ink/10 bg-mist px-4 py-2.5 text-sm font-semibold text-slate hover:border-ink/30 hover:text-ink transition-colors"
          >
            감사 로그
          </Link>
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강생의 등록 내역을 조회하고 상태를 변경합니다. 수강 중, 휴원, 퇴원 처리를 이 페이지에서
        진행합니다.
      </p>
      <div className="mt-8">
        <EnrollmentList
          initialEnrollments={enrollments as unknown as EnrollmentWithRelations[]}
          adminRole={ctx.adminUser.role}
        />
      </div>
    </div>
  );
}
