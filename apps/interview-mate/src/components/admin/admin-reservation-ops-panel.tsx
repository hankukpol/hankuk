"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarPlus2,
  LoaderCircle,
  Save,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useSessionSelection } from "@/components/admin/use-session-selection";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/ui/section-card";
import {
  formatDateLabel,
  formatTimeLabel,
  type SlotSummary,
} from "@/lib/reservation";
import { normalizePhone } from "@/lib/phone";
import type { SessionSummary } from "@/lib/sessions";

type AdminReservationOpsPanelProps = {
  adminKey: string;
  sessions: SessionSummary[];
  initialSessionId?: string;
  sessionId?: string;
  onSessionIdChange?: (sessionId: string) => void;
  hideSessionField?: boolean;
};

type ReservationStatusFilter = "all" | "확정" | "취소";

type ReservationSummary = {
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

type ReservationListPayload = {
  reservations: ReservationSummary[];
  summary: {
    totalCount: number;
    confirmedCount: number;
    cancelledCount: number;
  };
};

type CancelTarget = {
  id: string;
  name: string;
  phone: string;
  date: string;
  startTime: string;
  endTime: string;
};

type SlotDeleteTarget = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function todayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AdminReservationOpsPanel({
  adminKey,
  sessions,
  initialSessionId,
  sessionId: controlledSessionId,
  onSessionIdChange,
  hideSessionField = false,
}: AdminReservationOpsPanelProps) {
  const { sessionId, setSessionId } = useSessionSelection({
    sessions,
    initialSessionId,
    sessionId: controlledSessionId,
    onSessionIdChange,
  });
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState<ReservationStatusFilter>("all");
  const [reservations, setReservations] = useState<ReservationSummary[]>([]);
  const [summary, setSummary] = useState<ReservationListPayload["summary"]>({
    totalCount: 0,
    confirmedCount: 0,
    cancelledCount: 0,
  });
  const [manualDate, setManualDate] = useState(todayDateKey());
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [slotCapacityDrafts, setSlotCapacityDrafts] = useState<
    Record<string, string>
  >({});
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [slotDeleteTarget, setSlotDeleteTarget] =
    useState<SlotDeleteTarget | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isPending, startTransition] = useTransition();

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json; charset=utf-8",
      "x-admin-key": adminKey,
    }),
    [adminKey],
  );

  const loadReservations = useCallback(
    async (
      nextSessionId: string,
      nextQuery: string,
      nextStatus: ReservationStatusFilter,
    ) => {
      if (!nextSessionId) {
        setReservations([]);
        setSummary({
          totalCount: 0,
          confirmedCount: 0,
          cancelledCount: 0,
        });
        return;
      }

      const params = new URLSearchParams({
        session_id: nextSessionId,
        status: nextStatus,
      });

      if (nextQuery) {
        params.set("query", nextQuery);
      }

      setIsLoadingReservations(true);

      try {
        const payload = await fetch(
          `/api/admin/reservations?${params.toString()}`,
          {
            headers,
          },
        ).then(readJson<ReservationListPayload>);

        setReservations(payload.reservations);
        setSummary(payload.summary);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "예약 목록을 불러오지 못했습니다.",
        );
      } finally {
        setIsLoadingReservations(false);
      }
    },
    [headers],
  );

  const loadSlots = useCallback(async (nextSessionId: string, nextDate: string) => {
    if (!nextSessionId || !nextDate) {
      setSlots([]);
      setSelectedSlotId("");
      return;
    }

    setIsLoadingSlots(true);

    try {
      const payload = await fetch(
        `/api/reservations/slots?session_id=${nextSessionId}&date=${nextDate}`,
      ).then(readJson<{ date: string; slots: SlotSummary[] }>);

      setSlots(payload.slots);
      setSelectedSlotId((current) =>
        payload.slots.some((slot) => slot.id === current)
          ? current
          : payload.slots.find((slot) => slot.isActive && slot.remainingCount > 0)?.id ??
            "",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "예약 시간을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    void loadReservations(sessionId, submittedQuery, status);
  }, [loadReservations, sessionId, status, submittedQuery]);

  useEffect(() => {
    void loadSlots(sessionId, manualDate);
  }, [loadSlots, manualDate, sessionId]);

  useEffect(() => {
    setSlotCapacityDrafts(
      slots.reduce<Record<string, string>>((accumulator, slot) => {
        accumulator[slot.id] = String(slot.capacity);
        return accumulator;
      }, {}),
    );
  }, [slots]);

  const availableSlots = slots.filter((slot) => slot.isActive);

  const handleSearchSubmit = () => {
    setSubmittedQuery(query.trim());
  };

  const refreshReservationState = useCallback(async () => {
    await Promise.all([
      loadReservations(sessionId, submittedQuery, status),
      loadSlots(sessionId, manualDate),
    ]);
  }, [loadReservations, loadSlots, manualDate, sessionId, status, submittedQuery]);

  const handleManualReservation = () => {
    if (!sessionId || !selectedSlotId || !manualName.trim() || !manualPhone.trim()) {
      toast.error("면접 회차, 예약 시간, 이름, 연락처를 모두 입력해 주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch("/api/admin/reservations/manual", {
            method: "POST",
            headers,
            body: JSON.stringify({
              sessionId,
              slotId: selectedSlotId,
              name: manualName,
              phone: normalizePhone(manualPhone),
            }),
          }).then(readJson<{ reservation: ReservationSummary }>);

          setManualName("");
          setManualPhone("");
          await refreshReservationState();
          toast.success("관리자 대리 예약을 등록했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "관리자 대리 예약을 등록하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleCancelReservation = () => {
    if (!cancelTarget) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/admin/reservations/${cancelTarget.id}`, {
            method: "DELETE",
            headers,
            body: JSON.stringify({
              cancelReason,
            }),
          }).then(readJson<{ reservation: ReservationSummary }>);

          setCancelTarget(null);
          setCancelReason("");
          await refreshReservationState();
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

  const handleUpdateSlot = (slot: SlotSummary, updates: { capacity?: number; isActive?: boolean }) => {
    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/admin/reservations/slots/${slot.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updates),
          }).then(readJson<{ slot: SlotSummary }>);

          await refreshReservationState();
          toast.success("예약 시간 설정을 저장했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "예약 시간을 수정하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleDeleteSlot = () => {
    if (!slotDeleteTarget) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/admin/reservations/slots/${slotDeleteTarget.id}`, {
            method: "DELETE",
            headers,
          }).then(readJson<{ deletedId: string }>);

          setSlotDeleteTarget(null);
          await refreshReservationState();
          toast.success("예약 시간을 삭제했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "예약 시간을 삭제하지 못했습니다.",
          );
        }
      })();
    });
  };

  return (
    <>
      <SectionCard
        title="모의면접 수동 예약"
        description="관리자가 대리로 예약을 등록하고, 예약 현황 조회와 시간별 정원·활성 상태를 관리합니다."
      >
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_140px_auto]">
            {!hideSessionField && (
            <select
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">면접 회차 선택</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
            )}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSearchSubmit();
                }
              }}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="이름 또는 연락처 검색"
            />
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ReservationStatusFilter)
              }
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">전체 상태</option>
              <option value="확정">확정</option>
              <option value="취소">취소</option>
            </select>
            <button
              type="button"
              onClick={handleSearchSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              <Search className="h-4 w-4" />
              검색
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
              <p className="text-sm text-slate-500">전체 예약</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {isLoadingReservations ? "불러오는 중" : `${summary.totalCount}건`}
              </p>
            </div>
            <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-sm text-emerald-700">확정 예약</p>
              <p className="mt-2 text-xl font-semibold text-emerald-900">
                {summary.confirmedCount}건
              </p>
            </div>
            <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-4">
              <p className="text-sm text-rose-700">취소 예약</p>
              <p className="mt-2 text-xl font-semibold text-rose-900">
                {summary.cancelledCount}건
              </p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
            <div className="rounded-[10px] border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">관리자 대리 예약</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">
                    예약 시간 선택 후 직접 등록
                  </p>
                </div>
                <Badge tone="brand">booked_by=관리자</Badge>
              </div>

              <div className="mt-5 space-y-3">
                <input
                  type="date"
                  value={manualDate}
                  onChange={(event) => setManualDate(event.target.value)}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <select
                  value={selectedSlotId}
                  onChange={(event) => setSelectedSlotId(event.target.value)}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">예약 시간 선택</option>
                  {availableSlots.map((slot) => (
                    <option
                      key={slot.id}
                      value={slot.id}
                      disabled={slot.remainingCount <= 0}
                    >
                      {formatDateLabel(slot.date)} · {formatTimeLabel(slot.startTime)} ~{" "}
                      {formatTimeLabel(slot.endTime)} · 잔여 {slot.remainingCount}
                    </option>
                  ))}
                </select>
                <input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="학생 이름"
                />
                <input
                  value={manualPhone}
                  onChange={(event) => setManualPhone(event.target.value)}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="010-0000-0000"
                />
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  {isLoadingSlots
                    ? "선택한 날짜의 예약 시간을 불러오는 중입니다."
                    : availableSlots.length > 0
                      ? `${availableSlots.length}개의 예약 시간이 있습니다. 잔여 좌석이 없는 시간은 선택할 수 없습니다.`
                      : "선택한 날짜에는 등록된 예약 시간이 없습니다."}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleManualReservation}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarPlus2 className="h-4 w-4" />
                    )}
                    대리 예약 등록
                  </button>
                </div>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-500">예약 시간 관리</p>
                    <p className="mt-2 text-base font-semibold text-slate-950">
                      날짜별 예약 시간 운영
                    </p>
                  </div>
                  <Badge tone="info">{slots.length}개</Badge>
                </div>

                <div className="mt-4 grid gap-3">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-950">
                              {formatTimeLabel(slot.startTime)} ~{" "}
                              {formatTimeLabel(slot.endTime)}
                            </p>
                            <Badge tone={slot.isActive ? "success" : "neutral"}>
                              {slot.isActive ? "활성" : "비활성"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            확정 {slot.reservedCount}건 · 잔여 {slot.remainingCount}석
                          </p>
                        </div>

                        <div className="grid gap-2 md:grid-cols-[88px_auto_auto]">
                          <input
                            type="number"
                            min={slot.reservedCount}
                            value={slotCapacityDrafts[slot.id] ?? String(slot.capacity)}
                            onChange={(event) =>
                              setSlotCapacityDrafts((current) => ({
                                ...current,
                                [slot.id]: event.target.value,
                              }))
                            }
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateSlot(slot, {
                                capacity: Number(
                                  slotCapacityDrafts[slot.id] ?? slot.capacity,
                                ),
                              })
                            }
                            disabled={isPending}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Save className="h-3.5 w-3.5" />
                            정원 저장
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateSlot(slot, {
                                isActive: !slot.isActive,
                              })
                            }
                            disabled={isPending}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {slot.isActive ? (
                              <ToggleRight className="h-3.5 w-3.5" />
                            ) : (
                              <ToggleLeft className="h-3.5 w-3.5" />
                            )}
                            {slot.isActive ? "비활성화" : "활성화"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setSlotDeleteTarget({
                              id: slot.id,
                              date: slot.date,
                              startTime: slot.startTime,
                              endTime: slot.endTime,
                            })
                          }
                          disabled={isPending || slot.reservedCount > 0}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          예약 시간 삭제
                        </button>
                      </div>
                    </div>
                  ))}

                  {!isLoadingSlots && slots.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                      선택한 날짜에 생성된 예약 시간이 없습니다.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-[10px] border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">예약 목록</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">
                    {sessionId ? "현재 예약 현황" : "면접 회차를 선택해 주세요"}
                  </p>
                </div>
                {submittedQuery ? (
                  <Badge tone="info">검색어 {submittedQuery}</Badge>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3">
                {reservations.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-950">
                            {reservation.name}
                          </p>
                          <Badge
                            tone={reservation.status === "확정" ? "success" : "danger"}
                          >
                            {reservation.status}
                          </Badge>
                          <Badge
                            tone={
                              reservation.bookedBy === "관리자" ? "brand" : "neutral"
                            }
                          >
                            {reservation.bookedBy}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {reservation.phone} · {formatDateLabel(reservation.slot.date)} ·{" "}
                          {formatTimeLabel(reservation.slot.startTime)} ~{" "}
                          {formatTimeLabel(reservation.slot.endTime)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          등록 {formatDateTime(reservation.createdAt)}
                        </p>
                        {reservation.cancelReason ? (
                          <p className="mt-2 text-xs text-rose-600">
                            취소 사유: {reservation.cancelReason}
                          </p>
                        ) : null}
                      </div>
                      {reservation.status === "확정" ? (
                        <button
                          type="button"
                          onClick={() =>
                            setCancelTarget({
                              id: reservation.id,
                              name: reservation.name,
                              phone: reservation.phone,
                              date: reservation.slot.date,
                              startTime: reservation.slot.startTime,
                              endTime: reservation.slot.endTime,
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          예약 취소
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {!isLoadingReservations && reservations.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    아직 예약이 없습니다.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {false && cancelTarget ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[420px] border border-black/5 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">
              예약을 취소하시겠습니까?
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {cancelTarget?.name}({cancelTarget?.phone}) ·{" "}
              {cancelTarget ? formatDateLabel(cancelTarget!.date) : ""} ·{" "}
              {cancelTarget ? formatTimeLabel(cancelTarget!.startTime) : ""} ~{" "}
              {cancelTarget ? formatTimeLabel(cancelTarget!.endTime) : ""}
            </p>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              className="mt-4 min-h-[110px] w-full rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-sm"
              placeholder="취소 사유를 입력해주세요"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason("");
                }}
                disabled={isPending}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCancelReservation}
                disabled={isPending || !cancelReason.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                예약 취소
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="예약을 취소하시겠습니까?"
        description={
          cancelTarget
            ? `${cancelTarget.name}(${cancelTarget.phone}) · ${formatDateLabel(
                cancelTarget.date,
              )} · ${formatTimeLabel(cancelTarget.startTime)} ~ ${formatTimeLabel(
                cancelTarget.endTime,
              )}`
            : ""
        }
        confirmText={isPending ? "취소 처리 중" : "예약 취소"}
        tone="danger"
        isPending={isPending}
        confirmDisabled={!cancelReason.trim()}
        contentClassName="max-w-[420px]"
        onCancel={() => {
          setCancelTarget(null);
          setCancelReason("");
        }}
        onConfirm={handleCancelReservation}
      >
        <textarea
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          className="min-h-[110px] w-full rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-sm"
          placeholder="취소 사유를 입력해 주세요"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(slotDeleteTarget)}
        title="예약 시간을 삭제하시겠습니까?"
        description={
          slotDeleteTarget
            ? `${formatDateLabel(slotDeleteTarget.date)} · ${formatTimeLabel(
                slotDeleteTarget.startTime,
              )} ~ ${formatTimeLabel(slotDeleteTarget.endTime)}`
            : ""
        }
        confirmText="예약 시간 삭제"
        tone="danger"
        isPending={isPending}
        onCancel={() => setSlotDeleteTarget(null)}
        onConfirm={handleDeleteSlot}
      />
    </>
  );
}
