"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  LoaderCircle,
  Megaphone,
  RefreshCw,
  Save,
  Trash2,
  UserMinus,
  UserPlus2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/ui/section-card";
import { TRACKS } from "@/lib/constants";
import type { RoomMemberSummary } from "@/lib/room-service";
import type { SessionSummary } from "@/lib/sessions";

type Props = {
  adminKey: string;
  sessions: SessionSummary[];
  initialSessionId?: string;
};

type RoomStatus = "recruiting" | "formed" | "closed";
type RoomFilter = "all" | "requesting" | RoomStatus;

type RoomSummary = {
  id: string;
  sessionId: string;
  roomName: string | null;
  inviteCode: string;
  status: RoomStatus;
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

type RoomMessage = {
  id: string;
  message: string;
  isSystem: boolean;
  createdAt: string;
  senderName: string;
};

type MessagePageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};

type WaitingStudent = {
  id: string;
  studentId: string;
  name: string;
  phone: string;
  gender: string;
  region: string;
  series: string;
  score: number | null;
  createdAt: string;
};

type RoomDetail = {
  room: {
    id: string;
    roomName: string | null;
    inviteCode: string;
    status: RoomStatus;
    maxMembers: number;
    requestExtraMembers: number;
    requestExtraReason: string | null;
    minGroupSize: number;
    maxAllowedMembers: number;
    leaderStudentId: string | null;
    password: string;
    track: SessionSummary["track"];
  };
  members: RoomMemberSummary[];
};

type RemoveMemberTarget = {
  studentId: string;
  name: string;
};

