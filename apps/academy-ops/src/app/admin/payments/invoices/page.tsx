import type { ReactNode } from "react";
import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type EnrollmentDetail = {
  id: string;
  cohortName: string | null;
  productName: string | null;
  specialLectureName: string | null;
};

type InstallmentHubRow = {
  id: string;
  paymentId: string;
  examNumber: string | null;
  studentName: string | null;
  mobile: string | null;
  courseLabel: string;
  dueDate: Date;
  amount: number;
  seq: number;
  overdue: boolean;
};

type LinkHubRow = {
  id: number;
  title: string;
  examNumber: string | null;
  studentName: string | null;
  mobile: string | null;
  courseLabel: string;
  finalAmount: number;
  expiresAt: Date;
  usageCount: number;
  maxUsage: number | null;
  isExpiringSoon: boolean;
};

type UnlinkedHubRow = {
  id: string;
  processedAt: Date;
  netAmount: number;
  method: string;
  itemSummary: string;
  linkTitle: string | null;
};

type SummaryCardProps = {
  label: string;
  value: string;
  tone?: "default" | "ember" | "red" | "forest";
  hint?: string;
};

function SummaryCard({ label, value, tone = "default", hint }: SummaryCardProps) {
  const toneClass = {
    default: "border-ink/10 bg-white text-ink",
    ember: "border-ember/20 bg-ember/5 text-ember",
    red: "border-red-200 bg-red-50 text-red-700",
    forest: "border-forest/20 bg-forest/10 text-forest",
  }[tone];

  return (
    <div className={`rounded-[28px] border p-6 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{label}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate">{hint}</p> : null}
    </div>
  );
}

function ActionLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-sm transition hover:border-ember/30 hover:bg-ember/5"
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate">{description}</p>
    </Link>
  );
}

function SectionFrame({
  title,
  description,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  description: string;
  href: string;
  hrefLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          <p className="mt-2 text-sm leading-7 text-slate">{description}</p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          {hrefLabel}
        </Link>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function resolveCourseLabel(
  paymentItemName: string | null,
  enrollment: EnrollmentDetail | null,
  linkCourse: { name: string } | null,
  linkCohort: { name: string } | null,
  linkLecture: { name: string } | null,
) {
  if (paymentItemName) return paymentItemName;
  if (enrollment?.productName) return enrollment.productName;
  if (enrollment?.specialLectureName) return enrollment.specialLectureName;
  if (enrollment?.cohortName) return enrollment.cohortName;
  if (linkCourse?.name) return linkCourse.name;
  if (linkLecture?.name) return linkLecture.name;
  if (linkCohort?.name) return linkCohort.name;
  return "과정 미지정";
}

export default async function AdminPaymentInvoicesPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const weekLater = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [installments, paymentLinks, unlinkedPayments] = await prisma.$transaction([
    prisma.installment.findMany({
      where: { paidAt: null },
      include: {
        payment: {
          select: {
            id: true,
            examNumber: true,
            enrollmentId: true,
            student: { select: { examNumber: true, name: true, phone: true } },
            items: { select: { itemName: true }, take: 1 },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
      take: 200,
    }),
    prisma.paymentLink.findMany({
      where: { status: "ACTIVE" },
      include: {
        student: { select: { examNumber: true, name: true, phone: true } },
        course: { select: { name: true } },
        cohort: { select: { name: true } },
        specialLecture: { select: { name: true } },
        _count: { select: { payments: true } },
      },
      orderBy: { expiresAt: "asc" },
      take: 100,
    }),
    prisma.payment.findMany({
      where: {
        examNumber: null,
        paymentLinkId: { not: null },
      },
      include: {
        paymentLink: { select: { title: true } },
        items: { select: { itemName: true }, take: 3 },
      },
      orderBy: { processedAt: "desc" },
      take: 20,
    }),
  ]);

  const enrollmentIds = [...new Set(installments.map((item) => item.payment.enrollmentId).filter((id): id is string => Boolean(id)))];
  const enrollmentRows = enrollmentIds.length
    ? await prisma.courseEnrollment.findMany({
        where: { id: { in: enrollmentIds } },
        select: {
          id: true,
          cohort: { select: { name: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      })
    : [];

  const enrollmentMap = new Map<string, EnrollmentDetail>(
    enrollmentRows.map((row) => [
      row.id,
      {
        id: row.id,
        cohortName: row.cohort?.name ?? null,
        productName: row.product?.name ?? null,
        specialLectureName: row.specialLecture?.name ?? null,
      },
    ]),
  );

  const overdueRows: InstallmentHubRow[] = [];
  const upcomingRows: InstallmentHubRow[] = [];
  let outstandingAmount = 0;

  for (const installment of installments) {
    const overdue = installment.dueDate < todayStart;
    const withinWeek = installment.dueDate >= todayStart && installment.dueDate <= weekLater;
    const enrollment = installment.payment.enrollmentId
      ? enrollmentMap.get(installment.payment.enrollmentId) ?? null
      : null;
    const row: InstallmentHubRow = {
      id: installment.id,
      paymentId: installment.paymentId,
      examNumber: installment.payment.student?.examNumber ?? installment.payment.examNumber ?? null,
      studentName: installment.payment.student?.name ?? null,
      mobile: installment.payment.student?.phone ?? null,
      courseLabel: resolveCourseLabel(
        installment.payment.items[0]?.itemName ?? null,
        enrollment,
        null,
        null,
        null,
      ),
      dueDate: installment.dueDate,
      amount: installment.amount,
      seq: installment.seq,
      overdue,
    };
    outstandingAmount += row.amount;
    if (overdue && overdueRows.length < 8) overdueRows.push(row);
    if (withinWeek && upcomingRows.length < 8) upcomingRows.push(row);
  }

  const activeLinks = paymentLinks.filter((link) => link.expiresAt >= now && (link.maxUsage === null || link.usageCount < link.maxUsage));
  const linkRows: LinkHubRow[] = activeLinks.slice(0, 8).map((link) => ({
    id: link.id,
    title: link.title,
    examNumber: link.student?.examNumber ?? link.examNumber ?? null,
    studentName: link.student?.name ?? null,
    mobile: link.student?.phone ?? null,
    courseLabel: resolveCourseLabel(null, null, link.course, link.cohort, link.specialLecture),
    finalAmount: link.finalAmount,
    expiresAt: link.expiresAt,
    usageCount: link.usageCount,
    maxUsage: link.maxUsage,
    isExpiringSoon: link.expiresAt < weekLater,
  }));

  const unlinkedRows: UnlinkedHubRow[] = unlinkedPayments.map((payment) => ({
    id: payment.id,
    processedAt: payment.processedAt,
    netAmount: payment.netAmount,
    method: payment.method,
    itemSummary: payment.items.length > 0 ? payment.items.map((item) => item.itemName).join(", ") : "결제 항목 미지정",
    linkTitle: payment.paymentLink?.title ?? null,
  }));

  const overdueCount = installments.filter((item) => item.dueDate < todayStart).length;
  const upcomingCount = installments.filter((item) => item.dueDate >= todayStart && item.dueDate <= weekLater).length;
  const expiringLinkCount = activeLinks.filter((link) => link.expiresAt < weekLater).length;
  const unlinkedCount = unlinkedPayments.length;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">청구서 허브</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            미납 분할, 이번 주 예정 청구, 활성 결제 링크, 미연결 온라인 결제를 한 화면에서 확인하는 운영 허브입니다.
            기존 수납 로직은 그대로 재사용하고, 지금 바로 처리할 항목만 우선 모았습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/payments/new?category=TUITION"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            + 수납 등록
          </Link>
          <Link
            href="/admin/payment-links/new"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
          >
            결제 링크 생성
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="총 미수 금액" value={`${outstandingAmount.toLocaleString()}원`} tone="ember" hint="미납 분할 기준" />
        <SummaryCard label="연체 분할" value={`${overdueCount.toLocaleString()}건`} tone={overdueCount > 0 ? "red" : "default"} hint="오늘 이전 납부 예정" />
        <SummaryCard label="이번 주 청구 예정" value={`${upcomingCount.toLocaleString()}건`} tone={upcomingCount > 0 ? "forest" : "default"} hint="오늘부터 7일 이내" />
        <SummaryCard label="활성 결제 링크" value={`${activeLinks.length.toLocaleString()}건`} hint={expiringLinkCount > 0 ? `임박 ${expiringLinkCount.toLocaleString()}건` : "만료 임박 없음"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <ActionLink href="/admin/payments/unpaid" title="미납 현황" description="연체 분할과 납부 예정 분할을 다시 확인합니다." />
        <ActionLink href="/admin/payments/installments" title="분할 납부 관리" description="분할 일정, 수금률, 납부 처리 화면으로 이동합니다." />
        <ActionLink href="/admin/payments/links" title="온라인 청구" description="학생별 결제 링크를 생성하고 사용 현황을 확인합니다." />
        <ActionLink href="/admin/payments/unlinked" title="미연결 온라인 결제" description="학생 계정에 아직 연결되지 않은 결제를 정리합니다." />
      </div>

      <div className="mt-8 space-y-6">
        <SectionFrame
          title="오늘 바로 처리할 연체 분할"
          description="납부 예정일이 오늘 이전인 분할만 모았습니다. 학생 기본 정보와 과정 정보를 같이 보여 줍니다."
          href="/admin/payments/unpaid"
          hrefLabel="미납 전체 보기"
        >
          {overdueRows.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/15 bg-mist px-5 py-8 text-sm text-slate">
              현재 연체된 분할이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <caption className="sr-only">연체 분할 요약</caption>
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-[0.16em] text-slate">
                    <th className="px-3 py-3">학생</th>
                    <th className="px-3 py-3">연락처</th>
                    <th className="px-3 py-3">과정</th>
                    <th className="px-3 py-3">회차</th>
                    <th className="px-3 py-3">납부 예정일</th>
                    <th className="px-3 py-3 text-right">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueRows.map((row) => (
                    <tr key={row.id} className="border-b border-ink/5 align-top">
                      <td className="px-3 py-4">
                        <div className="font-medium text-ink">{row.studentName ?? "학생 미연결"}</div>
                        <div className="mt-1 text-xs text-slate">{row.examNumber ?? "학번 없음"}</div>
                      </td>
                      <td className="px-3 py-4 text-slate">{row.mobile ?? "미등록"}</td>
                      <td className="px-3 py-4 text-slate">{row.courseLabel}</td>
                      <td className="px-3 py-4 text-slate">{row.seq}회차</td>
                      <td className="px-3 py-4 text-red-700">{formatDate(row.dueDate)}</td>
                      <td className="px-3 py-4 text-right font-semibold text-ink">{row.amount.toLocaleString()}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionFrame>

        <SectionFrame
          title="이번 주 청구 예정"
          description="오늘부터 7일 이내 납부 예정인 분할만 모았습니다. 납부 안내나 링크 발송 전 점검용입니다."
          href="/admin/payments/installments/calendar"
          hrefLabel="달력 보기"
        >
          {upcomingRows.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/15 bg-mist px-5 py-8 text-sm text-slate">
              이번 주 예정된 분할이 없습니다.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {upcomingRows.map((row) => (
                <div key={row.id} className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{row.studentName ?? "학생 미연결"}</p>
                      <p className="mt-1 text-xs text-slate">{row.examNumber ?? "학번 없음"}</p>
                    </div>
                    <span className="rounded-full border border-forest/20 bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest">
                      {row.seq}회차
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate">{row.courseLabel}</p>
                  <p className="mt-2 text-xs text-slate">납부 예정일 {formatDate(row.dueDate)}</p>
                  <p className="mt-3 text-lg font-semibold text-ink">{row.amount.toLocaleString()}원</p>
                </div>
              ))}
            </div>
          )}
        </SectionFrame>

        <SectionFrame
          title="활성 결제 링크"
          description="온라인 청구 링크 중 현재 사용 가능한 항목만 보여 줍니다. 특정 학생 전용 링크와 공용 링크를 함께 봅니다."
          href="/admin/payments/links"
          hrefLabel="링크 전체 보기"
        >
          {linkRows.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/15 bg-mist px-5 py-8 text-sm text-slate">
              현재 활성 결제 링크가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <caption className="sr-only">활성 결제 링크 요약</caption>
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-[0.16em] text-slate">
                    <th className="px-3 py-3">링크</th>
                    <th className="px-3 py-3">대상 학생</th>
                    <th className="px-3 py-3">과정</th>
                    <th className="px-3 py-3">만료</th>
                    <th className="px-3 py-3">사용 현황</th>
                    <th className="px-3 py-3 text-right">청구 금액</th>
                  </tr>
                </thead>
                <tbody>
                  {linkRows.map((row) => (
                    <tr key={row.id} className="border-b border-ink/5 align-top">
                      <td className="px-3 py-4">
                        <div className="font-medium text-ink">{row.title}</div>
                        <div className="mt-1 text-xs text-slate">링크 #{row.id}</div>
                      </td>
                      <td className="px-3 py-4 text-slate">
                        {row.studentName ? (
                          <>
                            <div className="font-medium text-ink">{row.studentName}</div>
                            <div className="mt-1 text-xs text-slate">{row.examNumber ?? "학번 없음"}</div>
                            <div className="mt-1 text-xs text-slate">{row.mobile ?? "연락처 미등록"}</div>
                          </>
                        ) : (
                          <span>공용 링크</span>
                        )}
                      </td>
                      <td className="px-3 py-4 text-slate">{row.courseLabel}</td>
                      <td className="px-3 py-4 text-slate">
                        <div>{formatDateTime(row.expiresAt)}</div>
                        {row.isExpiringSoon ? (
                          <div className="mt-1 text-xs font-semibold text-red-600">이번 주 만료</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-4 text-slate">
                        {row.usageCount.toLocaleString()}회 사용
                        {row.maxUsage !== null ? ` / 최대 ${row.maxUsage.toLocaleString()}회` : " / 무제한"}
                      </td>
                      <td className="px-3 py-4 text-right font-semibold text-ink">{row.finalAmount.toLocaleString()}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionFrame>

        <SectionFrame
          title="미연결 온라인 결제"
          description="결제 링크로 수납되었지만 아직 학생 계정과 연결되지 않은 항목입니다. 수납 누락과 학생 매칭 오류를 빠르게 정리할 수 있습니다."
          href="/admin/payments/unlinked"
          hrefLabel={`미연결 ${unlinkedCount.toLocaleString()}건 보기`}
        >
          {unlinkedRows.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/15 bg-mist px-5 py-8 text-sm text-slate">
              학생 계정에 연결되지 않은 온라인 결제가 없습니다.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {unlinkedRows.map((row) => (
                <div key={row.id} className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-ink">{row.linkTitle ?? "링크 정보 없음"}</p>
                  <p className="mt-2 text-xs text-slate">{formatDateTime(row.processedAt)}</p>
                  <p className="mt-3 text-sm text-slate">{row.itemSummary}</p>
                  <p className="mt-3 text-lg font-semibold text-amber-800">{row.netAmount.toLocaleString()}원</p>
                  <p className="mt-1 text-xs text-slate">수단 {row.method}</p>
                </div>
              ))}
            </div>
          )}
        </SectionFrame>
      </div>
    </div>
  );
}



