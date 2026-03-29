import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { EXAM_CATEGORY_LABEL, ENROLLMENT_STATUS_LABEL, ENROLLMENT_STATUS_COLOR } from "@/lib/constants";
import { ProductEditForm } from "./product-edit-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function calcDiscountRate(regular: number, sale: number): string {
  if (regular <= 0 || sale >= regular) return "-";
  const rate = Math.round(((regular - sale) / regular) * 100);
  return `${rate}%`;
}

export default async function ComprehensiveProductDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const { id } = await params;

  const product = await getPrisma().comprehensiveCourseProduct.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: {
          student: { select: { name: true, phone: true } },
          cohort: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!product) notFound();

  // Gather unique cohorts using this product
  const cohortMap = new Map<string, { id: string; name: string; count: number }>();
  for (const e of product.enrollments) {
    if (e.cohort) {
      const existing = cohortMap.get(e.cohort.id);
      if (existing) {
        existing.count++;
      } else {
        cohortMap.set(e.cohort.id, { id: e.cohort.id, name: e.cohort.name, count: 1 });
      }
    }
  }
  const cohorts = Array.from(cohortMap.values());

  const activeCount = product.enrollments.filter((e) =>
    ["ACTIVE", "PENDING"].includes(e.status),
  ).length;
  const totalCount = product.enrollments.length;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "설정", href: "/admin/settings/comprehensive-products" },
          { label: "종합반 상품 관리", href: "/admin/settings/comprehensive-products" },
          { label: product.name },
        ]}
      />

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            종합반 상품 상세
          </div>
          <h1 className="mt-4 text-3xl font-semibold">{product.name}</h1>
          <p className="mt-1 text-sm text-slate">
            {EXAM_CATEGORY_LABEL[product.examCategory]} · {product.durationMonths}개월
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href="/admin/settings/comprehensive-products"
            className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
          >
            ← 목록으로
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: details + edit form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
              <p className="text-xs text-slate">정가</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate line-through">
                {product.regularPrice.toLocaleString()}원
              </p>
            </div>
            <div className="rounded-[20px] border border-ember/20 bg-ember/5 px-5 py-4">
              <p className="text-xs text-slate">판매가</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-ember">
                {product.salePrice.toLocaleString()}원
              </p>
            </div>
            <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
              <p className="text-xs text-slate">할인율</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {calcDiscountRate(product.regularPrice, product.salePrice)}
              </p>
            </div>
            <div className="rounded-[20px] border border-forest/20 bg-forest/5 px-5 py-4">
              <p className="text-xs text-slate">수강 등록</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-forest">
                {activeCount}명
                <span className="ml-1 text-xs font-normal text-slate">/ 전체 {totalCount}명</span>
              </p>
            </div>
          </div>

          {/* Product details */}
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
            <h2 className="text-sm font-semibold text-ink">상품 정보</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate">상품명</dt>
                <dd className="mt-0.5 font-medium text-ink">{product.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate">수험 유형</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {EXAM_CATEGORY_LABEL[product.examCategory]}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate">수강 기간</dt>
                <dd className="mt-0.5 font-medium text-ink">{product.durationMonths}개월</dd>
              </div>
              <div>
                <dt className="text-xs text-slate">상태</dt>
                <dd className="mt-0.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      product.isActive
                        ? "bg-forest/10 text-forest"
                        : "bg-slate/10 text-slate"
                    }`}
                  >
                    {product.isActive ? "활성" : "비활성"}
                  </span>
                </dd>
              </div>
              {product.features && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate">혜택 내용</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-ink">{product.features}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate">등록일</dt>
                <dd className="mt-0.5 text-slate">
                  {product.createdAt.toLocaleDateString("ko-KR")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate">최종 수정</dt>
                <dd className="mt-0.5 text-slate">
                  {product.updatedAt.toLocaleDateString("ko-KR")}
                </dd>
              </div>
            </dl>
          </div>

          {/* Edit form */}
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">상품 수정</h2>
            <ProductEditForm
              id={product.id}
              initialData={{
                name: product.name,
                examCategory: product.examCategory,
                durationMonths: product.durationMonths,
                regularPrice: product.regularPrice,
                salePrice: product.salePrice,
                features: product.features ?? "",
                isActive: product.isActive,
              }}
            />
          </div>
        </div>

        {/* Right: cohorts + recent enrollments */}
        <div className="space-y-6">
          {/* Cohorts using this product */}
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
            <h2 className="mb-3 text-sm font-semibold text-ink">사용 중인 기수</h2>
            {cohorts.length === 0 ? (
              <p className="text-xs text-slate">이 상품을 사용하는 기수가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {cohorts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <Link
                      href={`/admin/settings/cohorts/${c.id}`}
                      className="font-medium text-ink hover:text-forest"
                    >
                      {c.name}
                    </Link>
                    <span className="tabular-nums text-xs text-slate">{c.count}명</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent enrollments */}
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
            <h2 className="mb-3 text-sm font-semibold text-ink">
              수강 등록 목록
              <span className="ml-2 text-xs font-normal text-slate">최신 20건</span>
            </h2>
            {product.enrollments.length === 0 ? (
              <p className="text-xs text-slate">등록된 수강생이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {product.enrollments.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link
                      href={`/admin/students/${e.examNumber}`}
                      className="font-medium text-ink hover:text-forest"
                    >
                      {e.student.name}
                    </Link>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ENROLLMENT_STATUS_COLOR[e.status]}`}
                      >
                        {ENROLLMENT_STATUS_LABEL[e.status]}
                      </span>
                      <Link
                        href={`/admin/enrollments/${e.id}`}
                        className="text-slate hover:text-forest"
                      >
                        상세
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {product.enrollments.length > 20 && (
              <p className="mt-2 text-xs text-slate">
                외 {product.enrollments.length - 20}건 더 있습니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
