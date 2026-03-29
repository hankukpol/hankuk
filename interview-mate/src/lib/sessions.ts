import type { Track } from "@/lib/constants";

export type ReservationWindowStatus = "before_open" | "open" | "after_close";
export type ApplyWindowStatus = "before_open" | "open" | "after_close";

export type SessionRecord = {
  id: string;
  name: string;
  track: Track;
  status: "active" | "archived";
  reservation_open_at: string | null;
  reservation_close_at: string | null;
  apply_open_at: string | null;
  apply_close_at: string | null;
  interview_date: string | null;
  max_group_size: number;
  min_group_size: number;
  created_at: string;
  archived_at: string | null;
};

export type SessionSummary = {
  id: string;
  name: string;
  track: Track;
  status: "active" | "archived";
  reservationOpenAt: string | null;
  reservationCloseAt: string | null;
  applyOpenAt: string | null;
  applyCloseAt: string | null;
  interviewDate: string | null;
  maxGroupSize: number;
  minGroupSize: number;
  createdAt: string;
  archivedAt: string | null;
  reservationWindowStatus: ReservationWindowStatus;
  applyWindowStatus: ApplyWindowStatus;
};

type ReservationWindowFields = Pick<
  SessionRecord,
  "reservation_open_at" | "reservation_close_at"
>;

type ApplyWindowFields = Pick<SessionRecord, "apply_open_at" | "apply_close_at">;

export function getReservationWindowStatus(
  session: ReservationWindowFields,
  now = new Date(),
): ReservationWindowStatus {
  if (session.reservation_open_at) {
    const openAt = new Date(session.reservation_open_at);

    if (now < openAt) {
      return "before_open";
    }
  }

  if (session.reservation_close_at) {
    const closeAt = new Date(session.reservation_close_at);

    if (now > closeAt) {
      return "after_close";
    }
  }

  return "open";
}

export function getApplyWindowStatus(
  session: ApplyWindowFields,
  now = new Date(),
): ApplyWindowStatus {
  if (session.apply_open_at) {
    const openAt = new Date(session.apply_open_at);

    if (now < openAt) {
      return "before_open";
    }
  }

  if (session.apply_close_at) {
    const closeAt = new Date(session.apply_close_at);

    if (now > closeAt) {
      return "after_close";
    }
  }

  return "open";
}

export function serializeSession(session: SessionRecord): SessionSummary {
  return {
    id: session.id,
    name: session.name,
    track: session.track,
    status: session.status,
    reservationOpenAt: session.reservation_open_at,
    reservationCloseAt: session.reservation_close_at,
    applyOpenAt: session.apply_open_at,
    applyCloseAt: session.apply_close_at,
    interviewDate: session.interview_date,
    maxGroupSize: session.max_group_size,
    minGroupSize: session.min_group_size,
    createdAt: session.created_at,
    archivedAt: session.archived_at,
    reservationWindowStatus: getReservationWindowStatus(session),
    applyWindowStatus: getApplyWindowStatus(session),
  };
}
