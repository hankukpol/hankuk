import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatDate(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAY_KO[d.getDay()];
  return `${d.getFullYear()}년 ${m}월 ${day}일 (${dow})`;
}

export default async function ClassroomAttendanceOverviewPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // Fetch all active classrooms with their students and today's attendance logs
  const classrooms = await getPrisma().classroom.findMany({
    where: { isActive: true },
    include: {
      teacher: { select: { id: true, name: true } },
      students: {
        where: { leftAt: null },
        select: { examNumber: true, student: { select: { name: true } } },
      },
      attendanceLogs: {
        where: { attendDate: { gte: todayStart, lt: todayEnd } },
        select: { examNumber: true, attendType: true },
      },
    },
    orderBy: [{ generation: "desc" }, { name: "asc" }],
  });

  // Compute per-classroom stats
  const classroomStats = classrooms.map((cr) => {
    const totalStudents = cr.students.length;
    const logMap = new Map(cr.attendanceLogs.map((l) => [l.examNumber, l.attendType]));

    let normal = 0;
    let live = 0;
    let excused = 0;
    let absent = 0;
    let noRecord = 0;

    for (const s of cr.students) {
      const type = logMap.get(s.examNumber);
      if (!type) {
        noRecord++;
      } else if (type === AttendType.NORMAL) {
        normal++;
      } else if (type === AttendType.LIVE) {
        live++;
      } else if (type === AttendType.EXCUSED) {
        excused++;
      } else if (type === AttendType.ABSENT) {
        absent++;
      }
    }

    const recordedCount = normal + live + excused + absent;
    const presentRate =
      recordedCount > 0
        ? Math.round(((normal + live) / recordedCount) * 100)
        : null;

    return {
      id: cr.id,
      name: cr.name,
      generation: cr.generation,
      teacherName: cr.teacher.name,
      totalStudents,
      recordedCount,
      noRecord,
      normal,
      live,
      excused,
      absent,
      presentRate,
    };
  });

  // Overall KPI
  const totalNormal = classroomStats.reduce((s, c) => s + c.normal, 0);
  const totalLive = classroomStats.reduce((s, c) => s + c.live, 0);
  const totalExcused = classroomStats.reduce((s, c) => s + c.excused, 0);
  const totalAbsent = classroomStats.reduce((s, c) => s + c.absent, 0);
  const totalNoRecord = classroomStats.reduce((s, c) => s + c.noRecord, 0);
  const totalStudents = classroomStats.reduce((s, c) => s + c.totalStudents, 0);
  const totalPresent = totalNormal + totalLive;
  const totalRecorded = totalNormal + totalLive + totalExcused + totalAbsent;

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin/classrooms" className="text-sm text-slate hover:text-ink transition">
          ← 담임반 목록
        </Link>
        <span className="text-slate/40">/</span>
        <Link href="/admin/attendance" className="text-sm text-slate hover:text-ink transition">
          출결 허브
        </Link>
      </div>
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        출결 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">반별 출결 현황</h1>
      <p className="mt-2 text-sm text-slate">{formatDate(todayStart)} 기준</p>
      <p className="mt-3 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        오늘 날짜를 기준으로 각 담임반의 출결 현황을 한눈에 확인합니다.
        반 이름을 클릭하면 상세 출결 내역으로 이동합니다.
      </p>

      {/* ── 전체 KPI ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          전체 현황 (오늘)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">재적 학생</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{totalStudents}</p>
            <p className="mt-1 text-xs text-slate">활성 반 기준</p>
          </article>

          <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">출석</p>
            <p className="mt-3 text-3xl font-semibold text-forest">{totalPresent}</p>
            <p className="mt-1 text-xs text-forest/60">정상 + 라이브</p>
          </article>

          <article className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">공결</p>
            <p className="mt-3 text-3xl font-semibold text-amber-700">{totalExcused}</p>
            <p className="mt-1 text-xs text-amber-600">사유 결시</p>
          </article>

          <article className="rounded-[28px] border border-red-200 bg-red-50/60 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">결석</p>
            <p className="mt-3 text-3xl font-semibold text-red-600">{totalAbsent}</p>
            <p className="mt-1 text-xs text-red-500">무단 결시</p>
          </article>

          <article
            className={`rounded-[28px] border p-6 shadow-panel ${
              totalNoRecord > 0
                ? "border-ink/20 bg-ink/5"
                : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">미기록</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{totalNoRecord}</p>
            <p className="mt-1 text-xs text-slate">출결 미입력</p>
          </article>
        </div>

        {totalRecorded > 0 && (
          <div className="mt-4 rounded-[20px] border border-ink/10 bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate">전체 출석률</span>
              <span className="text-sm font-semibold text-forest">
                {Math.round((totalPresent / totalRecorded) * 100)}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-forest transition-all"
                style={{ width: `${Math.round((totalPresent / totalRecorded) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate">기록된 {totalRecorded}명 기준 (미기록 {totalNoRecord}명 제외)</p>
          </div>
        )}
      </section>

      {/* ── 반별 현황 테이블 ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          반별 현황
        </h2>

        {classroomStats.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            등록된 활성 반이 없습니다.{" "}
            <Link href="/admin/classrooms" className="font-semibold text-ember hover:underline">
              담임반 관리 →
            </Link>
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      반 이름
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      담임
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      재적
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-forest">
                      출석
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">
                      라이브
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                      공결
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
                      결석
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      미기록
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      출석률
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      상세
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {classroomStats.map((cr) => (
                    <tr key={cr.id} className="transition hover:bg-mist/60">
                      <td className="px-6 py-3">
                        <Link
                          href={`/admin/classrooms/${cr.id}`}
                          className="font-semibold text-ink hover:text-ember hover:underline"
                        >
                          {cr.name}
                        </Link>
                        {cr.generation && (
                          <span className="ml-2 text-xs text-slate">{cr.generation}기</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate">{cr.teacherName}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate">
                        {cr.totalStudents}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-semibold ${cr.normal > 0 ? "text-forest" : "text-slate/30"}`}
                        >
                          {cr.normal > 0 ? cr.normal : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-semibold ${cr.live > 0 ? "text-sky-600" : "text-slate/30"}`}
                        >
                          {cr.live > 0 ? cr.live : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-semibold ${cr.excused > 0 ? "text-amber-700" : "text-slate/30"}`}
                        >
                          {cr.excused > 0 ? cr.excused : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-semibold ${cr.absent > 0 ? "text-red-600" : "text-slate/30"}`}
                        >
                          {cr.absent > 0 ? cr.absent : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs font-semibold ${
                            cr.noRecord > 0 ? "text-ink/50" : "text-slate/30"
                          }`}
                        >
                          {cr.noRecord > 0 ? cr.noRecord : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cr.presentRate !== null ? (
                          <span
                            className={`font-semibold ${
                              cr.presentRate >= 90
                                ? "text-forest"
                                : cr.presentRate >= 70
                                ? "text-amber-600"
                                : "text-red-600"
                            }`}
                          >
                            {cr.presentRate}%
                          </span>
                        ) : (
                          <span className="text-slate/30 text-xs">미입력</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/classrooms/${cr.id}`}
                          className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-slate transition hover:border-forest/30 hover:text-forest"
                        >
                          상세
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── 하단 링크 ─────────────────────────────────────────────────── */}
      <section className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/admin/attendance"
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-5 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
        >
          출결 허브 →
        </Link>
        <Link
          href="/admin/classrooms"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
        >
          담임반 관리
        </Link>
      </section>
    </div>
  );
}
