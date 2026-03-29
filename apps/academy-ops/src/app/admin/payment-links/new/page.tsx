import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PaymentLinkForm } from "./payment-link-form";

export const dynamic = "force-dynamic";

const TEXT = {
  list: "\uACB0\uC81C \uB9C1\uD06C",
  create: "\uC0C8 \uB9C1\uD06C \uC0DD\uC131",
  badge: "\uC218\uB0A9 \uAD00\uB9AC",
  title: "\uACB0\uC81C \uB9C1\uD06C \uC0DD\uC131",
  description:
    "\uD559\uC0DD\uC5D0\uAC8C \uC804\uC1A1\uD560 \uC628\uB77C\uC778 \uACB0\uC81C \uB9C1\uD06C\uB97C \uC0DD\uC131\uD569\uB2C8\uB2E4. \uD559\uC0DD\uC774 \uB9C1\uD06C\uB97C \uD1B5\uD574 \uACB0\uC81C\uD558\uBA74 \uC218\uB0A9 \uAE30\uB85D\uC73C\uB85C \uC790\uB3D9 \uBC18\uC601\uB429\uB2C8\uB2E4.",
} as const;

export default async function NewPaymentLinkPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const db = getPrisma();

  const [rawCourses, rawCohorts, rawProducts, rawSpecialLectures] = await Promise.all([
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
        isActive: true,
        startDate: true,
        endDate: true,
        enrollments: { select: { status: true } },
      },
      orderBy: { startDate: "desc" },
    }),
    db.comprehensiveCourseProduct.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        examCategory: true,
        durationMonths: true,
        salePrice: true,
        isActive: true,
      },
      orderBy: [{ examCategory: "asc" }, { durationMonths: "asc" }],
    }),
    db.specialLecture.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        isActive: true,
        startDate: true,
        endDate: true,
        _count: { select: { enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } } } },
      },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const courses = rawCourses.map((c) => ({
    id: c.id,
    name: c.name,
    tuitionFee: c.tuitionFee ?? 0,
  }));

  const cohorts = rawCohorts.map(({ enrollments, startDate, endDate, ...cohort }) => {
    const activeCount = enrollments.filter((e) => e.status === "PENDING" || e.status === "ACTIVE").length;
    const waitlistCount = enrollments.filter((e) => e.status === "WAITING").length;
    return {
      ...cohort,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      activeCount,
      waitlistCount,
    };
  });

  const products = rawProducts.map((p) => ({
    ...p,
  }));

  const specialLectures = rawSpecialLectures.map(({ startDate, endDate, ...l }) => ({
    ...l,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/payments/links" className="transition hover:text-ember">
          {TEXT.list}
        </Link>
        <span>/</span>
        <span className="text-ink">{TEXT.create}</span>
      </nav>

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        {TEXT.badge}
      </div>
      <h1 className="mt-5 text-3xl font-semibold">{TEXT.title}</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">{TEXT.description}</p>

      <div className="mt-8 max-w-2xl">
        <PaymentLinkForm
          courses={courses}
          cohorts={cohorts}
          products={products}
          specialLectures={specialLectures}
        />
      </div>
    </div>
  );
}
