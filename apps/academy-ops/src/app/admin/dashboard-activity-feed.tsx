import Link from "next/link";
import { AttendType, PaymentMethod } from "@prisma/client";

// ── 타입 ────────────────────────────────────────────────────────────────────

type EnrollmentItem = {
  id: string;
  createdAt: Date;
  student: { name: string; examNumber: string };
  cohort: { name: string } | null;
  specialLecture: { name: string } | null;
};

type PaymentItem = {
  id: string;
  createdAt: Date;
  netAmount: number;
  method: PaymentMethod;
  examNumber: string | null;
  student: { name: string } | null;
};

type AttendanceItem = {
  id: string;
  createdAt: Date;
  attendType: AttendType;
  student: { name: string; examNumber: string };
};

export type ActivityFeedData = {
  recentEnrollments: EnrollmentItem[];
  recentPayments: PaymentItem[];
  recentAttendance: AttendanceItem[];
};

// ── 유틸 ────────────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}일 전`;
  return `${Math.floor(diffDay / 30)}개월 전`;
}

const ATTEND_TYPE_LABEL: Record<AttendType, string> = {
  NORMAL: "정상 출석",
  LIVE: "온라인 출석",
  EXCUSED: "공결",
  ABSENT: "결석",
};

const ATTEND_TYPE_COLOR: Record<AttendType, string> = {
  NORMAL: "text-forest",
  LIVE: "text-sky-600",
  EXCUSED: "text-amber-600",
  ABSENT: "text-red-600",
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "이체",
  POINT: "포인트",
  MIXED: "혼합",
};

// ── 이벤트 병합 및 정렬 ──────────────────────────────────────────────────────

type ActivityEvent =
  | { kind: "enrollment"; data: EnrollmentItem }
  | { kind: "payment"; data: PaymentItem }
  | { kind: "attendance"; data: AttendanceItem };

function mergeAndSort(
  enrollments: EnrollmentItem[],
  payments: PaymentItem[],
  attendance: AttendanceItem[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [
    ...enrollments.map((d) => ({ kind: "enrollment" as const, data: d })),
    ...payments.map((d) => ({ kind: "payment" as const, data: d })),
    ...attendance.map((d) => ({ kind: "attendance" as const, data: d })),
  ];
  events.sort((a, b) => {
    const aTime = a.data.createdAt.getTime();
    const bTime = b.data.createdAt.getTime();
    return bTime - aTime;
  });
  return events;
}

// ── 아이콘 ───────────────────────────────────────────────────────────────────

function EnrollmentIcon() {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest/10 text-forest"
      aria-hidden="true"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
      </svg>
    </span>
  );
}

function PaymentIcon() {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember/10 text-ember"
      aria-hidden="true"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path d="M1 4.25a3.733 3.733 0 0 1 2.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0 0 16.75 2H3.25A2.25 2.25 0 0 0 1 4.25ZM1 7.25a3.733 3.733 0 0 1 2.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0 0 16.75 5H3.25A2.25 2.25 0 0 0 1 7.25ZM7 8a1 1 0 0 0-1 1 8.98 8.98 0 0 0 18 0 1 1 0 0 0-1-1H7ZM10 10.5h.01a.75.75 0 0 1 0 1.5H10a.75.75 0 0 1 0-1.5Zm3.75.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
      </svg>
    </span>
  );
}

