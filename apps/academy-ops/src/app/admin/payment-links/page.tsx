import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentLinkManager } from "@/components/payments/payment-link-manager";
import type {
  PaymentLinkRow,
  CourseOption,
  LinkStats,
} from "@/app/admin/payments/links/page";

export const dynamic = "force-dynamic";

export default async function PaymentLinksPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const now = new Date();

  const [rawLinks, rawCourses] = await getPrisma().$transaction([
    getPrisma().paymentLink.findMany({
      include: {
        staff: { select: { name: true } },
        course: { select: { name: true } },
        _count: { select: { payments: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getPrisma().course.findMany({
      where: { isActive: true },
      select: { id: true, name: true, tuitionFee: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const links: PaymentLinkRow[] = rawLinks.map((l) => ({
    ...l,
    expiresAt: l.expiresAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
    isExpired: l.expiresAt < now,
    isExpiringSoon:
      l.status === "ACTIVE" &&
      l.expiresAt > now &&
      l.expiresAt < new Date(now.getTime() + 24 * 60 * 60 * 1000),
  }));

  const stats: LinkStats = {
    total: links.length,
    active: links.filter((l) => l.status === "ACTIVE" && !l.isExpired).length,
    paid: links.reduce((sum, l) => sum + l._count.payments, 0),
    expired: links.filter(
      (l) => l.status === "EXPIRED" || (l.status === "ACTIVE" && l.isExpired),
    ).length,
    disabled: links.filter((l) => l.status === "DISABLED").length,
    usedUp: links.filter((l) => l.status === "USED_UP").length,
    expiringSoon: links.filter((l) => l.isExpiringSoon).length,
  };

  const courses: CourseOption[] = rawCourses;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">결제 링크 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        온라인 결제 링크를 생성하여 카카오톡·문자로 학생에게 전송합니다. 학생이 링크를 통해
        결제하면 자동으로 수납이 등록됩니다.
      </p>
      <div className="mt-8">
        <PaymentLinkManager initialLinks={links} courses={courses} initialStats={stats} />
      </div>
    </div>
  );
}