const FILTER_LABELS: Record<RoomFilter, string> = {
  all: "전체",
  requesting: "추가 요청",
  recruiting: "모집 중",
  formed: "편성 완료",
  closed: "종료",
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
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRoomStatusTone(status: RoomStatus) {
  if (status === "formed") {
    return "success" as const;
  }

  if (status === "closed") {
    return "neutral" as const;
  }

  return "info" as const;
}

function getRoomStatusLabel(status: RoomStatus) {
  if (status === "formed") {
    return "편성 완료";
  }

  if (status === "closed") {
    return "종료";
  }

  return "모집 중";
}

function getMemberRoleTone(role: RoomMemberSummary["role"]) {
  if (role === "creator") {
    return "brand" as const;
  }

  if (role === "leader") {
    return "info" as const;
  }

  return "neutral" as const;
}

function getMemberRoleLabel(role: RoomMemberSummary["role"]) {
  if (role === "creator") {
    return "방장";
  }

  if (role === "leader") {
    return "조장";
  }

  return "조원";
}

function mergeMessages(olderMessages: RoomMessage[], currentMessages: RoomMessage[]) {
  const nextMessages = [...olderMessages];
  const seen = new Set(olderMessages.map((message) => message.id));

  for (const message of currentMessages) {
    if (seen.has(message.id)) {
      continue;
    }

    nextMessages.push(message);
    seen.add(message.id);
  }

  return nextMessages;
}

export function AdminRoomOpsPanel({
  adminKey,
  sessions,
  initialSessionId,
}: Props) {
  const [sessionId, setSessionId] = useState(initialSessionId ?? "");
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [messagePageInfo, setMessagePageInfo] = useState<MessagePageInfo>({
    hasMore: false,
    nextCursor: null,
  });
  const [waiting, setWaiting] = useState<WaitingStudent[]>([]);
  const [status, setStatus] = useState<RoomStatus>("recruiting");
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");
  const [maxMembers, setMaxMembers] = useState("10");
  const [leaderStudentId, setLeaderStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [roomNotice, setRoomNotice] = useState("");
  const [allNotice, setAllNotice] = useState("");
  const [removeMemberTarget, setRemoveMemberTarget] =
    useState<RemoveMemberTarget | null>(null);
  const [dissolveConfirmOpen, setDissolveConfirmOpen] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isPending, startTransition] = useTransition();

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json; charset=utf-8",
      "x-admin-key": adminKey,
    }),
    [adminKey],
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessionId, sessions],
  );

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const isReadOnly = selectedSession?.status !== "active";

  const filteredRooms = useMemo(() => {
    if (roomFilter === "all") {
      return rooms;
    }

    if (roomFilter === "requesting") {
      return rooms.filter((room) => room.requestExtraMembers > 0);
    }

    return rooms.filter((room) => room.status === roomFilter);
  }, [roomFilter, rooms]);

  const leaderCandidates = useMemo(
    () => detail?.members.filter((member) => member.role !== "creator") ?? [],
    [detail],
  );

  const roomCounts = useMemo(
    () => ({
      all: rooms.length,
      requesting: rooms.filter((room) => room.requestExtraMembers > 0).length,
      recruiting: rooms.filter((room) => room.status === "recruiting").length,
      formed: rooms.filter((room) => room.status === "formed").length,
      closed: rooms.filter((room) => room.status === "closed").length,
    }),
    [rooms],
  );

  const loadRooms = useCallback(
    async (nextSessionId: string, preferredRoomId?: string) => {
      if (!nextSessionId) {
        setRooms([]);
        setSelectedRoomId("");
        return "";
      }

      const payload = await fetch(`/api/admin/rooms?session_id=${nextSessionId}`, {
        headers,
      }).then(readJson<{ rooms: RoomSummary[] }>);

      setRooms(payload.rooms);

      const nextRoomId =
        preferredRoomId && payload.rooms.some((room) => room.id === preferredRoomId)
          ? preferredRoomId
          : payload.rooms.some((room) => room.id === selectedRoomId)
            ? selectedRoomId
            : payload.rooms[0]?.id ?? "";

      setSelectedRoomId(nextRoomId);
      return nextRoomId;
    },
    [headers, selectedRoomId],
  );

  const loadDetail = useCallback(
    async (roomId: string) => {
      if (!roomId) {
        setDetail(null);
        setMessages([]);
        setMessagePageInfo({
          hasMore: false,
          nextCursor: null,
        });
        return;
      }

      const [detailPayload, messagesPayload] = await Promise.all([
        fetch(`/api/admin/rooms/${roomId}`, { headers }).then(readJson<RoomDetail>),
        fetch(`/api/admin/rooms/${roomId}/messages`, { headers }).then(
          readJson<{ messages: RoomMessage[]; pageInfo: MessagePageInfo }>,
        ),
      ]);

      setDetail(detailPayload);
      setMessages(messagesPayload.messages);
      setMessagePageInfo(messagesPayload.pageInfo);
      setStatus(detailPayload.room.status);
      setMaxMembers(String(detailPayload.room.maxMembers));
      setLeaderStudentId(detailPayload.room.leaderStudentId ?? "");
      setPassword(detailPayload.room.password);
    },
    [headers],
  );

  const loadWaiting = useCallback(
    async (nextSessionId: string) => {
      if (!nextSessionId) {
        setWaiting([]);
        return;
      }

      const payload = await fetch(
        `/api/admin/waiting-pool?session_id=${nextSessionId}`,
        {
          headers,
        },
      ).then(readJson<{ waitingStudents: WaitingStudent[] }>);

      setWaiting(payload.waitingStudents);
    },
    [headers],
  );

  const refresh = useCallback(
    async (preferredRoomId?: string) => {
      const nextRoomId = await loadRooms(sessionId, preferredRoomId);
      await Promise.all([loadWaiting(sessionId), loadDetail(nextRoomId)]);
    },
    [loadDetail, loadRooms, loadWaiting, sessionId],
  );

  const loadOlderMessages = useCallback(async () => {
    if (
      !selectedRoomId ||
      !messagePageInfo.hasMore ||
      !messagePageInfo.nextCursor ||
      isLoadingOlderMessages
    ) {
      return;
    }

    setIsLoadingOlderMessages(true);

    try {
      const payload = await fetch(
        `/api/admin/rooms/${selectedRoomId}/messages?limit=50&before=${encodeURIComponent(
          messagePageInfo.nextCursor,
        )}`,
        { headers },
      ).then(readJson<{ messages: RoomMessage[]; pageInfo: MessagePageInfo }>);

      setMessages((current) => mergeMessages(payload.messages, current));
      setMessagePageInfo(payload.pageInfo);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "이전 댓글을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [
    headers,
    isLoadingOlderMessages,
    messagePageInfo.hasMore,
    messagePageInfo.nextCursor,
    selectedRoomId,
  ]);

  useEffect(() => {
    if (sessionId) {
      return;
    }

    const defaultSessionId =
      initialSessionId && sessions.some((session) => session.id === initialSessionId)
        ? initialSessionId
        : sessions.find((session) => session.status === "active")?.id ??
          sessions[0]?.id ??
          "";

    if (defaultSessionId) {
      setSessionId(defaultSessionId);
    }
  }, [initialSessionId, sessionId, sessions]);

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "조 방 운영 데이터를 불러오지 못했습니다.",
      );
    });
  }, [refresh]);

  useEffect(() => {
    if (!selectedRoomId) {
      setDetail(null);
      setMessages([]);
      return;
    }

    void loadDetail(selectedRoomId).catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "선택한 방 정보를 불러오지 못했습니다.",
      );
    });
  }, [loadDetail, selectedRoomId]);

  useEffect(() => {
    if (
      selectedRoomId &&
      filteredRooms.some((room) => room.id === selectedRoomId)
    ) {
      return;
    }

    setSelectedRoomId(filteredRooms[0]?.id ?? "");
  }, [filteredRooms, selectedRoomId]);

  const handleRefreshPanel = useCallback(() => {
    void refresh(selectedRoomId || undefined).catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "방 운영 데이터를 새로 불러오지 못했습니다.",
      );
    });
  }, [refresh, selectedRoomId]);

  const saveRoom = useCallback(() => {
    if (!selectedRoomId) {
      toast.error("먼저 조 방을 선택해 주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const nextMaxMembers = Number(maxMembers);

          if (!Number.isFinite(nextMaxMembers)) {
            throw new Error("정원은 숫자로 입력해 주세요.");
          }

          await fetch(`/api/admin/rooms/${selectedRoomId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              status,
              maxMembers: nextMaxMembers,
              leaderStudentId: leaderStudentId || null,
              password: password.trim(),
            }),
          }).then(readJson<RoomDetail>);

          await refresh(selectedRoomId);
          toast.success("방 설정을 저장했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "방 설정을 저장하지 못했습니다.",
          );
        }
      })();
    });
  }, [
    headers,
    leaderStudentId,
    maxMembers,
    password,
    refresh,
    selectedRoomId,
    status,
  ]);

  const clearExtra = useCallback(() => {
    if (!selectedRoomId) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/admin/rooms/${selectedRoomId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ clearExtraRequest: true }),
          }).then(readJson<RoomDetail>);

          await refresh(selectedRoomId);
          toast.success("추가 인원 요청을 정리했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "추가 인원 요청을 정리하지 못했습니다.",
          );
        }
      })();
    });
  }, [headers, refresh, selectedRoomId]);

  const assignWaiting = useCallback(
    (waitingId: string) => {
      if (!selectedRoomId) {
        toast.error("배정할 조 방을 먼저 선택해 주세요.");
        return;
      }

      startTransition(() => {
        void (async () => {
          try {
            await fetch("/api/admin/waiting-pool", {
              method: "PATCH",
              headers,
              body: JSON.stringify({
                waitingId,
                roomId: selectedRoomId,
              }),
            }).then(readJson<{ waitingId: string; roomId: string }>);

            await refresh(selectedRoomId);
            toast.success("대기자를 조 방에 배정했습니다.");
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "대기자를 배정하지 못했습니다.",
            );
          }
        })();
      });
    },
    [headers, refresh, selectedRoomId],
  );

  const confirmRemoveMember = useCallback(() => {
    if (!selectedRoomId || !removeMemberTarget) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(
            `/api/admin/rooms/${selectedRoomId}/members/${removeMemberTarget.studentId}`,
            {
              method: "DELETE",
              headers,
            },
          ).then(readJson<{ roomId: string; studentId: string }>);

          setRemoveMemberTarget(null);
          await refresh(selectedRoomId);
          toast.success("조원을 대기열로 이동시켰습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "조원을 강제 퇴장시키지 못했습니다.",
          );
        }
      })();
    });
  }, [headers, refresh, removeMemberTarget, selectedRoomId]);

  const confirmDissolveSelectedRoom = useCallback(() => {
    if (!selectedRoomId) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/admin/rooms/${selectedRoomId}`, {
            method: "DELETE",
            headers,
          }).then(readJson<{ dissolved: boolean }>);

          setDissolveConfirmOpen(false);
          await refresh();
          toast.success("조 방을 해산했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "조 방을 해산하지 못했습니다.",
          );
        }
      })();
    });
  }, [headers, refresh, selectedRoomId]);

  const announceRoom = useCallback(() => {
    if (!selectedRoomId) {
      toast.error("먼저 조 방을 선택해 주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/admin/rooms/${selectedRoomId}/announce`, {
            method: "POST",
            headers,
            body: JSON.stringify({ message: roomNotice }),
          }).then(readJson<{ roomId: string; messageId: string }>);

          setRoomNotice("");
          await refresh(selectedRoomId);
          toast.success("방 공지를 전송했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "방 공지를 전송하지 못했습니다.",
          );
        }
      })();
    });
  }, [headers, refresh, roomNotice, selectedRoomId]);

  const announceAll = useCallback(() => {
    if (!sessionId) {
      toast.error("먼저 세션을 선택해 주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch("/api/admin/rooms/announce-all", {
            method: "POST",
            headers,
            body: JSON.stringify({
              sessionId,
              message: allNotice,
            }),
          }).then(readJson<{ roomCount: number }>);

          setAllNotice("");
          await refresh(selectedRoomId || undefined);
          toast.success("세션 전체 공지를 전송했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "전체 공지를 전송하지 못했습니다.",
          );
        }
      })();
    });
  }, [allNotice, headers, refresh, selectedRoomId, sessionId]);

  return (
    <>
      <SectionCard
        title="조 방 운영"
        description="관리자 페이지에서 조 방 상태, 조장, 추가 요청, 대기자 배정, 공지와 댓글 기록을 한 화면에서 관리합니다. 학생 `/room` 화면은 여기 변경과 공지를 그대로 반영합니다."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isReadOnly ? "neutral" : "success"}>
              {isReadOnly ? "읽기 전용" : "운영 가능"}
            </Badge>
            <Badge tone="info">방 {rooms.length}</Badge>
            <Badge tone="warning">대기 {waiting.length}</Badge>
            <button
              type="button"
              onClick={handleRefreshPanel}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              새로고침
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
            <select
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">세션 선택</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-2">
              {(Object.keys(FILTER_LABELS) as RoomFilter[]).map((filter) => {
                const active = roomFilter === filter;
                const count = roomCounts[filter];

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setRoomFilter(filter)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-slate-950 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {FILTER_LABELS[filter]} {count}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedSession ? (
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">
                  {TRACKS[selectedSession.track].label}
                </Badge>
                <Badge tone={selectedSession.status === "active" ? "success" : "neutral"}>
                  {selectedSession.status === "active" ? "활성 세션" : "종료 세션"}
                </Badge>
                <span className="text-sm font-semibold text-slate-900">
                  {selectedSession.name}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {selectedSession.status === "active"
                  ? "관리자 인증을 다시 확인한 상태로 방 설정 저장, 강제 퇴장, 대기자 배정, 공지 전송이 가능합니다."
                  : "종료된 세션은 조회만 가능하고, 쓰기 작업은 비활성화됩니다."}
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.06fr)_minmax(280px,0.76fr)]">
            <div className="space-y-3">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">조 방 목록</p>
                <p className="mt-1 text-sm text-slate-500">
                  추가 요청 필터와 상태 필터를 함께 볼 수 있습니다.
                </p>
              </div>

              {filteredRooms.map((room) => {
                const active = room.id === selectedRoomId;

                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`w-full rounded-[10px] border px-4 py-4 text-left transition ${
                      active
                        ? "border-slate-950 bg-slate-950 text-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]"
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">
                          {room.roomName ?? "이름 없는 조 방"}
                        </p>
                        <p
                          className={`text-xs ${
                            active ? "text-white/70" : "text-slate-500"
                          }`}
                        >
                          초대코드 {room.inviteCode} · {room.memberCount}/
                          {room.maxMembers}명
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Badge tone={getRoomStatusTone(room.status)}>
                          {getRoomStatusLabel(room.status)}
                        </Badge>
                        {room.requestExtraMembers > 0 ? (
                          <Badge tone="warning">
                            추가 요청 {room.requestExtraMembers}명
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${
                        active ? "text-white/70" : "text-slate-500"
                      }`}
                    >
                      <span>조장 {room.leaderName ?? "미지정"}</span>
                      <span>생성 {formatDateTime(room.createdAt)}</span>
                      {room.createdByAdmin ? <span>관리자 생성</span> : null}
                    </div>

                    {room.requestExtraReason ? (
                      <p
                        className={`mt-3 line-clamp-2 text-sm ${
                          active ? "text-white/85" : "text-slate-600"
                        }`}
                      >
                        요청 사유: {room.requestExtraReason}
                      </p>
                    ) : null}

                    <p
                      className={`mt-3 line-clamp-2 text-sm ${
                        active ? "text-white/95" : "text-slate-600"
                      }`}
                    >
                      {room.latestMessage
                        ? room.latestMessage.message
                        : "아직 댓글이 없습니다."}
                    </p>
                  </button>
                );
              })}

              {filteredRooms.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  조건에 맞는 조 방이 없습니다.
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-[10px] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-950">
                      {detail?.room.roomName ?? selectedRoom?.roomName ?? "조 방 선택"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {detail
                        ? `초대코드 ${detail.room.inviteCode} · 비밀번호 ${detail.room.password}`
                        : "왼쪽 목록에서 조 방을 선택하면 설정과 조원 정보를 볼 수 있습니다."}
                    </p>
                  </div>
                  {detail ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={getRoomStatusTone(detail.room.status)}>
                        {getRoomStatusLabel(detail.room.status)}
                      </Badge>
                      <Badge tone="brand">
                        최소 {detail.room.minGroupSize} / 최대 {detail.room.maxAllowedMembers}
                      </Badge>
                    </div>
                  ) : null}
                </div>

                {detail ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">방 상태</span>
                        <select
                          value={status}
                          onChange={(event) =>
                            setStatus(event.target.value as RoomStatus)
                          }
                          disabled={isReadOnly || isPending}
                          className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="recruiting">모집 중</option>
                          <option value="formed">편성 완료</option>
                          <option value="closed">종료</option>
                        </select>
                      </label>

                      <label className="space-y-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">정원</span>
                        <input
                          type="number"
                          min={2}
                          value={maxMembers}
                          onChange={(event) => setMaxMembers(event.target.value)}
                          disabled={isReadOnly || isPending}
                          className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>

                      <label className="space-y-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">조장</span>
                        <select
                          value={leaderStudentId}
                          onChange={(event) => setLeaderStudentId(event.target.value)}
                          disabled={isReadOnly || isPending}
                          className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="">조장 미지정</option>
                          {leaderCandidates.map((member) => (
                            <option key={member.studentId} value={member.studentId}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">비밀번호</span>
                        <input
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          disabled={isReadOnly || isPending}
                          className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={saveRoom}
                        disabled={isReadOnly || isPending}
                        className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        설정 저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setDissolveConfirmOpen(true)}
                        disabled={isReadOnly || isPending}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        방 해산
                      </button>
                    </div>

                    <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            추가 인원 요청
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {detail.room.requestExtraMembers > 0
                              ? `${detail.room.requestExtraMembers}명 요청`
                              : "현재 추가 요청이 없습니다."}
                          </p>
                        </div>
                        {detail.room.requestExtraMembers > 0 ? (
                          <button
                            type="button"
                            onClick={clearExtra}
                            disabled={isReadOnly || isPending}
                            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            요청 정리
                          </button>
                        ) : null}
                      </div>
                      {detail.room.requestExtraReason ? (
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {detail.room.requestExtraReason}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">조원 목록</p>
                        <Badge tone="info">
                          {detail.members.length}/{detail.room.maxMembers}명
                        </Badge>
                      </div>
                      <div className="grid gap-3">
                        {detail.members.map((member) => (
                          <div
                            key={member.id}
                            className="rounded-[10px] border border-slate-200 bg-white px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-950">
                                    {member.name}
                                  </p>
                                  <Badge tone={getMemberRoleTone(member.role)}>
                                    {getMemberRoleLabel(member.role)}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                  {member.phone} · {member.region} · {member.series}
                                  {member.score !== null ? ` · ${member.score}점` : ""}
                                </p>
                                {member.intro ? (
                                  <p className="mt-2 text-sm leading-6 text-slate-600">
                                    {member.intro}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setRemoveMemberTarget({
                                    studentId: member.studentId,
                                    name: member.name,
                                  })
                                }
                                disabled={isReadOnly || isPending}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <UserMinus className="h-4 w-4" />
                                강제 퇴장
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    선택한 조 방이 없습니다.
                  </div>
                )}
              </div>

              <div className="rounded-[10px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">방 공지 및 댓글</p>
                    <p className="mt-1 text-sm text-slate-500">
                      관리자가 보낸 공지는 학생 방 화면 댓글 목록에 시스템 공지로 노출됩니다.
                    </p>
                  </div>
                  <Badge tone="neutral">최근 50개</Badge>
                </div>

                <div className="mt-4 space-y-3">
                  <textarea
                    value={roomNotice}
                    onChange={(event) => setRoomNotice(event.target.value)}
                    disabled={!selectedRoomId || isReadOnly || isPending}
                    rows={3}
                    className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700"
                    placeholder="선택한 방에 보낼 공지를 입력하세요."
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={announceRoom}
                      disabled={!selectedRoomId || isReadOnly || isPending}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Megaphone className="h-4 w-4" />
                      )}
                      방 공지 전송
                    </button>
                  </div>
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-5 text-slate-500">
                    댓글 기록은 실시간으로 자동 갱신되지 않습니다. 운영 변경 이후에는
                    상단 `새로고침` 버튼으로 최신 댓글과 공지를 확인하세요.
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {messagePageInfo.hasMore ? (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => void loadOlderMessages()}
                        disabled={isLoadingOlderMessages}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLoadingOlderMessages ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : null}
                        이전 댓글 더 보기
                      </button>
                    </div>
                  ) : null}
                  {messages.map((message) => (
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
                  {messages.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                      표시할 댓글 기록이 없습니다.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[10px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">대기자 배정</p>
                    <p className="mt-1 text-sm text-slate-500">
                      현재 선택한 조 방에 수동 배정합니다.
                    </p>
                  </div>
                  <Badge tone="warning">{waiting.length}명</Badge>
                </div>

                <div className="mt-4 grid gap-3">
                  {waiting.map((student) => (
                    <div
                      key={student.id}
                      className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-950">
                              {student.name}
                            </p>
                            <Badge tone="neutral">{student.gender}</Badge>
                            <Badge tone="brand">{student.series}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {student.phone} · {student.region}
                            {student.score !== null ? ` · ${student.score}점` : ""}
                          </p>
                          <p className="mt-2 text-xs text-slate-400">
                            대기 등록 {formatDateTime(student.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => assignWaiting(student.id)}
                          disabled={!selectedRoomId || isReadOnly || isPending}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <UserPlus2 className="h-4 w-4" />
                          배정
                        </button>
                      </div>
                    </div>
                  ))}
                  {waiting.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                      대기자가 없습니다.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[10px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">세션 전체 공지</p>
                    <p className="mt-1 text-sm text-slate-500">
                      종료되지 않은 모든 조 방에 같은 공지를 보냅니다.
                    </p>
                  </div>
                  <Badge tone="info">
                    {rooms.filter((room) => room.status !== "closed").length}개 방
                  </Badge>
                </div>

                <div className="mt-4 space-y-3">
                  <textarea
                    value={allNotice}
                    onChange={(event) => setAllNotice(event.target.value)}
                    disabled={!sessionId || isReadOnly || isPending}
                    rows={4}
                    className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700"
                    placeholder="현재 세션의 모든 조 방에 보낼 공지를 입력하세요."
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={announceAll}
                      disabled={!sessionId || isReadOnly || isPending}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Megaphone className="h-4 w-4" />
                      )}
                      전체 공지 전송
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={Boolean(removeMemberTarget)}
        title="조원을 강제 퇴장시키시겠습니까?"
        description={
          removeMemberTarget
            ? `${removeMemberTarget.name}님은 대기열로 이동되고, 필요하면 다른 조로 다시 배정할 수 있습니다.`
            : ""
        }
        confirmText="강제 퇴장"
        tone="danger"
        isPending={isPending}
        onCancel={() => setRemoveMemberTarget(null)}
        onConfirm={confirmRemoveMember}
      />

      <ConfirmDialog
        open={dissolveConfirmOpen}
        title="이 조 방을 해산하시겠습니까?"
        description={
          detail
            ? `${detail.room.roomName ?? "선택한 조 방"}의 조원은 모두 대기열로 이동합니다. 학생 방 화면에서도 즉시 반영됩니다.`
            : ""
        }
        confirmText="방 해산"
        tone="danger"
        isPending={isPending}
        onCancel={() => setDissolveConfirmOpen(false)}
        onConfirm={confirmDissolveSelectedRoom}
      />
    </>
  );
}
