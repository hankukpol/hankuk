import { NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface HistoryEvent {
  id: string;
  type: "ENROLLMENT" | "PAYMENT" | "SCORE" | "ATTENDANCE" | "ABSENCE_NOTE" | "POINT" | "OTHER";
  date: string; // ISO
  title: string; // Korean
  description?: string;
  badge?: string; // small extra info
  link?: string; // optional href
  color: "forest" | "ember" | "sky" | "amber" | "slate";
}

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

export async function GET(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { examNumber } = auth.student;
  const prisma = getPrisma();

  const since = new Date();
  since.setDate(since.getDate() - 60); // last 60 days

  const events: HistoryEvent[] = [];

  // ── 1. CourseEnrollment 이벤트 ─────────────────────────────────────────────
  try {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: {
        examNumber,
        createdAt: { gte: since },
      },
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
        e.product?.name ??
        e.cohort?.name ??
        e.specialLecture?.name ??
        "강좌";
      const typeLabel = COURSE_TYPE_LABEL[e.courseType] ?? e.courseType;

      events.push({
        id: `enrollment-${e.id}`,
        type: "ENROLLMENT",
        date: e.createdAt.toISOString(),
        title: "수강 등록",
        description: `${courseName} (${typeLabel}) — ${formatAmount(e.finalFee)}`,
        badge: ENROLLMENT_STATUS_LABEL[e.status] ?? e.status,
        link: undefined,
        color: "forest",
      });

      // If status was updated and differs (e.g., suspended, completed)
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
          link: undefined,
          color: "amber",
        });
      }
    }
  } catch {
    // skip if model unavailable
  }

  // ── 2. Payment 이벤트 ──────────────────────────────────────────────────────
  try {
    const payments = await prisma.payment.findMany({
      where: {
        examNumber,
        processedAt: { gte: since },
      },
      orderBy: { processedAt: "desc" },
      select: {
        id: true,
        grossAmount: true,
        netAmount: true,
        status: true,
        category: true,
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
    // skip if model unavailable
  }

  // ── 3. Score (시험 성적) 이벤트 ────────────────────────────────────────────
  try {
    const scores = await prisma.score.findMany({
      where: {
        examNumber,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        finalScore: true,
        rawScore: true,
        attendType: true,
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

    // Group scores by exam date to create per-session events
    const byDate = new Map<string, typeof scores>();
    for (const s of scores) {
      const dateKey = s.session.examDate.toISOString().slice(0, 10);
      const group = byDate.get(dateKey) ?? [];
      group.push(s);
      byDate.set(dateKey, group);
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
        link: `/student/scores`,
        color: "sky",
      });
    }
  } catch {
    // skip if model unavailable
  }

  // ── 4. AbsenceNote 이벤트 ─────────────────────────────────────────────────
  try {
    const absenceNotes = await prisma.absenceNote.findMany({
      where: {
        examNumber,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        reason: true,
        submittedAt: true,
        approvedAt: true,
        createdAt: true,
        session: {
          select: {
            examDate: true,
            subject: true,
          },
        },
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
    // skip if model unavailable
  }

  // ── 5. PointLog 이벤트 ────────────────────────────────────────────────────
  try {
    const pointLogs = await prisma.pointLog.findMany({
      where: {
        examNumber,
        grantedAt: { gte: since },
      },
      orderBy: { grantedAt: "desc" },
      select: {
        id: true,
        amount: true,
        reason: true,
        type: true,
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
        description: `${p.reason}`,
        badge: `${isEarned ? "+" : ""}${p.amount.toLocaleString()}P`,
        link: "/student/points",
        color: isEarned ? "forest" : "amber",
      });
    }
  } catch {
    // skip if model unavailable
  }

  // ── 6. LectureAttendance 이벤트 (결석/지각만) ────────────────────────────
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
            sessionDate: true,
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
    // skip if model unavailable
  }

  // ── Sort all events newest-first, limit to 100 ────────────────────────────
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const limited = events.slice(0, 100);

  return NextResponse.json({ data: limited });
}
