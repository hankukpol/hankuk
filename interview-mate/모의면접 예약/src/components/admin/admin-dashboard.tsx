"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Archive,
  CalendarPlus,
  LoaderCircle,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { AdminExportPanel } from "@/components/admin/admin-export-panel";
import { AdminGroupSyncPanel } from "@/components/admin/admin-group-sync-panel";
import { AdminRoomBulkPanel } from "@/components/admin/admin-room-bulk-panel";
import { AdminReservationOpsPanel } from "@/components/admin/admin-reservation-ops-panel";
import { AdminRosterPanel } from "@/components/admin/admin-roster-panel";
import { AdminRoomOpsPanel } from "@/components/admin/admin-room-ops-panel";
import { AdminSessionEditorPanel } from "@/components/admin/admin-session-editor-panel";
import { AdminStatsPanel } from "@/components/admin/admin-stats-panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { TRACKS, type Track } from "@/lib/constants";
import type { SessionSummary } from "@/lib/sessions";

type AdminDashboardProps = {
  adminKey: string;
};

type AcademyState = {
  academyName: string;
  updatedAt: string | null;
};

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
  sessionId: string;
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  capacity: number;
};

type RegisteredStudentSummary = {
  id: string;
  sessionId: string;
  name: string;
  phone: string;
  gender: string | null;
  series: string | null;
  createdAt: string;
};

type AdminRoomSummary = {
  id: string;
  sessionId: string;
  roomName: string | null;
  inviteCode: string;
  status: "recruiting" | "formed" | "closed";
  createdByAdmin: boolean;
  maxMembers: number;
  memberCount: number;
  leaderName: string | null;
  requestExtraMembers: number;
  requestExtraReason: string | null;
  createdAt: string;
  latestMessage: {
    message: string;
    createdAt: string;
    isSystem: boolean;
  } | null;
};

