import Link from "next/link";
import { AdminRole, SpecialLectureType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "수강중",
  WAITING: "순번대기",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "border-forest/30 bg-forest/10 text-forest";
    case "COMPLETED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "WAITING":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "SUSPENDED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "WITHDRAWN":
    case "CANCELLED":
      return "border-ink/20 bg-ink/5 text-slate";
    default:
      return "border-ink/20 bg-ink/5 text-slate";
  }
}

function formatKRW(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

export default async function InterviewCoachingPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const db = getPrisma();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  // Fetch all INTERVIEW_COACHING special lectures
  const lectures = await db.specialLecture.findMany({
    where: { lectureType: SpecialLectureType.INTERVIEW_COACHING },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      subjects: {
        include: { instructor: { select: { name: true } } },
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: {
          enrollments: {
            where: { status: { in: ["ACTIVE", "PENDING", "WAITING"] } },
          },
        },
      },
    },
  });

  // Fetch recent enrollments for interview coaching
  const recentEnrollments = await db.courseEnrollment.findMany({
    where: {
      specialLectureId: { in: lectures.map((l) => l.id) },
    },
    include: {
      student: { select: { examNumber: true, name: true, phone: true } },
      specialLecture: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Stats
  const [totalEnrollCount, thisMonthNewCount, completingSoonCount] =
    await Promise.all([
      db.courseEnrollment.count({
        where: {
          specialLectureId: { in: lectures.map((l) => l.id) },
          status: { in: ["ACTIVE", "PENDING", "COMPLETED"] },
        },
      }),
      db.courseEnrollment.count({
        where: {
          specialLectureId: { in: lectures.map((l) => l.id) },
          status: { in: ["ACTIVE", "PENDING"] },
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      // "완료 예정" = ACTIVE enrollments where lecture ends within 30 days
      db.courseEnrollment.count({
        where: {
          specialLectureId: {
            in: lectures
              .filter(
                (l) =>
                  l.isActive &&
                  l.endDate > now &&
                  l.endDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
              )
              .map((l) => l.id),
          },
          status: "ACTIVE",
        },
      }),
    ]);

  const activeLectures = lectures.filter(
    (l) => l.isActive && new Date(l.endDate) >= now,
  );
  const endedLectures = lectures.filter(
    (l) => !l.isActive || new Date(l.endDate) < now,
  );

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link
          href="/admin/special-lectures"
          className="transition hover:text-ember"
        >
          특강 단과 관리
        </Link>
        <span>/</span>
        <span className="text-ink">면접 코칭반</span>
      </nav>

      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        면접 코칭
      </div>
      <h1 className="mt-5 text-3xl font-semibold">면접 코칭반 관리</h1>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
        면접 코칭 특강 강좌 및 수강생 현황을 한눈에 조회합니다.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/admin/enrollments/new?type=interview-coaching"
          className="inline-flex items-center justify-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          면접 코칭반 등록
        </Link>
        <Link
          href="/admin/settings/special-lectures"
          className="inline-flex items-center justify-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
        >
          강좌 설정 보기
        </Link>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            총 면접 코칭 강좌
          </p>
          <p className="mt-3 text-2xl font-semibold text-ink">
            {lectures.length}
          </p>
          <p className="mt-1 text-xs text-slate">진행중 {activeLectures.length}개</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            총 면접 코칭 수강생
          </p>
          <p className="mt-3 text-2xl font-semibold text-forest">
            {totalEnrollCount}
          </p>
          <p className="mt-1 text-xs text-slate">전체 등록 기준</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            이번 달 신규
          </p>
          <p className="mt-3 text-2xl font-semibold text-ember">
            {thisMonthNewCount}
          </p>
          <p className="mt-1 text-xs text-slate">이번 달 신규 등록</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            수료 예정 (30일)
          </p>
          <p className="mt-3 text-2xl font-semibold text-amber-600">
            {completingSoonCount}
          </p>
          <p className="mt-1 text-xs text-slate">진행중 강좌 종료 예정</p>
        </div>
      </div>

      {/* Active Lectures */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">진행중 면접 코칭 강좌</h2>
          <Link
            href="/admin/special-lectures"
            className="inline-flex items-center gap-1 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ember/30 hover:text-ember"
          >
            전체 특강 보기
          </Link>
        </div>

        {activeLectures.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            현재 진행 중인 면접 코칭 강좌가 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeLectures.map((lecture) => {
              const instructorNames = Array.from(
                new Set(lecture.subjects.map((s) => s.instructor.name)),
              );
              const maxCap =
                lecture.maxCapacityOffline ?? lecture.maxCapacityLive;
              const enrolled = lecture._count.enrollments;
              const fillRate =
                maxCap != null && maxCap > 0
                  ? Math.min(100, Math.round((enrolled / maxCap) * 100))
                  : null;
              return (
                <div
                  key={lecture.id}
                  className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-ink leading-snug">
                      {lecture.name}
                    </h3>
                    <span className="inline-flex shrink-0 rounded-full border border-forest/30 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                      진행중
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate">
                    {lecture.startDate.toISOString().slice(0, 10)} ~{" "}
                    {lecture.endDate.toISOString().slice(0, 10)}
                  </p>
                  {instructorNames.length > 0 && (
                    <p className="mt-1 text-xs text-slate">
                      강사: {instructorNames.join(", ")}
                    </p>
                  )}
                  {lecture.fullPackagePrice != null && (
                    <p className="mt-1 text-xs text-slate">
                      수강료: {formatKRW(lecture.fullPackagePrice)}
                    </p>
                  )}

                  {/* Enrollment progress */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate">
                        수강생{" "}
                        <span className="font-semibold text-ink">
                          {enrolled}명
                        </span>
                        {maxCap != null && (
                          <span className="text-slate"> / {maxCap}명</span>
                        )}
                      </span>
                      {fillRate !== null && (
                        <span className="text-xs text-slate">{fillRate}%</span>
                      )}
                    </div>
                    {fillRate !== null && (
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-mist">
                        <div
                          className={`h-full rounded-full transition-all ${
                            fillRate >= 90
                              ? "bg-red-500"
                              : fillRate >= 70
                                ? "bg-amber-500"
                                : "bg-forest"
                          }`}
                          style={{ width: `${fillRate}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <Link
                      href={`/admin/special-lectures/${lecture.id}`}
                      className="inline-flex items-center rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/20"
                    >
                      상세 보기
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Ended Lectures summary */}
      {endedLectures.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-xl font-semibold">종료된 면접 코칭 강좌</h2>
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  {["강좌명", "기간", "강사", "수강 현황", ""].map((h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {endedLectures.map((lecture) => {
                  const instructorNames = Array.from(
                    new Set(lecture.subjects.map((s) => s.instructor.name)),
                  );
                  const maxCap =
                    lecture.maxCapacityOffline ?? lecture.maxCapacityLive;
                  return (
                    <tr key={lecture.id} className="transition hover:bg-mist/20">
                      <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                        {lecture.name}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                        {lecture.startDate.toISOString().slice(0, 10)} ~{" "}
                        {lecture.endDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {instructorNames.length > 0
                          ? instructorNames.join(", ")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-sm text-ink whitespace-nowrap">
                        {lecture._count.enrollments}
                        {maxCap != null ? (
                          <span className="text-slate"> / {maxCap}명</span>
                        ) : (
                          <span className="text-slate">명</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/special-lectures/${lecture.id}`}
                          className="inline-flex rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                        >
                          상세
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent enrollments table */}
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold">최근 면접 코칭 수강 등록</h2>
        {recentEnrollments.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            등록된 수강생이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  {["학번", "이름", "연락처", "수강 강좌명", "등록일", "수강 상태"].map(
                    (h) => (
                      <th
                        key={h}
                        className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {recentEnrollments.map((enrollment) => (
                  <tr
                    key={enrollment.id}
                    className="transition hover:bg-mist/20"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${enrollment.student.examNumber}`}
                        className="font-mono text-xs text-ember underline underline-offset-2 hover:text-ember/80"
                      >
                        {enrollment.student.examNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${enrollment.student.examNumber}`}
                        className="font-semibold text-ink transition hover:text-ember"
                      >
                        {enrollment.student.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {enrollment.student.phone ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-ink whitespace-nowrap">
                      {enrollment.specialLecture?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {enrollment.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(enrollment.status)}`}
                      >
                        {ENROLLMENT_STATUS_LABEL[enrollment.status] ??
                          enrollment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
