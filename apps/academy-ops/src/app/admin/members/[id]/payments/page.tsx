import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { applyAcademyScope, getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";
import {
  DEFAULT_FILTERS,
  formatDateTime,
  formatKRW,
  parsePaymentHistoryFilters,
  toFromDate,
  toToDate,
} from "./payment-history-helpers";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const TEXT = {
  breadcrumbMembers: "\uD68C\uC6D0 \uAD00\uB9AC",
  breadcrumbDetail: "\uD68C\uC6D0 \uC0C1\uC138",
  breadcrumbCurrent: "\uC218\uB0A9 \uC774\uB825",
  badge: "\uD68C\uC6D0 \uC218\uB0A9",
  title: "\uD68C\uC6D0 \uBCC4 \uC218\uB0A9 \uC774\uB825",
  description:
    "\uD68C\uC6D0 \uB9C8\uC2A4\uD130 \uACBD\uB85C\uC5D0\uC11C\uB3C4 \uAE30\uC874 \uC218\uB0A9 \uB370\uC774\uD130\uB97C \uADF8\uB300\uB85C \uC7AC\uC0AC\uC6A9\uD558\uC5EC \uD559\uBC88 \uAE30\uC900 \uC218\uB0A9 \uC774\uB825\uC744 \uBC14\uB85C \uC870\uD68C\uD569\uB2C8\uB2E4.",
  backToMember: "\uD68C\uC6D0 \uC0C1\uC138\uB85C",
  backToStudent: "\uD559\uC0DD \uC0C1\uC138\uB85C",
  addPayment: "\uC218\uB0A9 \uB4F1\uB85D",
  cardTitle: "\uD68C\uC6D0 \uAE30\uBCF8 \uC815\uBCF4",
  examNumber: "\uD559\uBC88",
  name: "\uC774\uB984",
  mobile: "\uC5F0\uB77D\uCC98",
  mobileFallback: "\uBBF8\uB4F1\uB85D",
  enrollments: "\uC218\uAC15\uB0B4\uC5ED",
  noEnrollments: "\uD45C\uC2DC\uD560 \uC218\uAC15\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  moreSuffix: "\uAC74 \uB354",
  filtersTitle: "\uC870\uD68C \uD544\uD130",
  category: "\uAD6C\uBD84",
  method: "\uACB0\uC81C \uC218\uB2E8",
  status: "\uC0C1\uD0DC",
  from: "\uC2DC\uC791\uC77C",
  to: "\uC885\uB8CC\uC77C",
  apply: "\uD544\uD130 \uC801\uC6A9",
  reset: "\uCD08\uAE30\uD654",
  totalCount: "\uC218\uB0A9 \uAC74\uC218",
  grossAmount: "\uCD1D \uCCAD\uAD6C\uC561",
  netAmount: "\uC2E4\uC218\uB0A9\uC561",
  refundAmount: "\uD658\uBD88\uC561",
  historyTitle: "\uC218\uB0A9 \uC774\uB825",
  fixedExamNumber: "\uD559\uBC88 \uAE30\uC900 \uC870\uD68C",
  emptyTitle: "\uC870\uD68C\uB41C \uC218\uB0A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyDescription:
    "\uD574\uB2F9 \uD68C\uC6D0\uC758 \uD559\uBC88\uC73C\uB85C \uB4F1\uB85D\uB41C \uC218\uB0A9\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uD544\uD130 \uC870\uAC74\uC744 \uC644\uD654\uD558\uAC70\uB098 \uC218\uB0A9 \uB4F1\uB85D \uD750\uB984\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  processedAt: "\uCC98\uB9AC\uC77C\uC2DC",
  categoryHeader: "\uAD6C\uBD84",
  item: "\uB0B4\uC5ED",
  methodHeader: "\uC218\uB2E8",
  grossHeader: "\uCCAD\uAD6C\uC561",
  netHeader: "\uC218\uB0A9\uC561",
  refundHeader: "\uD658\uBD88\uC561",
  statusHeader: "\uC0C1\uD0DC",
  processor: "\uCC98\uB9AC \uC9C1\uC6D0",
  noteFallback: "\uBE44\uACE0 \uC5C6\uC74C",
  detail: "\uC0C1\uC138",
  detailLink: "\uC218\uB0A9 \uC0C1\uC138",
} as const;

const CATEGORY_LABEL: Record<PaymentCategory | "ALL", string> = {
  ALL: "\uC804\uCCB4",
  TUITION: "\uC218\uAC15\uB8CC",
  FACILITY: "\uC2DC\uC124\uBE44",
  TEXTBOOK: "\uAD50\uC7AC",
  MATERIAL: "\uAD50\uAD6C\u00B7\uBD80\uC790\uC7AC",
  SINGLE_COURSE: "\uB2E8\uACFC",
  PENALTY: "\uC704\uC57D\uAE08",
  ETC: "\uAE30\uD0C0",
};

const METHOD_LABEL: Record<PaymentMethod | "ALL", string> = {
  ALL: "\uC804\uCCB4",
  CASH: "\uD604\uAE08",
  CARD: "\uCE74\uB4DC",
  TRANSFER: "\uACC4\uC88C\uC774\uCCB4",
  POINT: "\uD3EC\uC778\uD2B8",
  MIXED: "\uBCF5\uD569 \uACB0\uC81C",
};

const STATUS_LABEL: Record<PaymentStatus | "ALL", string> = {
  ALL: "\uC804\uCCB4",
  PENDING: "\uCC98\uB9AC \uC911",
  APPROVED: "\uC2B9\uC778 \uC644\uB8CC",
  PARTIAL_REFUNDED: "\uBD80\uBD84 \uD658\uBD88",
  FULLY_REFUNDED: "\uC804\uC561 \uD658\uBD88",
  CANCELLED: "\uCDE8\uC18C",
};

const CATEGORY_TONE: Record<PaymentCategory, string> = {
  TUITION: "border-forest/20 bg-forest/10 text-forest",
  FACILITY: "border-sky-200 bg-sky-50 text-sky-800",
  TEXTBOOK: "border-violet-200 bg-violet-50 text-violet-800",
  MATERIAL: "border-indigo-200 bg-indigo-50 text-indigo-800",
  SINGLE_COURSE: "border-amber-200 bg-amber-50 text-amber-800",
  PENALTY: "border-rose-200 bg-rose-50 text-rose-700",
  ETC: "border-ink/10 bg-ink/5 text-ink",
};

const STATUS_TONE: Record<PaymentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-sky-200 bg-sky-50 text-sky-800",
  FULLY_REFUNDED: "border-violet-200 bg-violet-50 text-violet-800",
  CANCELLED: "border-ink/10 bg-ink/5 text-slate",
};

