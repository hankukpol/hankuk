import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ProductManager } from "@/components/comprehensive-products/product-manager";
import { CourseManager } from "@/components/courses/course-manager";

export const dynamic = "force-dynamic";

function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}

export default async function CoursesSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const [products, courses, activeLectureCount] = await Promise.all([
    prisma.comprehensiveCourseProduct.findMany({
      orderBy: [{ examCategory: "asc" }, { durationMonths: "asc" }],
    }),
    prisma.course.findMany({
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.specialLecture.count({
      where: { isActive: true },
    }),
  ]);

  const activeProductCount = products.filter((product) => product.isActive).length;
  const activeCourseCount = courses.filter((course) => course.isActive).length;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 강좌 마스터
      </div>
      <h1 className="mt-5 text-3xl font-semibold">강좌 마스터 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        문서상 <code>/admin/settings/courses</code>에 해당하는 운영 기준 화면입니다. 종합반 수강 등록은
        아래 종합반 상품 마스터를 기준으로 동작하고, 특강과 교재 설정은 연결 화면에서 함께 관리합니다.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-forest">종합반 상품</p>
          <p className="mt-2 text-3xl font-semibold text-forest">{formatCount(activeProductCount)}</p>
          <p className="mt-1 text-xs text-forest/80">현재 수강 등록에서 직접 사용하는 활성 상품 수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">레거시 과정</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{formatCount(activeCourseCount)}</p>
          <p className="mt-1 text-xs text-slate">결제 링크·기존 운영 화면에서 참조하는 과정 카탈로그</p>
        </div>
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-700">활성 특강</p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">{formatCount(activeLectureCount)}</p>
          <p className="mt-1 text-xs text-amber-700/80">특강 상품은 별도 특강 설정 화면에서 관리</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/admin/settings/special-lectures"
          className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
        >
          특강 설정
        </Link>
        <Link
          href="/admin/settings/textbooks"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          교재 관리
        </Link>
        <Link
          href="/admin/settings/comprehensive-products"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/15"
        >
          종합반 상품 전용 화면
        </Link>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">종합반 상품 마스터</h2>
            <p className="mt-1 text-sm text-slate">
              시험 구분, 수강 개월수, 정가·판매가, 상품 특징을 관리합니다. 신규 수강 등록의 종합반 선택 목록은
              이 데이터를 기준으로 생성됩니다.
            </p>
          </div>
        </div>
        <ProductManager
          initialProducts={products.map((product) => ({
            ...product,
            createdAt: product.createdAt.toISOString(),
            updatedAt: product.updatedAt.toISOString(),
          })) as any}
        />
      </section>

      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">기타 과정 카탈로그</h2>
            <p className="mt-1 text-sm text-slate">
              기존 운영 화면과 결제 링크에서 참조하는 일반 과정 마스터입니다. 종합반 등록 기준 데이터는 위
              종합반 상품 마스터가 우선입니다.
            </p>
          </div>
        </div>
        <CourseManager
          initialCourses={courses.map((course) => ({
            ...course,
            cohortStartDate: course.cohortStartDate?.toISOString() ?? null,
            cohortEndDate: course.cohortEndDate?.toISOString() ?? null,
            createdAt: course.createdAt.toISOString(),
            updatedAt: course.updatedAt.toISOString(),
          })) as any}
        />
      </section>
    </div>
  );
}
