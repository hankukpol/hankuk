import type { Metadata } from "next";
import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { HistoryTimeline } from "@/components/student-portal/history-timeline";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import type { HistoryEvent } from "@/app/api/student/history/route";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "활동 이력",
};

// ─── Labels ────────────────────────────────────────────────────────────────────

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기 중",
  ACTIVE: "수강 중",
  WAITING: "대기자",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "자퇴",
  CANCELLED: "취소",
};

const COURSE_TYPE_LABEL: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "처리 중",
  APPROVED: "승인 완료",
  PARTIAL_REFUNDED: "부분 환불",
  FULLY_REFUNDED: "전액 환불",
  CANCELLED: "취소",
};

const ABSENCE_STATUS_LABEL: Record<string, string> = {
  PENDING: "검토 대기",
  APPROVED: "승인",
  REJECTED: "반려",
  CANCELLED: "취소",
};

const SUBJECT_LABEL: Record<string, string> = {
  KOREAN: "국어",
  MATH: "수학",
  ENGLISH: "영어",
  SOCIAL: "사회",
  SCIENCE: "과학",
  HISTORY: "한국사",
  LAW: "형사법",
  CRIMINAL_LAW: "형법",
  CRIMINAL_PROCEDURE: "형소법",
  CONSTITUTION: "헌법",
  POLICE_SCIENCE: "경찰학",
  GENERAL: "일반상식",
};

