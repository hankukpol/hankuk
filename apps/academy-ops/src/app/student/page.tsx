import Link from "next/link";
import { AttendStatus, CourseType, Subject } from "@prisma/client";
import {
  BarComparisonChart,
  RadarComparisonChart,
  TrendLineChart,
} from "@/components/analytics/charts";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { WrongNoteSaveButton } from "@/components/student-portal/wrong-note-save-button";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "@/lib/analytics/presentation";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate, formatDateWithWeekday } from "@/lib/format";
import { listStudentNotices } from "@/lib/notices/service";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalPageData } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(searchParams: PageProps["searchParams"], key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined
    ? "-"
    : value.toFixed(2).replace(/\.00$/, "");
}

function questionSummary(
  questionRows: Array<{ searchedStudentCorrect: boolean | null }>,
) {
  const total = questionRows.length;
  const correct = questionRows.filter((row) => row.searchedStudentCorrect === true).length;
  const wrong = questionRows.filter((row) => row.searchedStudentCorrect === false).length;
  const correctRate = total === 0 ? 0 : Math.round((correct / total) * 1000) / 10;

  return {
    total,
    correct,
    wrong,
    correctRate,
  };
}

export default async function StudentPortalPage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              학생 포털 준비 중
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              학생 포털은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학생 성적과 공지 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                홈으로
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const data = await getStudentPortalPageData({
    periodId: Number(readParam(searchParams, "periodId") ?? 0) || undefined,
    date: readParam(searchParams, "date") ?? undefined,
    monthKey: readParam(searchParams, "monthKey") ?? undefined,
    subject: (readParam(searchParams, "subject") as Subject | undefined) ?? undefined,
  });

  if (!data) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel">
            <div className="bg-hero-grid bg-[size:28px_28px] px-6 py-8 sm:px-8 sm:py-10">
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                학생 포털
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                학생 포털에 로그인해 주세요.
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-8 text-slate sm:text-base">
                수험번호와 이름으로 로그인하면 성적, 출결, 공지, 사유서, 오답 노트를 한 곳에서 확인할 수 있습니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/student/notices"
                  className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                >
                  공지사항 보기
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                >
                  홈으로
                </Link>
              </div>
            </div>
          </section>

          <StudentLookupForm />
        </div>
      </main>
    );
  }

  const todayForStudentExams = new Date();
  todayForStudentExams.setHours(0, 0, 0, 0);

  // Today's date string for lecture attendance lookup
  const todayDateStr = todayForStudentExams.toISOString().slice(0, 10);

  // Compute start of current week (Monday) and end (Sunday) for weekly attendance
  const weekStart = new Date(todayForStudentExams);
  const dayOfWeek = weekStart.getDay(); // 0=Sun, 1=Mon...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + diffToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const [activeEnrollment, upcomingStudentExams, todayLectureAttendances, recentNotices, pointBalance, weeklyMorningAttendance, unpaidEnrollmentData] = await Promise.all([
    getPrisma().courseEnrollment.findFirst({
      where: {
        examNumber: data.student.examNumber,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
      include: {
        cohort: { select: { name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
    }),
    getPrisma()
      .civilServiceExam.findMany({
        where: {
          isActive: true,
          writtenDate: { gte: todayForStudentExams },
          examType: data.student.examType,
        },
        orderBy: { writtenDate: "asc" },
        take: 3,
        select: {
          id: true,
          name: true,
          examType: true,
          year: true,
          writtenDate: true,
          interviewDate: true,
          resultDate: true,
        },
      })
      .then((rows) => {
        if (rows.length > 0) return rows;
        // Fallback: show all exam types if no exams for this student's type
        return getPrisma().civilServiceExam.findMany({
          where: {
            isActive: true,
            writtenDate: { gte: todayForStudentExams },
          },
          orderBy: { writtenDate: "asc" },
          take: 3,
          select: {
            id: true,
            name: true,
            examType: true,
            year: true,
            writtenDate: true,
            interviewDate: true,
            resultDate: true,
          },
        });
      })
      .catch(() => [] as never[]),
    // Today's lecture attendance records
    getPrisma().lectureAttendance.findMany({
      where: {
        studentId: data.student.examNumber,
        session: {
          sessionDate: todayForStudentExams,
          isCancelled: false,
        },
      },
      include: {
        session: {
          include: {
            schedule: {
              select: { subjectName: true, startTime: true, endTime: true },
            },
          },
        },
      },
      orderBy: { session: { startTime: "asc" } },
    }).catch(() => [] as never[]),
    // Top 3 recent published notices
    listStudentNotices(data.student.examType)
      .then((notices) => notices.slice(0, 3))
      .catch(() => [] as never[]),
    // Point balance
    getPrisma().pointBalance.findUnique({
      where: { examNumber: data.student.examNumber },
      select: { balance: true },
    }).catch(() => null),
    // This week's morning exam attendance records
    getPrisma().score.findMany({
      where: {
        examNumber: data.student.examNumber,
        session: {
          examDate: { gte: weekStart, lte: weekEnd },
          isCancelled: false,
        },
      },
      select: {
        attendType: true,
        session: { select: { examDate: true } },
      },
    }).catch(() => [] as never[]),
    // Unpaid enrollment data: active enrollment with finalFee vs total approved payments
    getPrisma().courseEnrollment.findFirst({
      where: {
        examNumber: data.student.examNumber,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        finalFee: true,
      },
    }).then(async (enrollment) => {
      if (!enrollment) return null;
      const paidSum = await getPrisma().payment.aggregate({
        where: {
          enrollmentId: enrollment.id,
          status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        },
        _sum: { netAmount: true },
      }).catch(() => ({ _sum: { netAmount: 0 } }));
      const paid = paidSum._sum.netAmount ?? 0;
      const unpaid = enrollment.finalFee - paid;
      return unpaid > 0 ? { unpaidAmount: unpaid } : null;
    }).catch(() => null),
  ]);

  function getEnrollmentCourseName(
    enrollment: typeof activeEnrollment,
  ): string {
    if (!enrollment) return "";
    if (enrollment.courseType === CourseType.SPECIAL_LECTURE) {
      return enrollment.specialLecture?.name ?? "특강";
    }
    return enrollment.cohort?.name ?? enrollment.product?.name ?? "종합반";
  }

  function computeDDay(endDate: Date | null): string {
    if (!endDate) return "";
    const now = new Date();
    const diff = Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diff < 0) return "만료됨";
    if (diff === 0) return "D-Day";
    return `D-${diff}`;
  }

  const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
    PENDING: "대기 중",
    ACTIVE: "수강 중",
    WAITING: "대기자",
    SUSPENDED: "휴원",
    COMPLETED: "수료",
    WITHDRAWN: "자퇴",
    CANCELLED: "취소",
  };

  const ENROLLMENT_STATUS_BADGE: Record<string, string> = {
    PENDING: "border-amber-200 bg-amber-50 text-amber-700",
    ACTIVE: "border-forest/20 bg-forest/10 text-forest",
    WAITING: "border-amber-200 bg-amber-50 text-amber-700",
    SUSPENDED: "border-slate/20 bg-slate/10 text-slate",
    COMPLETED: "border-ink/10 bg-mist text-ink",
    WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
    CANCELLED: "border-red-200 bg-red-50 text-red-700",
  };

  const ATTEND_STATUS_LABEL: Record<AttendStatus, string> = {
    PRESENT: "출석",
    LATE: "지각",
    ABSENT: "결석",
    EXCUSED: "공결",
  };

  const ATTEND_STATUS_BADGE: Record<AttendStatus, string> = {
    PRESENT: "border-forest/20 bg-forest/10 text-forest",
    LATE: "border-amber-200 bg-amber-50 text-amber-700",
    ABSENT: "border-red-200 bg-red-50 text-red-700",
    EXCUSED: "border-sky-200 bg-sky-50 text-sky-700",
  };

  // Weekly morning exam attendance summary
  const weeklyAttendDays = new Set(
    weeklyMorningAttendance
      .filter((s) => s.attendType === "NORMAL" || s.attendType === "LIVE" || s.attendType === "EXCUSED")
      .map((s) => new Date(s.session.examDate).toDateString()),
  ).size;
  const weeklyTotalDays = new Set(
    weeklyMorningAttendance.map((s) => new Date(s.session.examDate).toDateString()),
  ).size;
  const weeklyAbsentDays = new Set(
    weeklyMorningAttendance
      .filter((s) => s.attendType === "ABSENT")
      .map((s) => new Date(s.session.examDate).toDateString()),
  ).size;

  const wrongNoteQuestionIds = new Set(data.wrongNoteQuestionIds);
  const branding = await getAcademyRuntimeBranding(data.student.academyId ?? undefined);
  const classLabel = data.student.className ?? "반 정보 없음";
  const generationLabel = data.student.generation ? `${data.student.generation}기` : "기수 미지정";

  function computeCivilExamDDay(date: Date): { label: string; pillClass: string } {
    const diff = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: "종료", pillClass: "border-ink/10 bg-mist text-ink" };
    if (diff === 0) return { label: "D-Day", pillClass: "border-red-200 bg-red-50 text-red-700" };
    if (diff <= 14) return { label: `D-${diff}`, pillClass: "border-red-200 bg-red-50 text-red-700" };
    if (diff <= 30) return { label: `D-${diff}`, pillClass: "border-amber-200 bg-amber-50 text-amber-700" };
    return { label: `D-${diff}`, pillClass: "border-forest/20 bg-forest/10 text-forest" };
  }

  function formatKoreanDatePortal(date: Date | null): string {
    if (!date) return "-";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}년 ${m}월 ${d}일`;
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel">
          <div className="bg-hero-grid bg-[size:28px_28px] px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                  학생 포털
                </div>
                <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                  {data.student.name} ({data.student.examNumber})
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
                  {EXAM_TYPE_LABEL[data.student.examType]} / {classLabel} / {generationLabel}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-2 text-sm font-semibold ${STATUS_BADGE_CLASS[data.student.currentStatus]}`}
                >
                  {STATUS_LABEL[data.student.currentStatus]}
                </span>
                <span className="inline-flex rounded-full border border-ink/10 bg-white/70 px-3 py-2 text-sm font-semibold">
                  오답 노트 {data.wrongNoteCount}건
                </span>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[24px] border border-ink/10 bg-white/75 p-4">
                <p className="text-sm text-slate">조회 기간</p>
                <p className="mt-3 text-xl font-semibold">
                  {data.selectedPeriod?.name ?? "기간 미선택"}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-white/75 p-4">
                <p className="text-sm text-slate">선택 일자</p>
                <p className="mt-3 text-xl font-semibold">{data.selectedDate || "-"}</p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-white/75 p-4">
                <p className="text-sm text-slate">선택 월</p>
                <p className="mt-3 text-xl font-semibold">
                  {data.selectedMonth
                    ? `${data.selectedMonth.year}년 ${data.selectedMonth.month}월`
                    : "-"}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-white/75 p-4">
                <p className="text-sm text-slate">선택 과목</p>
                <p className="mt-3 text-xl font-semibold">
                  {data.selectedSubject ? SUBJECT_LABEL[data.selectedSubject] : "-"}
                </p>
              </article>
            </div>
          </div>
        </section>

        <StudentLookupForm
          currentStudent={{
            examNumber: data.student.examNumber,
            name: data.student.name,
            examType: data.student.examType,
          }}
        />

        {/* ── 미납 수강료 알림 배너 ── */}
        {unpaidEnrollmentData && (
          <Link
            href="/student/payments"
            className="flex items-center gap-3 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 shrink-0 text-amber-600"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">
                미납 수강료{" "}
                <span className="text-amber-700">
                  ₩{unpaidEnrollmentData.unpaidAmount.toLocaleString()}
                </span>{" "}
                이 있습니다
              </span>
              <span className="ml-1 text-xs text-amber-600">→ 납부 현황 보기</span>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0 text-amber-500"
            >
              <path
                fillRule="evenodd"
                d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        )}

        {/* ── 빠른 메뉴 아이콘 그리드 ── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-4">
          <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            메뉴
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[
              {
                href: "/student/scores",
                label: "성적조회",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 15.5 2ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9a1.5 1.5 0 0 0 3 0v-9A1.5 1.5 0 0 0 9.5 6ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5a1.5 1.5 0 0 0 3 0v-5A1.5 1.5 0 0 0 3.5 10Z" />
                  </svg>
                ),
                color: "text-forest bg-forest/10",
              },
              {
                href: "/student/attendance",
                label: "출결확인",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                  </svg>
                ),
                color: "text-sky-600 bg-sky-50",
              },
              {
                href: "/student/check-in",
                label: "QR출석",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                  </svg>
                ),
                color: "text-forest bg-forest/10",
              },
              {
                href: "/student/notices",
                label: "공지사항",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M4.214 3.227a.75.75 0 0 0-1.156-.956 8.97 8.97 0 0 0-1.856 3.826.75.75 0 1 0 1.466.316 7.47 7.47 0 0 1 1.546-3.186ZM16.942 2.271a.75.75 0 0 0-1.157.956 7.47 7.47 0 0 1 1.547 3.186.75.75 0 1 0 1.466-.316 8.971 8.971 0 0 0-1.856-3.826ZM10 4a.75.75 0 0 1 .75.75v2.5h2a.75.75 0 0 1 0 1.5h-2v.625c0 .55-.151 1.066-.414 1.51l1.696 1.695a.75.75 0 0 1-1.06 1.06l-1.696-1.695A3.737 3.737 0 0 1 7 11.875V8.75H5a.75.75 0 0 1 0-1.5h2v-2.5A.75.75 0 0 1 10 4Z" />
                    <path d="M10 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
                  </svg>
                ),
                color: "text-amber-600 bg-amber-50",
              },
              {
                href: "/student/points",
                label: "포인트",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.18.161.195.145.438.27.72.364V6.704a2.24 2.24 0 0 0-.84.274c-.423.277-.88.85-.88 1.22 0 .37.1.523.32.594.075.025.151.038.228.038l.272-.27ZM10 1a9 9 0 1 0 0 18A9 9 0 0 0 10 1ZM9.25 6.75a.75.75 0 0 1 1.5 0v.317c.909.204 1.75.86 1.75 1.933 0 1.24-.999 1.976-2.066 2.157l.316 1.474a.75.75 0 1 1-1.461.314L9 11.24c-.909-.204-1.75-.86-1.75-1.933a.75.75 0 0 1 1.5 0c0 .077.04.227.227.411.13.129.315.244.523.325V8.3a2.24 2.24 0 0 0-.723-.364C8.3 7.788 7.5 7.306 7.5 6.307c0-.998.86-1.752 1.75-2.054V4a.75.75 0 0 1 1.5 0v.253c.909.204 1.75.86 1.75 1.933 0 .29-.06.561-.169.806a.75.75 0 1 1-1.378-.596c.005-.012.047-.21.047-.21a.75.75 0 0 0-1.5 0v.316c.207.078.39.192.52.321Z" />
                  </svg>
                ),
                color: "text-ember bg-ember/10",
              },
              {
                href: "/student/enrollment",
                label: "수강증",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7Z" clipRule="evenodd" />
                  </svg>
                ),
                color: "text-purple-600 bg-purple-50",
              },
              {
                href: "/student/contract",
                label: "수강계약서",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                  </svg>
                ),
                color: "text-amber-700 bg-amber-50",
              },
              {
                href: "/student/payment-history",
                label: "납부이력",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M1 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4Zm12 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm13-1a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" clipRule="evenodd" />
                    <path d="M3 13.5A2.5 2.5 0 0 1 .5 11V9h.757a3.498 3.498 0 0 0 6.486 0h4.514a3.498 3.498 0 0 0 6.486 0H19v2a2.5 2.5 0 0 1-2.5 2.5h-13Z" />
                  </svg>
                ),
                color: "text-green-700 bg-green-50",
              },
              {
                href: "/student/payments",
                label: "수납현황",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Z" />
                    <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 0 1-1.99 1.79H4.802a2 2 0 0 1-1.99-1.79L2 7.5ZM7 11a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z" clipRule="evenodd" />
                  </svg>
                ),
                color: "text-amber-600 bg-amber-50",
              },
              {
                href: "/student/wrong-notes",
                label: "오답노트",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M10.75 16.82A7.462 7.462 0 0 1 10 17c-.314 0-.62-.025-.92-.073l-.637-2.235a7.547 7.547 0 0 1-1.08-.44l-2.165.865A7.516 7.516 0 0 1 3.928 13.5l1.006-2.056a7.535 7.535 0 0 1-.35-1.091L2.5 9.57v-.135a7.496 7.496 0 0 1 .5-2.659l2.164.865a7.543 7.543 0 0 1 1.08-.44l.637-2.235c.3-.048.609-.073.919-.073a7.5 7.5 0 0 1 1.33.118l.67 2.344a7.5 7.5 0 0 1 1.08.44l2.165-.865A7.516 7.516 0 0 1 16.072 8.5l-1.006 2.056a7.532 7.532 0 0 1 .35 1.091l2.084.783v.135c0 .32-.023.634-.07.94l-2.164-.865a7.547 7.547 0 0 1-1.08.44l-.636 2.235ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                  </svg>
                ),
                color: "text-rose-600 bg-rose-50",
              },
              {
                href: "/student/absence-notes",
                label: "결석신청",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 0 1 8.75 1h2.5A2.75 2.75 0 0 1 14 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.83 2.54-1.952.599-4.024.921-6.17.921s-4.219-.322-6.17-.921C2.694 12.73 2 11.665 2 10.539V7.07c0-1.321.947-2.489 2.294-2.676A41.047 41.047 0 0 1 6 4.193V3.75Zm6.5 0v.325a41.622 41.622 0 0 0-5 0V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25ZM10 10a1 1 0 0 0-1 1v.01a1 1 0 0 0 2 0V11a1 1 0 0 0-1-1Z" clipRule="evenodd" />
                    <path d="M3 15.055v-.684c.126.053.255.1.39.142 2.092.642 4.313.987 6.61.987 2.297 0 4.518-.345 6.61-.987.135-.041.264-.089.39-.142v.684c0 1.347-.985 2.53-2.363 2.686a41.454 41.454 0 0 1-9.274 0C3.985 17.585 3 16.402 3 15.055Z" />
                  </svg>
                ),
                color: "text-slate bg-slate/10",
              },
              {
                href: "/student/schedule",
                label: "시간표",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
                  </svg>
                ),
                color: "text-violet-600 bg-violet-50",
              },
              {
                href: "/student/civil-exams",
                label: "시험일정",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 0 1 8.75 1h2.5A2.75 2.75 0 0 1 14 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.83 2.54-1.952.599-4.024.921-6.17.921s-4.219-.322-6.17-.921C2.694 12.73 2 11.665 2 10.539V7.07c0-1.321.947-2.489 2.294-2.676A41.047 41.047 0 0 1 6 4.193V3.75Zm6.5 0v.325a41.622 41.622 0 0 0-5 0V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25ZM10 10a1 1 0 0 0-1 1v.01a1 1 0 0 0 2 0V11a1 1 0 0 0-1-1Z" clipRule="evenodd" />
                    <path d="M3 15.055v-.684c.126.053.255.1.39.142 2.092.642 4.313.987 6.61.987 2.297 0 4.518-.345 6.61-.987.135-.041.264-.089.39-.142v.684c0 1.347-.985 2.53-2.363 2.686a41.454 41.454 0 0 1-9.274 0C3.985 17.585 3 16.402 3 15.055Z" />
                  </svg>
                ),
                color: "text-ink bg-amber-50",
              },
              {
                href: "/student/study-rooms",
                label: "스터디룸",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Z" />
                  </svg>
                ),
                color: "text-teal-600 bg-teal-50",
              },
              {
                href: "/student/locker",
                label: "사물함",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 0 1 4.75 2h10.5A2.75 2.75 0 0 1 18 4.75v10.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25V4.75ZM4.75 3.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V4.75c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
                    <path d="M9.25 7.75a.75.75 0 0 1 1.5 0v2a.75.75 0 0 1-1.5 0v-2ZM10 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
                  </svg>
                ),
                color: "text-orange-600 bg-orange-50",
              },
              {
                href: "/student/enrollment/certificate",
                label: "증명서",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13ZM13.25 9a.75.75 0 0 1 .75.75v.01a.75.75 0 0 1-1.5 0V9.75a.75.75 0 0 1 .75-.75ZM6 12.75a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75ZM6.75 15a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" />
                  </svg>
                ),
                color: "text-indigo-600 bg-indigo-50",
              },
              {
                href: "/student/analytics",
                label: "학습분석",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M12 9a1 1 0 0 1-1-1V3c0-.552.45-1.007.997-.93a7.004 7.004 0 0 1 5.933 5.933c.078.547-.378.997-.93.997h-5Z" />
                    <path d="M8.003 4.07C8.55 3.994 9 4.449 9 5v5a1 1 0 0 0 1 1h5c.552 0 1.008.45.93.997A7.001 7.001 0 0 1 2 11a7.002 7.002 0 0 1 6.003-6.93Z" />
                  </svg>
                ),
                color: "text-violet-600 bg-violet-50",
              },
              {
                href: "/student/settings",
                label: "설정",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                  </svg>
                ),
                color: "text-ink bg-ink/10",
              },
              {
                href: "/student/referral",
                label: "추천인",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.52 2.52 0 0 1 13 4.5Z" />
                  </svg>
                ),
                color: "text-pink-600 bg-pink-50",
              },
              {
                href: "/student/calendar",
                label: "학원캘린더",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
                  </svg>
                ),
                color: "text-ember bg-ember/10",
              },
              {
                href: "/student/counseling",
                label: "면담신청",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 0 0 1.28.53l3.58-3.579a.78.78 0 0 1 .527-.224 41.202 41.202 0 0 0 5.183-.5c1.437-.232 2.43-1.49 2.43-2.903V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0 0 10 2Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM8 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm5 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                  </svg>
                ),
                color: "text-forest bg-forest/10",
              },
              {
                href: "/student/history",
                label: "활동이력",
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
                  </svg>
                ),
                color: "text-cyan-600 bg-cyan-50",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-2 rounded-[20px] border border-transparent px-2 py-3 text-center transition hover:border-ink/10 hover:bg-mist"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-[18px] ${item.color}`}>
                  {item.icon}
                </span>
                <span className="text-[11px] font-semibold leading-tight text-ink">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 다가오는 공채 시험 D-day 위젯 ── */}
        {upcomingStudentExams.length > 0 && (() => {
          const nextExam = upcomingStudentExams[0]!;
          const ddayDiff = nextExam.writtenDate
            ? Math.ceil((new Date(nextExam.writtenDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null;
          const ddayLabel =
            ddayDiff === null
              ? null
              : ddayDiff === 0
              ? "D-Day!"
              : ddayDiff > 0
              ? `D-${ddayDiff}`
              : "완료";
          const ddayClass =
            ddayDiff === null
              ? "border-ink/10 bg-mist text-slate"
              : ddayDiff === 0
              ? "border-ember/30 bg-ember/10 text-ember"
              : ddayDiff > 0 && ddayDiff <= 14
              ? "border-red-200 bg-red-50 text-red-700"
              : ddayDiff > 0 && ddayDiff <= 30
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : ddayDiff > 0
              ? "border-forest/20 bg-forest/10 text-forest"
              : "border-ink/10 bg-mist text-slate";

          return (
            <Link
              href="/student/civil-exams"
              className="block rounded-[28px] border border-ink/10 bg-white p-5 transition hover:border-ember/20 hover:shadow-sm sm:p-6"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                Upcoming Exam
              </p>
              <div className="mt-2 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-ink">다가오는 공채 시험</h2>
                  <p className="mt-1 truncate text-sm font-medium text-ink">
                    {nextExam.name}{" "}
                    <span className="text-slate">({nextExam.year}년)</span>
                  </p>
                  {nextExam.writtenDate && (
                    <p className="mt-0.5 text-xs text-slate">
                      필기{" "}
                      {(() => {
                        const d = new Date(nextExam.writtenDate);
                        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
                      })()}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {ddayLabel && (
                    <span className={`rounded-full border px-3 py-1 text-sm font-bold ${ddayClass}`}>
                      {ddayLabel}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-slate">
                    전체 보기
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>
          );
        })()}

        {/* ── 오늘 출결 상태 ── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                Today&apos;s Attendance
              </p>
              <h2 className="mt-1 text-xl font-semibold">오늘 출결 현황</h2>
              <p className="mt-1 text-xs text-slate">{todayDateStr}</p>
            </div>
            <Link
              href="/student/attendance"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              출결 전체 보기
            </Link>
          </div>

          {todayLectureAttendances.length === 0 ? (
            <div className="mt-4 rounded-[24px] border border-dashed border-ink/10 px-5 py-6 text-sm text-slate">
              오늘 등록된 강의 출결 기록이 없습니다.
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {todayLectureAttendances.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between rounded-[20px] border border-ink/10 bg-mist/60 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {att.session.schedule.subjectName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate">
                      {att.session.schedule.startTime} ~ {att.session.schedule.endTime}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${ATTEND_STATUS_BADGE[att.status]}`}
                  >
                    {ATTEND_STATUS_LABEL[att.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 이번 주 모의고사 출석 + 포인트 요약 ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 이번 주 모의고사 출석 요약 */}
          <Link
            href="/student/attendance"
            className="rounded-[28px] border border-ink/10 bg-white p-5 transition hover:border-forest/20 hover:shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              This Week
            </p>
            <h2 className="mt-1 text-lg font-semibold">이번 주 모의고사 출석</h2>
            {weeklyTotalDays === 0 ? (
              <p className="mt-3 text-sm text-slate">이번 주 시험 기록이 없습니다.</p>
            ) : (
              <>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-bold text-ink">
                    {weeklyAttendDays}
                  </span>
                  <span className="mb-0.5 text-sm text-slate">/ {weeklyTotalDays}일 응시</span>
                  {weeklyAbsentDays > 0 && (
                    <span className="mb-0.5 ml-auto text-xs font-semibold text-red-500">
                      결시 {weeklyAbsentDays}일
                    </span>
                  )}
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full bg-forest transition-all"
                    style={{
                      width: `${weeklyTotalDays > 0 ? Math.round((weeklyAttendDays / weeklyTotalDays) * 100) : 0}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-right text-xs text-slate">
                  응시율{" "}
                  {weeklyTotalDays > 0
                    ? Math.round((weeklyAttendDays / weeklyTotalDays) * 100)
                    : 0}
                  %
                </p>
              </>
            )}
          </Link>

          {/* 포인트 현황 */}
          <Link
            href="/student/points"
            className="rounded-[28px] border border-ink/10 bg-white p-5 transition hover:border-ember/20 hover:shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Points
            </p>
            <h2 className="mt-1 text-lg font-semibold">포인트 현황</h2>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-3xl font-bold text-ember">
                {(pointBalance?.balance ?? 0).toLocaleString()}
              </span>
              <span className="mb-0.5 text-sm text-slate">점</span>
            </div>
            <p className="mt-2 text-xs text-slate">
              포인트는 단과 강좌 및 시설 이용에 사용할 수 있습니다.
            </p>
            <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-ember">
              내역 보기
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </Link>
        </div>

        {/* ── 최신 공지사항 (상위 3건) ── */}
        {recentNotices.length > 0 && (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                  Notices
                </p>
                <h2 className="mt-1 text-xl font-semibold">최신 공지사항</h2>
              </div>
              <Link
                href="/student/notices"
                className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                전체 공지 보기
              </Link>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {recentNotices.map((notice) => (
                <Link
                  key={notice.id}
                  href={`/student/notices/${notice.id}`}
                  className="flex items-start justify-between gap-3 rounded-[20px] border border-ink/10 bg-mist/60 px-4 py-3 transition hover:border-ember/20 hover:bg-ember/5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {notice.isPinned && (
                        <span className="inline-flex rounded-full border border-ember/30 bg-ember/10 px-2 py-0.5 text-[10px] font-semibold text-ember">
                          고정
                        </span>
                      )}
                      <span className="truncate text-sm font-semibold text-ink">
                        {notice.title}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate">
                      {notice.publishedAt
                        ? `${notice.publishedAt.getFullYear()}-${String(notice.publishedAt.getMonth() + 1).padStart(2, "0")}-${String(notice.publishedAt.getDate()).padStart(2, "0")}`
                        : `${notice.createdAt.getFullYear()}-${String(notice.createdAt.getMonth() + 1).padStart(2, "0")}-${String(notice.createdAt.getDate()).padStart(2, "0")}`}
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-slate">
                    <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 최근 성적 요약 카드 ── */}
        {data.dailyAnalysis.length > 0 && (() => {
          const latestDate = data.dailyAnalysis[0]?.examDate;
          const latestSessions = data.dailyAnalysis.filter(
            (s) => s.examDate && latestDate &&
              new Date(s.examDate).toDateString() === new Date(latestDate).toDateString()
          );
          const totalScore = latestSessions.reduce(
            (sum, s) => sum + (s.searchedStudent?.score ?? 0),
            0,
          );
          const subjectCount = latestSessions.filter(
            (s) => s.searchedStudent?.score != null,
          ).length;
          const avgScore = subjectCount > 0 ? totalScore / subjectCount : null;

          return (
            <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                    Latest Score
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">최근 성적 요약</h2>
                </div>
                <Link
                  href="/student/scores"
                  className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                >
                  전체 성적 보기
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-xs text-slate">시험일</p>
                  <p className="mt-2 text-base font-semibold">
                    {latestDate ? formatDate(latestDate) : "-"}
                  </p>
                </article>
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-xs text-slate">평균 점수</p>
                  <p className="mt-2 text-xl font-bold text-ember">
                    {avgScore != null ? formatScore(avgScore) : "-"}
                  </p>
                </article>
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-xs text-slate">응시 과목</p>
                  <p className="mt-2 text-xl font-semibold">
                    {subjectCount}과목
                  </p>
                </article>
                <article className="rounded-[24px] border border-ember/10 bg-ember/5 p-4">
                  <p className="text-xs text-slate">내 석차 (최고)</p>
                  <p className="mt-2 text-xl font-semibold text-ember">
                    {latestSessions
                      .filter((s) => s.searchedStudent?.rank != null)
                      .sort(
                        (a, b) =>
                          (a.searchedStudent?.rank ?? 9999) -
                          (b.searchedStudent?.rank ?? 9999),
                      )[0]?.searchedStudent?.rank != null
                      ? `${latestSessions
                          .filter((s) => s.searchedStudent?.rank != null)
                          .sort(
                            (a, b) =>
                              (a.searchedStudent?.rank ?? 9999) -
                              (b.searchedStudent?.rank ?? 9999),
                          )[0]?.searchedStudent?.rank}등`
                      : "-"}
                  </p>
                </article>
              </div>

              {latestSessions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {latestSessions.map((s) => (
                    <div
                      key={s.sessionId}
                      className="flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs"
                    >
                      <span className="font-semibold">{SUBJECT_LABEL[s.subject]}</span>
                      <span className="text-slate">
                        {formatScore(s.searchedStudent?.score)}점
                      </span>
                      {s.searchedStudent?.rank != null && (
                        <span className="text-ember font-medium">
                          {s.searchedStudent.rank}등
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })()}

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">내 수강 정보</h2>
            <Link
              href="/student/enrollment"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              상세 보기
            </Link>
          </div>

          {activeEnrollment ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">강좌명</p>
                <p className="mt-3 text-base font-semibold leading-snug">
                  {getEnrollmentCourseName(activeEnrollment)}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">수강 상태</p>
                <p className="mt-3">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${ENROLLMENT_STATUS_BADGE[activeEnrollment.status] ?? "border-ink/10 bg-mist text-ink"}`}
                  >
                    {ENROLLMENT_STATUS_LABEL[activeEnrollment.status] ?? activeEnrollment.status}
                  </span>
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">수강 기간</p>
                <p className="mt-3 text-sm font-semibold">
                  {formatDateWithWeekday(activeEnrollment.startDate)}
                  {activeEnrollment.endDate
                    ? ` ~ ${formatDateWithWeekday(activeEnrollment.endDate)}`
                    : ""}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">남은 기간</p>
                <p className="mt-3 text-xl font-semibold">
                  {activeEnrollment.endDate
                    ? computeDDay(activeEnrollment.endDate)
                    : "-"}
                </p>
              </article>
            </div>
          ) : (
            <div className="mt-4 rounded-[24px] border border-dashed border-ink/10 p-6 text-sm text-slate">
              현재 등록된 강좌가 없습니다.{" "}
              <span className="text-ink">문의: {branding.phone ?? "학원 창구"}</span>
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">공무원 시험 일정</h2>
              <p className="mt-1 text-xs text-slate">필기시험 기준 D-day</p>
            </div>
            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              {EXAM_TYPE_LABEL[data.student.examType]}
            </span>
          </div>
          {upcomingStudentExams.length === 0 ? (
            <div className="mt-4 rounded-[24px] border border-dashed border-ink/10 px-5 py-6 text-sm text-slate">
              예정된 시험이 없습니다.
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              {upcomingStudentExams.map((exam) => {
                const dday = exam.writtenDate ? computeCivilExamDDay(exam.writtenDate) : null;
                return (
                  <div
                    key={exam.id}
                    className="flex flex-1 min-w-[220px] items-center gap-3 rounded-[20px] border border-ink/10 bg-mist/60 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{exam.name}</p>
                      <p className="mt-0.5 text-xs text-slate">
                        {EXAM_TYPE_LABEL[exam.examType]} / {exam.year}년
                      </p>
                      <p className="mt-0.5 text-xs text-slate">
                        필기 {exam.writtenDate ? formatKoreanDatePortal(exam.writtenDate) : "-"}
                      </p>
                      {exam.resultDate ? (
                        <p className="mt-0.5 text-xs text-slate">
                          결과 {formatKoreanDatePortal(exam.resultDate)}
                        </p>
                      ) : null}
                    </div>
                    {dday ? (
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${dday.pillClass}`}>
                        {dday.label}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <form className="grid gap-4 rounded-[28px] border border-ink/10 bg-white p-5 sm:grid-cols-2 xl:grid-cols-5 sm:p-6">
          <div>
            <label className="mb-2 block text-sm font-medium">조회 기간</label>
            <select
              name="periodId"
              defaultValue={data.selectedPeriod?.id ? String(data.selectedPeriod.id) : ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">일자</label>
            <select
              name="date"
              defaultValue={data.selectedDate}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.dateOptions.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">월</label>
            <select
              name="monthKey"
              defaultValue={data.selectedMonthKey}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.monthOptions.map((option) => (
                <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
                  {option.year}년 {option.month}월
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">과목</label>
            <select
              name="subject"
              defaultValue={data.selectedSubject ?? ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.subjectOptions.map((subject) => (
                <option key={subject} value={subject}>
                  {SUBJECT_LABEL[subject]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              조회 적용
            </button>
          </div>
        </form>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">일자별 시험 분석</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                선택한 날짜의 과목별 비교표와 문항 분석을 확인할 수 있습니다.
              </p>
            </div>
          </div>

          {data.dailyAnalysis.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              선택한 날짜에 표시할 시험 데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-8">
              <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">과목</th>
                      <th className="px-4 py-3 font-semibold">내 점수</th>
                      <th className="px-4 py-3 font-semibold">석차</th>
                      <th className="px-4 py-3 font-semibold">전체 평균</th>
                      <th className="px-4 py-3 font-semibold">상위 10%</th>
                      <th className="px-4 py-3 font-semibold">상위 30%</th>
                      <th className="px-4 py-3 font-semibold">최고점</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {data.dailyAnalysis.map((session) => (
                      <tr key={session.sessionId}>
                        <td className="px-4 py-3">{SUBJECT_LABEL[session.subject]}</td>
                        <td className="px-4 py-3">{formatScore(session.searchedStudent?.score)}</td>
                        <td className="px-4 py-3">
                          {session.searchedStudent?.rank
                            ? `${session.searchedStudent.rank}/${session.participantCount}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3">{formatScore(session.averageScore)}</td>
                        <td className="px-4 py-3">{formatScore(session.top10Average)}</td>
                        <td className="px-4 py-3">{formatScore(session.top30Average)}</td>
                        <td className="px-4 py-3">{formatScore(session.highestScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.dailyAnalysis.map((session) => {
                const summary = questionSummary(session.questionRows);

                return (
                  <article key={session.sessionId} className="space-y-6 rounded-[24px] border border-ink/10 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold">{SUBJECT_LABEL[session.subject]}</h3>
                        <p className="mt-2 text-sm text-slate">
                          {formatDate(session.examDate)} / {session.week}주차 / 응시 {session.participantCount}명
                        </p>
                        {session.searchedStudent ? (
                          <p className="mt-2 text-sm text-slate">
                            내 점수 {formatScore(session.searchedStudent.score)} / 석차 {session.searchedStudent.rank ?? "-"}등
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">총 문항</div>
                          <div className="mt-2 text-lg font-semibold">{summary.total}</div>
                        </div>
                        <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">정답</div>
                          <div className="mt-2 text-lg font-semibold">{summary.correct}</div>
                        </div>
                        <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">오답</div>
                          <div className="mt-2 text-lg font-semibold">{summary.wrong}</div>
                        </div>
                        <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                          <div className="text-slate">정답률</div>
                          <div className="mt-2 text-lg font-semibold">{summary.correctRate}%</div>
                        </div>
                      </div>
                    </div>

                    <BarComparisonChart
                      data={[
                        {
                          label: SUBJECT_LABEL[session.subject],
                          highestScore: session.highestScore ?? 0,
                          myScore: session.searchedStudent?.score ?? 0,
                          top10Average: session.top10Average ?? 0,
                          top30Average: session.top30Average ?? 0,
                        },
                      ]}
                      xKey="label"
                      bars={[
                        { dataKey: "highestScore", color: "#0F766E", name: "최고점" },
                        { dataKey: "myScore", color: "#EA580C", name: "내 점수" },
                        { dataKey: "top10Average", color: "#2563EB", name: "상위 10%" },
                        { dataKey: "top30Average", color: "#7C3AED", name: "상위 30%" },
                      ]}
                    />

                    <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-mist/80 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold">문항</th>
                            <th className="px-4 py-3 font-semibold">정답</th>
                            <th className="px-4 py-3 font-semibold">내 답안</th>
                            <th className="px-4 py-3 font-semibold">정오</th>
                            <th className="px-4 py-3 font-semibold">정답률</th>
                            <th className="px-4 py-3 font-semibold">난이도</th>
                            <th className="px-4 py-3 font-semibold">노트</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {session.questionRows.map((question) => (
                            <tr key={question.questionId}>
                              <td className="px-4 py-3">{question.questionNo}</td>
                              <td className="px-4 py-3">{question.correctAnswer}</td>
                              <td className="px-4 py-3">{question.searchedStudentAnswer ?? "-"}</td>
                              <td className="px-4 py-3">
                                {question.searchedStudentCorrect === null
                                  ? "-"
                                  : question.searchedStudentCorrect
                                    ? "O"
                                    : "X"}
                              </td>
                              <td className="px-4 py-3">{question.correctRate.toFixed(1)}%</td>
                              <td className="px-4 py-3">{question.difficulty ?? "-"}</td>
                              <td className="px-4 py-3">
                                {question.searchedStudentCorrect === false ? (
                                  <WrongNoteSaveButton
                                    questionId={question.questionId}
                                    initiallySaved={wrongNoteQuestionIds.has(question.questionId)}
                                  />
                                ) : (
                                  "-"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-mist/80 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold">상위 오답 TOP5</th>
                            <th className="px-4 py-3 font-semibold">정답</th>
                            <th className="px-4 py-3 font-semibold">정답률</th>
                            <th className="px-4 py-3 font-semibold">최다 오답</th>
                            <th className="px-4 py-3 font-semibold">내 답안</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {session.topWrongQuestions.map((question) => (
                            <tr key={`${session.sessionId}-${question.questionNo}`}>
                              <td className="px-4 py-3">{question.questionNo}번</td>
                              <td className="px-4 py-3">{question.correctAnswer}</td>
                              <td className="px-4 py-3">{question.correctRate.toFixed(1)}%</td>
                              <td className="px-4 py-3">{question.mostCommonWrongAnswer ?? "-"}</td>
                              <td className="px-4 py-3">{question.searchedStudentAnswer ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">월간 종합 분석</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                월 평균, 출결, 과목별 비교를 함께 확인할 수 있습니다.
              </p>
            </div>
          </div>

          {!data.monthlyAnalysis ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              선택한 월의 분석 데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">내 평균</p>
                  <p className="mt-3 text-xl font-semibold">
                    {formatScore(data.monthlyAnalysis.summary.monthlyAverage)}
                  </p>
                </article>
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">출석률</p>
                  <p className="mt-3 text-xl font-semibold">
                    {data.monthlyAnalysis.summary.attendanceRate.toFixed(1)}%
                  </p>
                </article>
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">응시 횟수</p>
                  <p className="mt-3 text-xl font-semibold">
                    {data.monthlyAnalysis.summary.attendedCount} / {data.monthlyAnalysis.summary.sessionCount}
                  </p>
                </article>
                <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">직렬</p>
                  <p className="mt-3 text-xl font-semibold">
                    {EXAM_TYPE_LABEL[data.monthlyAnalysis.student.examType]}
                  </p>
                </article>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <article className="rounded-[24px] border border-ink/10 p-4">
                  <h3 className="text-lg font-semibold">과목별 균형</h3>
                  <div className="mt-4">
                    <RadarComparisonChart data={data.monthlyAnalysis.radarData} />
                  </div>
                </article>
                <article className="rounded-[24px] border border-ink/10 p-4">
                  <h3 className="text-lg font-semibold">내 점수 vs 코호트</h3>
                  <div className="mt-4">
                    <BarComparisonChart
                      data={data.monthlyAnalysis.barData}
                      xKey="subject"
                      bars={[
                        { dataKey: "studentAverage", color: "#EA580C", name: "내 평균" },
                        { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                        { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                      ]}
                    />
                  </div>
                </article>
              </div>

              <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">과목</th>
                      <th className="px-4 py-3 font-semibold">내 평균</th>
                      <th className="px-4 py-3 font-semibold">석차</th>
                      <th className="px-4 py-3 font-semibold">전체 평균</th>
                      <th className="px-4 py-3 font-semibold">상위 10%</th>
                      <th className="px-4 py-3 font-semibold">상위 30%</th>
                      <th className="px-4 py-3 font-semibold">목표</th>
                      <th className="px-4 py-3 font-semibold">달성률</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {data.monthlyAnalysis.subjectSummary.map((row) => (
                      <tr key={row.subject}>
                        <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                        <td className="px-4 py-3">{formatScore(row.studentAverage)}</td>
                        <td className="px-4 py-3">
                          {row.rank ? `${row.rank}/${row.participantCount}` : "-"}
                        </td>
                        <td className="px-4 py-3">{formatScore(row.cohortAverage)}</td>
                        <td className="px-4 py-3">{formatScore(row.top10Average)}</td>
                        <td className="px-4 py-3">{formatScore(row.top30Average)}</td>
                        <td className="px-4 py-3">{formatScore(row.targetScore)}</td>
                        <td className="px-4 py-3">
                          {row.achievementRate ? `${row.achievementRate.toFixed(1)}%` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">과목별 추이</h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                선택한 과목의 회차별 변화와 비교 지표를 확인할 수 있습니다.
              </p>
            </div>
          </div>

          {data.subjectAnalysis.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              선택한 과목의 추이 데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <TrendLineChart
                data={data.subjectAnalysis.map((row) => ({
                  label: formatDate(row.examDate),
                  studentScore: row.studentScore ?? 0,
                  averageScore: row.averageScore ?? 0,
                  top10Average: row.top10Average ?? 0,
                  top30Average: row.top30Average ?? 0,
                  targetScore:
                    data.student.targetScores[data.selectedSubject ?? Subject.CUMULATIVE] ?? 0,
                }))}
                xKey="label"
                lines={[
                  { dataKey: "studentScore", color: "#EA580C", name: "내 점수" },
                  { dataKey: "averageScore", color: "#2563EB", name: "전체 평균" },
                  { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                  { dataKey: "top30Average", color: "#7C3AED", name: "상위 30%" },
                  { dataKey: "targetScore", color: "#475569", name: "목표 점수" },
                ]}
              />

              <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">시험일</th>
                      <th className="px-4 py-3 font-semibold">주차</th>
                      <th className="px-4 py-3 font-semibold">응시자 수</th>
                      <th className="px-4 py-3 font-semibold">내 점수</th>
                      <th className="px-4 py-3 font-semibold">전체 평균</th>
                      <th className="px-4 py-3 font-semibold">상위 10%</th>
                      <th className="px-4 py-3 font-semibold">상위 30%</th>
                      <th className="px-4 py-3 font-semibold">최고점</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {data.subjectAnalysis.map((row) => (
                      <tr key={row.sessionId}>
                        <td className="px-4 py-3">{formatDate(row.examDate)}</td>
                        <td className="px-4 py-3">{row.week}주차</td>
                        <td className="px-4 py-3">{row.participantCount}</td>
                        <td className="px-4 py-3">{formatScore(row.studentScore)}</td>
                        <td className="px-4 py-3">{formatScore(row.averageScore)}</td>
                        <td className="px-4 py-3">{formatScore(row.top10Average)}</td>
                        <td className="px-4 py-3">{formatScore(row.top30Average)}</td>
                        <td className="px-4 py-3">{formatScore(row.highestScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
