import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams?: { q?: string };
};

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "수강 중",
  WAITING: "대기자",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "처리 중",
  APPROVED: "승인",
  PARTIAL_REFUNDED: "부분 환불",
  FULLY_REFUNDED: "전액 환불",
  CANCELLED: "취소",
};

const PAYMENT_CATEGORY_LABEL: Record<string, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구",
  SINGLE_COURSE: "단과",
  PENALTY: "위약금",
  ETC: "기타",
};

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

export default async function AdminSearchPage({ searchParams }: SearchPageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const q = (searchParams?.q ?? "").trim();
  const isValidQuery = q.length >= 2;

  let students: Array<{
    examNumber: string;
    name: string;
    phone: string | null;
    isActive: boolean;
  }> = [];

  let enrollments: Array<{
    id: string;
    examNumber: string;
    courseType: string;
    status: string;
    startDate: Date;
    student: { name: string };
    product: { name: string } | null;
    cohort: { name: string } | null;
    specialLecture: { name: string } | null;
  }> = [];

  let payments: Array<{
    id: string;
    examNumber: string | null;
    category: string;
    status: string;
    netAmount: number;
    processedAt: Date;
    student: { name: string; examNumber: string } | null;
  }> = [];

  if (isValidQuery) {
    const db = getPrisma();
    [students, enrollments, payments] = await Promise.all([
      db.student.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { examNumber: { contains: q } },
            { phone: { contains: q } },
          ],
        },
        select: { examNumber: true, name: true, phone: true, isActive: true },
        orderBy: { name: "asc" },
        take: 10,
      }),
      db.courseEnrollment.findMany({
        where: {
          OR: [
            { student: { name: { contains: q } } },
            { student: { examNumber: { contains: q } } },
            { examNumber: { contains: q } },
            { cohort: { name: { contains: q } } },
            { product: { name: { contains: q } } },
            { specialLecture: { name: { contains: q } } },
          ],
        },
        select: {
          id: true,
          examNumber: true,
          courseType: true,
          status: true,
          startDate: true,
          student: { select: { name: true } },
          product: { select: { name: true } },
          cohort: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.payment.findMany({
        where: {
          student: {
            OR: [
              { name: { contains: q } },
              { examNumber: { contains: q } },
            ],
          },
        },
        select: {
          id: true,
          examNumber: true,
          category: true,
          status: true,
          netAmount: true,
          processedAt: true,
          student: { select: { name: true, examNumber: true } },
        },
        orderBy: { processedAt: "desc" },
        take: 5,
      }),
    ]);
  }

  function getEnrollmentCourseName(e: typeof enrollments[number]) {
    if (e.cohort) return e.cohort.name;
    if (e.product) return e.product.name;
    if (e.specialLecture) return e.specialLecture.name;
    return e.courseType === "SPECIAL_LECTURE" ? "특강" : "종합반";
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Page badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        통합 검색
      </div>
      <h1 className="mt-5 text-3xl font-semibold">통합 검색</h1>
      <p className="mt-4 max-w-2xl text-sm leading-8 text-slate sm:text-base">
        학생·수강·수납 전체에서 검색합니다.
      </p>

      {/* Keyboard shortcut hint */}
      <p className="mt-1 text-xs text-slate/60">
        Cmd/Ctrl+K로 빠른 검색 (사이드바 검색창 사용)
      </p>

      {/* Search form */}
      <form method="GET" action="/admin/search" className="mt-8">
        <div className="flex max-w-xl gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="학생명, 학번, 연락처, 강좌명 입력 (2자 이상)"
            autoFocus
            className="flex-1 rounded-lg border border-slate/30 bg-white px-4 py-2.5 text-sm text-ink shadow-sm outline-none placeholder:text-slate/40 focus:border-ember focus:ring-2 focus:ring-ember/20"
          />
          <button
            type="submit"
            className="rounded-lg bg-ember px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ember/90 active:scale-[0.97]"
          >
            검색
          </button>
        </div>
        {q.length > 0 && q.length < 2 && (
          <p className="mt-2 text-xs text-red-500">검색어는 2자 이상이어야 합니다.</p>
        )}
      </form>

      {/* Results */}
      {isValidQuery && (
        <div className="mt-10 space-y-10">
          {/* Students section */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-base font-semibold text-ink">학생 검색</h2>
              <span className="rounded-full bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                {students.length}건{students.length === 10 && " (최대 10건)"}
              </span>
            </div>
            {students.length === 0 ? (
              <p className="rounded-lg border border-slate/10 bg-mist px-4 py-3 text-sm text-slate">
                검색 결과 없음
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate/15 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate/10 bg-mist/60">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">학번</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">이름</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">연락처</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">상태</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate/8">
                    {students.map((s) => (
                      <tr key={s.examNumber} className="transition hover:bg-mist/40">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/students/${s.examNumber}`}
                            className="font-mono text-xs font-medium text-forest hover:underline"
                          >
                            {s.examNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/students/${s.examNumber}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {s.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-slate">
                          {s.phone ?? "-"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              s.isActive
                                ? "bg-green-50 text-green-700"
                                : "bg-slate/10 text-slate"
                            }`}
                          >
                            {s.isActive ? "재원" : "비활성"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={`/admin/students/${s.examNumber}`}
                            className="text-xs text-ember hover:underline"
                          >
                            상세보기 →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Enrollments section */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-base font-semibold text-ink">수강 검색</h2>
              <span className="rounded-full bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                {enrollments.length}건{enrollments.length === 10 && " (최대 10건)"}
              </span>
            </div>
            {enrollments.length === 0 ? (
              <p className="rounded-lg border border-slate/10 bg-mist px-4 py-3 text-sm text-slate">
                검색 결과 없음
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate/15 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate/10 bg-mist/60">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">학번</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">학생명</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">강좌/기수</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">상태</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">시작일</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate/8">
                    {enrollments.map((e) => (
                      <tr key={e.id} className="transition hover:bg-mist/40">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/students/${e.examNumber}`}
                            className="font-mono text-xs font-medium text-forest hover:underline"
                          >
                            {e.examNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-ink">
                          {e.student.name}
                        </td>
                        <td className="px-4 py-2.5 text-slate">
                          {getEnrollmentCourseName(e)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              e.status === "ACTIVE"
                                ? "bg-green-50 text-green-700"
                                : e.status === "WAITING"
                                ? "bg-yellow-50 text-yellow-700"
                                : e.status === "SUSPENDED"
                                ? "bg-orange-50 text-orange-700"
                                : e.status === "COMPLETED"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-slate/10 text-slate"
                            }`}
                          >
                            {ENROLLMENT_STATUS_LABEL[e.status] ?? e.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate">
                          {formatDate(e.startDate)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={`/admin/enrollments/${e.id}`}
                            className="text-xs text-ember hover:underline"
                          >
                            상세보기 →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Payments section */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-base font-semibold text-ink">수납 검색</h2>
              <span className="rounded-full bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                {payments.length}건{payments.length === 5 && " (최대 5건)"}
              </span>
            </div>
            {payments.length === 0 ? (
              <p className="rounded-lg border border-slate/10 bg-mist px-4 py-3 text-sm text-slate">
                검색 결과 없음
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate/15 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate/10 bg-mist/60">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">학생명</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">학번</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">구분</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">금액</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">상태</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate">처리일</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate/8">
                    {payments.map((p) => (
                      <tr key={p.id} className="transition hover:bg-mist/40">
                        <td className="px-4 py-2.5 font-medium text-ink">
                          {p.student ? (
                            <Link
                              href={`/admin/students/${p.student.examNumber}`}
                              className="hover:underline"
                            >
                              {p.student.name}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {p.student ? (
                            <Link
                              href={`/admin/students/${p.student.examNumber}`}
                              className="font-mono text-xs font-medium text-forest hover:underline"
                            >
                              {p.student.examNumber}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-slate">
                              {p.examNumber ?? "-"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate">
                          {PAYMENT_CATEGORY_LABEL[p.category] ?? p.category}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-ink">
                          {formatKRW(p.netAmount)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              p.status === "APPROVED"
                                ? "bg-green-50 text-green-700"
                                : p.status === "PARTIAL_REFUNDED"
                                ? "bg-yellow-50 text-yellow-700"
                                : p.status === "FULLY_REFUNDED"
                                ? "bg-red-50 text-red-700"
                                : "bg-slate/10 text-slate"
                            }`}
                          >
                            {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate">
                          {formatDate(p.processedAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={`/admin/payments/${p.id}`}
                            className="text-xs text-ember hover:underline"
                          >
                            상세보기 →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Empty state: no query yet */}
      {!isValidQuery && q.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-3 text-slate/50">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <p className="text-sm">검색어를 입력하면 결과가 표시됩니다.</p>
        </div>
      )}
    </div>
  );
}
