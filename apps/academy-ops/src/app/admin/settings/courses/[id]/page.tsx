import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

const CATEGORY_LABELS: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SINGLE: "단과",
  SPECIAL: "특강",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "모집중",
  CLOSED: "마감",
  FINISHED: "종료",
  CANCELLED: "취소",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "border-forest/30 bg-forest/10 text-forest",
  CLOSED: "border-amber-200 bg-amber-50 text-amber-800",
  FINISHED: "border-ink/20 bg-ink/5 text-slate",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
};

const EXAM_TYPE_LABELS: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const LINK_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "활성",
  USED: "사용됨",
  EXPIRED: "만료",
  CANCELLED: "취소",
};

const LINK_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "border-forest/30 bg-forest/10 text-forest",
  USED: "border-sky-200 bg-sky-50 text-sky-800",
  EXPIRED: "border-ink/20 bg-ink/5 text-slate",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-forest/30 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-orange-200 bg-orange-50 text-orange-700",
  FULLY_REFUNDED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/20 bg-ink/5 text-slate",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "처리 중",
  APPROVED: "완납",
  PARTIAL_REFUNDED: "부분 환불",
  FULLY_REFUNDED: "전액 환불",
  CANCELLED: "취소",
};

function formatDate(d: Date | null | undefined) {
  if (!d) return "-";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const courseId = Number(id);
  if (isNaN(courseId)) notFound();

  await requireAdminContext(AdminRole.MANAGER);

  const course = await getPrisma().course.findUnique({
    where: { id: courseId },
    include: {
      paymentLinks: {
        include: {
          cohort: {
            select: {
              id: true,
              name: true,
              examCategory: true,
              startDate: true,
              endDate: true,
              isActive: true,
              enrollments: {
                select: { id: true, status: true },
              },
            },
          },
          payments: {
            select: {
              id: true,
              netAmount: true,
              status: true,
              processedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!course) notFound();

  // Aggregate cohorts from payment links
  const cohortMap = new Map<
    string,
    {
      id: string;
      name: string;
      examCategory: string;
      startDate: Date;
      endDate: Date;
      isActive: boolean;
      enrollmentCount: number;
      activeCount: number;
    }
  >();

  for (const link of course.paymentLinks) {
    if (link.cohort) {
      const cohort = link.cohort;
      if (!cohortMap.has(cohort.id)) {
        const activeCount = cohort.enrollments.filter(
          (e) => e.status === "ACTIVE" || e.status === "PENDING",
        ).length;
        cohortMap.set(cohort.id, {
          id: cohort.id,
          name: cohort.name,
          examCategory: cohort.examCategory,
          startDate: cohort.startDate,
          endDate: cohort.endDate,
          isActive: cohort.isActive,
          enrollmentCount: cohort.enrollments.length,
          activeCount,
        });
      }
    }
  }

  const cohorts = Array.from(cohortMap.values());

  // Revenue calculation from payment links
  const allPayments = course.paymentLinks.flatMap((link) => link.payments);
  const totalRevenue = allPayments
    .filter((p) => p.status === "APPROVED" || p.status === "PARTIAL_REFUNDED")
    .reduce((sum, p) => sum + p.netAmount, 0);
  const totalPaymentCount = allPayments.filter(
    (p) => p.status === "APPROVED" || p.status === "PARTIAL_REFUNDED",
  ).length;

  // Recent payments (last 5)
  const recentPayments = [...allPayments]
    .sort((a, b) => b.processedAt.getTime() - a.processedAt.getTime())
    .slice(0, 5);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "설정", href: "/admin/settings/courses" },
          { label: "강좌 관리", href: "/admin/settings/courses" },
          { label: course.name },
        ]}
      />

      {/* 상단 헤더 */}
      <Link
        href="/admin/settings/courses"
        className="text-sm text-slate transition hover:text-ember"
      >
        ← 강좌 목록으로
      </Link>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            강좌 상세
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-ink">{course.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[course.status] ?? "border-ink/20 bg-ink/5 text-slate"}`}
            >
              {STATUS_LABELS[course.status] ?? course.status}
            </span>
            <span className="text-sm text-slate">
              {CATEGORY_LABELS[course.category] ?? course.category}
            </span>
            {course.examType && (
              <span className="text-sm text-slate">
                · {EXAM_TYPE_LABELS[course.examType] ?? course.examType}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 기본 정보 카드 */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">수강료</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {course.tuitionFee.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate">원</span>
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">정원</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {course.maxCapacity != null ? (
              <>
                {course.maxCapacity}
                <span className="ml-1 text-sm font-normal text-slate">명</span>
              </>
            ) : (
              <span className="text-base text-slate">무제한</span>
            )}
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">연결 기수</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {cohorts.length}
            <span className="ml-1 text-sm font-normal text-slate">개</span>
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">누적 수납</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {totalRevenue.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate">원</span>
          </p>
          {totalPaymentCount > 0 && (
            <p className="mt-1 text-xs text-slate">{totalPaymentCount}건</p>
          )}
        </div>
      </div>

      {/* 강좌 설명 + 기수 기간 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[24px] border border-ink/10 bg-white p-6">
          <h2 className="text-base font-semibold text-ink">강좌 정보</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex gap-3">
              <dt className="w-28 flex-shrink-0 font-medium text-slate">강좌명</dt>
              <dd className="text-ink">{course.name}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 flex-shrink-0 font-medium text-slate">분류</dt>
              <dd className="text-ink">{CATEGORY_LABELS[course.category] ?? course.category}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 flex-shrink-0 font-medium text-slate">시험 유형</dt>
              <dd className="text-ink">
                {course.examType
                  ? (EXAM_TYPE_LABELS[course.examType] ?? course.examType)
                  : "공통 (공채+경채)"}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 flex-shrink-0 font-medium text-slate">상태</dt>
              <dd>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[course.status] ?? "border-ink/20 bg-ink/5 text-slate"}`}
                >
                  {STATUS_LABELS[course.status] ?? course.status}
                </span>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 flex-shrink-0 font-medium text-slate">수강료</dt>
              <dd className="tabular-nums text-ink">
                {course.tuitionFee.toLocaleString()}원
              </dd>
            </div>
            {course.maxCapacity != null && (
              <div className="flex gap-3">
                <dt className="w-28 flex-shrink-0 font-medium text-slate">정원</dt>
                <dd className="tabular-nums text-ink">{course.maxCapacity}명</dd>
              </div>
            )}
            {(course.cohortStartDate || course.cohortEndDate) && (
              <div className="flex gap-3">
                <dt className="w-28 flex-shrink-0 font-medium text-slate">기수 기간</dt>
                <dd className="tabular-nums text-ink">
                  {formatDate(course.cohortStartDate)} ~ {formatDate(course.cohortEndDate)}
                </dd>
              </div>
            )}
            {course.description && (
              <div className="flex gap-3">
                <dt className="w-28 flex-shrink-0 font-medium text-slate">설명</dt>
                <dd className="whitespace-pre-wrap text-ink">{course.description}</dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="w-28 flex-shrink-0 font-medium text-slate">등록일</dt>
              <dd className="text-slate">{formatDate(course.createdAt)}</dd>
            </div>
          </dl>
        </div>

        {/* 최근 결제 현황 */}
        <div className="rounded-[24px] border border-ink/10 bg-white p-6">
          <h2 className="text-base font-semibold text-ink">최근 결제 내역</h2>
          {recentPayments.length === 0 ? (
            <p className="mt-4 text-sm text-slate">
              이 강좌에 연결된 결제 내역이 없습니다.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-2xl border border-ink/10 px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_COLORS[payment.status] ?? "border-ink/20 bg-ink/5 text-slate"}`}
                    >
                      {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                    </span>
                    <span className="text-xs text-slate">
                      {formatDate(payment.processedAt)}
                    </span>
                  </div>
                  <span className="tabular-nums font-medium text-ink">
                    {payment.netAmount.toLocaleString()}원
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 연결된 기수 목록 */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="p-6 pb-0">
          <h2 className="text-base font-semibold text-ink">연결된 기수</h2>
          <p className="mt-1 text-sm text-slate">
            이 강좌로 결제 링크가 발급된 기수 목록입니다.
          </p>
        </div>
        {cohorts.length === 0 ? (
          <div className="p-6 text-sm text-slate">
            연결된 기수가 없습니다. 결제 링크를 통해 기수를 연결할 수 있습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  {["기수명", "시험 유형", "기간", "전체 등록", "수강중", "상태", ""].map((h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {cohorts.map((cohort) => (
                  <tr key={cohort.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 font-medium text-ink">{cohort.name}</td>
                    <td className="px-4 py-3 text-slate">{cohort.examCategory}</td>
                    <td className="px-4 py-3 text-xs text-slate">
                      {formatDate(cohort.startDate)} ~ {formatDate(cohort.endDate)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {cohort.enrollmentCount}명
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {cohort.activeCount}명
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          cohort.isActive
                            ? "border-forest/30 bg-forest/10 text-forest"
                            : "border-ink/20 bg-ink/5 text-slate"
                        }`}
                      >
                        {cohort.isActive ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/settings/cohorts/${cohort.id}`}
                        className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                      >
                        기수 상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 결제 링크 목록 */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="p-6 pb-0">
          <h2 className="text-base font-semibold text-ink">결제 링크</h2>
          <p className="mt-1 text-sm text-slate">
            이 강좌에 연결된 결제 링크 목록입니다.
          </p>
        </div>
        {course.paymentLinks.length === 0 ? (
          <div className="p-6 text-sm text-slate">연결된 결제 링크가 없습니다.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  {["링크 제목", "금액", "결제 건수", "만료일", "상태"].map((h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {course.paymentLinks.map((link) => (
                  <tr key={link.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 font-medium text-ink">{link.title}</td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {link.finalAmount.toLocaleString()}원
                      {link.discountAmount > 0 && (
                        <span className="ml-1 text-xs text-slate line-through">
                          ({link.amount.toLocaleString()}원)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {link.payments.length}건
                    </td>
                    <td className="px-4 py-3 text-xs text-slate">
                      {formatDate(link.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${LINK_STATUS_COLORS[link.status] ?? "border-ink/20 bg-ink/5 text-slate"}`}
                      >
                        {LINK_STATUS_LABELS[link.status] ?? link.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
