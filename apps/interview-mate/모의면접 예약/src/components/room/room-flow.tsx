"use client";

import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Check,
  Copy,
  Crown,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  Phone,
  Plus,
  Save,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { KakaoGuide } from "@/components/kakao-guide";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/ui/section-card";
import { TRACKS } from "@/lib/constants";
import type { RoomMessageSummary, RoomMemberSummary } from "@/lib/room-service";
import type { StudyPollSummary } from "@/lib/study-polls";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type RoomFlowProps = {
  token: string;
  roomId: string;
};

type ViewerRole = "creator" | "leader" | "member";

type RoomPayload = {
  room: {
    id: string;
    sessionId: string;
    track: "police" | "fire";
    applyWindowStatus: "before_open" | "open" | "after_close";
    viewerStudentId: string;
    roomName: string | null;
    inviteCode: string;
    status: "recruiting" | "formed" | "closed";
    maxMembers: number;
    requestExtraMembers: number;
    requestExtraReason: string | null;
  };
  members: RoomMemberSummary[];
  messages: RoomMessageSummary[];
  messagePageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
  };
  viewerRole: ViewerRole;
};

type LeaderTransferPayload = {
  leaderStudentId: string;
  leaderName: string;
  viewerRole: ViewerRole;
};

type PollCreatePayload = {
  pollId: string;
};

