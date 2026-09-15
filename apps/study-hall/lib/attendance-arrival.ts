import { normalizeYmdDate } from "./date-utils";
/** Explicit arrival only. A delayed/bulk save is not evidence of a student's arrival. */
export function classifyAttendanceArrival(input: { date: string; arrivalTime: string; periodStartTime: string; periodEndTime: string; tardyMinutes: number; lateArrivalPolicy: "after_start" | "threshold" }, now = new Date()) {
  normalizeYmdDate(input.date);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (![input.arrivalTime,input.periodStartTime,input.periodEndTime].every(t=>time.test(t))) throw new Error("도착 시각과 교시 시각을 확인해 주세요.");
  if (!Number.isInteger(input.tardyMinutes) || input.tardyMinutes < 0 || input.tardyMinutes > 180) throw new Error("학원의 지각 분 기준을 확인해 주세요.");
  const arrived = new Date(input.date + "T" + input.arrivalTime + ":00+09:00");
  if (arrived.getTime() > now.getTime()) throw new Error("미래 도착 시각은 기록할 수 없습니다.");
  if (input.arrivalTime > input.periodEndTime) throw new Error("해당 교시의 종료 시각 이전으로 입력해 주세요.");
  const start = new Date(input.date + "T" + input.periodStartTime + ":00+09:00");
  const lateMinutes = (arrived.getTime() - start.getTime()) / 60000;
  const tardy = input.lateArrivalPolicy === "after_start" || input.tardyMinutes === 0 ? lateMinutes > 0 : lateMinutes >= input.tardyMinutes;
  return { status: tardy ? "TARDY" as const : "PRESENT" as const, checkInTime: arrived };
}
