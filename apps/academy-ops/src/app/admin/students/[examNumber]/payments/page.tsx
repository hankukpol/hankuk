import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { applyAcademyScope, getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";
import {
  COURSE_TYPE_LABEL,
  ENROLLMENT_STATUS_COLOR,
  ENROLLMENT_STATUS_LABEL,
  PAYMENT_CATEGORY_COLOR,
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

const SUB_NAV = [
  { href: "enrollments", label: "수업" },
  { href: "payments", label: "수납" },
] as const;

function formatDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

function formatKRW(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function courseNameOf(item: {
  cohort: { name: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? "과정 미지정";
}

export default async function StudentPaymentsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);
  const academyScope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(academyScope);

  const { examNumber } = await params;
  const prisma = getPrisma();

  const [student, payments] = await Promise.all([
    prisma.student.findFirst({
      where: applyAcademyScope({ examNumber }, academyId),
      select: {
        name: true,
        examNumber: true,
        phone: true,
        isActive: true,
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
      where: applyAcademyScope({ examNumber }, academyId),
      include: {
        items: { orderBy: { id: "asc" } },
        processor: { select: { name: true } },
        refunds: {
          select: {
            id: true,
            amount: true,
            refundType: true,
            status: true,
            processedAt: true,
            reason: true,
          },
        },
      },
      orderBy: { processedAt: "desc" },
    }),
  ]);

  if (!student) notFound();

  const approvedPayments = payments.filter(
    (payment) =>
      payment.status === "APPROVED" ||
      payment.status === "PARTIAL_REFUNDED" ||
      payment.status === "FULLY_REFUNDED",
  );

  const totalNet = approvedPayments.reduce((sum, payment) => sum + payment.netAmount, 0);
  const totalDiscount = approvedPayments.reduce(
    (sum, payment) => sum + payment.discountAmount + payment.couponAmount + payment.pointAmount,
    0,
  );
  const totalRefunded = payments
    .flatMap((payment) => payment.refunds)
    .filter((refund) => refund.status === "COMPLETED")
    .reduce((sum, refund) => sum + refund.amount, 0);
  const netReceived = totalNet - totalRefunded;
  const enrollmentPreview = student.courseEnrollments.slice(0, 4);
  const extraEnrollmentCount = Math.max(student.courseEnrollments.length - enrollmentPreview.length, 0);
  const currentEnrollment =
    student.courseEnrollments.find((enrollment) =>
      ["ACTIVE", "WAITING", "PENDING", "SUSPENDED"].includes(enrollment.status),
    ) ?? student.courseEnrollments[0] ?? null;

  return (
    <div className="p-8 sm:p-10">
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/students" className="transition-colors hover:text-forest">
          학생 목록
        </Link>
        <span>/</span>
        <Link href={`/admin/students/${examNumber}`} className="transition-colors hover:text-forest">
          {student.name}
        </Link>
        <span>/</span>
        <span className="text-ink">수납</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            학생 수납
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            {student.name}
            <span className="ml-2 text-base font-normal text-slate">({student.examNumber})</span>
          </h1>
          <p className="mt-1 text-sm text-slate">
            {student.phone ?? "연락처 미등록"} · {student.isActive ? "활성 학생" : "비활성 학생"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/members/${examNumber}/payments`}
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            회원 수납 이력
          </Link>
          {currentEnrollment ? (
            <Link
              href={`/admin/enrollments/${currentEnrollment.id}/payment-plan`}
              className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/10"
            >
              납부 계획표
            </Link>
          ) : null}
          <Link
            href={`/admin/payments/new?examNumber=${examNumber}`}
            className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            + 수납 등록
          </Link>
        </div>
      </div>

      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-ink/10 bg-mist/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">학번</p>
            <Link
              href={`/admin/students/${student.examNumber}`}
              className="mt-2 inline-flex text-lg font-semibold text-forest hover:underline"
            >
              {student.examNumber}
            </Link>
          </div>
          <div className="rounded-3xl border border-ink/10 bg-mist/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">이름</p>
            <Link
              href={`/admin/students/${student.examNumber}`}
              className="mt-2 inline-flex text-lg font-semibold text-forest hover:underline"
            >
              {student.name}
            </Link>
          </div>
          <div className="rounded-3xl border border-ink/10 bg-mist/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">연락처</p>
            <p className="mt-2 text-lg font-semibold text-ink">{student.phone ?? "연락처 미등록"}</p>
          </div>
          <div className="rounded-3xl border border-ink/10 bg-mist/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">수강내역</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {enrollmentPreview.length > 0 ? (
                <>
                  {enrollmentPreview.map((enrollment) => (
                    <Link
                      key={enrollment.id}
                      href={`/admin/enrollments/${enrollment.id}`}
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium transition hover:border-ink/30 ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}
                    >
                      {courseNameOf(enrollment)} · {COURSE_TYPE_LABEL[enrollment.courseType]} ·{" "}
                      {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                    </Link>
                  ))}
                  {extraEnrollmentCount > 0 ? (
                    <span className="inline-flex rounded-full border border-ink/10 bg-white px-2.5 py-1 text-xs font-medium text-slate">
                      +{extraEnrollmentCount}건 더
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-sm text-slate">표시할 수강내역이 없습니다.</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {SUB_NAV.map((item) => (
          <Link
            key={item.href}
            href={`/admin/students/${examNumber}/${item.href}`}
            className={`rounded-t-2xl px-5 py-2.5 text-sm font-semibold transition ${
              item.href === "payments"
                ? "-mb-px border border-b-white border-ink/10 bg-white text-ink"
                : "text-slate hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 수납액</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{formatKRW(totalNet)}</p>
          {totalDiscount > 0 ? (
            <p className="mt-1 text-xs text-forest">할인 반영 {formatKRW(totalDiscount)}</p>
          ) : (
            <p className="mt-1 text-xs text-slate">할인 내역 없음</p>
          )}
        </div>
        <div className="rounded-[28px] border border-red-100 bg-red-50 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-500">총 환불액</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-red-600">
            {totalRefunded > 0 ? `-${formatKRW(totalRefunded)}` : "0원"}
          </p>
          <p className="mt-1 text-xs text-red-500">완료된 환불만 반영</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">순 수납액</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-forest">{formatKRW(netReceived)}</p>
          <p className="mt-1 text-xs text-forest/70">환불 반영 후 기준</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">수납 건수</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{payments.length}건</p>
          <p className="mt-1 text-xs text-slate">학생 기준 전체 수납</p>
        </div>
      </div>

      <div className="mt-6">
        {payments.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            등록된 수납 이력이 없습니다. 수납 등록 버튼으로 첫 결제를 연결해 주세요.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 shadow-panel">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">처리일시</th>
                  <th className="px-4 py-3 font-semibold">유형</th>
                  <th className="px-4 py-3 font-semibold">수납 내역</th>
                  <th className="px-4 py-3 font-semibold">결제수단</th>
                  <th className="px-4 py-3 text-right font-semibold">수납액</th>
                  <th className="px-4 py-3 text-right font-semibold">환불액</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">처리 직원</th>
                  <th className="px-4 py-3 font-semibold">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {payments.map((payment) => {
                  const refundTotal = payment.refunds
                    .filter((refund) => refund.status === "COMPLETED")
                    .reduce((sum, refund) => sum + refund.amount, 0);

                  return (
                    <tr
                      key={payment.id}
                      className={`transition hover:bg-mist/40 ${
                        payment.status === "CANCELLED" ? "opacity-50" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {formatDateTime(payment.processedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_CATEGORY_COLOR[payment.category]}`}
                        >
                          {PAYMENT_CATEGORY_LABEL[payment.category]}
                        </span>
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <div className="space-y-0.5">
                          {payment.items.map((item) => (
                            <div key={item.id} className="truncate text-xs text-slate">
                              {item.itemName}
                              {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                            </div>
                          ))}
                          {payment.items.length === 0 && payment.note ? (
                            <div className="truncate text-xs text-slate">{payment.note}</div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">{PAYMENT_METHOD_LABEL[payment.method]}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-medium">{formatKRW(payment.netAmount)}</div>
                        {payment.discountAmount > 0 ? (
                          <div className="mt-0.5 text-xs text-forest">
                            할인 {formatKRW(payment.discountAmount)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {refundTotal > 0 ? (
                          <span className="font-medium text-red-600">-{formatKRW(refundTotal)}</span>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
                        >
                          {PAYMENT_STATUS_LABEL[payment.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">{payment.processor?.name ?? "-"}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/payments/${payment.id}`}
                          className="text-xs font-semibold text-ember transition hover:underline"
                        >
                          상세보기
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8">
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center gap-1.5 text-sm text-forest transition hover:underline"
        >
          ← 학생 상세로 이동
        </Link>
      </div>
    </div>
  );
}