type InviteDetailsPayload = {
  invite: {
    roomId: string;
    roomName: string | null;
    inviteCode: string;
    password: string;
  };
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

function getRoleLabel(role: RoomMemberSummary["role"]) {
  if (role === "creator") {
    return "방장";
  }

  if (role === "leader") {
    return "조장";
  }

  return "조원";
}

function getRoleTone(role: RoomMemberSummary["role"]) {
  if (role === "creator") {
    return "brand" as const;
  }

  if (role === "leader") {
    return "info" as const;
  }

  return "neutral" as const;
}

function mergeMessageLists(
  olderMessages: RoomMessageSummary[],
  currentMessages: RoomMessageSummary[],
) {
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

export function RoomFlow({ token, roomId }: RoomFlowProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<RoomPayload | null>(null);
  const [inviteDetails, setInviteDetails] =
    useState<InviteDetailsPayload["invite"] | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [requestExtraMembers, setRequestExtraMembers] = useState("0");
  const [requestExtraReason, setRequestExtraReason] = useState("");
  const [nextLeaderStudentId, setNextLeaderStudentId] = useState("");
  const [profileIntro, setProfileIntro] = useState("");
  const [profileShowPhone, setProfileShowPhone] = useState(false);
  const [polls, setPolls] = useState<StudyPollSummary[]>([]);
  const [pollTitle, setPollTitle] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [voteDrafts, setVoteDrafts] = useState<Record<string, string[]>>({});
  const [pageOrigin, setPageOrigin] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaderConfirmOpen, setLeaderConfirmOpen] = useState(false);
  const [closePollId, setClosePollId] = useState<string | null>(null);
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const loadRoom = useCallback(
    async (withLoading = false) => {
      if (!token || !roomId) {
        setDetail(null);
        setIsLoading(false);
        return null;
      }

      if (withLoading) {
        setIsLoading(true);
      }

      try {
        const payload = await fetch(`/api/rooms/${roomId}`, {
          headers: {
            "x-access-token": token,
          },
        }).then(readJson<RoomPayload>);

        setDetail(payload);
        setRequestExtraMembers(String(payload.room.requestExtraMembers));
        setRequestExtraReason(payload.room.requestExtraReason ?? "");
        return payload;
      } finally {
        if (withLoading) {
          setIsLoading(false);
        }
      }
    },
    [roomId, token],
  );

  const loadPolls = useCallback(async () => {
    if (!token || !roomId) {
      setPolls([]);
      return [];
    }

    const payload = await fetch(`/api/rooms/${roomId}/polls`, {
      headers: {
        "x-access-token": token,
      },
    }).then(readJson<{ polls: StudyPollSummary[] }>);

    setPolls(payload.polls);
    return payload.polls;
  }, [roomId, token]);

  const loadInviteDetails = useCallback(async () => {
    if (!token || !roomId) {
      setInviteDetails(null);
      return null;
    }

    const payload = await fetch(`/api/rooms/${roomId}/invite`, {
      headers: {
        "x-access-token": token,
      },
    }).then(readJson<InviteDetailsPayload>);

    setInviteDetails(payload.invite);
    return payload.invite;
  }, [roomId, token]);

  useEffect(() => {
    void loadRoom(true).catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "조 방 정보를 불러오지 못했습니다.",
      );
      setIsLoading(false);
    });
  }, [loadRoom]);

  useEffect(() => {
    void loadPolls().catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "투표 목록을 불러오지 못했습니다.",
      );
    });
  }, [loadPolls]);

  useEffect(() => {
    void loadInviteDetails().catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "초대 정보를 불러오지 못했습니다.",
      );
    });
  }, [loadInviteDetails]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setPageOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!supabase || !roomId || !token) {
      return;
    }

    const channel = supabase
      .channel(`room-chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void loadRoom(false).catch(() => undefined);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRoom, roomId, supabase, token]);

  const leaderTransferCandidates = useMemo(
    () => (detail?.members ?? []).filter((member) => member.role === "member"),
    [detail?.members],
  );

  useEffect(() => {
    setNextLeaderStudentId((current) =>
      leaderTransferCandidates.some((member) => member.studentId === current)
        ? current
        : leaderTransferCandidates[0]?.studentId ?? "",
    );
  }, [leaderTransferCandidates]);

  const selectedLeaderCandidate =
    leaderTransferCandidates.find(
      (member) => member.studentId === nextLeaderStudentId,
    ) ?? null;
  const viewerMember =
    detail?.members.find(
      (member) => member.studentId === detail.room.viewerStudentId,
    ) ?? null;

  useEffect(() => {
    setProfileIntro(viewerMember?.intro ?? "");
    setProfileShowPhone(Boolean(viewerMember?.showPhone));
  }, [viewerMember?.intro, viewerMember?.showPhone]);

  useEffect(() => {
    setVoteDrafts(
      polls.reduce<Record<string, string[]>>((accumulator, poll) => {
        accumulator[poll.id] = poll.selectedOptionIds;
        return accumulator;
      }, {}),
    );
  }, [polls]);

  const track = detail ? TRACKS[detail.room.track] : TRACKS.police;
  const isRoomClosed = detail?.room.status === "closed";
  const isApplyClosed = detail?.room.applyWindowStatus === "after_close";
  const canMutateRoomData = !isRoomClosed && !isApplyClosed;
  const canManageRoom =
    detail?.viewerRole === "creator" || detail?.viewerRole === "leader";
  const canManageMutableRoomData = canManageRoom && canMutateRoomData;
  const canTransferLeader =
    canManageMutableRoomData && leaderTransferCandidates.length > 0;
  const requiresLeaderTransferBeforeLeave =
    detail?.viewerRole === "leader" && leaderTransferCandidates.length > 0;
  const canLeaveRoom = !isApplyClosed && !isRoomClosed;
  const canSendMessage = !isRoomClosed;

  const refreshRoom = async () => {
    await loadRoom(false);
  };

  const refreshAll = async () => {
    await Promise.all([loadRoom(false), loadPolls(), loadInviteDetails()]);
  };

  const inviteLink = pageOrigin
    ? `${pageOrigin}/join/${detail?.room.inviteCode ?? inviteDetails?.inviteCode ?? ""}`
    : "";

  const copyInviteValue = async (label: string, value: string) => {
    if (!value) {
      toast.error(`${label} 정보가 없습니다.`);
      return;
    }

    try {
      if (!navigator.clipboard) {
        throw new Error("clipboard_unavailable");
      }

      await navigator.clipboard.writeText(value);
      toast.success(`${label}를 복사했습니다.`);
    } catch {
      toast.error(`${label}를 복사하지 못했습니다.`);
    }
  };

  const handleSendMessage = () => {
    if (!token || !roomId || !messageInput.trim() || !canSendMessage) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch(`/api/rooms/${roomId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-access-token": token,
            },
            body: JSON.stringify({
              message: messageInput.trim(),
            }),
          }).then(readJson<{ message: RoomMessageSummary }>);

          setDetail((current) =>
            current
              ? {
                  ...current,
                  messages: [...current.messages, payload.message],
                }
              : current,
          );
          setMessageInput("");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "메시지를 전송하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleLoadOlderMessages = async () => {
    const nextCursor = detail?.messagePageInfo.nextCursor;

    if (
      !token ||
      !roomId ||
      !detail?.messagePageInfo.hasMore ||
      !nextCursor ||
      isLoadingOlderMessages
    ) {
      return;
    }

    setIsLoadingOlderMessages(true);

    try {
      const payload = await fetch(
        `/api/rooms/${roomId}/messages?limit=50&before=${encodeURIComponent(nextCursor)}`,
        {
          headers: {
            "x-access-token": token,
          },
        },
      ).then(
        readJson<{
          messages: RoomMessageSummary[];
          pageInfo: {
            hasMore: boolean;
            nextCursor: string | null;
          };
        }>,
      );

      setDetail((current) =>
        current
          ? {
              ...current,
              messages: mergeMessageLists(payload.messages, current.messages),
              messagePageInfo: payload.pageInfo,
            }
          : current,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "이전 채팅을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingOlderMessages(false);
    }
  };

  const handleSaveExtraRequest = () => {
    if (!token || !roomId || !canManageMutableRoomData) {
      return;
    }

    const parsedRequestedMembers = Number.parseInt(requestExtraMembers, 10);

    startTransition(() => {
      void (async () => {
        try {
          const normalizedRequestedMembers = Number.isNaN(parsedRequestedMembers)
            ? -1
            : parsedRequestedMembers;
          const payload = await fetch(`/api/rooms/${roomId}/request-members`, {
            method: normalizedRequestedMembers > 0 ? "POST" : "DELETE",
            headers:
              normalizedRequestedMembers > 0
                ? {
                    "Content-Type": "application/json; charset=utf-8",
                    "x-access-token": token,
                  }
                : {
                    "x-access-token": token,
                  },
            body:
              normalizedRequestedMembers > 0
                ? JSON.stringify({
                    requestedMembers: normalizedRequestedMembers,
                    reason: requestExtraReason,
                  })
                : undefined,
          }).then(
            readJson<{
              requestExtraMembers: number;
              requestExtraReason: string | null;
            }>,
          );

          setRequestExtraMembers(String(payload.requestExtraMembers));
          setRequestExtraReason(payload.requestExtraReason ?? "");
          await refreshRoom();
          toast.success(
            payload.requestExtraMembers > 0
              ? "추가 인원 요청을 저장했습니다."
              : "추가 인원 요청을 취소했습니다.",
          );
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "추가 인원 요청을 처리하지 못했습니다.",
          );
        }
      })();
    });
  };

  const openLeaveConfirm = () => {
    if (!canLeaveRoom) {
      toast.error(
        isApplyClosed
          ? "지원 마감 후에는 조 탈퇴를 할 수 없습니다."
          : "종료된 조 방에서는 탈퇴를 진행할 수 없습니다.",
      );
      return;
    }

    if (requiresLeaderTransferBeforeLeave) {
      toast.error("조장은 다른 조원에게 조장을 위임한 뒤 탈퇴할 수 있습니다.");
      return;
    }

    setLeaveConfirmOpen(true);
  };

  const handleLeaveRoom = () => {
    if (!token || !roomId || !canLeaveRoom) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/rooms/${roomId}/leave`, {
            method: "POST",
            headers: {
              "x-access-token": token,
            },
          }).then(readJson<{ roomId: string; movedToWaitingPool: boolean }>);

          toast.success("조 방을 나가고 대기자 목록으로 이동했습니다.");
          router.push(`/status?token=${token}`);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "조 탈퇴를 처리하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleTransferLeader = () => {
    if (!token || !roomId || !selectedLeaderCandidate || !canMutateRoomData) {
      toast.error("위임할 조원을 먼저 선택해 주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch(`/api/rooms/${roomId}/leader`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-access-token": token,
            },
            body: JSON.stringify({
              leaderStudentId: selectedLeaderCandidate.studentId,
            }),
          }).then(readJson<LeaderTransferPayload>);

          setLeaderConfirmOpen(false);
          await refreshRoom();
          setDetail((current) =>
            current
              ? {
                  ...current,
                  viewerRole: payload.viewerRole,
                }
              : current,
          );
          toast.success(`${payload.leaderName} 님에게 조장을 위임했습니다.`);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "조장 위임을 처리하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleSaveProfile = () => {
    if (!token || !canMutateRoomData) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch("/api/students/profile", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-access-token": token,
            },
            body: JSON.stringify({
              intro: profileIntro,
              showPhone: profileShowPhone,
            }),
          }).then(readJson<{ profile: { studentId: string } }>);

          await refreshRoom();
          toast.success("내 프로필을 저장했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "내 프로필을 저장하지 못했습니다.",
          );
        }
      })();
    });
  };

  const updatePollOption = (index: number, value: string) => {
    if (!canManageMutableRoomData) {
      return;
    }

    setPollOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      ),
    );
  };

  const addPollOption = () => {
    if (!canManageMutableRoomData) {
      return;
    }

    setPollOptions((current) =>
      current.length >= 8 ? current : [...current, ""],
    );
  };

  const removePollOption = (index: number) => {
    if (!canManageMutableRoomData) {
      return;
    }

    setPollOptions((current) =>
      current.length <= 2
        ? current
        : current.filter((_, optionIndex) => optionIndex !== index),
    );
  };

  const handleCreatePoll = () => {
    if (!token || !roomId || !canManageMutableRoomData) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/rooms/${roomId}/polls`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-access-token": token,
            },
            body: JSON.stringify({
              title: pollTitle,
              options: pollOptions,
            }),
          }).then(readJson<PollCreatePayload>);

          setPollTitle("");
          setPollOptions(["", ""]);
          await refreshAll();
          toast.success("스터디 일정 투표를 만들었습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "스터디 일정 투표를 만들지 못했습니다.",
          );
        }
      })();
    });
  };

  const toggleVoteDraft = (pollId: string, optionId: string) => {
    if (!canMutateRoomData) {
      return;
    }

    setVoteDrafts((current) => {
      const selected = current[pollId] ?? [];
      const nextSelected = selected.includes(optionId)
        ? selected.filter((item) => item !== optionId)
        : [...selected, optionId];

      return {
        ...current,
        [pollId]: nextSelected,
      };
    });
  };

  const handleVotePoll = (pollId: string) => {
    if (!token || !roomId || !canMutateRoomData) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/rooms/${roomId}/polls/${pollId}/vote`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-access-token": token,
            },
            body: JSON.stringify({
              selectedOptionIds: voteDrafts[pollId] ?? [],
            }),
          }).then(
            readJson<{
              pollId: string;
            }>,
          );

          await loadPolls();
          toast.success("투표를 저장했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "투표를 저장하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleClosePoll = () => {
    if (!token || !roomId || !closePollId || !canManageMutableRoomData) {
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/rooms/${roomId}/polls/${closePollId}`, {
            method: "PATCH",
            headers: {
              "x-access-token": token,
            },
          }).then(
            readJson<{
              pollId: string;
            }>,
          );

          setClosePollId(null);
          await refreshAll();
          toast.success("투표를 마감했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "투표를 마감하지 못했습니다.",
          );
        }
      })();
    });
  };

  if (!token || !roomId) {
    return (
      <main className="student-container space-y-5">
        <SectionCard
          title="조 방"
          description="조 방 접속에 필요한 정보가 부족합니다."
        >
          <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            토큰 또는 방 정보가 없습니다. 올바른 링크로 다시 접속해 주세요.
          </div>
        </SectionCard>
      </main>
    );
  }

  return (
    <main
      className="student-container space-y-5"
      style={
        {
          "--division-color": track.color,
          "--division-color-light": track.lightColor,
          "--division-color-dark": track.darkColor,
        } as CSSProperties
      }
    >
      <SectionCard
        title="스터디 일정 투표"
        description="조원들이 가능한 시간대를 선택하고, 방장 또는 조장이 투표를 마감할 수 있습니다."
        action={
          <Badge tone={polls.length > 0 ? "brand" : "neutral"}>
            투표 {polls.length}개
          </Badge>
        }
      >
        <div className="space-y-4">
          {canManageRoom ? (
            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="space-y-3">
                <input
                  value={pollTitle}
                  onChange={(event) => setPollTitle(event.target.value)}
                  maxLength={80}
                  disabled={!canManageMutableRoomData}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  placeholder="투표 제목을 입력해 주세요."
                />
                <div className="space-y-2">
                  {pollOptions.map((option, index) => (
                    <div
                      key={`poll-option-${index}`}
                      className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <input
                        value={option}
                        onChange={(event) =>
                          updatePollOption(index, event.target.value)
                        }
                        disabled={!canManageMutableRoomData}
                        className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm"
                        placeholder={`옵션 ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removePollOption(index)}
                        disabled={
                          pollOptions.length <= 2 || !canManageMutableRoomData
                        }
                        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        옵션 삭제
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={addPollOption}
                    disabled={pollOptions.length >= 8 || !canManageMutableRoomData}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    옵션 추가
                  </button>
                  <button
                    type="button"
                    onClick={handleCreatePoll}
                    disabled={isPending || !canManageMutableRoomData}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    투표 만들기
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {polls.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              아직 생성된 스터디 일정 투표가 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {polls.map((poll) => (
                <div
                  key={poll.id}
                  className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {poll.title}
                        </p>
                        <Badge tone={poll.isClosed ? "neutral" : "info"}>
                          {poll.isClosed ? "마감" : "진행 중"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {poll.createdByName} · {formatDateTime(poll.createdAt)}
                      </p>
                    </div>
                    {poll.canManage && !poll.isClosed ? (
                      <button
                        type="button"
                        onClick={() => setClosePollId(poll.id)}
                        disabled={isPending || !canManageMutableRoomData}
                        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        투표 마감
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-2">
                    {poll.options.map((option) => {
                      const selected = (voteDrafts[poll.id] ?? []).includes(
                        option.id,
                      );

                      return (
                        <label
                          key={option.id}
                          className={`flex items-start gap-3 rounded-[12px] border px-3 py-3 ${
                            selected
                              ? "border-[var(--division-color)] bg-[var(--division-color-light)]/40"
                              : "border-slate-200 bg-slate-50"
                          } ${
                            poll.isClosed || !canMutateRoomData
                              ? "cursor-default"
                              : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleVoteDraft(poll.id, option.id)}
                            disabled={
                              poll.isClosed || isPending || !canMutateRoomData
                            }
                            className="sr-only"
                          />
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? "border-[var(--division-color)] bg-[var(--division-color)] text-white"
                                : "border-slate-300 bg-white text-transparent"
                            }`}
                          >
                            <Check className="h-3 w-3" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800">
                              {option.label}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              {option.voteCount}명 선택
                              {option.voterNames.length > 0
                                ? ` · ${option.voterNames.join(", ")}`
                                : ""}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {!poll.isClosed ? (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleVotePoll(poll.id)}
                        disabled={isPending || !canMutateRoomData}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        투표 저장
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title={detail?.room.roomName ?? "조 방"}
        description="조원 목록, 공지, 채팅을 이 화면에서 바로 확인할 수 있습니다."
        action={
          <div className="flex items-center gap-2">
            <Badge tone={detail?.room.status === "closed" ? "neutral" : "info"}>
              {detail?.room.status ?? "loading"}
            </Badge>
            <button
              type="button"
              onClick={openLeaveConfirm}
                disabled={isLoading || isPending || !canLeaveRoom}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              조 탈퇴
            </button>
          </div>
        }
      >
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          {isLoading
            ? "조 방 정보를 불러오는 중입니다."
            : `초대코드 ${detail?.room.inviteCode ?? "-"} 쨌 현재 ${detail?.members.length ?? 0}/${detail?.room.maxMembers ?? 0}명`}
          {!isLoading && detail?.room.requestExtraMembers ? (
            <p className="mt-3 text-xs text-[var(--division-color-dark)]">
              추가 인원 요청 {detail.room.requestExtraMembers}명
              {detail.room.requestExtraReason
                ? ` 쨌 ${detail.room.requestExtraReason}`
                : ""}
            </p>
          ) : null}
          {!isLoading && isApplyClosed && !isRoomClosed ? (
            <p className="mt-3 text-xs text-amber-700">
              지원 마감 후에는 채팅만 가능합니다.
            </p>
          ) : null}
          {requiresLeaderTransferBeforeLeave ? (
            <p className="mt-3 text-xs text-amber-700">
              현재 조장은 위임 가능한 조원이 남아 있어 먼저 조장을 넘긴 뒤 탈퇴해야 합니다.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="초대 정보"
        description="조원에게 보낼 초대 링크와 비밀번호를 바로 복사할 수 있습니다."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold text-slate-500">초대 코드</p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">
              {inviteDetails?.inviteCode ?? detail?.room.inviteCode ?? "-"}
            </p>
            <button
              type="button"
              onClick={() =>
                void copyInviteValue(
                  "초대 코드",
                  inviteDetails?.inviteCode ?? detail?.room.inviteCode ?? "",
                )
              }
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              <Copy className="h-3.5 w-3.5" />
              코드 복사
            </button>
          </div>
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold text-slate-500">방 비밀번호</p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">
              {inviteDetails?.password ?? "-"}
            </p>
            <button
              type="button"
              onClick={() =>
                void copyInviteValue("방 비밀번호", inviteDetails?.password ?? "")
              }
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              <Copy className="h-3.5 w-3.5" />
              비밀번호 복사
            </button>
          </div>
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold text-slate-500">초대 링크</p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">
              {inviteLink || "-"}
            </p>
            <button
              type="button"
              onClick={() => void copyInviteValue("초대 링크", inviteLink)}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              <Copy className="h-3.5 w-3.5" />
              링크 복사
            </button>
          </div>
        </div>
      </SectionCard>

      <KakaoGuide />

      <SectionCard
        title="조원 목록"
        description="방장, 조장, 조원 역할과 간단한 소개를 한 번에 확인할 수 있습니다."
      >
        <div className="space-y-3">
          {(detail?.members ?? []).map((member) => (
            <div
              key={member.id}
              className="flex items-start justify-between rounded-[10px] border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--division-color-light)] text-[var(--division-color)]">
                  {member.role === "creator" || member.role === "leader" ? (
                    <Crown className="h-5 w-5" />
                  ) : (
                    <UsersRound className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {member.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {member.region} 쨌 {member.series} 쨌 필기 {member.score ?? "-"}
                  </p>
                  {member.intro ? (
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {member.intro}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {member.showPhone ||
                    member.studentId === detail?.room.viewerStudentId ? (
                      <a
                        href={`tel:${member.phone.replaceAll("-", "")}`}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600"
                      >
                        <Phone className="h-3 w-3" />
                        {member.phone}
                      </a>
                    ) : (
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
                        연락처 비공개
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Badge tone={getRoleTone(member.role)}>{getRoleLabel(member.role)}</Badge>
            </div>
          ))}
          {!isLoading && (detail?.members.length ?? 0) === 0 ? (
            <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              아직 조원이 없습니다. 초대 링크를 공유해 보세요.
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="내 프로필"
        description="조원 목록에 보일 자기소개와 연락처 공개 여부를 설정합니다."
      >
        <div className="space-y-3">
          <textarea
            value={profileIntro}
            onChange={(event) => setProfileIntro(event.target.value)}
            maxLength={100}
            disabled={!canMutateRoomData}
            className="min-h-[104px] w-full rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-sm"
            placeholder="예: 대전 일반 직렬입니다. 평일 저녁 스터디 가능합니다."
          />
          <label className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <input
                type="checkbox"
                checked={profileShowPhone}
                onChange={(event) => setProfileShowPhone(event.target.checked)}
                disabled={!canMutateRoomData}
                className="h-4 w-4 rounded border-slate-300"
            />
            조원에게 연락처를 공개합니다.
          </label>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>자기소개는 최대 100자까지 입력할 수 있습니다.</span>
            <span>{profileIntro.length}/100</span>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isPending || !canMutateRoomData}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              내 프로필 저장
            </button>
          </div>
        </div>
      </SectionCard>

      {canManageRoom ? (
        <SectionCard
          title="조장 위임"
          description="방장 또는 조장은 다른 조원에게 조장을 넘길 수 있습니다."
          action={
            <Badge tone={canTransferLeader ? "brand" : "neutral"}>
              {canTransferLeader ? "위임 가능" : "위임 대상 없음"}
            </Badge>
          }
        >
          <div className="space-y-3">
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              조장을 바꾸면 기존 조장은 일반 조원으로 전환됩니다. 방장은 그대로 유지됩니다.
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={nextLeaderStudentId}
                onChange={(event) => setNextLeaderStudentId(event.target.value)}
                disabled={!canTransferLeader}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                <option value="">위임할 조원 선택</option>
                {leaderTransferCandidates.map((member) => (
                  <option key={member.studentId} value={member.studentId}>
                    {member.name} 쨌 {member.region}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setLeaderConfirmOpen(true)}
                disabled={isPending || !selectedLeaderCandidate || !canTransferLeader}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4" />
                )}
                조장 위임
              </button>
            </div>
            {!canTransferLeader ? (
              <p className="text-xs text-slate-500">
                현재 위임 가능한 일반 조원이 없습니다. 마지막 조장 상태라면 바로 탈퇴할 수 있습니다.
              </p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {canManageRoom || detail?.room.requestExtraMembers ? (
        <SectionCard
          title="추가 인원 요청"
          description="방장 또는 조장은 관리자에게 추가 인원 배정을 요청할 수 있습니다."
          action={
            <Badge
              tone={
                detail?.room.requestExtraMembers
                  ? "warning"
                  : canManageRoom
                    ? "brand"
                    : "neutral"
              }
            >
              {detail?.room.requestExtraMembers
                ? `요청 ${detail.room.requestExtraMembers}명`
                : "요청 없음"}
            </Badge>
          }
        >
          <div className="space-y-3">
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              현재 정원 {detail?.room.maxMembers ?? 0}명 기준으로 부족한 인원을 요청할 수 있습니다.
              관리자가 확인하면 대기자를 배정하거나 정원을 조정합니다.
            </div>
            {canManageRoom ? (
              <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_auto]">
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={requestExtraMembers}
                  onChange={(event) => setRequestExtraMembers(event.target.value)}
                  disabled={!canManageMutableRoomData}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="0"
                />
                <input
                  value={requestExtraReason}
                  onChange={(event) => setRequestExtraReason(event.target.value)}
                  disabled={!canManageMutableRoomData}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="예: 여성 조원 1명 추가 필요"
                />
                <button
                  type="button"
                  onClick={handleSaveExtraRequest}
                  disabled={isPending || !canManageMutableRoomData}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    "요청 저장"
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="채팅"
        description="조 방 공지와 대화를 이 화면에서 바로 확인할 수 있습니다."
      >
        <div className="space-y-3">
          {detail?.messagePageInfo.hasMore ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void handleLoadOlderMessages()}
                disabled={isLoadingOlderMessages}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingOlderMessages ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                이전 메시지 더 보기
              </button>
            </div>
          ) : null}
          {(detail?.messages ?? []).map((message) =>
            message.isSystem ? (
              <div
                key={message.id}
                className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500"
              >
                시스템 쨌 {message.message}
              </div>
            ) : (
              <div
                key={message.id}
                className="rounded-[10px] border border-slate-200 bg-white px-4 py-3"
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
            ),
          )}

          <div className="flex gap-3">
            <input
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              disabled={!canSendMessage}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  handleSendMessage();
                }
              }}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="메시지를 입력해 주세요."
            />
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={isPending || !messageInput.trim() || !canSendMessage}
              className="inline-flex items-center justify-center rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquareText className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={leaveConfirmOpen}
        title="조를 탈퇴하시겠습니까?"
        description="탈퇴하면 대기자 목록으로 이동하고, 관리자가 다른 조에 다시 배정할 수 있습니다."
        confirmText="탈퇴"
        tone="danger"
        isPending={isPending}
        confirmDisabled={!canLeaveRoom}
        onCancel={() => setLeaveConfirmOpen(false)}
        onConfirm={handleLeaveRoom}
      />

      <ConfirmDialog
        open={leaderConfirmOpen}
        title="조장을 위임하시겠습니까?"
        description={
          selectedLeaderCandidate
            ? `${selectedLeaderCandidate.name} 님에게 조장을 넘깁니다. 기존 조장은 일반 조원으로 바뀝니다.`
            : "위임할 조원을 먼저 선택해 주세요."
        }
        confirmText="위임 확인"
        isPending={isPending}
        confirmDisabled={!selectedLeaderCandidate || !canTransferLeader}
        onCancel={() => setLeaderConfirmOpen(false)}
        onConfirm={handleTransferLeader}
      />

      <ConfirmDialog
        open={Boolean(closePollId)}
        title="투표를 마감하시겠습니까?"
        description="마감 후에는 추가 투표나 변경이 불가능합니다."
        confirmText="투표 마감"
        isPending={isPending}
        confirmDisabled={!closePollId || !canManageMutableRoomData}
        onCancel={() => setClosePollId(null)}
        onConfirm={handleClosePoll}
      />
    </main>
  );
}
