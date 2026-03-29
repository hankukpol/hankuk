"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

export type CalendarAppointment = {
  id: number;
  examNumber: string;
  scheduledAt: string;
  counselorName: string;
  agenda: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  cancelReason: string | null;
  studentName: string;
  studentPhone: string | null;
};

type ViewMode = "week" | "month";

const STATUS_COLORS: Record<string, { card: string; badge: string; label: string }> = {
  SCHEDULED: {
    card: "border-[#1F4D3A]/30 bg-[#1F4D3A]/10",
    badge: "border-[#1F4D3A]/20 bg-[#1F4D3A]/10 text-[#1F4D3A]",
    label: "예약됨",
  },
  COMPLETED: {
    card: "border-slate/20 bg-slate/5",
    badge: "border-slate/20 bg-slate/10 text-slate",
    label: "완료",
  },
  CANCELLED: {
    card: "border-red-200 bg-red-50",
    badge: "border-red-200 bg-red-50 text-red-600",
    label: "취소",
  },
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08~21

function getWeekDates(anchor: Date): Date[] {
  const day = anchor.getDay();
  const mon = new Date(anchor);
  mon.setDate(anchor.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CreateFormState {
  visible: boolean;
  date: Date | null;
  hour: number;
  examNumber: string;
  counselorName: string;
  agenda: string;
}

interface DetailState {
  visible: boolean;
  appointment: CalendarAppointment | null;
}

interface Props {
  initialAppointments: CalendarAppointment[];
  defaultCounselorName: string;
}

export function AppointmentCalendar({ initialAppointments, defaultCounselorName }: Props) {
  const [appointments, setAppointments] = useState<CalendarAppointment[]>(initialAppointments);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [createForm, setCreateForm] = useState<CreateFormState>({
    visible: false,
    date: null,
    hour: 10,
    examNumber: "",
    counselorName: defaultCounselorName,
    agenda: "",
  });
  const [detail, setDetail] = useState<DetailState>({ visible: false, appointment: null });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  const weekDates = useMemo(() => getWeekDates(anchor), [anchor]);

  // Group appointments by date-key then by hour
  const grouped = useMemo(() => {
    const map: Record<string, Record<number, CalendarAppointment[]>> = {};
    for (const appt of appointments) {
      const d = new Date(appt.scheduledAt);
      const key = dateKey(d);
      const hour = d.getHours();
      if (!map[key]) map[key] = {};
      if (!map[key][hour]) map[key][hour] = [];
      map[key][hour].push(appt);
    }
    return map;
  }, [appointments]);

  // Month view: get all dates in the month
  const monthDates = useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [anchor]);

  const goToToday = () => setAnchor(new Date());
  const prevPeriod = () => {
    const d = new Date(anchor);
    if (viewMode === "week") d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setAnchor(d);
  };
  const nextPeriod = () => {
    const d = new Date(anchor);
    if (viewMode === "week") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setAnchor(d);
  };

  const periodLabel = useMemo(() => {
    if (viewMode === "week") {
      const from = weekDates[0];
      const to = weekDates[6];
      return `${from.getFullYear()}년 ${from.getMonth() + 1}월 ${from.getDate()}일 — ${to.getMonth() + 1}월 ${to.getDate()}일`;
    }
    return `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월`;
  }, [viewMode, anchor, weekDates]);

  const openCreate = (date: Date, hour: number) => {
    setCreateForm({
      visible: true,
      date,
      hour,
      examNumber: "",
      counselorName: defaultCounselorName,
      agenda: "",
    });
    setCreateError("");
    setDetail({ visible: false, appointment: null });
  };

  const openDetail = (appt: CalendarAppointment) => {
    setDetail({ visible: true, appointment: appt });
    setCreateForm((prev) => ({ ...prev, visible: false }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.date) return;
    setCreateError("");
    setCreateLoading(true);

    try {
      const scheduledAt = new Date(createForm.date);
      scheduledAt.setHours(createForm.hour, 0, 0, 0);

      const res = await fetch("/api/counseling/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examNumber: createForm.examNumber.trim(),
          scheduledAt: scheduledAt.toISOString(),
          counselorName: createForm.counselorName.trim(),
          agenda: createForm.agenda.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error ?? "예약 생성 실패");
        return;
      }
      const created = json.record ?? json.data ?? json.appointment;
      if (created) {
        setAppointments((prev) => [
          ...prev,
          {
            id: created.id,
            examNumber: created.examNumber,
            scheduledAt: typeof created.scheduledAt === "string"
              ? created.scheduledAt
              : new Date(created.scheduledAt).toISOString(),
            counselorName: created.counselorName,
            agenda: created.agenda ?? null,
            status: created.status ?? "SCHEDULED",
            cancelReason: null,
            studentName: created.student?.name ?? created.examNumber,
            studentPhone: created.student?.phone ?? null,
          },
        ]);
      }
      setCreateForm((prev) => ({ ...prev, visible: false }));
    } catch {
      setCreateError("네트워크 오류가 발생했습니다.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    const action = newStatus === "COMPLETED" ? "complete" : "cancel";
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/counseling/appointments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: newStatus as CalendarAppointment["status"] } : a,
          ),
        );
        setDetail((prev) =>
          prev.appointment?.id === id
            ? {
                ...prev,
                appointment: { ...prev.appointment, status: newStatus as CalendarAppointment["status"] },
              }
            : prev,
        );
      }
    } catch {
      // ignore
    } finally {
      setStatusLoading(false);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm("이 예약을 취소하시겠습니까?")) return;
    await handleStatusChange(id, "CANCELLED");
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={prevPeriod}
            className="rounded-full border border-ink/10 bg-white p-2 transition hover:bg-[#F7F4EF]"
            aria-label="이전"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="min-w-[220px] text-center text-sm font-semibold text-ink">
            {periodLabel}
          </span>
          <button
            onClick={nextPeriod}
            className="rounded-full border border-ink/10 bg-white p-2 transition hover:bg-[#F7F4EF]"
            aria-label="다음"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            onClick={goToToday}
            className="ml-2 inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-[#F7F4EF]"
          >
            오늘
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex overflow-hidden rounded-full border border-ink/10 bg-white">
            {(["week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-1.5 text-sm font-semibold transition ${
                  viewMode === mode
                    ? "bg-[#1F4D3A] text-white"
                    : "text-ink hover:bg-[#F7F4EF]"
                }`}
              >
                {mode === "week" ? "주간" : "월간"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <span key={status} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${colors.badge}`}>
            <span className={`h-2 w-2 rounded-full ${status === "SCHEDULED" ? "bg-[#1F4D3A]" : status === "COMPLETED" ? "bg-slate" : "bg-red-500"}`} />
            {colors.label}
          </span>
        ))}
      </div>

      {/* Week View */}
      {viewMode === "week" && (
        <div className="mt-5 overflow-hidden rounded-[24px] border border-ink/10 bg-white">
          {/* Day header */}
          <div className="grid border-b border-ink/10" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
            <div className="border-r border-ink/10 bg-[#F7F4EF] px-2 py-3" />
            {weekDates.map((d) => {
              const today = isSameDay(d, new Date());
              return (
                <div
                  key={d.toISOString()}
                  className={`border-r border-ink/10 px-2 py-3 text-center last:border-r-0 ${
                    today ? "bg-[#1F4D3A]/10" : "bg-[#F7F4EF]"
                  }`}
                >
                  <p className={`text-xs font-semibold ${d.getDay() === 0 ? "text-red-500" : d.getDay() === 6 ? "text-blue-500" : "text-slate"}`}>
                    {WEEKDAYS[d.getDay()]}
                  </p>
                  <p className={`text-sm font-bold ${today ? "text-[#1F4D3A]" : "text-ink"}`}>
                    {d.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Time slots */}
          <div className="divide-y divide-ink/10">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="grid"
                style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
              >
                {/* Time label */}
                <div className="flex items-start justify-end border-r border-ink/10 px-2 py-1.5">
                  <span className="text-[10px] font-medium text-slate">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                </div>
                {/* Day cells */}
                {weekDates.map((d) => {
                  const key = dateKey(d);
                  const slotAppts = grouped[key]?.[hour] ?? [];
                  return (
                    <div
                      key={d.toISOString()}
                      className="min-h-[52px] cursor-pointer border-r border-ink/10 p-1 last:border-r-0 hover:bg-[#F7F4EF]/60 transition"
                      onClick={() => {
                        if (slotAppts.length === 0) openCreate(d, hour);
                      }}
                    >
                      {slotAppts.map((appt) => {
                        const colors = STATUS_COLORS[appt.status];
                        return (
                          <div
                            key={appt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(appt);
                            }}
                            className={`mb-1 cursor-pointer rounded-xl border px-2 py-1 text-[11px] transition hover:opacity-80 ${colors.card}`}
                          >
                            <p className="truncate font-semibold">{appt.studentName}</p>
                            <p className="truncate text-[10px] opacity-70">
                              {String(new Date(appt.scheduledAt).getHours()).padStart(2, "0")}:{String(new Date(appt.scheduledAt).getMinutes()).padStart(2, "0")}
                              {appt.counselorName ? ` · ${appt.counselorName}` : ""}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Month View */}
      {viewMode === "month" && (
        <div className="mt-5 overflow-hidden rounded-[24px] border border-ink/10 bg-white">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-ink/10 bg-[#F7F4EF]">
            {WEEKDAYS.map((day, i) => (
              <div key={day} className="py-3 text-center text-xs font-semibold">
                <span className={i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate"}>
                  {day}
                </span>
              </div>
            ))}
          </div>
          {/* Weeks */}
          <div className="grid grid-cols-7 divide-x divide-y divide-ink/10">
            {monthDates.map((d, idx) => {
              if (!d) return <div key={`empty-${idx}`} className="min-h-[80px] bg-[#F7F4EF]/40" />;
              const today = isSameDay(d, new Date());
              const key = dateKey(d);
              const dayAppts = Object.values(grouped[key] ?? {}).flat();
              return (
                <div
                  key={d.toISOString()}
                  className={`min-h-[80px] cursor-pointer p-2 transition hover:bg-[#F7F4EF]/60 ${today ? "bg-[#1F4D3A]/5" : ""}`}
                  onClick={() => openCreate(d, 10)}
                >
                  <p className={`mb-1 text-xs font-bold ${today ? "text-[#1F4D3A]" : "text-ink"} ${d.getDay() === 0 ? "text-red-500" : d.getDay() === 6 ? "text-blue-500" : ""}`}>
                    {d.getDate()}
                  </p>
                  {dayAppts.slice(0, 3).map((appt) => {
                    const colors = STATUS_COLORS[appt.status];
                    return (
                      <div
                        key={appt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(appt);
                        }}
                        className={`mb-0.5 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${colors.card}`}
                      >
                        {appt.studentName}
                      </div>
                    );
                  })}
                  {dayAppts.length > 3 && (
                    <p className="text-[10px] text-slate">+{dayAppts.length - 3}건</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Form Panel */}
      {createForm.visible && (
        <div className="mt-4 rounded-[24px] border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 p-5">
          <h3 className="text-base font-semibold text-[#1F4D3A]">
            새 면담 예약{" "}
            {createForm.date
              ? `— ${createForm.date.getMonth() + 1}/${createForm.date.getDate()} ${String(createForm.hour).padStart(2, "0")}:00`
              : ""}
          </h3>
          <form onSubmit={handleCreateSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">학번</label>
              <input
                type="text"
                value={createForm.examNumber}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, examNumber: e.target.value }))}
                placeholder="예: 2024-001"
                required
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-[#1F4D3A] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">시간</label>
              <select
                value={createForm.hour}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, hour: parseInt(e.target.value, 10) }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-[#1F4D3A] focus:outline-none"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">상담사</label>
              <input
                type="text"
                value={createForm.counselorName}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, counselorName: e.target.value }))}
                placeholder="담당 상담사"
                required
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-[#1F4D3A] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">안건 (선택)</label>
              <input
                type="text"
                value={createForm.agenda}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, agenda: e.target.value }))}
                placeholder="예: 성적 상담, 출결 확인"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-[#1F4D3A] focus:outline-none"
              />
            </div>

            {createError && (
              <p className="col-span-full rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-600">
                {createError}
              </p>
            )}

            <div className="col-span-full flex gap-3">
              <button
                type="submit"
                disabled={createLoading}
                className="inline-flex items-center gap-2 rounded-full bg-[#1F4D3A] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#163929] disabled:opacity-50"
              >
                {createLoading ? "처리 중..." : "예약 생성"}
              </button>
              <button
                type="button"
                onClick={() => setCreateForm((prev) => ({ ...prev, visible: false }))}
                className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Detail Panel */}
      {detail.visible && detail.appointment && (
        <div className="mt-4 rounded-[24px] border border-ink/10 bg-white p-5">
          {(() => {
            const appt = detail.appointment;
            const d = new Date(appt.scheduledAt);
            const colors = STATUS_COLORS[appt.status];
            return (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{appt.studentName}</h3>
                    <p className="mt-1 text-sm text-slate">
                      {d.getFullYear()}.{d.getMonth() + 1}.{d.getDate()} ({WEEKDAYS[d.getDay()]}) {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors.badge}`}>
                    {colors.label}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate">학번</p>
                    <Link href={`/admin/students/${appt.examNumber}`} className="font-semibold text-[#C55A11] hover:underline">
                      {appt.examNumber}
                    </Link>
                  </div>
                  <div>
                    <p className="text-xs text-slate">상담사</p>
                    <p className="font-medium">{appt.counselorName}</p>
                  </div>
                  {appt.studentPhone && (
                    <div>
                      <p className="text-xs text-slate">연락처</p>
                      <p className="font-medium">{appt.studentPhone}</p>
                    </div>
                  )}
                  {appt.agenda && (
                    <div>
                      <p className="text-xs text-slate">안건</p>
                      <p className="font-medium">{appt.agenda}</p>
                    </div>
                  )}
                </div>

                {appt.status === "SCHEDULED" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleStatusChange(appt.id, "COMPLETED")}
                      disabled={statusLoading}
                      className="inline-flex items-center rounded-full bg-[#1F4D3A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163929] disabled:opacity-50"
                    >
                      완료 처리
                    </button>
                    <button
                      onClick={() => handleCancel(appt.id)}
                      disabled={statusLoading}
                      className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      취소
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setDetail({ visible: false, appointment: null })}
                  className="mt-3 text-xs text-slate hover:text-ink"
                >
                  닫기
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
