"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { TRACKS, type Track } from "@/lib/constants";
import {
  buildCalendarDays,
  formatDateLabel,
  formatMonthTitle,
  formatTimeLabel,
  parseDateKey,
  toMonthKey,
  type DaySummary,
  type SlotSummary,
} from "@/lib/reservation";
import type { SessionSummary } from "@/lib/sessions";

type ReservationFlowProps = {
  track: Track;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "요청을 처리하지 못했습니다.");
  }

  return payload;
}

export function ReservationFlow({ track }: ReservationFlowProps) {
  const trackInfo = TRACKS[track];
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isPending, startTransition] = useTransition();

  const monthKey = useMemo(() => toMonthKey(visibleMonth), [visibleMonth]);
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const daySummaryMap = useMemo(
    () => new Map(daySummaries.map((day) => [day.date, day])),
    [daySummaries],
  );
  const isSessionActive = session?.status === "active";

  useEffect(() => {
    setIsLoadingSession(true);
    void fetch(`/api/sessions/active?track=${track}`)
      .then(readJson<{ session: SessionSummary | null }>)
      .then((payload) => {
        setSession(payload.session);

        if (payload.session?.interviewDate) {
          const interviewDate = parseDateKey(payload.session.interviewDate);
          if (interviewDate) {
            setVisibleMonth(interviewDate);
          }
        }
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "활성 세션을 불러오지 못했습니다.",
        );
      })
      .finally(() => setIsLoadingSession(false));
  }, [track]);

  useEffect(() => {
    if (!session || !isSessionActive) {
      setDaySummaries([]);
      return;
    }

    void fetch(
      `/api/reservations/slots?session_id=${session.id}&month=${monthKey}`,
    )
      .then(readJson<{ month: string; days: DaySummary[] }>)
      .then((payload) => {
        setDaySummaries(payload.days);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "월별 슬롯 정보를 불러오지 못했습니다.",
        );
      });
  }, [isSessionActive, monthKey, session]);

  useEffect(() => {
    if (!session || !isSessionActive) {
      setSlots([]);
      setSelectedSlotId("");
      return;
    }

    const firstAvailableDate = daySummaries[0]?.date ?? "";

    if (
      !selectedDate ||
      (firstAvailableDate &&
        !daySummaries.some((day) => day.date === selectedDate))
    ) {
      setSelectedDate(firstAvailableDate);
      if (!firstAvailableDate) {
        setSlots([]);
        setSelectedSlotId("");
      }
      return;
    }

    setIsLoadingSlots(true);
    void fetch(
      `/api/reservations/slots?session_id=${session.id}&date=${selectedDate}`,
    )
      .then(readJson<{ date: string; slots: SlotSummary[] }>)
      .then((payload) => {
        setSlots(payload.slots);
        setSelectedSlotId((current) =>
          payload.slots.some((slot) => slot.id === current)
            ? current
            : payload.slots.find((slot) => slot.isActive && slot.remainingCount > 0)?.id ??
              "",
        );
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "예약 슬롯을 불러오지 못했습니다.",
        );
      })
      .finally(() => setIsLoadingSlots(false));
  }, [daySummaries, isSessionActive, selectedDate, session]);

  const handleReserve = () => {
    if (!session || !selectedSlotId || !name.trim() || !phone.trim()) {
      toast.error("이름, 연락처, 예약 슬롯을 모두 선택해주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch("/api/reservations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
              sessionId: session.id,
              slotId: selectedSlotId,
              name,
              phone,
            }),
          }).then(readJson<{ reservation: { slot: { startTime: string; date: string } } }>);

          toast.success(
            `${formatDateLabel(payload.reservation.slot.date)} ${formatTimeLabel(payload.reservation.slot.startTime)} 예약이 완료되었습니다.`,
          );

          setName("");
          setPhone("");

          const [{ days }, { slots: nextSlots }] = await Promise.all([
            fetch(
              `/api/reservations/slots?session_id=${session.id}&month=${monthKey}`,
            ).then(readJson<{ month: string; days: DaySummary[] }>),
            fetch(
              `/api/reservations/slots?session_id=${session.id}&date=${selectedDate}`,
            ).then(readJson<{ date: string; slots: SlotSummary[] }>),
          ]);

          setDaySummaries(days);
          setSlots(nextSlots);
          setSelectedSlotId(
            nextSlots.find((slot) => slot.isActive && slot.remainingCount > 0)?.id ??
              "",
          );
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "예약을 생성하지 못했습니다.",
          );
        }
      })();
    });
  };

  const reservationNotice =
    session?.status === "archived"
      ? "이 면접반은 종료되었습니다."
      : session?.reservationWindowStatus === "before_open"
      ? "예약 오픈 전입니다. 오픈 시간 이후에 다시 시도해주세요."
      : session?.reservationWindowStatus === "after_close"
        ? "예약이 마감되었습니다."
        : "현재 예약 가능한 상태입니다.";

  return (
    <>
    <main
      className="student-container space-y-4"
      style={
        {
          "--division-color": trackInfo.color,
          "--division-color-light": trackInfo.lightColor,
          "--division-color-dark": trackInfo.darkColor,
        } as CSSProperties
      }
    >
      <SectionCard
        title={`${trackInfo.label} 모의면접 예약`}
        description="활성 세션과 날짜별 슬롯을 조회한 뒤 바로 예약할 수 있습니다."
        action={
          <Badge tone={session?.reservationWindowStatus === "open" ? "brand" : "warning"}>
            {session?.reservationWindowStatus === "open" ? "예약 가능" : "예약 안내"}
          </Badge>
        }
      >
        <div className="rounded-[10px] border border-[var(--division-color-light)] bg-[var(--division-color-muted)] p-4">
          <p className="text-sm font-semibold text-[var(--division-color-dark)]">
            {session
              ? session.status === "archived"
                ? "이 면접반은 종료되었습니다."
                : session.name
              : `${trackInfo.label} 활성 세션 확인 중`}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {isLoadingSession
              ? "운영 중인 면접반 정보를 불러오고 있습니다."
              : reservationNotice}
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="날짜 선택"
        description="월별 슬롯 요약을 기준으로 예약 가능한 날짜를 표시합니다."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="rounded-[10px] border border-slate-200 bg-white p-2 text-slate-600"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CalendarDays className="h-4 w-4 text-[var(--division-color)]" />
              {formatMonthTitle(visibleMonth)}
            </div>
            <button
              type="button"
              className="rounded-[10px] border border-slate-200 bg-white p-2 text-slate-600"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-500">
            {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const summary = daySummaryMap.get(day.key);
              const isSelected = day.key === selectedDate;
              const isDisabled = !day.inMonth || !summary;

              return (
                <button
                  key={day.key}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => setSelectedDate(day.key)}
                  className={`flex min-h-[52px] flex-col items-center justify-center rounded-[10px] border px-1 text-sm font-medium ${
                    isSelected
                      ? "border-[var(--division-color)] bg-[var(--division-color)] text-white"
                      : isDisabled
                        ? "border-slate-200 bg-slate-100 text-[#999]"
                        : day.isToday
                          ? "border-[var(--division-color)] bg-white text-[var(--division-color)]"
                          : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <span>{day.label}</span>
                  <span
                    className={`mt-1 text-[11px] ${
                      isSelected ? "text-white/80" : "text-slate-400"
                    }`}
                  >
                    {summary ? `${summary.availableSlots}개` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="시간 선택"
        description={
          selectedDate
            ? `${formatDateLabel(selectedDate)}의 예약 가능한 시간을 표시합니다.`
            : "날짜를 선택하면 시간 슬롯이 표시됩니다."
        }
      >
        {isLoadingSlots ? (
          <div className="flex items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            시간 슬롯을 불러오는 중입니다.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {slots.length > 0 ? (
              slots.map((slot) => {
                const isAvailable = slot.isActive && slot.remainingCount > 0;
                const isSelected = selectedSlotId === slot.id;

                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => setSelectedSlotId(slot.id)}
                    className={`rounded-[10px] border px-4 py-4 text-left ${
                      isSelected
                        ? "border-[var(--division-color)] bg-[var(--division-color-light)]"
                        : isAvailable
                          ? "border-slate-200 bg-white"
                          : "border-slate-200 bg-slate-100 text-[#999]"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Clock3 className="h-4 w-4" />
                      {formatTimeLabel(slot.startTime)}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {isAvailable ? `${slot.remainingCount}명 남음` : "마감"}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="col-span-2 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                이 날짜에는 예약 가능한 시간이 없습니다.
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="예약 정보"
        description="이름과 연락처를 입력하면 선택한 시간으로 예약합니다."
      >
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-[var(--division-color)] focus:outline-none focus:ring-1 focus:ring-[var(--division-color)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">연락처</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-[var(--division-color)] focus:outline-none focus:ring-1 focus:ring-[var(--division-color)]"
              placeholder="010-1234-5678"
            />
          </label>
          <button
            type="button"
            disabled={
              isPending ||
              session?.reservationWindowStatus !== "open" ||
              !selectedSlotId ||
              !name.trim() ||
              !phone.trim()
            }
            onClick={handleReserve}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <UserRound className="h-4 w-4" />
            )}
            예약하기
          </button>
        </div>
      </SectionCard>
    </main>
    <StudentBottomNav />
    </>
  );
}
