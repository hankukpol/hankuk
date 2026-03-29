import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintButton } from "../enrollment-certificate/print-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatKoreanDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

type MonthStat = {
  label: string;    // e.g. "2026년 3월"
  present: number;
  late: number;
  earlyLeave: number;
  excused: number;
  absent: number;
  total: number;
};

export default async function AttendanceCertificatePage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { examNumber } = await params;
  const sp = searchParams ? await searchParams : {};

  // Date range: default last 30 days
  const today = new Date();
  const defaultEnd = toDateString(today);
  const defaultStart = toDateString(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));

  const rawFrom = typeof sp.from === "string" ? sp.from : defaultStart;
  const rawTo = typeof sp.to === "string" ? sp.to : defaultEnd;

  const fromDate = new Date(rawFrom);
  const toDate = new Date(rawTo);
  // Set end to end of day
  toDate.setHours(23, 59, 59, 999);

  const prisma = getPrisma();

  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      birthDate: true,
    },
  });

  if (!student) notFound();

  // Fetch active enrollment for course name
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { examNumber, status: { in: ["ACTIVE", "PENDING"] } },
    orderBy: { createdAt: "desc" },
    include: {
      cohort: { select: { name: true } },
      specialLecture: { select: { name: true } },
      product: { select: { name: true } },
    },
  });

  const courseName = enrollment?.cohort?.name
    ?? enrollment?.specialLecture?.name
    ?? enrollment?.product?.name
    ?? "강좌 미지정";

  // Fetch attendance logs in range
  const logs = await prisma.classroomAttendanceLog.findMany({
    where: {
      examNumber,
      attendDate: {
        gte: fromDate,
        lte: toDate,
      },
    },
    orderBy: { attendDate: "asc" },
  });

  // Aggregate by month
  const monthMap = new Map<string, MonthStat>();
  for (const log of logs) {
    const d = new Date(log.attendDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    if (!monthMap.has(key)) {
      monthMap.set(key, { label, present: 0, late: 0, earlyLeave: 0, excused: 0, absent: 0, total: 0 });
    }
    const stat = monthMap.get(key)!;
    stat.total += 1;
    switch (log.attendType) {
      case AttendType.NORMAL:
      case AttendType.LIVE:
        stat.present += 1;
        break;
      case AttendType.EXCUSED:
        stat.excused += 1;
        break;
      case AttendType.ABSENT:
        stat.absent += 1;
        break;
    }
  }

  const monthStats = Array.from(monthMap.values());

  const totalDays = logs.length;
  const presentDays = logs.filter(
    (l) => l.attendType === AttendType.NORMAL || l.attendType === AttendType.LIVE,
  ).length;
  const excusedDays = logs.filter((l) => l.attendType === AttendType.EXCUSED).length;
  const absentDays = logs.filter((l) => l.attendType === AttendType.ABSENT).length;
  const attendanceRate =
    totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : "0.0";

  const issuedAt = formatKoreanDate(new Date());

  return (
    <div
      className="min-h-screen bg-[#F7F4EF]"
      style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
    >
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .print-area {
            padding: 20mm 20mm !important;
            margin: 0 !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}/documents`}
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
          >
            ← 서류 발급 목록
          </Link>
          <span className="text-lg font-bold text-[#111827]">출결확인서</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Date range selector — hidden on print */}
          <form
            method="get"
            className="flex items-center gap-2 rounded-full border border-[#111827]/10 bg-white px-4 py-1.5"
          >
            <label className="text-xs text-[#4B5563]">기간</label>
            <input
              type="date"
              name="from"
              defaultValue={rawFrom}
              className="rounded border-0 bg-transparent text-xs text-[#111827] focus:outline-none"
            />
            <span className="text-xs text-[#4B5563]">~</span>
            <input
              type="date"
              name="to"
              defaultValue={rawTo}
              className="rounded border-0 bg-transparent text-xs text-[#111827] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-[#1F4D3A] px-3 py-0.5 text-xs font-medium text-white transition hover:bg-[#1F4D3A]/90"
            >
              조회
            </button>
          </form>
          <Link
            href={`/admin/students/${examNumber}/documents/enrollment-certificate`}
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 bg-white px-4 py-2 text-sm font-medium text-[#4B5563] transition hover:bg-[#F7F4EF]"
          >
            수강확인서 보기
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* Document preview */}
      <div className="print-area flex justify-center px-8 py-10">
        <div
          className="w-full max-w-[680px] rounded-2xl border border-[#111827]/15 bg-white shadow-lg"
          style={{ minHeight: "297mm" }}
        >
          <div className="px-16 py-16">
            {/* Academy header */}
            <div className="mb-10 text-center">
              <p className="text-xs font-semibold tracking-widest text-[#1F4D3A] uppercase">
                학원명 미설정
              </p>
              <p className="mt-0.5 text-[10px] text-[#4B5563]">
                학원 주소는 관리자 설정을 확인하세요 · 연락처는 관리자 설정을 확인하세요
              </p>
            </div>

            {/* Title */}
            <h1
              className="mb-10 text-center text-3xl font-bold text-[#111827]"
              style={{ letterSpacing: "0.5em" }}
            >
              출 결 확 인 서
            </h1>

            <p className="mb-8 text-center text-base leading-relaxed text-[#111827]">
              위 학생의 출결 현황을 다음과 같이 확인합니다.
            </p>

            {/* Student info */}
            <div className="mb-6 border border-[#111827]/20">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-[#111827]/10">
                    <th className="w-32 bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                      성&nbsp;&nbsp;&nbsp;&nbsp;명
                    </th>
                    <td className="px-5 py-3.5 text-[#111827]">{student.name}</td>
                    <th className="w-32 bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                      수험번호
                    </th>
                    <td className="px-5 py-3.5 text-[#111827]">{student.examNumber}</td>
                  </tr>
                  <tr className="border-b border-[#111827]/10">
                    <th className="bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                      강&nbsp;&nbsp;&nbsp;&nbsp;좌
                    </th>
                    <td className="px-5 py-3.5 font-medium text-[#111827]" colSpan={3}>
                      {courseName}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                      확인기간
                    </th>
                    <td className="px-5 py-3.5 text-[#111827]" colSpan={3}>
                      {formatKoreanDate(fromDate)} ~ {formatKoreanDate(toDate)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Monthly breakdown table */}
            {totalDays === 0 ? (
              <div className="mb-10 rounded-xl border border-[#111827]/10 bg-[#F7F4EF] px-6 py-8 text-center">
                <p className="text-sm text-[#4B5563]">해당 기간의 출결 기록이 없습니다.</p>
              </div>
            ) : (
              <>
                <div className="mb-6 border border-[#111827]/20">
                  <div className="bg-[#F7F4EF] px-5 py-2.5 text-sm font-semibold text-[#111827]">
                    월별 출결 현황
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#111827]/10 bg-white text-[#4B5563] text-xs">
                        <th className="px-4 py-2.5 text-left font-medium">월</th>
                        <th className="px-4 py-2.5 text-center font-medium">출석</th>
                        <th className="px-4 py-2.5 text-center font-medium">공결</th>
                        <th className="px-4 py-2.5 text-center font-medium">결석</th>
                        <th className="px-4 py-2.5 text-center font-medium">총일수</th>
                        <th className="px-4 py-2.5 text-right font-medium">출석률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthStats.map((ms) => {
                        const rate =
                          ms.total > 0
                            ? ((ms.present / ms.total) * 100).toFixed(1)
                            : "0.0";
                        return (
                          <tr
                            key={ms.label}
                            className="border-b border-[#111827]/10 last:border-0"
                          >
                            <td className="px-4 py-2.5 font-medium text-[#111827]">{ms.label}</td>
                            <td className="px-4 py-2.5 text-center text-[#1F4D3A] font-semibold">
                              {ms.present}
                            </td>
                            <td className="px-4 py-2.5 text-center text-[#4B5563]">
                              {ms.excused > 0 ? ms.excused : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-center text-[#C55A11] font-medium">
                              {ms.absent > 0 ? ms.absent : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-center text-[#111827]">{ms.total}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-[#111827]">
                              {rate}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Total summary */}
                <div className="mb-10 border border-[#111827]/20 bg-[#F7F4EF]">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-[#111827]/10">
                        <th className="w-40 px-5 py-3 text-left font-semibold text-[#111827]">
                          총 수업일
                        </th>
                        <td className="px-5 py-3 font-semibold text-[#111827]">{totalDays}일</td>
                      </tr>
                      <tr className="border-b border-[#111827]/10">
                        <th className="px-5 py-3 text-left font-semibold text-[#111827]">
                          출&nbsp;&nbsp;&nbsp;&nbsp;석
                        </th>
                        <td className="px-5 py-3 font-semibold text-[#1F4D3A]">
                          {presentDays}일
                          <span className="ml-2 font-normal text-[#4B5563]">
                            (출석률 {attendanceRate}%)
                          </span>
                        </td>
                      </tr>
                      {excusedDays > 0 && (
                        <tr className="border-b border-[#111827]/10">
                          <th className="px-5 py-3 text-left font-semibold text-[#111827]">
                            공&nbsp;&nbsp;&nbsp;&nbsp;결
                          </th>
                          <td className="px-5 py-3 text-[#4B5563]">{excusedDays}일</td>
                        </tr>
                      )}
                      <tr>
                        <th className="px-5 py-3 text-left font-semibold text-[#111827]">
                          결&nbsp;&nbsp;&nbsp;&nbsp;석
                        </th>
                        <td className="px-5 py-3 font-semibold text-[#C55A11]">{absentDays}일</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="my-12" />

            <p className="mb-10 text-center text-base text-[#111827]">{issuedAt}</p>

            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-4">
                <p className="text-base font-semibold text-[#111827]">학원장</p>
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#C55A11] text-[10px] font-semibold text-[#C55A11]">
                  (인)
                </div>
              </div>
              <p className="text-sm text-[#4B5563]">
                학원 주소는 관리자 설정을 확인하세요
              </p>
              <p className="text-sm text-[#4B5563]">연락처는 관리자 설정을 확인하세요</p>
            </div>
          </div>
        </div>
      </div>

      <p className="no-print mt-2 pb-8 text-center text-xs text-[#4B5563]/60">
        인쇄 버튼을 누른 후 용지 크기를 A4로 선택하세요. PDF로 저장도 가능합니다.
      </p>
    </div>
  );
}