type AdminRoomMessage = {
  id: string;
  studentId: string | null;
  message: string;
  isSystem: boolean;
  createdAt: string;
  senderName: string;
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
  sessionId: "",
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
    return "미설정";
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

export function AdminDashboard({ adminKey }: AdminDashboardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [academy, setAcademy] = useState<AcademyState>({
    academyName: "한국경찰학원",
    updatedAt: null,
  });
  const [academyInput, setAcademyInput] = useState("한국경찰학원");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionForm, setSessionForm] =
    useState<SessionFormState>(defaultSessionForm);
  const [slotForm, setSlotForm] = useState<SlotFormState>(defaultSlotForm);
  const [archiveTarget, setArchiveTarget] = useState<SessionSummary | null>(null);
  const [rosterSessionId, setRosterSessionId] = useState("");
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [rosterInputKey, setRosterInputKey] = useState(0);
  const [replaceExistingRoster, setReplaceExistingRoster] = useState(true);
  const [rosterStudents, setRosterStudents] = useState<RegisteredStudentSummary[]>(
    [],
  );
  const [isRosterLoading, setIsRosterLoading] = useState(false);
  const [roomSessionId, setRoomSessionId] = useState("");
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [roomMessages, setRoomMessages] = useState<AdminRoomMessage[]>([]);
  const [isRoomsLoading, setIsRoomsLoading] = useState(false);
  const [isRoomMessagesLoading, setIsRoomMessagesLoading] = useState(false);
  const [opsVersion, setOpsVersion] = useState(0);
  const activeSessionCount = sessions.filter(
    (session) => session.status === "active",
  ).length;

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json; charset=utf-8",
      "x-admin-key": adminKey,
    }),
    [adminKey],
  );

  const loadRosterPreview = useCallback(
    async (sessionId: string) => {
      if (!sessionId) {
        setRosterStudents([]);
        return;
      }

      setIsRosterLoading(true);

      try {
        const payload = await fetch(
          `/api/admin/roster?session_id=${sessionId}`,
          { headers },
        ).then(readJson<{ students: RegisteredStudentSummary[] }>);

        setRosterStudents(payload.students);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "등록 명단을 불러오지 못했습니다.",
        );
      } finally {
        setIsRosterLoading(false);
      }
    },
    [headers],
  );

  const loadRoomsPreview = useCallback(
    async (sessionId: string) => {
      if (!sessionId) {
        setRooms([]);
        setSelectedRoomId("");
        return;
      }

      setIsRoomsLoading(true);

      try {
        const payload = await fetch(
          `/api/admin/rooms?session_id=${sessionId}`,
          { headers },
        ).then(readJson<{ rooms: AdminRoomSummary[] }>);

        setRooms(payload.rooms);
        setSelectedRoomId((current) =>
          payload.rooms.some((room) => room.id === current)
            ? current
            : payload.rooms[0]?.id ?? "",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "조 방 목록을 불러오지 못했습니다.",
        );
      } finally {
        setIsRoomsLoading(false);
      }
    },
    [headers],
  );

  const loadRoomMessages = useCallback(
    async (roomId: string) => {
      if (!roomId) {
        setRoomMessages([]);
        return;
      }

      setIsRoomMessagesLoading(true);

      try {
        const payload = await fetch(`/api/admin/rooms/${roomId}/messages`, {
          headers,
        }).then(readJson<{ messages: AdminRoomMessage[] }>);

        setRoomMessages(payload.messages);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "방 채팅 내역을 불러오지 못했습니다.",
        );
      } finally {
        setIsRoomMessagesLoading(false);
      }
    },
    [headers],
  );

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);

    try {
      const [academyPayload, sessionPayload] = await Promise.all([
        fetch("/api/admin/academy", { headers }).then(
          readJson<{ academyName: string; updatedAt: string | null }>,
        ),
        fetch("/api/admin/sessions", { headers }).then(
          readJson<{ sessions: SessionSummary[] }>,
        ),
      ]);

      setAcademy(academyPayload);
      setAcademyInput(academyPayload.academyName);
      setSessions(sessionPayload.sessions);
      const defaultSessionId =
        sessionPayload.sessions.find((session) => session.status === "active")?.id ??
        sessionPayload.sessions[0]?.id ??
        "";

      if (!slotForm.sessionId && defaultSessionId) {
        setSlotForm((current) => ({
          ...current,
          sessionId: defaultSessionId,
        }));
      }

      if (!rosterSessionId && defaultSessionId) {
        setRosterSessionId(defaultSessionId);
      }

      if (!roomSessionId && defaultSessionId) {
        setRoomSessionId(defaultSessionId);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "관리자 화면 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [headers, roomSessionId, rosterSessionId, slotForm.sessionId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadRosterPreview(rosterSessionId);
  }, [loadRosterPreview, rosterSessionId]);

  useEffect(() => {
    void loadRoomsPreview(roomSessionId);
  }, [loadRoomsPreview, roomSessionId]);

  useEffect(() => {
    void loadRoomMessages(selectedRoomId);
  }, [loadRoomMessages, selectedRoomId]);

  const handleSessionUpdated = useCallback((updatedSession: SessionSummary) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === updatedSession.id ? updatedSession : session,
      ),
    );
  }, []);

  const handleSaveAcademy = () => {
    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch("/api/admin/academy", {
            method: "PATCH",
            headers,
            body: JSON.stringify({ academyName: academyInput }),
          }).then(readJson<{ academyName: string; updatedAt: string | null }>);

          setAcademy(payload);
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
            headers,
            body: JSON.stringify({
              ...sessionForm,
              reservationOpenAt: toIsoOrNull(sessionForm.reservationOpenAt),
              reservationCloseAt: toIsoOrNull(sessionForm.reservationCloseAt),
              applyOpenAt: toIsoOrNull(sessionForm.applyOpenAt),
              applyCloseAt: toIsoOrNull(sessionForm.applyCloseAt),
              interviewDate: sessionForm.interviewDate || null,
            }),
          }).then(readJson<{ session: SessionSummary }>);

          setSessions((current) => [payload.session, ...current]);
          setSessionForm(defaultSessionForm);
          setSlotForm((current) => ({
            ...current,
            sessionId: payload.session.id,
          }));
          toast.success("새 세션을 생성했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "세션을 생성하지 못했습니다.",
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
          const payload = await fetch(
            `/api/admin/sessions/${archiveTarget.id}/archive`,
            {
              method: "POST",
              headers,
            },
          ).then(readJson<{ session: SessionSummary }>);

          setSessions((current) =>
            current.map((item) =>
              item.id === payload.session.id ? payload.session : item,
            ),
          );
          setArchiveTarget(null);
          toast.success("세션을 종료했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "세션을 종료하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleCreateSlots = () => {
    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch("/api/admin/reservations/slots", {
            method: "POST",
            headers,
            body: JSON.stringify(slotForm),
          }).then(readJson<{ createdCount: number }>);

          toast.success(`슬롯 ${payload.createdCount}개를 생성했습니다.`);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "슬롯을 생성하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleUploadRoster = () => {
    if (!rosterSessionId) {
      toast.error("명단을 연결할 세션을 선택해주세요.");
      return;
    }

    if (!rosterFile) {
      toast.error("업로드할 명단 파일을 선택해주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const formData = new FormData();
          formData.append("sessionId", rosterSessionId);
          formData.append("file", rosterFile);
          formData.append("replaceExisting", String(replaceExistingRoster));

          const payload = await fetch("/api/admin/roster", {
            method: "POST",
            headers: {
              "x-admin-key": adminKey,
            },
            body: formData,
          }).then(readJson<{ importedCount: number }>);

          await loadRosterPreview(rosterSessionId);
          setRosterFile(null);
          setRosterInputKey((current) => current + 1);
          toast.success(`등록 명단 ${payload.importedCount}명을 저장했습니다.`);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "등록 명단을 업로드하지 못했습니다.",
          );
        }
      })();
    });
  };

  return (
    <>
      <div className="mx-auto grid min-h-screen max-w-[1440px] gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-slate-950 px-4 py-6 text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:border-r-white/10">
          <div className="mb-6 px-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">
              Admin
            </p>
            <h1 className="mt-2 text-xl font-semibold">운영 대시보드</h1>
            <p className="mt-2 text-sm leading-6 text-white/60">
              큰 화면에서는 현황을 넓게 보고, 모바일에서는 같은 카드 구성을 세로로
              확인할 수 있습니다.
            </p>
          </div>
          <div className="mb-5 rounded-[10px] border border-white/10 bg-white/5 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/50">
              Overview
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {activeSessionCount}
            </p>
            <p className="mt-1 text-sm text-white/60">현재 운영 중 세션</p>
          </div>
          <div className="grid gap-2">
            {["개요", "세션", "명단", "예약", "조 방", "대기자"].map(
              (label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`rounded-[10px] px-3 py-3 text-left text-sm font-medium ${
                    index === 0
                      ? "bg-white text-slate-950 shadow-[0_16px_40px_rgba(255,255,255,0.16)]"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </aside>

        <section className="admin-container space-y-5">
          <SectionCard
            title="운영 개요"
            description="학원 설정과 세션 목록을 API와 연결한 상태입니다."
            action={<Badge tone="success">관리자 인증 연결됨</Badge>}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">학원 이름</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {academy.academyName}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  최근 수정 {formatDateTime(academy.updatedAt)}
                </p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">운영 중 세션</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {activeSessionCount}개
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  직렬별 active 세션 1개 정책
                </p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">현재 상태</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {isLoading ? "불러오는 중" : "API 정상"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  학원 설정, 세션, 슬롯 생성 라우트 연결
                </p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">누적 세션</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {sessions.length}개
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  종료된 시즌 기록까지 포함
                </p>
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
            <SectionCard
              title="학원 설정"
              description="학원 이름을 변경하면 메인과 관리자 화면의 기준 이름이 바뀝니다."
              className="h-full"
            >
              <div className="flex h-full flex-col gap-3">
                <input
                  value={academyInput}
                  onChange={(event) => setAcademyInput(event.target.value)}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="학원 이름"
                />
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  최근 저장 {formatDateTime(academy.updatedAt)}
                </div>
                <div className="mt-auto flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveAcademy}
                    disabled={isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white"
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
              title="세션 생성"
              description="활성 세션은 직렬별 한 개만 생성할 수 있습니다."
            >
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={sessionForm.name}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="예: 2026 상반기 경찰 면접반"
              />
              <select
                value={sessionForm.track}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    track: event.target.value as Track,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="police">경찰</option>
                <option value="fire">소방</option>
              </select>
              <input
                type="datetime-local"
                value={sessionForm.reservationOpenAt}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    reservationOpenAt: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="datetime-local"
                value={sessionForm.reservationCloseAt}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    reservationCloseAt: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="datetime-local"
                value={sessionForm.applyOpenAt}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    applyOpenAt: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="datetime-local"
                value={sessionForm.applyCloseAt}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    applyCloseAt: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={sessionForm.interviewDate}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    interviewDate: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
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
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="최대 조 인원"
                />
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
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="최소 조 인원"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
              >
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                세션 생성
              </button>
            </div>
            </SectionCard>
          </div>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.24fr)_minmax(0,0.96fr)]">
            <SectionCard
              title="세션 목록"
              description="운영 중 세션과 종료된 세션을 함께 확인하고 종료할 수 있습니다."
            >
            <div className="grid gap-3">
              {sessions.map((session) => {
                const track = TRACKS[session.track];

                return (
                  <div
                    key={session.id}
                    className="rounded-[10px] border border-slate-200 bg-white px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge tone="brand">{track.label}</Badge>
                          <Badge
                            tone={
                              session.status === "active" ? "success" : "neutral"
                            }
                          >
                            {session.status}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {session.name}
                          </p>
                          <p className="text-xs text-slate-500">
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
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setArchiveTarget(session)}
                          disabled={session.status !== "active" || isPending}
                          className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Archive className="h-4 w-4" />
                          세션 종료
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!isLoading && sessions.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  생성된 세션이 없습니다.
                </div>
              ) : null}
            </div>
            </SectionCard>

            <SectionCard
              title="예약 슬롯 일괄 생성"
              description="선택한 세션에 날짜 범위와 시간 간격 기준으로 슬롯을 생성합니다."
              className="h-full"
            >
              <div className="flex h-full flex-col">
                <div className="grid gap-3 md:grid-cols-2">
              <select
                value={slotForm.sessionId}
                onChange={(event) =>
                  setSlotForm((current) => ({
                    ...current,
                    sessionId: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">세션 선택</option>
                {sessions
                  .filter((session) => session.status === "active")
                  .map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
              </select>
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
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="정원"
              />
              <input
                type="date"
                value={slotForm.startDate}
                onChange={(event) =>
                  setSlotForm((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={slotForm.endDate}
                onChange={(event) =>
                  setSlotForm((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={slotForm.startTime}
                onChange={(event) =>
                  setSlotForm((current) => ({
                    ...current,
                    startTime: event.target.value,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="time"
                  value={slotForm.endTime}
                  onChange={(event) =>
                    setSlotForm((current) => ({
                      ...current,
                      endTime: event.target.value,
                    }))
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                />
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
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="간격(분)"
                />
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
                <div className="mt-auto pt-4">
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    PC에서는 우측에서 조건을 조정하고 좌측 세션 목록을 동시에
                    확인할 수 있습니다. 모바일에서는 같은 흐름이 세로로 이어집니다.
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreateSlots}
                      disabled={isPending}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
                    >
                      {isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <CalendarPlus className="h-4 w-4" />
                      )}
                      슬롯 생성
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="등록 명단 업로드"
            description="경찰/소방 명단 파일을 업로드해 학생 본인확인과 지원 검증 기준으로 사용합니다."
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
              <div className="space-y-4">
                <select
                  value={rosterSessionId}
                  onChange={(event) => setRosterSessionId(event.target.value)}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">세션 선택</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
                </select>

                <input
                  key={rosterInputKey}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) =>
                    setRosterFile(event.target.files?.[0] ?? null)
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                />

                <label className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={replaceExistingRoster}
                    onChange={(event) =>
                      setReplaceExistingRoster(event.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  기존 명단을 교체하고 새 파일 기준으로 다시 저장
                </label>

                <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  업로드 형식: `이름, 연락처, 성별, 직렬` 헤더를 우선 사용합니다.
                  현재 프로젝트의 CSV 목업 파일도 바로 테스트 가능합니다.
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleUploadRoster}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    명단 업로드
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm text-slate-500">등록 명단 수</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">
                    {isRosterLoading ? "불러오는 중" : `${rosterStudents.length}명`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    선택한 세션 기준으로 표시됩니다.
                  </p>
                </div>

                <div className="grid gap-3">
                  {rosterStudents.slice(0, 8).map((student) => (
                    <div
                      key={student.id}
                      className="rounded-[10px] border border-slate-200 bg-white px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {student.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {student.phone}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {student.gender ? (
                            <Badge tone="neutral">{student.gender}</Badge>
                          ) : null}
                          {student.series ? (
                            <Badge tone="brand">{student.series}</Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!isRosterLoading && rosterStudents.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                      등록된 학생이 없습니다. 명단 파일을 업로드해주세요.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="조 방 현황"
            description="세션별 조 방 상태와 최근 채팅을 PC 화면에서 한눈에 모니터링할 수 있습니다."
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
              <div className="space-y-4">
                <select
                  value={roomSessionId}
                  onChange={(event) => setRoomSessionId(event.target.value)}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">세션 선택</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
                </select>

                <div className="grid gap-3">
                  {rooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setSelectedRoomId(room.id)}
                      className={`rounded-[10px] border px-4 py-4 text-left ${
                        selectedRoomId === room.id
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-900"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {room.roomName ?? "이름 없는 조 방"}
                          </p>
                          <p
                            className={`mt-1 text-xs ${
                              selectedRoomId === room.id
                                ? "text-white/70"
                                : "text-slate-500"
                            }`}
                          >
                            초대코드 {room.inviteCode} · {room.memberCount}/
                            {room.maxMembers}명
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            tone={
                              room.status === "closed"
                                ? "neutral"
                                : room.status === "formed"
                                  ? "success"
                                  : "info"
                            }
                          >
                            {room.status}
                          </Badge>
                        </div>
                      </div>
                      <div
                        className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${
                          selectedRoomId === room.id
                            ? "text-white/70"
                            : "text-slate-500"
                        }`}
                      >
                        <span>조장 {room.leaderName ?? "미지정"}</span>
                        {room.requestExtraMembers > 0 ? (
                          <span>
                            추가 요청 {room.requestExtraMembers}명
                          </span>
                        ) : null}
                      </div>
                      <p
                        className={`mt-3 line-clamp-2 text-sm ${
                          selectedRoomId === room.id
                            ? "text-white/90"
                            : "text-slate-600"
                        }`}
                      >
                        {room.latestMessage
                          ? room.latestMessage.message
                          : "아직 채팅이 없습니다."}
                      </p>
                    </button>
                  ))}
                  {!isRoomsLoading && rooms.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                      생성된 조 방이 없습니다.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm text-slate-500">채팅 모니터링</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">
                    {selectedRoomId
                      ? rooms.find((room) => room.id === selectedRoomId)?.roomName ??
                        "선택된 조 방"
                      : "조 방을 선택하세요"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    최근 50개 메시지를 읽기 전용으로 표시합니다.
                  </p>
                </div>

                <div className="grid gap-3">
                  {roomMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-[10px] border px-4 py-3 ${
                        message.isSystem
                          ? "border-slate-200 bg-slate-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {message.senderName}
                        </p>
                        <span className="text-xs text-slate-400">
                          {formatDateTime(message.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {message.message}
                      </p>
                    </div>
                  ))}
                  {!isRoomMessagesLoading && roomMessages.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                      표시할 채팅 내역이 없습니다.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </SectionCard>

          <AdminSessionEditorPanel
            adminKey={adminKey}
            sessions={sessions}
            initialSessionId={slotForm.sessionId || roomSessionId}
            onUpdated={handleSessionUpdated}
          />

          <AdminRosterPanel
            adminKey={adminKey}
            sessions={sessions}
            initialSessionId={rosterSessionId || slotForm.sessionId || roomSessionId}
          />

          <AdminStatsPanel
            key={`stats-${opsVersion}`}
            adminKey={adminKey}
            sessions={sessions}
            initialSessionId={slotForm.sessionId || roomSessionId}
          />

          <AdminGroupSyncPanel
            adminKey={adminKey}
            sessions={sessions}
            initialSessionId={roomSessionId || slotForm.sessionId}
            onImported={() => setOpsVersion((current) => current + 1)}
          />

          <AdminExportPanel
            key={`exports-${opsVersion}`}
            adminKey={adminKey}
            sessions={sessions}
            initialSessionId={slotForm.sessionId || roomSessionId}
          />

          <AdminRoomBulkPanel
            key={`room-bulk-${opsVersion}`}
            adminKey={adminKey}
            sessions={sessions}
            initialSessionId={roomSessionId || slotForm.sessionId}
            onCreated={() => setOpsVersion((current) => current + 1)}
          />

          <AdminRoomOpsPanel
            key={`rooms-${opsVersion}`}
            adminKey={adminKey}
            sessions={sessions}
            initialSessionId={roomSessionId}
          />

          <AdminReservationOpsPanel
            adminKey={adminKey}
            sessions={sessions}
            initialSessionId={slotForm.sessionId || roomSessionId}
          />
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="이 면접반을 종료하시겠습니까?"
        description={
          archiveTarget
            ? `'${archiveTarget.name}'의 예약과 조 방을 종료 상태로 전환합니다.`
            : ""
        }
        confirmText="세션 종료"
        tone="danger"
        isPending={isPending}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={handleArchiveSession}
      />
    </>
  );
}
