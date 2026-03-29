"use client";

import { formatDate } from "@/lib/format";
import type { LeaveRecordRow } from "./page";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "수강 중",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
  WAITING: "대기자",
};

type TimelineEvent = {
  date: string; // ISO string
  label: string;
  detail?: string;
  type: "register" | "leave" | "return" | "terminal" | "current";
};

function buildTimeline(
  createdAt: string,
  startDate: string,
  endDate: string | null,
  status: string,
  leaveRecords: LeaveRecordRow[],
  courseName: string,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // 등록일
  events.push({
    date: createdAt,
    label: "수강 등록",
    detail: courseName,
    type: "register",
  });

  // 수강 시작일이 등록일과 다를 경우만 표시
  const createdDate = createdAt.split("T")[0];
  const startDateOnly = startDate.split("T")[0];
  if (startDateOnly !== createdDate) {
    events.push({
      date: startDate,
      label: "수강 시작",
      detail: `수강 기간 시작`,
      type: "register",
    });
  }

  // 휴원/복귀 이력 (오래된 순으로 정렬)
  const sortedLeaves = [...leaveRecords].sort(
    (a, b) => new Date(a.leaveDate).getTime() - new Date(b.leaveDate).getTime(),
  );

  for (const leave of sortedLeaves) {
    events.push({
      date: leave.leaveDate,
      label: "휴원",
      detail: leave.reason ?? undefined,
      type: "leave",
    });

    if (leave.returnDate) {
      const days = Math.ceil(
        (new Date(leave.returnDate).getTime() - new Date(leave.leaveDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      events.push({
        date: leave.returnDate,
        label: "복귀",
        detail: `${days}일 휴원 후 복귀`,
        type: "return",
      });
    }
  }

  // 종료 상태 이벤트
  if (status === "COMPLETED" && endDate) {
    events.push({
      date: endDate,
      label: "수료",
      detail: "수강 과정 수료",
      type: "terminal",
    });
  } else if (status === "WITHDRAWN" && endDate) {
    events.push({
      date: endDate,
      label: "퇴원",
      detail: "수강 중도 퇴원",
      type: "terminal",
    });
  } else if (status === "CANCELLED") {
    events.push({
      date: createdAt, // 취소는 등록 직후이므로 createdAt 사용
      label: "취소",
      detail: "수강 신청 취소",
      type: "terminal",
    });
  } else {
    // 현재 진행 중 상태
    const currentLabel = STATUS_LABEL[status] ?? status;
    events.push({
      date: new Date().toISOString(),
      label: `현재 — ${currentLabel}`,
      detail: endDate ? `수강 종료 예정: ${formatDate(endDate)}` : "종료일 미정",
      type: "current",
    });
  }

  // 날짜 순 정렬 (current 이벤트는 항상 마지막)
  return events.sort((a, b) => {
    if (a.type === "current") return 1;
    if (b.type === "current") return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

const EVENT_STYLES: Record<
  TimelineEvent["type"],
  { dot: string; badge: string; label: string }
> = {
  register: {
    dot: "bg-forest border-forest/30",
    badge: "border-forest/20 bg-forest/10 text-forest",
    label: "text-ink",
  },
  leave: {
    dot: "bg-amber-400 border-amber-300",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    label: "text-amber-800",
  },
  return: {
    dot: "bg-sky-400 border-sky-300",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    label: "text-sky-800",
  },
  terminal: {
    dot: "bg-slate border-ink/20",
    badge: "border-ink/10 bg-mist text-slate",
    label: "text-slate",
  },
  current: {
    dot: "bg-ember border-ember/30 ring-2 ring-ember/20",
    badge: "border-ember/20 bg-ember/10 text-ember",
    label: "text-ink font-semibold",
  },
};

type Props = {
  createdAt: string;
  startDate: string;
  endDate: string | null;
  status: string;
  leaveRecords: LeaveRecordRow[];
  courseName: string;
};

export function EnrollmentHistoryTimeline({
  createdAt,
  startDate,
  endDate,
  status,
  leaveRecords,
  courseName,
}: Props) {
  const events = buildTimeline(createdAt, startDate, endDate, status, leaveRecords, courseName);

  return (
    <div>
      <h3 className="text-lg font-semibold">수강 이력 타임라인</h3>
      <p className="mt-1 text-sm text-slate">수강 등록부터 현재까지의 주요 이력을 시간순으로 표시합니다.</p>
      <div className="mt-4">
        <ol className="relative ml-3 border-l border-ink/10">
          {events.map((event, idx) => {
            const styles = EVENT_STYLES[event.type];
            const isLast = idx === events.length - 1;
            const dateStr =
              event.type === "current"
                ? "현재"
                : new Date(event.date).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  });

            return (
              <li key={idx} className={`ml-4 ${isLast ? "mb-0" : "mb-5"}`}>
                {/* Timeline dot */}
                <span
                  className={`absolute -left-2 mt-1.5 h-4 w-4 rounded-full border ${styles.dot}`}
                />
                <div className="flex flex-wrap items-start gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles.badge}`}
                  >
                    {event.label}
                  </span>
                  <span className="text-sm text-slate">{dateStr}</span>
                </div>
                {event.detail && (
                  <p className={`mt-1 text-xs ${event.type === "current" ? "text-slate" : "text-slate"}`}>
                    {event.detail}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