function formatAmount(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchHistoryEvents(examNumber: string): Promise<HistoryEvent[]> {
  const prisma = getPrisma();
  const since = new Date();
  since.setDate(since.getDate() - 60);

  const events: HistoryEvent[] = [];

  // 1. CourseEnrollment
  try {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { examNumber, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        courseType: true,
        status: true,
        finalFee: true,
        createdAt: true,
        updatedAt: true,
        product: { select: { name: true } },
        cohort: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
      take: 30,
    });

    for (const e of enrollments) {
      const courseName =
        e.product?.name ?? e.cohort?.name ?? e.specialLecture?.name ?? "강좌";
      const typeLabel = COURSE_TYPE_LABEL[e.courseType] ?? e.courseType;

      events.push({
        id: `enrollment-${e.id}`,
        type: "ENROLLMENT",
        date: e.createdAt.toISOString(),
        title: "수강 등록",
        description: `${courseName} (${typeLabel}) — ${formatAmount(e.finalFee)}`,
        badge: ENROLLMENT_STATUS_LABEL[e.status] ?? e.status,
        color: "forest",
      });

      if (
        e.status !== "PENDING" &&
        e.status !== "ACTIVE" &&
        e.updatedAt.toISOString() !== e.createdAt.toISOString() &&
        e.updatedAt >= since
      ) {
        events.push({
          id: `enrollment-status-${e.id}`,
          type: "ENROLLMENT",
          date: e.updatedAt.toISOString(),
          title: "수강 상태 변경",
          description: `${courseName} → ${ENROLLMENT_STATUS_LABEL[e.status] ?? e.status}`,
          badge: ENROLLMENT_STATUS_LABEL[e.status] ?? e.status,
          color: "amber",
        });
      }
    }
  } catch {
    // model might not exist in dev env
  }

  // 2. Payment
  try {
    const payments = await prisma.payment.findMany({
      where: { examNumber, processedAt: { gte: since } },
      orderBy: { processedAt: "desc" },
      select: {
        id: true,
        grossAmount: true,
        status: true,
        processedAt: true,
      },
      take: 30,
    });

    for (const p of payments) {
      const isRefunded =
        p.status === "FULLY_REFUNDED" || p.status === "PARTIAL_REFUNDED";
      events.push({
        id: `payment-${p.id}`,
        type: "PAYMENT",
        date: p.processedAt.toISOString(),
        title: isRefunded ? "환불 처리" : "수납 완료",
        description: `${formatAmount(p.grossAmount)} ${isRefunded ? "환불" : "납부"}`,
        badge: PAYMENT_STATUS_LABEL[p.status] ?? p.status,
        link: "/student/payment-history",
        color: isRefunded ? "amber" : "ember",
      });
    }
  } catch {
    // model might not exist in dev env
  }

  // 3. Score — group by exam date
  try {
    const scores = await prisma.score.findMany({
      where: { examNumber, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        finalScore: true,
        createdAt: true,
        session: {
          select: {
            id: true,
            subject: true,
            examDate: true,
            week: true,
          },
        },
      },
      take: 60,
    });

    const byDate = new Map<string, typeof scores>();
    for (const s of scores) {
      const dk = s.session.examDate.toISOString().slice(0, 10);
      const g = byDate.get(dk) ?? [];
      g.push(s);
      byDate.set(dk, g);
    }

    for (const [, group] of byDate) {
      const first = group[0]!;
      const totalScore = group.reduce((sum, s) => sum + (s.finalScore ?? 0), 0);
      const subjectNames = group
        .map((s) => SUBJECT_LABEL[s.session.subject] ?? s.session.subject)
        .join(", ");

      events.push({
        id: `score-${first.session.examDate.toISOString().slice(0, 10)}-${examNumber}`,
        type: "SCORE",
        date: first.createdAt.toISOString(),
        title: "성적 입력",
        description: `${first.session.week}주차 · ${subjectNames} · 합계 ${totalScore.toFixed(1)}점`,
        badge: `${group.length}과목`,
        link: "/student/scores",
        color: "sky",
      });
    }
  } catch {
    // model might not exist in dev env
  }

  // 4. AbsenceNote
  try {
    const absenceNotes = await prisma.absenceNote.findMany({
      where: { examNumber, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        reason: true,
        approvedAt: true,
        createdAt: true,
        session: { select: { examDate: true, subject: true } },
      },
      take: 20,
    });

    for (const note of absenceNotes) {
      const subjectLabel = SUBJECT_LABEL[note.session.subject] ?? note.session.subject;
      const dateLabel = note.session.examDate.toISOString().slice(0, 10);

      events.push({
        id: `absence-${note.id}`,
        type: "ABSENCE_NOTE",
        date: note.createdAt.toISOString(),
        title: "결석확인서 제출",
        description: `${dateLabel} ${subjectLabel} — ${note.reason.slice(0, 40)}${note.reason.length > 40 ? "…" : ""}`,
        badge: ABSENCE_STATUS_LABEL[note.status] ?? note.status,
        link: "/student/absence-notes",
        color: "slate",
      });

      if (note.approvedAt && note.approvedAt >= since) {
        events.push({
          id: `absence-approved-${note.id}`,
          type: "ABSENCE_NOTE",
          date: note.approvedAt.toISOString(),
          title: "결석확인서 승인",
          description: `${dateLabel} ${subjectLabel}`,
          badge: "승인",
          link: "/student/absence-notes",
          color: "forest",
        });
      }
    }
  } catch {
    // model might not exist in dev env
  }

  // 5. PointLog
  try {
    const pointLogs = await prisma.pointLog.findMany({
      where: { examNumber, grantedAt: { gte: since } },
      orderBy: { grantedAt: "desc" },
      select: {
        id: true,
        amount: true,
        reason: true,
        grantedAt: true,
      },
      take: 20,
    });

    for (const p of pointLogs) {
      const isEarned = p.amount > 0;
      events.push({
        id: `point-${p.id}`,
        type: "POINT",
        date: p.grantedAt.toISOString(),
        title: isEarned ? "포인트 지급" : "포인트 차감",
        description: p.reason,
        badge: `${isEarned ? "+" : ""}${p.amount.toLocaleString()}P`,
        link: "/student/points",
        color: isEarned ? "forest" : "amber",
      });
    }
  } catch {
    // model might not exist in dev env
  }

  // 6. LectureAttendance (결석/지각만)
  try {
    const lectureAttendances = await prisma.lectureAttendance.findMany({
      where: {
        studentId: examNumber,
        status: { in: ["ABSENT", "LATE"] },
        checkedAt: { gte: since },
      },
      orderBy: { checkedAt: "desc" },
      select: {
        id: true,
        status: true,
        note: true,
        checkedAt: true,
        session: {
          select: {
            startTime: true,
            schedule: { select: { subjectName: true } },
          },
        },
      },
      take: 20,
    });

    for (const a of lectureAttendances) {
      const isAbsent = a.status === "ABSENT";
      events.push({
        id: `lecture-attendance-${a.id}`,
        type: "ATTENDANCE",
        date: a.checkedAt.toISOString(),
        title: isAbsent ? "강의 결석" : "강의 지각",
        description: `${a.session.schedule.subjectName} ${a.session.startTime}${a.note ? ` — ${a.note}` : ""}`,
        badge: isAbsent ? "결석" : "지각",
        link: "/student/attendance",
        color: isAbsent ? "amber" : "slate",
      });
    }
  } catch {
    // model might not exist in dev env
  }

  // Sort newest-first, limit to 100
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return events.slice(0, 100);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentHistoryPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            History Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            활동 이력은 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 이력 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            활동 이력
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            활동 이력은 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 최근 60일간의 수강, 성적, 수납, 출결 이력을 타임라인으로 확인할 수 있습니다.
          </p>
        </section>

        <StudentLookupForm redirectPath="/student/history" />
      </main>
    );
  }

  const events = await fetchHistoryEvents(viewer.examNumber);

  const totalCount = events.length;
  const scoreCount = events.filter((e) => e.type === "SCORE").length;
  const paymentCount = events.filter((e) => e.type === "PAYMENT").length;
  const attendanceCount = events.filter(
    (e) => e.type === "ATTENDANCE" || e.type === "ABSENCE_NOTE",
  ).length;

  return (
    <main className="space-y-6 px-0 py-6">

      {/* ── Header ── */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Activity History
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              {viewer.name}의 활동 이력
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              최근 60일간 수강 등록, 성적 입력, 수납, 출결 이력을 타임라인으로 확인할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털로 돌아가기
            </Link>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">전체 이력</p>
            <p className="mt-3 text-2xl font-bold text-ink">{totalCount}건</p>
          </article>
          <article className="rounded-[24px] border border-sky-200 bg-sky-50 p-4">
            <p className="text-sm text-slate">성적</p>
            <p className="mt-3 text-2xl font-bold text-sky-700">{scoreCount}건</p>
          </article>
          <article className="rounded-[24px] border border-ember/20 bg-ember/5 p-4">
            <p className="text-sm text-slate">수납</p>
            <p className="mt-3 text-2xl font-bold text-ember">{paymentCount}건</p>
          </article>
          <article className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-slate">출결</p>
            <p className="mt-3 text-2xl font-bold text-amber-700">{attendanceCount}건</p>
          </article>
        </div>
      </section>

      {/* ── Timeline ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
            Timeline
          </p>
          <h2 className="mt-1 text-xl font-semibold">이력 타임라인</h2>
          <p className="mt-1 text-xs text-slate">
            최근 60일 · 최대 100건 표시
          </p>
        </div>

        <HistoryTimeline events={events} />
      </section>

    </main>
  );
}
