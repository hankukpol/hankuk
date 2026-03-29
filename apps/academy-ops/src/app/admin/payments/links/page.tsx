import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentLinkManager } from "@/components/payments/payment-link-manager";

export const dynamic = "force-dynamic";

const TEXT = {
  badge: "\uC218\uB0A9 \uAD00\uB9AC",
  title: "\uACB0\uC81C \uB9C1\uD06C \uAD00\uB9AC",
  description:
    "\uC628\uB77C\uC778 \uACB0\uC81C \uB9C1\uD06C\uB97C \uC0DD\uC131\uD574 \uCE74\uCE74\uC624\uD1A1\uACFC \uBB38\uC790\uB85C \uD559\uC0DD\uC5D0\uAC8C \uC804\uC1A1\uD569\uB2C8\uB2E4. \uD559\uC0DD\uC774 \uB9C1\uD06C\uB97C \uD1B5\uD574 \uACB0\uC81C\uD558\uBA74 \uC218\uB0A9 \uAE30\uB85D\uC73C\uB85C \uC790\uB3D9 \uBC18\uC601\uB429\uB2C8\uB2E4.",
} as const;

export type PaymentLinkRow = {
  id: number;
  token: string;
  title: string;
  courseId: number | null;
  amount: number;
  discountAmount: number;
  finalAmount: number;
  allowPoint: boolean;
  expiresAt: string;
  maxUsage: number | null;
  usageCount: number;
  status: "ACTIVE" | "EXPIRED" | "DISABLED" | "USED_UP";
  note: string | null;
  createdBy: string;
  createdAt: string;
  staff: { name: string };
  course: { name: string } | null;
  _count: { payments: number };
  isExpired: boolean;
  isExpiringSoon: boolean;
};

export type CourseOption = {
  id: number;
  name: string;
  tuitionFee: number;
};

export type LinkStats = {
  total: number;
  active: number;
  paid: number;
  expired: number;
  disabled: number;
  usedUp: number;
  expiringSoon: number;
};

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
    expired: links.filter((l) => l.status === "EXPIRED" || (l.status === "ACTIVE" && l.isExpired)).length,
    disabled: links.filter((l) => l.status === "DISABLED").length,
    usedUp: links.filter((l) => l.status === "USED_UP").length,
    expiringSoon: links.filter((l) => l.isExpiringSoon).length,
  };

  const courses: CourseOption[] = rawCourses;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        {TEXT.badge}
      </div>
      <h1 className="mt-5 text-3xl font-semibold">{TEXT.title}</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">{TEXT.description}</p>
      <div className="mt-8">
        <PaymentLinkManager initialLinks={links} courses={courses} initialStats={stats} />
      </div>
    </div>
  );
}
