import { ExamType, Subject } from "@prisma/client";
import { formatDate } from "@/lib/format";

export type IntegratedCalendarExamEvent = {
  sessionId: number;
  dateKey: string;
  subject: Subject;
  weekLabel: string;
  isCancelled: boolean;
  isPendingInput: boolean;
  normalCount: number;
  liveCount: number;
  absentCount: number;
  warningCount: number;
  dropoutCount: number;
};

export type IntegratedCalendarCounselingEvent = {
  appointmentId: number;
  dateKey: string;
  timeLabel: string;
  scheduledAtLabel: string;
  counselorName: string;
  agenda: string | null;
  student: {
    examNumber: string;
    name: string;
    examType: ExamType;
  };
};

export type IntegratedCalendarEvent =
  | ({
      type: "exam";
      id: string;
      sortKey: string;
    } & IntegratedCalendarExamEvent)
  | ({
      type: "counseling";
      id: string;
      sortKey: string;
    } & IntegratedCalendarCounselingEvent);

export type IntegratedCalendarDay = {
  dateKey: string;
  dayNumber: number;
  examCount: number;
  counselingCount: number;
  cancelledExamCount: number;
  pendingExamCount: number;
  warningCount: number;
  dropoutCount: number;
  events: IntegratedCalendarEvent[];
};

export type IntegratedCalendarGrid = {
  leadingEmpty: number;
  trailingEmpty: number;
  days: IntegratedCalendarDay[];
};

export type IntegratedCalendarSummary = {
  examCount: number;
  counselingCount: number;
  cancelledExamCount: number;
  overlapDayCount: number;
  activeDayCount: number;
};

function compareEvents(left: IntegratedCalendarEvent, right: IntegratedCalendarEvent) {
  if (left.type !== right.type) {
    return left.type === "exam" ? -1 : 1;
  }

  return left.sortKey.localeCompare(right.sortKey);
}

export function buildIntegratedCalendarGrid(input: {
  year: number;
  month: number;
  examEvents: IntegratedCalendarExamEvent[];
  counselingEvents: IntegratedCalendarCounselingEvent[];
}): IntegratedCalendarGrid {
  const eventMap = new Map<string, IntegratedCalendarEvent[]>();
  const firstDay = new Date(input.year, input.month - 1, 1);
  const daysInMonth = new Date(input.year, input.month, 0).getDate();
  const leadingEmpty = firstDay.getDay();
  const trailingEmpty = (7 - ((leadingEmpty + daysInMonth) % 7 || 7)) % 7;

  for (const event of input.examEvents) {
    const current = eventMap.get(event.dateKey) ?? [];
    current.push({
      ...event,
      type: "exam",
      id: `exam-${event.sessionId}`,
      sortKey: `${event.dateKey}-00:00-${String(event.sessionId).padStart(8, "0")}`,
    });
    eventMap.set(event.dateKey, current);
  }

  for (const event of input.counselingEvents) {
    const current = eventMap.get(event.dateKey) ?? [];
    current.push({
      ...event,
      type: "counseling",
      id: `counseling-${event.appointmentId}`,
      sortKey: `${event.dateKey}-${event.timeLabel}-${String(event.appointmentId).padStart(8, "0")}`,
    });
    eventMap.set(event.dateKey, current);
  }

  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const dayNumber = index + 1;
    const dateKey = formatDate(new Date(input.year, input.month - 1, dayNumber));
    const events = [...(eventMap.get(dateKey) ?? [])].sort(compareEvents);
    const examEvents = events.filter(
      (event): event is Extract<IntegratedCalendarEvent, { type: "exam" }> => event.type === "exam",
    );

    return {
      dateKey,
      dayNumber,
      examCount: examEvents.length,
      counselingCount: events.length - examEvents.length,
      cancelledExamCount: examEvents.filter((event) => event.isCancelled).length,
      pendingExamCount: examEvents.filter((event) => event.isPendingInput).length,
      warningCount: examEvents.reduce((sum, event) => sum + event.warningCount, 0),
      dropoutCount: examEvents.reduce((sum, event) => sum + event.dropoutCount, 0),
      events,
    } satisfies IntegratedCalendarDay;
  });

  return {
    leadingEmpty,
    trailingEmpty,
    days,
  };
}

export function summarizeIntegratedCalendar(days: IntegratedCalendarDay[]): IntegratedCalendarSummary {
  return days.reduce<IntegratedCalendarSummary>(
    (summary, day) => ({
      examCount: summary.examCount + day.examCount,
      counselingCount: summary.counselingCount + day.counselingCount,
      cancelledExamCount: summary.cancelledExamCount + day.cancelledExamCount,
      overlapDayCount: summary.overlapDayCount + (day.examCount > 0 && day.counselingCount > 0 ? 1 : 0),
      activeDayCount: summary.activeDayCount + (day.events.length > 0 ? 1 : 0),
    }),
    {
      examCount: 0,
      counselingCount: 0,
      cancelledExamCount: 0,
      overlapDayCount: 0,
      activeDayCount: 0,
    },
  );
}

export function getDefaultIntegratedCalendarDateKey(input: {
  year: number;
  month: number;
  days: IntegratedCalendarDay[];
  preferredDateKey?: string | null;
}) {
  if (input.preferredDateKey) {
    const preferred = input.days.find((day) => day.dateKey === input.preferredDateKey);
    if (preferred) {
      return preferred.dateKey;
    }
  }

  return input.days.find((day) => day.events.length > 0)?.dateKey ?? formatDate(new Date(input.year, input.month - 1, 1));
}
