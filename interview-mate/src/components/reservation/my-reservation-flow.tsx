"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  PencilLine,
  ReceiptText,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
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

type MyReservationFlowProps = {
  track: Track;
};

type ReservationDetail = {
  id: string;
  sessionId: string;
  name: string;
  phone: string;
  status: "확정" | "취소";
  cancelReason: string | null;
  bookedBy: "학생" | "관리자";
  createdAt: string;
  slot: SlotSummary;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
}

export function MyReservationFlow({ track }: MyReservationFlowProps) {
  const trackInfo = TRACKS[track];
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [phone, setPhone] = useState("");
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changeConfirmOpen, setChangeConfirmOpen] = useState(false);
  const [isChangeMode, setIsChangeMode] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [slots, setSlots] = useState<SlotSummary[]>([]);

  const monthKey = useMemo(() => toMonthKey(visibleMonth), [visibleMonth]);
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const daySummaryMap = useMemo(
    () => new Map(daySummaries.map((day) => [day.date, day])),
    [daySummaries],
  );
  const isSessionActive = session?.status === "active";

  const isReservationChangeable =
    session?.status === "active" && session?.reservationWindowStatus === "open";
  const changeNotice =
    session?.status === "archived"
      ? "이 면접반은 종료되었습니다."
      : session?.reservationWindowStatus === "before_open"
      ? "예약 오픈 전에는 예약 변경이 불가능합니다."
      : session?.reservationWindowStatus === "after_close"
        ? "예약 마감 후에는 예약 변경이 불가능합니다."
        : "다른 날짜와 시간으로 예약을 변경할 수 있습니다.";
  const canSubmitChange =
    Boolean(reservation) &&
    Boolean(selectedSlotId) &&
    selectedSlotId !== reservation?.slot.id &&
    isReservationChangeable;

  useEffect(() => {
    setIsLoadingSession(true);
    void fetch(`/api/sessions/active?track=${track}`)
      .then(readJson<{ session: SessionSummary | null }>)
      .then((payload) => setSession(payload.session))
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
    if (!session || !isSessionActive || !reservation || !isChangeMode) {
      setDaySummaries([]);
      setSlots([]);
      setSelectedSlotId("");
      setIsLoadingSlots(false);
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
        setDaySummaries([]);
        toast.error(
          error instanceof Error
            ? error.message
            : "월별 슬롯 정보를 불러오지 못했습니다.",
        );
      });
  }, [isChangeMode, isSessionActive, monthKey, reservation, session]);

  useEffect(() => {
    if (!session || !reservation || !isChangeMode) {
      setSlots([]);
      return;
    }

    const reservationDate = reservation.slot.date;
    const firstAvailableDate =
      daySummaries.find((day) => day.availableSlots > 0)?.date ??
      daySummaries[0]?.date ??
      "";
    const nextDate =
      selectedDate && daySummaries.some((day) => day.date === selectedDate)
        ? selectedDate
        : daySummaries.some((day) => day.date === reservationDate)
          ? reservationDate
          : firstAvailableDate;

    if (nextDate !== selectedDate) {
      setSelectedDate(nextDate);

      if (!nextDate) {
        setSlots([]);
        setSelectedSlotId("");
      }

      return;
    }

    if (!nextDate) {
      setSlots([]);
      setSelectedSlotId("");
      return;
    }

    setIsLoadingSlots(true);
    void fetch(
      `/api/reservations/slots?session_id=${session.id}&date=${nextDate}`,
    )
      .then(readJson<{ date: string; slots: SlotSummary[] }>)
      .then((payload) => {
        setSlots(payload.slots);
        setSelectedSlotId((current) => {
          if (payload.slots.some((slot) => slot.id === current)) {
            return current;
          }

          return (
            payload.slots.find((slot) => slot.id === reservation.slot.id)?.id ??
            payload.slots.find(
              (slot) => slot.isActive && slot.remainingCount > 0,
            )?.id ??
            ""
          );
        });
      })
      .catch((error) => {
        setSlots([]);
        setSelectedSlotId("");
        toast.error(
          error instanceof Error
            ? error.message
            : "예약 슬롯을 불러오지 못했습니다.",
        );
      })
      .finally(() => setIsLoadingSlots(false));
  }, [daySummaries, isChangeMode, isSessionActive, reservation, selectedDate, session]);

  const handleSearch = async () => {
    if (!session) {
      toast.error("활성 세션이 없습니다.");
      return;
    }

    if (!isSessionActive) {
      toast.error("이 면접반은 종료되었습니다.");
      return;
    }

    if (!phone.trim()) {
      toast.error("연락처를 입력해주세요.");
      return;
    }

    setIsSearching(true);

    try {
      const payload = await fetch(
        `/api/reservations?session_id=${session.id}&phone=${encodeURIComponent(phone)}`,
      ).then(readJson<{ reservation: ReservationDetail | null }>);

      setReservation(payload.reservation);
      setIsChangeMode(false);
      setChangeConfirmOpen(false);
      setDaySummaries([]);
      setSlots([]);

      if (payload.reservation) {
        const reservationDate = parseDateKey(payload.reservation.slot.date);
        if (reservationDate) {
          setVisibleMonth(reservationDate);
        }
        setSelectedDate(payload.reservation.slot.date);
        setSelectedSlotId(payload.reservation.slot.id);
      } else {
        setSelectedDate("");
        setSelectedSlotId("");
        toast("예약 내역이 없습니다.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "예약 조회에 실패했습니다.",
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleOpenChangeMode = () => {
    if (!reservation) {
      return;
    }

    const reservationDate = parseDateKey(reservation.slot.date);
    if (reservationDate) {
      setVisibleMonth(reservationDate);
    }
    setSelectedDate(reservation.slot.date);
    setSelectedSlotId(reservation.slot.id);
    setIsChangeMode(true);
  };

  const handleCancel = () => {
    if (!reservation) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch("/api/reservations", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
              id: reservation.id,
              cancelReason: "학생 본인 취소",
            }),
          }).then(readJson<{ reservation: ReservationDetail }>);

          setReservation(null);
          setConfirmOpen(false);
          setChangeConfirmOpen(false);
          setIsChangeMode(false);
          setDaySummaries([]);
          setSlots([]);
          setSelectedDate("");
          setSelectedSlotId("");
          toast.success("예약을 취소했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "예약을 취소하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleChangeReservation = () => {
    if (!reservation || !selectedSlotId || selectedSlotId === reservation.slot.id) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch("/api/reservations", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
              reservationId: reservation.id,
              newSlotId: selectedSlotId,
            }),
          }).then(readJson<{ reservation: ReservationDetail }>);

          setReservation(payload.reservation);
          setChangeConfirmOpen(false);
          setIsChangeMode(false);
          setDaySummaries([]);
          setSlots([]);
          const reservationDate = parseDateKey(payload.reservation.slot.date);
          if (reservationDate) {
            setVisibleMonth(reservationDate);
          }
          setSelectedDate(payload.reservation.slot.date);
          setSelectedSlotId(payload.reservation.slot.id);
          toast.success(
            `${formatDateLabel(payload.reservation.slot.date)} ${formatTimeLabel(payload.reservation.slot.startTime)}로 예약을 변경했습니다.`,
          );
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "예약을 변경하지 못했습니다.",
          );
        }
      })();
    });
  };

  return (
    <main
      className="student-container space-y-5"
      style={
        {
          "--division-color": trackInfo.color,
          "--division-color-light": trackInfo.lightColor,
          "--division-color-dark": trackInfo.darkColor,
        } as CSSProperties
      }
    >
      <SectionCard
        title="내 예약 조회"
        description="연락처를 입력해 현재 확정된 예약을 조회합니다."
        action={<Badge tone="info">{trackInfo.label} 회차</Badge>}
      >
        <div className="rounded-[10px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {isLoadingSession
            ? "활성 세션을 확인하고 있습니다."
            : session
              ? session.status === "archived"
                ? "이 면접반은 종료되었습니다."
                : `${session.name} 기준으로 조회합니다.`
              : "운영 중인 세션이 없습니다."}
        </div>
      </SectionCard>

      <SectionCard
        title="연락처 확인"
        description="등록한 연락처를 입력하면 예약 내역을 불러옵니다."
      >
        <div className="space-y-3">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="010-1234-5678"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={isSearching || !isSessionActive}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSearching ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            예약 조회하기
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="조회 결과"
        description="조회된 예약은 변경 또는 취소까지 바로 진행할 수 있습니다."
      >
        {reservation ? (
          <div className="space-y-4 rounded-[10px] border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {reservation.name}
                </p>
                <p className="text-xs text-slate-500">{reservation.phone}</p>
              </div>
              <Badge tone="success">{reservation.status}</Badge>
            </div>
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">
                {formatDate(reservation.slot.date)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {formatTimeLabel(reservation.slot.startTime)} ~{" "}
                {formatTimeLabel(reservation.slot.endTime)}
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  isChangeMode ? setIsChangeMode(false) : handleOpenChangeMode()
                }
                disabled={!isReservationChangeable}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--division-color)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--division-color)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                <PencilLine className="h-4 w-4" />
                {isChangeMode ? "변경 패널 닫기" : "예약 변경하기"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white"
              >
                <Trash2 className="h-4 w-4" />
                예약 취소
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-white text-slate-400 shadow-card">
              <ReceiptText className="h-6 w-6" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                예약 내역이 없습니다.
              </p>
              <p className="text-sm text-slate-500">
                연락처를 입력해 조회하거나, 아직 예약하지 않았다면 예약 페이지에서
                먼저 진행해주세요.
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      {reservation && isChangeMode ? (
        <SectionCard
          title="예약 변경"
          description="다른 날짜와 시간 슬롯을 선택한 뒤 예약을 옮깁니다."
        >
          <div className="space-y-5">
            <div className="rounded-[10px] border border-[var(--division-color-light)] bg-[var(--division-color-light)] px-4 py-4">
              <p className="text-sm font-semibold text-[var(--division-color-dark)]">
                현재 예약
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {formatDate(reservation.slot.date)}{" "}
                {formatTimeLabel(reservation.slot.startTime)} ~{" "}
                {formatTimeLabel(reservation.slot.endTime)}
              </p>
              <p className="mt-2 text-xs text-slate-600">{changeNotice}</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="rounded-[10px] border border-slate-200 bg-white p-2 text-slate-600"
                  onClick={() =>
                    setVisibleMonth(
                      (current) =>
                        new Date(current.getFullYear(), current.getMonth() - 1, 1),
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
                      (current) =>
                        new Date(current.getFullYear(), current.getMonth() + 1, 1),
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

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Clock3 className="h-4 w-4 text-[var(--division-color)]" />
                {selectedDate
                  ? `${formatDateLabel(selectedDate)} 시간 선택`
                  : "날짜를 먼저 선택해주세요."}
              </div>

              {isLoadingSlots ? (
                <div className="flex items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  변경 가능한 슬롯을 불러오는 중입니다.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {slots.length > 0 ? (
                    slots.map((slot) => {
                      const isCurrent = slot.id === reservation.slot.id;
                      const isAvailable =
                        slot.id === reservation.slot.id ||
                        (slot.isActive && slot.remainingCount > 0);
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
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <Clock3 className="h-4 w-4" />
                              {formatTimeLabel(slot.startTime)}
                            </div>
                            {isCurrent ? (
                              <Badge tone="brand">현재 예약</Badge>
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {isCurrent
                              ? "현재 예약된 시간입니다."
                              : isAvailable
                                ? `${slot.remainingCount}명 남음`
                                : "마감"}
                          </p>
                        </button>
                      );
                    })
                  ) : (
                    <div className="col-span-2 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                      이 날짜에는 변경 가능한 시간이 없습니다.
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!canSubmitChange || isPending}
              onClick={() => setChangeConfirmOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <PencilLine className="h-4 w-4" />
              )}
              선택한 시간으로 변경
            </button>
          </div>
        </SectionCard>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="예약을 취소하시겠습니까?"
        description={
          reservation
            ? `${formatDate(reservation.slot.date)} ${formatTimeLabel(reservation.slot.startTime)} 예약이 취소됩니다.`
            : ""
        }
        confirmText="예약 취소"
        tone="danger"
        isPending={isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleCancel}
      />

      <ConfirmDialog
        open={changeConfirmOpen}
        title="선택한 시간으로 예약을 변경하시겠습니까?"
        description={
          reservation && selectedDate && selectedSlotId
            ? `${formatDateLabel(selectedDate)} ${formatTimeLabel(
                slots.find((slot) => slot.id === selectedSlotId)?.startTime ??
                  reservation.slot.startTime,
              )}로 이동합니다.`
            : ""
        }
        confirmText="예약 변경"
        isPending={isPending}
        onCancel={() => setChangeConfirmOpen(false)}
        onConfirm={handleChangeReservation}
      />
    </main>
  );
}
