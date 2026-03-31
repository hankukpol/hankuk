"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  CalendarPlus,
  LoaderCircle,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { AdminReservationOpsPanel } from "@/components/admin/admin-reservation-ops-panel";
import { AdminSessionEditorPanel } from "@/components/admin/admin-session-editor-panel";
import { AdminStepScreen } from "@/components/admin/admin-step-screen";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/ui/section-card";
import { TRACKS, type Track } from "@/lib/constants";
import type { SessionSummary } from "@/lib/sessions";

type SessionFormState = {
  name: string;
  track: Track;
  reservationOpenAt: string;
  reservationCloseAt: string;
  applyOpenAt: string;
  applyCloseAt: string;
  interviewDate: string;
  maxGroupSize: number;
  minGroupSize: number;
};

type SlotFormState = {
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  capacity: number;
};

const weekdayOptions = [
  { label: "일", value: 0 },
  { label: "월", value: 1 },
  { label: "화", value: 2 },
  { label: "수", value: 3 },
  { label: "목", value: 4 },
  { label: "금", value: 5 },
  { label: "토", value: 6 },
];

const defaultSessionForm: SessionFormState = {
  name: "",
  track: "police",
  reservationOpenAt: "",
  reservationCloseAt: "",
  applyOpenAt: "",
  applyCloseAt: "",
  interviewDate: "",
  maxGroupSize: 10,
  minGroupSize: 6,
};