const COURSE_TYPE_LABEL = {
  COMPREHENSIVE: "\uC885\uD569\uBC18",
  SPECIAL_LECTURE: "\uD2B9\uAC15",
} as const;

const ENROLLMENT_STATUS_LABEL = {
  PENDING: "\uC608\uC815",
  ACTIVE: "\uC218\uAC15 \uC911",
  WAITING: "\uB300\uAE30",
  SUSPENDED: "\uD734\uD559",
  COMPLETED: "\uC885\uB8CC",
  WITHDRAWN: "\uD1F4\uC6D0",
  CANCELLED: "\uCDE8\uC18C",
} as const;

const ENROLLMENT_STATUS_TONE = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  WAITING: "border-sky-200 bg-sky-50 text-sky-800",
  SUSPENDED: "border-violet-200 bg-violet-50 text-violet-800",
  COMPLETED: "border-ink/10 bg-ink/5 text-ink",
  WITHDRAWN: "border-rose-200 bg-rose-50 text-rose-700",
  CANCELLED: "border-ink/10 bg-ink/5 text-slate",
} as const;

const CATEGORY_OPTIONS: Array<PaymentCategory | "ALL"> = [
  "ALL",
  "TUITION",
  "FACILITY",
  "TEXTBOOK",
  "MATERIAL",
  "SINGLE_COURSE",
  "PENALTY",
  "ETC",
];

