import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type StudentAttendStats = {
  seatNum: number;
  examNumber: string;
  name: string;
  totalDays: number;
  present: number; // NORMAL + LIVE
  late: number;    // EXCUSED (지각/공결)
  absent: number;  // ABSENT
  rate: number;    // (present + late) / totalDays * 100
};

function attendBar(rate: number): string {
  const filled = Math.round(rate / 20); // 0–5 blocks
  return "█".repeat(filled) + "░".repeat(5 - filled);
}

function rateColorClass(rate: number): string {
  if (rate >= 90) return "text-forest font-semibold";
  if (rate >= 70) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

export default async function SeatingHeatmapPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;
  const prisma = getPrisma();

  const classroom = await prisma.classroom.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      generation: true,
      teacher: { select: { name: true } },
      students: {
        where: { leftAt: null },
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          joinedAt: true,
          student: {
            select: {
              examNumber: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!classroom) notFound();

  // 최근 30일 범위 계산
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const examNumbers = classroom.students.map((cs) => cs.student.examNumber);

  // 해당 반의 출결 로그 조회 (최근 30일)
  const attendanceLogs = examNumbers.length > 0
    ? await prisma.classroomAttendanceLog.findMany({
        where: {
          classroomId: id,
          examNumber: { in: examNumbers },
          attendDate: { gte: thirtyDaysAgo, lte: today },
        },
        select: {
          examNumber: true,
          attendDate: true,
          attendType: true,
        },
      })
    : [];

  // 실제 출결이 기록된 날짜 집합 (해당 반의 수업 날짜)
  const classDatesSet = new Set(
    attendanceLogs.map((log) =>
      new Date(log.attendDate).toISOString().slice(0, 10),
    ),
  );
  const totalClassDays = classDatesSet.size;

  // 학생별 출결 집계
  const logsByStudent = new Map<string, typeof attendanceLogs>();
  for (const log of attendanceLogs) {
    if (!logsByStudent.has(log.examNumber)) {
      logsByStudent.set(log.examNumber, []);
    }
    logsByStudent.get(log.examNumber)!.push(log);
  }

  const stats: StudentAttendStats[] = classroom.students.map((cs, idx) => {
    const logs = logsByStudent.get(cs.student.examNumber) ?? [];
    const present = logs.filter(
      (l) => l.attendType === AttendType.NORMAL || l.attendType === AttendType.LIVE,
    ).length;
    const late = logs.filter((l) => l.attendType === AttendType.EXCUSED).length;
    const absent = logs.filter((l) => l.attendType === AttendType.ABSENT).length;

    const denominator = totalClassDays > 0 ? totalClassDays : logs.length;
    const rate = denominator > 0 ? Math.round(((present + late) / denominator) * 100) : 0;

    return {
      seatNum: idx + 1,
      examNumber: cs.student.examNumber,
      name: cs.student.name,
      totalDays: denominator,
      present,
      late,
      absent,
      rate,
    };
  });

  // 집계 요약
  const studentCount = stats.length;
  const avgRate =
    studentCount > 0
      ? Math.round(stats.reduce((s, r) => s + r.rate, 0) / studentCount)
      : 0;
  const lowAttendCount = stats.filter((s) => s.rate < 70).length;
  const perfectCount = stats.filter((s) => s.rate === 100).length;

  const dateRangeLabel = `${thirtyDaysAgo.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} ~ ${new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}`;

  return (
    <div className="p-8 sm:p-10">
      {/* 네비 */}
      <div className="flex items-center gap-2 mb-2">
        <Link
          href={`/admin/classrooms/${id}/seating`}
          className="text-sm text-slate-500 hover:text-ink transition"
        >
          ← 좌석 배정표
        </Link>
      </div>

      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
        출석 현황
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">
        {classroom.name} — 좌석별 출석 현황
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        담임: {classroom.teacher.name}
        {classroom.generation ? ` · ${classroom.generation}기` : ""}
        {" · "}기간: {dateRangeLabel} ({totalClassDays}일)
      </p>
      <p className="mt-1 text-xs text-slate-400">
        출석률 = (정상 출석 + 공결·지각) / 수업 일수 × 100
      </p>

      {/* KPI */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">전체 학생</p>
          <p className="mt-1.5 text-2xl font-bold text-ink">{studentCount}명</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">평균 출석률</p>
          <p className={`mt-1.5 text-2xl font-bold ${rateColorClass(avgRate)}`}>
            {avgRate}%
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">개근 (100%)</p>
          <p className="mt-1.5 text-2xl font-bold text-forest">{perfectCount}명</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">출석률 70% 미만</p>
          <p className={`mt-1.5 text-2xl font-bold ${lowAttendCount > 0 ? "text-red-600" : "text-ink"}`}>
            {lowAttendCount}명
          </p>
        </div>
      </div>

      {/* 출석 현황 테이블 */}
      <div className="mt-8 overflow-hidden rounded-[20px] border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-mist border-b border-ink/10">
            <tr>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 w-16">좌석</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">학생명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">학번</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">출석률</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">출석</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">지각·공결</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">결석</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">미기록</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {stats.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                  재적 학생이 없습니다.
                </td>
              </tr>
            ) : (
              stats.map((s, idx) => {
                const unrecorded = Math.max(0, s.totalDays - s.present - s.late - s.absent);
                return (
                  <tr
                    key={s.examNumber}
                    className={idx % 2 === 0 ? "bg-white" : "bg-mist/40"}
                  >
                    {/* 좌석 번호 */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-xs font-bold text-amber-700 border border-amber-200">
                        {s.seatNum}
                      </span>
                    </td>

                    {/* 이름 */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${s.examNumber}`}
                        className="font-medium text-ink hover:text-ember transition"
                      >
                        {s.name}
                      </Link>
                    </td>

                    {/* 학번 */}
                    <td className="px-4 py-3 text-slate-500 tabular-nums">
                      {s.examNumber}
                    </td>

                    {/* 출석률 바 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm tracking-tighter text-slate-400">
                          {attendBar(s.rate)}
                        </span>
                        <span className={rateColorClass(s.rate)}>
                          {s.totalDays > 0 ? `${s.rate}%` : "—"}
                        </span>
                      </div>
                    </td>

                    {/* 출석 */}
                    <td className="px-4 py-3 text-center tabular-nums">
                      <span className="text-forest font-medium">{s.present}</span>
                    </td>

                    {/* 지각·공결 */}
                    <td className="px-4 py-3 text-center tabular-nums">
                      {s.late > 0 ? (
                        <span className="text-amber-600 font-medium">{s.late}</span>
                      ) : (
                        <span className="text-ink/30">0</span>
                      )}
                    </td>

                    {/* 결석 */}
                    <td className="px-4 py-3 text-center tabular-nums">
                      {s.absent > 0 ? (
                        <span className="text-red-600 font-medium">{s.absent}</span>
                      ) : (
                        <span className="text-ink/30">0</span>
                      )}
                    </td>

                    {/* 미기록 */}
                    <td className="px-4 py-3 text-center tabular-nums">
                      {unrecorded > 0 ? (
                        <span className="text-slate-400">{unrecorded}</span>
                      ) : (
                        <span className="text-ink/20">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="mt-4 flex flex-wrap items-center gap-6 text-xs text-slate">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-forest" />
          <span>90% 이상 — 정상</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span>70–89% — 주의</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span>70% 미만 — 관리 필요</span>
        </div>
        <div className="ml-auto">
          <Link
            href={`/admin/classrooms/${id}/attendance`}
            className="text-ember hover:underline"
          >
            출결 상세 관리 →
          </Link>
        </div>
      </div>
    </div>
  );
}
