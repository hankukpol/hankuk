import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import { RosterClient } from "./roster-client";
import { PrintRosterButton } from "./print-roster-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatKorDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatAmount(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

export type AttendBar = {
  date: string; // YYYY-MM-DD
  subject: string;
  attendType: "NORMAL" | "LIVE" | "EXCUSED" | "ABSENT";
};

export type RosterRow = {
  idx: number;
  enrollmentId: string;
  examNumber: string;
  name: string;
  phone: string;
  enrolledAt: string;
  finalFee: number;
  finalFeeFormatted: string;
  status: string;
  statusLabel: string;
  waitlistOrder: number | null;
  paymentStatus: "PAID" | "UNPAID" | "PARTIAL";
  paymentStatusLabel: string;
  paidAmount: number;
  paidAmountFormatted: string;
  attendanceStatus: "NORMAL" | "WARNING" | "UNKNOWN";
  attendanceStatusLabel: string;
  absenceCount: number;
  // 4-week attendance bars from Score.attendType
  recentAttend: AttendBar[];
  scoreAttendRate: number | null; // 0-100, null if no scores
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "재학",
  WAITING: "대기",
  SUSPENDED: "휴원",
  PENDING: "대기",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

export default async function CohortRosterPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;
  const prisma = getPrisma();

  const cohort = await prisma.cohort.findUnique({
    where: { id },
    include: {
      enrollments: {
        where: {
          status: { in: ["ACTIVE", "WAITING", "SUSPENDED", "PENDING"] },
        },
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
            },
          },
        },
        orderBy: [
          { status: "asc" },
          { examNumber: "asc" },
        ],
      },
    },
  });

  if (!cohort) notFound();

  // Fetch payment data for all enrollments
  const enrollmentIds = cohort.enrollments.map((e) => e.id);

  const payments = enrollmentIds.length > 0
    ? await prisma.payment.findMany({
        where: {
          enrollmentId: { in: enrollmentIds },
          status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        },
        select: {
          enrollmentId: true,
          netAmount: true,
          status: true,
        },
      })
    : [];

  // Paid amount by enrollmentId
  const paidByEnrollment = new Map<string, number>();
  for (const p of payments) {
    if (!p.enrollmentId) continue;
    paidByEnrollment.set(
      p.enrollmentId,
      (paidByEnrollment.get(p.enrollmentId) ?? 0) + p.netAmount,
    );
  }

  // Fetch recent 4 weeks of Score data for attendance bars
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const examNumbers = cohort.enrollments
    .map((e) => e.student?.examNumber ?? e.examNumber)
    .filter(Boolean);

  // Score.attendType for last 4 weeks
  const recentScores = examNumbers.length > 0
    ? await prisma.score.findMany({
        where: {
          examNumber: { in: examNumbers },
          session: {
            examDate: { gte: fourWeeksAgo },
            isCancelled: false,
          },
        },
        include: {
          session: {
            select: {
              examDate: true,
              subject: true,
            },
          },
        },
        orderBy: { session: { examDate: "asc" } },
      })
    : [];

  // Group by examNumber
  const scoresByExam = new Map<string, typeof recentScores>();
  for (const sc of recentScores) {
    const arr = scoresByExam.get(sc.examNumber) ?? [];
    arr.push(sc);
    scoresByExam.set(sc.examNumber, arr);
  }

  // Fetch absence notes for this week per student (attendance warning = 2+ absences in last 7 days)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const recentAbsences = examNumbers.length > 0
    ? await prisma.absenceNote.findMany({
        where: {
          examNumber: { in: examNumbers },
          submittedAt: { gte: oneWeekAgo },
        },
        select: {
          examNumber: true,
        },
      })
    : [];

  // Count recent absences per student
  const absenceCountMap = new Map<string, number>();
  for (const note of recentAbsences) {
    absenceCountMap.set(
      note.examNumber,
      (absenceCountMap.get(note.examNumber) ?? 0) + 1,
    );
  }

  // Build roster rows
  const rows: RosterRow[] = cohort.enrollments.map((enrollment, idx) => {
    const examNum = enrollment.student?.examNumber ?? enrollment.examNumber;
    const paidAmount = paidByEnrollment.get(enrollment.id) ?? 0;
    const finalFee = enrollment.finalFee;

    // Payment status
    let paymentStatus: RosterRow["paymentStatus"];
    let paymentStatusLabel: string;
    if (finalFee <= 0) {
      paymentStatus = "PAID";
      paymentStatusLabel = "완납";
    } else if (paidAmount >= finalFee) {
      paymentStatus = "PAID";
      paymentStatusLabel = "완납";
    } else if (paidAmount > 0) {
      paymentStatus = "PARTIAL";
      paymentStatusLabel = "부분납";
    } else {
      paymentStatus = "UNPAID";
      paymentStatusLabel = "미납";
    }

    // Attendance status
    const absenceCount = absenceCountMap.get(examNum) ?? 0;
    let attendanceStatus: RosterRow["attendanceStatus"];
    let attendanceStatusLabel: string;
    if (absenceCount >= 2) {
      attendanceStatus = "WARNING";
      attendanceStatusLabel = "경고";
    } else if (absenceCount === 1) {
      attendanceStatus = "WARNING";
      attendanceStatusLabel = "주의";
    } else {
      attendanceStatus = "NORMAL";
      attendanceStatusLabel = "정상";
    }

    // Build 4-week attendance bars
    const examScores = scoresByExam.get(examNum) ?? [];
    const recentAttend: AttendBar[] = examScores.map((sc) => ({
      date: sc.session.examDate.toISOString().slice(0, 10),
      subject: sc.session.subject,
      attendType: sc.attendType as "NORMAL" | "LIVE" | "EXCUSED" | "ABSENT",
    }));

    // Score-based attendance rate
    let scoreAttendRate: number | null = null;
    if (examScores.length > 0) {
      const attended = examScores.filter((sc) => sc.attendType !== "ABSENT").length;
      scoreAttendRate = Math.round((attended / examScores.length) * 100);
    }

    return {
      idx: idx + 1,
      enrollmentId: enrollment.id,
      examNumber: examNum,
      name: enrollment.student?.name ?? "-",
      phone: formatPhone(enrollment.student?.phone),
      enrolledAt: formatDate(enrollment.createdAt),
      finalFee,
      finalFeeFormatted: formatAmount(finalFee),
      status: enrollment.status,
      statusLabel: STATUS_LABEL[enrollment.status] ?? enrollment.status,
      waitlistOrder: enrollment.waitlistOrder,
      paymentStatus,
      paymentStatusLabel,
      paidAmount,
      paidAmountFormatted: formatAmount(paidAmount),
      attendanceStatus,
      attendanceStatusLabel,
      absenceCount,
      recentAttend,
      scoreAttendRate,
    };
  });

  const activeCount = rows.filter((r) => r.status === "ACTIVE" || r.status === "SUSPENDED").length;
  const waitlistCount = rows.filter((r) => r.status === "WAITING").length;
  const unpaidCount = rows.filter((r) => r.paymentStatus === "UNPAID" || r.paymentStatus === "PARTIAL").length;
  const warningCount = rows.filter((r) => r.attendanceStatus === "WARNING").length;

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  const today = new Date();
  const printDate = formatKorDate(today);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 10mm; }
          body { background: white; }
          .print-area { padding: 0 !important; max-width: none !important; }
        }
      `}</style>

      {/* No-print toolbar */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink/10 bg-white px-6 py-3">
        <Link
          href={`/admin/settings/cohorts/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
        >
          <span>&larr;</span>
          <span>기수 상세로</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{cohort.name} — 수강생 명단</span>
        </div>
        <PrintRosterButton />
      </div>

      {/* Screen: summary stats */}
      <div className="no-print mx-auto max-w-6xl px-6 py-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-[20px] border border-ink/10 bg-white p-4">
            <p className="text-xs text-slate">재적 인원</p>
            <p className="mt-1 text-2xl font-bold text-ink">{activeCount}<span className="ml-1 text-sm font-normal text-slate">명</span></p>
          </div>
          <div className="rounded-[20px] border border-ink/10 bg-white p-4">
            <p className="text-xs text-slate">대기자</p>
            <p className="mt-1 text-2xl font-bold text-ink">{waitlistCount}<span className="ml-1 text-sm font-normal text-slate">명</span></p>
          </div>
          <div className={`rounded-[20px] border p-4 ${unpaidCount > 0 ? "border-amber-200 bg-amber-50" : "border-ink/10 bg-white"}`}>
            <p className={`text-xs ${unpaidCount > 0 ? "text-amber-700" : "text-slate"}`}>미납/부분납</p>
            <p className={`mt-1 text-2xl font-bold ${unpaidCount > 0 ? "text-amber-700" : "text-ink"}`}>{unpaidCount}<span className="ml-1 text-sm font-normal">명</span></p>
          </div>
          <div className={`rounded-[20px] border p-4 ${warningCount > 0 ? "border-red-200 bg-red-50" : "border-ink/10 bg-white"}`}>
            <p className={`text-xs ${warningCount > 0 ? "text-red-700" : "text-slate"}`}>출석 경고/주의</p>
            <p className={`mt-1 text-2xl font-bold ${warningCount > 0 ? "text-red-700" : "text-ink"}`}>{warningCount}<span className="ml-1 text-sm font-normal">명</span></p>
          </div>
        </div>
      </div>

      {/* Interactive client section (search/filter/sort/export) */}
      <div className="no-print mx-auto max-w-6xl px-6 pb-10">
        <RosterClient
          rows={rows}
          cohortName={cohort.name}
          cohortId={id}
        />
      </div>

      {/* Print-only area */}
      <div className="print-area mx-auto max-w-[210mm] bg-white p-8">
        {/* Print header */}
        <div className="text-center text-base font-semibold text-ink">
          academy-ops 강남 캠퍼스
        </div>
        <h1 className="mt-1 text-center text-xl font-bold text-ink">
          {cohort.name} 수강생 명단
        </h1>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-slate">
          <span>
            기간:{" "}
            <span className="font-medium text-ink">
              {formatDate(cohort.startDate)} ~ {formatDate(cohort.endDate)}
            </span>
          </span>
          <span className="text-slate/40">|</span>
          <span>
            시험:{" "}
            <span className="font-medium text-ink">{examCategoryLabel}</span>
          </span>
          {cohort.maxCapacity != null && (
            <>
              <span className="text-slate/40">|</span>
              <span>
                정원:{" "}
                <span className="font-medium text-ink">{cohort.maxCapacity}명</span>
              </span>
            </>
          )}
          <span className="text-slate/40">|</span>
          <span>
            재적:{" "}
            <span className="font-medium text-ink">{activeCount}명</span>
          </span>
        </div>
        <div className="mt-2 text-right text-xs text-slate">
          출력일: {printDate}
        </div>

        {/* Print table: active students */}
        <table
          className="mt-4 w-full border-collapse text-sm"
          style={{ border: "1px solid black" }}
        >
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "5%" }}>번호</th>
              <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "12%" }}>학번</th>
              <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "10%" }}>이름</th>
              <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "16%" }}>연락처</th>
              <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "10%" }}>등록일</th>
              <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "12%" }}>수강료</th>
              <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "8%" }}>납부</th>
              <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "7%" }}>상태</th>
              <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black" }}>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.filter((r) => r.status !== "WAITING").length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate" style={{ border: "1px solid black" }}>
                  수강생이 없습니다.
                </td>
              </tr>
            ) : (
              rows
                .filter((r) => r.status !== "WAITING")
                .map((row, i) => (
                  <tr key={row.enrollmentId} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                    <td className="px-2 py-1 text-center" style={{ border: "1px solid black" }}>{i + 1}</td>
                    <td className="px-2 py-1 text-center font-mono text-xs" style={{ border: "1px solid black" }}>{row.examNumber}</td>
                    <td className="px-2 py-1 text-center" style={{ border: "1px solid black" }}>{row.name}</td>
                    <td className="px-2 py-1 text-center" style={{ border: "1px solid black" }}>{row.phone}</td>
                    <td className="px-2 py-1 text-center text-xs" style={{ border: "1px solid black" }}>{row.enrolledAt}</td>
                    <td className="px-2 py-1 text-right text-xs" style={{ border: "1px solid black" }}>{row.finalFeeFormatted}</td>
                    <td className="px-2 py-1 text-center text-xs" style={{ border: "1px solid black" }}>{row.paymentStatusLabel}</td>
                    <td className="px-2 py-1 text-center text-xs" style={{ border: "1px solid black" }}>{row.statusLabel}</td>
                    <td className="px-2 py-1" style={{ border: "1px solid black", minWidth: "60px" }}>&nbsp;</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>

        {/* Print: waiting list */}
        {rows.filter((r) => r.status === "WAITING").length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-ink">
              대기자 명단 ({rows.filter((r) => r.status === "WAITING").length}명)
            </h2>
            <table className="mt-2 w-full border-collapse text-sm" style={{ border: "1px solid black" }}>
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "8%" }}>순번</th>
                  <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "14%" }}>학번</th>
                  <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "12%" }}>이름</th>
                  <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black", width: "18%" }}>연락처</th>
                  <th className="px-2 py-1.5 text-center font-semibold" style={{ border: "1px solid black" }}>비고</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.status === "WAITING")
                  .map((row, i) => (
                    <tr key={row.enrollmentId}>
                      <td className="px-2 py-1 text-center" style={{ border: "1px solid black" }}>{row.waitlistOrder ?? i + 1}</td>
                      <td className="px-2 py-1 text-center font-mono text-xs" style={{ border: "1px solid black" }}>{row.examNumber}</td>
                      <td className="px-2 py-1 text-center" style={{ border: "1px solid black" }}>{row.name}</td>
                      <td className="px-2 py-1 text-center" style={{ border: "1px solid black" }}>{row.phone}</td>
                      <td className="px-2 py-1" style={{ border: "1px solid black" }}>&nbsp;</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Print footer */}
        <div className="mt-8 flex items-end justify-end gap-4">
          <span className="text-sm">확인: _______________ (인)</span>
        </div>
      </div>
    </>
  );
}