function AttendanceIcon({ type }: { type: AttendType }) {
  const colorClass =
    type === "ABSENT"
      ? "bg-red-50 text-red-600"
      : type === "EXCUSED"
        ? "bg-amber-50 text-amber-600"
        : "bg-sky-50 text-sky-600";
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClass}`}
      aria-hidden="true"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function DashboardActivityFeed({ data }: { data: ActivityFeedData }) {
  const events = mergeAndSort(
    data.recentEnrollments,
    data.recentPayments,
    data.recentAttendance,
  );

  if (events.length === 0) {
    return (
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">최근 활동</h2>
        <div className="mt-4 rounded-[24px] border border-dashed border-ink/10 px-5 py-8 text-center text-sm text-slate">
          최근 활동 내역이 없습니다.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">최근 활동</h2>
          <p className="mt-1 text-xs text-slate">수강 등록 · 수납 · 출결 최근 기록</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/enrollments"
            className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20"
          >
            수강 목록
          </Link>
          <Link
            href="/admin/payments"
            className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
          >
            수납 목록
          </Link>
        </div>
      </div>

      <ol className="mt-5 space-y-0">
        {events.map((event, idx) => {
          const isLast = idx === events.length - 1;
          return (
            <li key={`${event.kind}-${event.data.id}`} className="relative flex gap-3">
              {/* 타임라인 세로선 */}
              {!isLast && (
                <div className="absolute left-4 top-8 h-full w-px bg-ink/10" aria-hidden="true" />
              )}

              {/* 아이콘 */}
              <div className="relative z-10 pt-1">
                {event.kind === "enrollment" && <EnrollmentIcon />}
                {event.kind === "payment" && <PaymentIcon />}
                {event.kind === "attendance" && (
                  <AttendanceIcon type={event.data.attendType} />
                )}
              </div>

              {/* 내용 */}
              <div className={`flex-1 pb-4 ${isLast ? "" : ""}`}>
                {event.kind === "enrollment" && (
                  <div className="flex flex-wrap items-start justify-between gap-1">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-forest">
                        수강 등록
                      </span>
                      <p className="mt-0.5 text-sm text-ink">
                        <Link
                          href={`/admin/students/${event.data.student.examNumber}`}
                          className="font-semibold hover:text-forest hover:underline"
                        >
                          {event.data.student.name}
                        </Link>
                        <span className="text-slate">
                          {" "}
                          ·{" "}
                          {event.data.cohort?.name ??
                            event.data.specialLecture?.name ??
                            "강좌 미지정"}
                        </span>
                      </p>
                    </div>
                    <time
                      className="shrink-0 text-xs text-slate"
                      dateTime={event.data.createdAt.toISOString()}
                    >
                      {relativeTime(event.data.createdAt)}
                    </time>
                  </div>
                )}

                {event.kind === "payment" && (
                  <div className="flex flex-wrap items-start justify-between gap-1">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-ember">
                        수납
                      </span>
                      <p className="mt-0.5 text-sm text-ink">
                        {event.data.student ? (
                          <Link
                            href={`/admin/students/${event.data.examNumber}`}
                            className="font-semibold hover:text-ember hover:underline"
                          >
                            {event.data.student.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-slate">
                            {event.data.examNumber ?? "익명"}
                          </span>
                        )}
                        <span className="text-slate">
                          {" "}
                          · {event.data.netAmount.toLocaleString()}원 (
                          {METHOD_LABEL[event.data.method]})
                        </span>
                      </p>
                    </div>
                    <time
                      className="shrink-0 text-xs text-slate"
                      dateTime={event.data.createdAt.toISOString()}
                    >
                      {relativeTime(event.data.createdAt)}
                    </time>
                  </div>
                )}

                {event.kind === "attendance" && (
                  <div className="flex flex-wrap items-start justify-between gap-1">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate">
                        출결
                      </span>
                      <p className="mt-0.5 text-sm text-ink">
                        <Link
                          href={`/admin/students/${event.data.student.examNumber}`}
                          className="font-semibold hover:text-ink hover:underline"
                        >
                          {event.data.student.name}
                        </Link>
                        <span className={`ml-1 ${ATTEND_TYPE_COLOR[event.data.attendType]}`}>
                          {ATTEND_TYPE_LABEL[event.data.attendType]}
                        </span>
                      </p>
                    </div>
                    <time
                      className="shrink-0 text-xs text-slate"
                      dateTime={event.data.createdAt.toISOString()}
                    >
                      {relativeTime(event.data.createdAt)}
                    </time>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
