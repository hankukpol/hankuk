import Link from "next/link";
import { AdminRole, CourseType, Prisma } from "@prisma/client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { requireAdminContext } from "@/lib/auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

type SearchParams = {
  status?: string;
  consent?: string;
  courseType?: string;
  from?: string;
  to?: string;
  q?: string;
};

type ContractRow = Prisma.CourseContractGetPayload<{
  include: {
    enrollment: {
      include: {
        student: { select: { examNumber: true; name: true; phone: true; notificationConsent: true } };
        cohort: { select: { name: true } };
        product: { select: { name: true } };
        specialLecture: { select: { name: true } };
      };
    };
    staff: { select: { name: true } };
  };
}>;

function buildSearchQuery(sp: SearchParams) {
  return new URLSearchParams(
    Object.entries(sp).filter(([, value]) => value && String(value).trim().length > 0) as [string, string][],
  ).toString();
}

export default async function EnrollmentContractsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireAdminContext(AdminRole.COUNSELOR);
  const sp = await searchParams;
  const academyId = resolveVisibleAcademyId(context);
  const prisma = getPrisma();

  const contractWhere: Prisma.CourseContractWhereInput = {};
  if (sp.status === "printed") {
    contractWhere.printedAt = { not: null };
  } else if (sp.status === "unprinted") {
    contractWhere.printedAt = null;
  }

  if (sp.consent === "recorded") {
    contractWhere.privacyConsentedAt = { not: null };
  } else if (sp.consent === "missing") {
    contractWhere.privacyConsentedAt = null;
  }

  if (sp.from || sp.to) {
    contractWhere.issuedAt = {
      ...(sp.from ? { gte: new Date(sp.from) } : {}),
      ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59`) } : {}),
    };
  }

  const courseType = sp.courseType as CourseType | undefined;
  const query = sp.q?.trim();

  const enrollmentFilter = applyAcademyScope(
    {
      ...(courseType ? { courseType } : {}),
      ...(query
        ? {
            OR: [
              { examNumber: { contains: query } },
              { student: { is: { name: { contains: query } } } },
              { student: { is: { phone: { contains: query } } } },
            ],
          }
        : {}),
    },
    academyId,
  ) as Prisma.CourseEnrollmentWhereInput;

  const contracts: ContractRow[] = await prisma.courseContract.findMany({
    where: {
      ...contractWhere,
      enrollment: { is: enrollmentFilter },
    },
    include: {
      enrollment: {
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
              notificationConsent: true,
            },
          },
          cohort: { select: { name: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      },
      staff: { select: { name: true } },
    },
    orderBy: { issuedAt: "desc" },
    take: 500,
  });

  const totalCount = contracts.length;
  const printedCount = contracts.filter((contract) => Boolean(contract.printedAt)).length;
  const missingConsentCount = contracts.filter((contract) => !contract.privacyConsentedAt).length;
  const unprintedCount = totalCount - printedCount;

  return (
    <div className="min-h-screen bg-[#F7F4EF] p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/enrollments" },
          { label: "수강 계약서 허브" },
        ]}
      />

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-[#1F4D3A]/20 bg-[#1F4D3A]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
            수강 계약서
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[#111827]">수강 계약서 허브</h1>
          <p className="mt-1 text-sm text-[#4B5563]">
            계약서 발급 현황, 필수 개인정보 동의 기록, 출력 상태를 한 화면에서 관리합니다.
          </p>
        </div>

        <a
          href={`/api/enrollments/contracts/export?${buildSearchQuery(sp)}`}
          className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
        >
          CSV 내보내기
        </a>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "전체 계약서", value: totalCount, color: "text-[#111827]" },
          { label: "출력 완료", value: printedCount, color: "text-[#1F4D3A]" },
          { label: "미출력", value: unprintedCount, color: "text-[#C55A11]" },
          { label: "동의 기록 필요", value: missingConsentCount, color: "text-amber-700" },
        ].map((item) => (
          <div key={item.label} className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">{item.label}</p>
            <p className={`mt-2 text-2xl font-bold ${item.color}`}>{item.value.toLocaleString()}건</p>
          </div>
        ))}
      </div>

      <form method="GET" className="mb-6 rounded-[28px] border border-[#111827]/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="이름, 학번, 연락처 검색"
            className="w-56 rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30"
          />
          <select name="status" defaultValue={sp.status ?? ""} className="rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30">
            <option value="">전체 출력 상태</option>
            <option value="unprinted">미출력</option>
            <option value="printed">출력 완료</option>
          </select>
          <select name="consent" defaultValue={sp.consent ?? ""} className="rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30">
            <option value="">전체 동의 상태</option>
            <option value="recorded">동의 기록 완료</option>
            <option value="missing">동의 기록 필요</option>
          </select>
          <select name="courseType" defaultValue={sp.courseType ?? ""} className="rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30">
            <option value="">전체 강좌 유형</option>
            <option value="COMPREHENSIVE">종합반</option>
            <option value="SPECIAL_LECTURE">특강</option>
          </select>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30" />
          <span className="text-sm text-[#4B5563]">~</span>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="rounded-2xl border border-[#111827]/10 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3A]/30" />
          <button type="submit" className="rounded-2xl bg-[#C55A11] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#C55A11]/90">
            검색
          </button>
          {(sp.q || sp.status || sp.consent || sp.courseType || sp.from || sp.to) ? (
            <Link href="/admin/enrollments/contracts" className="rounded-2xl border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30">
              초기화
            </Link>
          ) : null}
        </div>
      </form>

      <section className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#111827]">
            계약서 목록 <span className="text-base font-normal text-[#4B5563]">({totalCount}건)</span>
          </h2>
        </div>

        {contracts.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#111827]/10 py-12 text-center text-sm text-[#4B5563]">
            조회 조건에 맞는 계약서가 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-[#111827]/10">
            <table className="min-w-full divide-y divide-[#111827]/10 text-sm">
              <thead className="bg-[#F7F4EF]/80 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">학생명</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">학번</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">연락처</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">수강내역</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">강좌 유형</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">개인정보 동의</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">출력일</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">담당자</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#111827]/10 bg-white">
                {contracts.map((contract) => {
                  const courseName =
                    contract.enrollment.cohort?.name ??
                    contract.enrollment.product?.name ??
                    contract.enrollment.specialLecture?.name ??
                    "-";

                  return (
                    <tr key={contract.id} className="transition-colors hover:bg-[#F7F4EF]/60">
                      <td className="px-5 py-3.5 font-medium text-[#111827]">
                        <Link href={`/admin/students/${contract.enrollment.student.examNumber}`} className="transition hover:text-[#C55A11]">
                          {contract.enrollment.student.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">{contract.enrollment.student.examNumber}</td>
                      <td className="px-5 py-3.5 text-[#4B5563]">{contract.enrollment.student.phone ?? "-"}</td>
                      <td className="px-5 py-3.5 text-[#4B5563]">{courseName}</td>
                      <td className="px-5 py-3.5 text-[#4B5563]">{COURSE_TYPE_LABEL[contract.enrollment.courseType]}</td>
                      <td className="px-5 py-3.5">
                        {contract.privacyConsentedAt ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                            {formatDate(contract.privacyConsentedAt.toISOString())}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            기록 필요
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">{contract.printedAt ? formatDate(contract.printedAt.toISOString()) : "-"}</td>
                      <td className="px-5 py-3.5 text-[#4B5563]">{contract.staff.name}</td>
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/enrollments/${contract.enrollment.id}/contract`} className="inline-flex">
                          {contract.printedAt ? (
                            <span className="inline-flex rounded-full border border-[#1F4D3A]/20 bg-[#1F4D3A]/10 px-2.5 py-0.5 text-xs font-semibold text-[#1F4D3A]">
                              출력 완료
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-[#C55A11]/20 bg-[#C55A11]/10 px-2.5 py-0.5 text-xs font-semibold text-[#C55A11]">
                              계약서 열기
                            </span>
                          )}
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