const defaultSlotForm: SlotFormState = {
  startDate: "",
  endDate: "",
  weekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
  intervalMinutes: 60,
  capacity: 20,
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

function formatDateTime(value: string | null) {
  if (!value) {
    return "미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return "미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function AdminSessionsScreen() {
  const [sessionForm, setSessionForm] =
    useState<SessionFormState>(defaultSessionForm);
  const [slotForm, setSlotForm] = useState<SlotFormState>(defaultSlotForm);
  const [academyInput, setAcademyInput] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<SessionSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <AdminStepScreen
      step="sessions"
      title="일정·예약 관리"
      description="면접 회차를 만들고, 모의면접 예약 시간과 운영을 관리합니다."
    >
      {({
        academy,
        refreshWorkspace,
        selectedSession,
        sessionId,
        sessions,
        setSessionId,
      }) => {
        const activeSessionCount = sessions.filter(
          (session) => session.status === "active",
        ).length;

        const handleSaveAcademy = () => {
          startTransition(() => {
            void (async () => {
              try {
                await fetch("/api/admin/academy", {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json; charset=utf-8",
                  },
                  body: JSON.stringify({
                    academyName: academyInput.trim() || academy.academyName,
                  }),
                }).then(
                  readJson<{ academyName: string; updatedAt: string | null }>,
                );

                await refreshWorkspace();
                setAcademyInput("");
                toast.success("학원 설정을 저장했습니다.");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "학원 설정을 저장하지 못했습니다.",
                );
              }
            })();
          });
        };

        const handleCreateSession = () => {
          startTransition(() => {
            void (async () => {
              try {
                const payload = await fetch("/api/admin/sessions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json; charset=utf-8",
                  },
                  body: JSON.stringify({
                    ...sessionForm,
                    reservationOpenAt: toIsoOrNull(sessionForm.reservationOpenAt),
                    reservationCloseAt: toIsoOrNull(sessionForm.reservationCloseAt),
                    applyOpenAt: toIsoOrNull(sessionForm.applyOpenAt),
                    applyCloseAt: toIsoOrNull(sessionForm.applyCloseAt),
                    interviewDate: sessionForm.interviewDate || null,
                  }),
                }).then(readJson<{ session: SessionSummary }>);

                await refreshWorkspace();
                setSessionId(payload.session.id);
                setSessionForm(defaultSessionForm);
                toast.success("새 면접 회차를 만들었습니다.");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "면접 회차를 만들지 못했습니다.",
                );
              }
            })();
          });
        };

        const handleArchiveSession = () => {
          if (!archiveTarget) {
            return;
          }

          startTransition(() => {
            void (async () => {
              try {
                await fetch(`/api/admin/sessions/${archiveTarget.id}/archive`, {
                  method: "POST",
                }).then(readJson<{ session: SessionSummary }>);

                await refreshWorkspace();
                setArchiveTarget(null);
                toast.success("면접 회차 운영을 종료했습니다.");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "면접 회차를 종료하지 못했습니다.",
                );
              }
            })();
          });
        };

        const handleCreateSlots = () => {
          if (!sessionId) {
            toast.error("면접 회차를 먼저 선택해 주세요.");
            return;
          }

          startTransition(() => {
            void (async () => {
              try {
                const payload = await fetch("/api/admin/reservations/slots", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json; charset=utf-8",
                  },
                  body: JSON.stringify({
                    ...slotForm,
                    sessionId,
                  }),
                }).then(readJson<{ createdCount: number }>);

                toast.success(`예약 시간 ${payload.createdCount}개를 만들었습니다.`);
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "예약 시간을 만들지 못했습니다.",
                );
              }
            })();
          });
        };

        return (
          <>
            <div className="space-y-6">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <SectionCard
                  title="학원 설정"
                  description="학원 이름을 변경하면 공개 화면과 관리자 화면에 바로 반영됩니다."
                >
                  <div className="space-y-4">
                    <input
                      value={academyInput || academy.academyName}
                      onChange={(event) => setAcademyInput(event.target.value)}
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      placeholder="학원 이름"
                    />
                    <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                      최근 수정 {formatDateTime(academy.updatedAt)}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveAcademy}
                        disabled={isPending}
                        className="inline-flex items-center gap-2 rounded-[12px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white"
                      >
                        {isPending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        저장
                      </button>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="회차 요약"
                  description="현재 운영 중인 면접 회차 수와 선택된 회차 정보를 보여줍니다."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-sm text-slate-500">운영 중 회차</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {activeSessionCount}개
                      </p>
                    </div>
                    <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-sm text-slate-500">현재 선택 회차</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {selectedSession?.name ?? "회차 선택 필요"}
                      </p>
                      {selectedSession ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge tone="brand">
                            {TRACKS[selectedSession.track].label}
                          </Badge>
                          <Badge
                            tone={
                              selectedSession.status === "active"
                                ? "success"
                                : "neutral"
                            }
                          >
                            {selectedSession.status}
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </SectionCard>
              </div>

              <SectionCard
                title="용어 빠른 설명"
                description="관리 화면에서 자주 쓰는 용어를 짧게 정리했습니다."
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">면접 회차</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      하나의 면접 운영 단위입니다. 모의면접 예약, 스터디 지원,
                      조 편성을 하나로 묶어 관리합니다.
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">예약 시간</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      학생이 선택하는 개별 면접 시간입니다. 한 예약 안에 여러 개를
                      한 번에 만들 수 있습니다.
                    </p>
                  </div>
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">운영 종료</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      더 이상 예약이나 수정은 받지 않고 기록으로만 남기는 상태입니다.
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="면접 회차 만들기"
                description="새로운 면접 회차를 등록하고 예약 및 지원 기간을 설정합니다."
              >
                <div className="mb-4 rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                  여기서 만든 회차를 기준으로 이후 명단 업로드, 조 편성, 방 관리가
                  순서대로 연결됩니다.
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      회차 이름
                    </span>
                    <input
                      value={sessionForm.name}
                      onChange={(event) =>
                        setSessionForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      placeholder="2026 상반기 경찰 면접반"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">직렬</span>
                    <select
                      value={sessionForm.track}
                      onChange={(event) =>
                        setSessionForm((current) => ({
                          ...current,
                          track: event.target.value as Track,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="police">경찰</option>
                      <option value="fire">소방</option>
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      예약 시작
                    </span>
                    <input
                      type="datetime-local"
                      value={sessionForm.reservationOpenAt}
                      onChange={(event) =>
                        setSessionForm((current) => ({
                          ...current,
                          reservationOpenAt: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      예약 마감
                    </span>
                    <input
                      type="datetime-local"
                      value={sessionForm.reservationCloseAt}
                      onChange={(event) =>
                        setSessionForm((current) => ({
                          ...current,
                          reservationCloseAt: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      지원 시작
                    </span>
                    <input
                      type="datetime-local"
                      value={sessionForm.applyOpenAt}
                      onChange={(event) =>
                        setSessionForm((current) => ({
                          ...current,
                          applyOpenAt: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      지원 마감
                    </span>
                    <input
                      type="datetime-local"
                      value={sessionForm.applyCloseAt}
                      onChange={(event) =>
                        setSessionForm((current) => ({
                          ...current,
                          applyCloseAt: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">면접일</span>
                    <input
                      type="date"
                      value={sessionForm.interviewDate}
                      onChange={(event) =>
                        setSessionForm((current) => ({
                          ...current,
                          interviewDate: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-500">
                        최대 인원
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={sessionForm.maxGroupSize}
                        onChange={(event) =>
                          setSessionForm((current) => ({
                            ...current,
                            maxGroupSize: Number(event.target.value),
                          }))
                        }
                        className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-500">
                        최소 인원
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={sessionForm.minGroupSize}
                        onChange={(event) =>
                          setSessionForm((current) => ({
                            ...current,
                            minGroupSize: Number(event.target.value),
                          }))
                        }
                        className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateSession}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-[12px] bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    {isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    면접 회차 만들기
                  </button>
                </div>
              </SectionCard>

              <SectionCard
                title="등록된 회차"
                description="만든 면접 회차를 확인하고, 작업할 회차를 선택하거나 종료합니다."
              >
                <div className="grid gap-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-[10px] border border-slate-200 bg-white px-4 py-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="brand">{TRACKS[session.track].label}</Badge>
                            <Badge
                              tone={
                                session.status === "active" ? "success" : "neutral"
                              }
                            >
                              {session.status}
                            </Badge>
                            {session.id === sessionId ? (
                              <Badge tone="info">현재 선택</Badge>
                            ) : null}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              {session.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              예약 {formatDateTime(session.reservationOpenAt)} ~{" "}
                              {formatDateTime(session.reservationCloseAt)}
                            </p>
                            <p className="text-xs text-slate-500">
                              지원 {formatDateTime(session.applyOpenAt)} ~{" "}
                              {formatDateTime(session.applyCloseAt)} · 면접일{" "}
                              {formatDate(session.interviewDate)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setSessionId(session.id)}
                            className="inline-flex items-center rounded-[12px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                          >
                            이 회차 선택
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchiveTarget(session)}
                            disabled={session.status !== "active" || isPending}
                            className="inline-flex items-center gap-2 rounded-[12px] bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Archive className="h-4 w-4" />
                            운영 종료
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <AdminSessionEditorPanel
                adminKey=""
                sessions={sessions}
                sessionId={sessionId}
                onSessionIdChange={setSessionId}
                hideSessionField
                onUpdated={() => void refreshWorkspace()}
              />

              <SectionCard
                title="모의면접 예약 시간 만들기"
                description="선택한 회차에 날짜·시간 범위를 정하면 학생이 선택할 예약 시간을 일괄 생성합니다."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      생성 시작 날짜
                    </span>
                    <input
                      type="date"
                      value={slotForm.startDate}
                      onChange={(event) =>
                        setSlotForm((current) => ({
                          ...current,
                          startDate: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      생성 종료 날짜
                    </span>
                    <input
                      type="date"
                      value={slotForm.endDate}
                      onChange={(event) =>
                        setSlotForm((current) => ({
                          ...current,
                          endDate: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      하루 시작 시간
                    </span>
                    <input
                      type="time"
                      value={slotForm.startTime}
                      onChange={(event) =>
                        setSlotForm((current) => ({
                          ...current,
                          startTime: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      하루 종료 시간
                    </span>
                    <input
                      type="time"
                      value={slotForm.endTime}
                      onChange={(event) =>
                        setSlotForm((current) => ({
                          ...current,
                          endTime: event.target.value,
                        }))
                      }
                      className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3 md:col-span-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-500">
                        시간 간격(분)
                      </span>
                      <input
                        type="number"
                        min={30}
                        step={30}
                        value={slotForm.intervalMinutes}
                        onChange={(event) =>
                          setSlotForm((current) => ({
                            ...current,
                            intervalMinutes: Number(event.target.value),
                          }))
                        }
                        className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-500">
                        시간별 정원
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={slotForm.capacity}
                        onChange={(event) =>
                          setSlotForm((current) => ({
                            ...current,
                            capacity: Number(event.target.value),
                          }))
                        }
                        className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {weekdayOptions.map((weekday) => {
                    const checked = slotForm.weekdays.includes(weekday.value);

                    return (
                      <button
                        key={weekday.value}
                        type="button"
                        onClick={() =>
                          setSlotForm((current) => ({
                            ...current,
                            weekdays: checked
                              ? current.weekdays.filter(
                                  (value) => value !== weekday.value,
                                )
                              : [...current.weekdays, weekday.value].sort(),
                          }))
                        }
                        className={`rounded-full px-4 py-2 text-sm font-medium ${
                          checked
                            ? "bg-[var(--division-color)] text-white"
                            : "border border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {weekday.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateSlots}
                    disabled={isPending || !sessionId}
                    className="inline-flex items-center gap-2 rounded-[12px] bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarPlus className="h-4 w-4" />
                    )}
                    예약 시간 만들기
                  </button>
                </div>
              </SectionCard>

              <AdminReservationOpsPanel
                adminKey=""
                sessions={sessions}
                sessionId={sessionId}
                onSessionIdChange={setSessionId}
                hideSessionField
              />
            </div>

            <ConfirmDialog
              open={Boolean(archiveTarget)}
              title="이 면접 회차를 종료하시겠습니까?"
              description={
                archiveTarget
                  ? `'${archiveTarget.name}' 회차를 종료하면 예약과 방 상태가 종료 기준으로 정리됩니다.`
                  : ""
              }
              confirmText="운영 종료"
              tone="danger"
              isPending={isPending}
              onCancel={() => setArchiveTarget(null)}
              onConfirm={handleArchiveSession}
            />
          </>
        );
      }}
    </AdminStepScreen>
  );
}