const METHOD_OPTIONS: Array<PaymentMethod | "ALL"> = [
  "ALL",
  "CASH",
  "CARD",
  "TRANSFER",
  "POINT",
  "MIXED",
];

const STATUS_OPTIONS: Array<PaymentStatus | "ALL"> = [
  "ALL",
  "PENDING",
  "APPROVED",
  "PARTIAL_REFUNDED",
  "FULLY_REFUNDED",
  "CANCELLED",
];

function refundAmountOf(refunds: Array<{ amount: number; status: string }>): number {
  return refunds
    .filter((refund) => refund.status === "COMPLETED")
    .reduce((sum, refund) => sum + refund.amount, 0);
}

function itemSummary(
  items: Array<{ id: string; itemName: string; quantity: number }>,
  note: string | null,
): string {
  if (items.length > 0) {
    const [first, ...rest] = items;
    const quantityLabel = first.quantity > 1 ? ` x${first.quantity}` : "";
    const moreLabel = rest.length > 0 ? ` ${rest.length}${TEXT.moreSuffix}` : "";
    return `${first.itemName}${quantityLabel}${moreLabel}`;
  }

  return note?.trim() || TEXT.noteFallback;
}

function enrollmentName(item: {
  cohort: { name: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
  courseType: "COMPREHENSIVE" | "SPECIAL_LECTURE";
}) {
  return (
    item.cohort?.name ??
    item.product?.name ??
    item.specialLecture?.name ??
    COURSE_TYPE_LABEL[item.courseType]
  );
}

export default async function MemberPaymentsPage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);
  const academyScope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(academyScope);

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters = parsePaymentHistoryFilters(resolvedSearchParams);
  const prisma = getPrisma();

  const [student, payments] = await Promise.all([
    prisma.student.findFirst({
      where: applyAcademyScope({ examNumber: id }, academyId),
      select: {
        examNumber: true,
        name: true,
        phone: true,
        courseEnrollments: {
          where: applyAcademyScope({}, academyId),
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            courseType: true,
            status: true,
            cohort: { select: { name: true } },
            product: { select: { name: true } },
            specialLecture: { select: { name: true } },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: applyAcademyScope({
        examNumber: id,
        ...(filters.category !== "ALL" ? { category: filters.category } : {}),
        ...(filters.method !== "ALL" ? { method: filters.method } : {}),
        ...(filters.status !== "ALL" ? { status: filters.status } : {}),
        ...(() => {
          const from = toFromDate(filters.from);
          const to = toToDate(filters.to);
          if (!from && !to) {
            return {};
          }
          return {
            processedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          };
        })(),
      }, academyId),
      orderBy: { processedAt: "desc" },
      include: {
        items: {
          orderBy: { id: "asc" },
          select: { id: true, itemName: true, quantity: true },
        },
        processor: { select: { name: true } },
        refunds: {
          select: { amount: true, status: true },
        },
      },
    }),
  ]);

  if (!student) {
    notFound();
  }

  const totalGross = payments.reduce((sum, payment) => sum + payment.grossAmount, 0);
  const totalNet = payments.reduce((sum, payment) => sum + payment.netAmount, 0);
  const totalRefund = payments.reduce((sum, payment) => sum + refundAmountOf(payment.refunds), 0);
  const enrollmentPreview = student.courseEnrollments.slice(0, 3);
  const extraEnrollmentCount = Math.max(student.courseEnrollments.length - enrollmentPreview.length, 0);
  const currentEnrollment =
    student.courseEnrollments.find((enrollment) =>
      ["ACTIVE", "WAITING", "PENDING", "SUSPENDED"].includes(enrollment.status),
    ) ?? student.courseEnrollments[0] ?? null;

  return (
    <div className="p-8 sm:p-10">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate">
        <Link href="/admin/members" className="transition hover:text-ink">
          {TEXT.breadcrumbMembers}
        </Link>
        <span>/</span>
        <Link href={`/admin/members/${id}`} className="transition hover:text-ink">
          {TEXT.breadcrumbDetail}
        </Link>
        <span>/</span>
        <span className="text-ink">{TEXT.breadcrumbCurrent}</span>
      </nav>

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        {TEXT.badge}
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">{TEXT.title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate sm:text-base">{TEXT.description}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={`/admin/members/${id}`}
          className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/25 hover:text-ink"
        >
          {TEXT.backToMember}
        </Link>
        <Link
          href={`/admin/students/${id}`}
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
        >
          {TEXT.backToStudent}
        </Link>
        {currentEnrollment ? (
          <Link
            href={`/admin/enrollments/${currentEnrollment.id}/payment-plan`}
            className="inline-flex items-center rounded-full border border-forest/20 bg-white px-4 py-2 text-sm font-semibold text-forest transition hover:border-forest/40"
          >
            {"\uB0A9\uBD80 \uACC4\uD68D\uD45C"}
          </Link>
        ) : null}
        <Link
          href={`/admin/payments/new?examNumber=${id}`}
          className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          {TEXT.addPayment}
        </Link>
      </div>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{TEXT.cardTitle}</h2>
            <p className="mt-1 text-sm text-slate">{TEXT.fixedExamNumber}: {student.examNumber}</p>
          </div>
          <Link href={`/admin/students/${student.examNumber}`} className="text-sm font-semibold text-forest transition hover:underline">
            {student.name}
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-ink/10 bg-mist/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">{TEXT.examNumber}</p>
            <Link href={`/admin/students/${student.examNumber}`} className="mt-2 inline-flex text-lg font-semibold text-forest hover:underline">
              {student.examNumber}
            </Link>
          </div>
          <div className="rounded-3xl border border-ink/10 bg-mist/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">{TEXT.name}</p>
            <Link href={`/admin/students/${student.examNumber}`} className="mt-2 inline-flex text-lg font-semibold text-forest hover:underline">
              {student.name}
            </Link>
          </div>
          <div className="rounded-3xl border border-ink/10 bg-mist/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">{TEXT.mobile}</p>
            <p className="mt-2 text-lg font-semibold text-ink">{student.phone || TEXT.mobileFallback}</p>
          </div>
          <div className="rounded-3xl border border-ink/10 bg-mist/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">{TEXT.enrollments}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {enrollmentPreview.length > 0 ? (
                <>
                  {enrollmentPreview.map((enrollment) => (
                    <Link
                      key={enrollment.id}
                      href={`/admin/enrollments/${enrollment.id}`}
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium transition hover:border-ink/30 ${ENROLLMENT_STATUS_TONE[enrollment.status as keyof typeof ENROLLMENT_STATUS_TONE] ?? "border-ink/10 bg-ink/5 text-ink"}`}
                    >
                      {`${enrollmentName(enrollment)} · ${ENROLLMENT_STATUS_LABEL[enrollment.status as keyof typeof ENROLLMENT_STATUS_LABEL] ?? enrollment.status}`}
                    </Link>
                  ))}
                  {extraEnrollmentCount > 0 ? (
                    <span className="inline-flex rounded-full border border-ink/10 bg-white px-2.5 py-1 text-xs font-medium text-slate">
                      +{extraEnrollmentCount}{TEXT.moreSuffix}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-sm text-slate">{TEXT.noEnrollments}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{TEXT.filtersTitle}</h2>
          <Link href={`/admin/members/${id}/payments`} className="text-sm font-medium text-slate transition hover:text-ink">
            {TEXT.reset}
          </Link>
        </div>
        <form className="mt-5 grid gap-4 md:grid-cols-5">
          <label className="space-y-2 text-sm text-slate">
            <span>{TEXT.category}</span>
            <select name="category" defaultValue={filters.category} className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-forest/40">
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {CATEGORY_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate">
            <span>{TEXT.method}</span>
            <select name="method" defaultValue={filters.method} className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-forest/40">
              {METHOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {METHOD_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate">
            <span>{TEXT.status}</span>
            <select name="status" defaultValue={filters.status} className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-forest/40">
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate">
            <span>{TEXT.from}</span>
            <input type="date" name="from" defaultValue={filters.from || DEFAULT_FILTERS.from} className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-forest/40" />
          </label>
          <label className="space-y-2 text-sm text-slate">
            <span>{TEXT.to}</span>
            <input type="date" name="to" defaultValue={filters.to || DEFAULT_FILTERS.to} className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-forest/40" />
          </label>
          <div className="md:col-span-5 flex justify-end">
            <button type="submit" className="inline-flex items-center rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90">
              {TEXT.apply}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">{TEXT.totalCount}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{payments.length}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">{TEXT.grossAmount}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{formatKRW(totalGross)}</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">{TEXT.netAmount}</p>
          <p className="mt-2 text-2xl font-semibold text-forest">{formatKRW(totalNet)}</p>
        </div>
        <div className="rounded-[28px] border border-red-100 bg-red-50 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">{TEXT.refundAmount}</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{formatKRW(totalRefund)}</p>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-5">
          <h2 className="text-lg font-semibold text-ink">{TEXT.historyTitle}</h2>
          <p className="mt-1 text-sm text-slate">{TEXT.fixedExamNumber}: {student.examNumber}</p>
        </div>

        {payments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-base font-semibold text-ink">{TEXT.emptyTitle}</p>
            <p className="mt-2 text-sm text-slate">{TEXT.emptyDescription}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/70 text-left text-slate">
                <tr>
                  <th className="px-4 py-3 font-semibold">{TEXT.processedAt}</th>
                  <th className="px-4 py-3 font-semibold">{TEXT.categoryHeader}</th>
                  <th className="px-4 py-3 font-semibold">{TEXT.item}</th>
                  <th className="px-4 py-3 font-semibold">{TEXT.methodHeader}</th>
                  <th className="px-4 py-3 text-right font-semibold">{TEXT.grossHeader}</th>
                  <th className="px-4 py-3 text-right font-semibold">{TEXT.netHeader}</th>
                  <th className="px-4 py-3 text-right font-semibold">{TEXT.refundHeader}</th>
                  <th className="px-4 py-3 font-semibold">{TEXT.statusHeader}</th>
                  <th className="px-4 py-3 font-semibold">{TEXT.processor}</th>
                  <th className="px-4 py-3 font-semibold">{TEXT.detail}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {payments.map((payment) => {
                  const refundAmount = refundAmountOf(payment.refunds);
                  return (
                    <tr key={payment.id} className="transition hover:bg-mist/40">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">{formatDateTime(payment.processedAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${CATEGORY_TONE[payment.category]}`}>
                          {CATEGORY_LABEL[payment.category]}
                        </span>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-sm text-ink">{itemSummary(payment.items, payment.note)}</td>
                      <td className="px-4 py-3 text-sm text-slate">{METHOD_LABEL[payment.method]}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">{formatKRW(payment.grossAmount)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">{formatKRW(payment.netAmount)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-red-600">{refundAmount > 0 ? formatKRW(refundAmount) : "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[payment.status]}`}>
                          {STATUS_LABEL[payment.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate">{payment.processor?.name ?? "-"}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/payments/${payment.id}`} className="text-sm font-semibold text-ember transition hover:underline">
                          {TEXT.detailLink}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
