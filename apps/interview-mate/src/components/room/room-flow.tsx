"use client";

import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  Copy,
  Crown,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  Save,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/ui/section-card";
import { TRACKS } from "@/lib/constants";
import type { RoomMessageSummary, RoomMemberSummary } from "@/lib/room-service";
import type { StudyPollSummary } from "@/lib/study-polls";
import {
  loadStudentSession,
  saveStudentSession,
  clearStudentSession,
} from "@/hooks/use-student-session";

type RoomFlowProps = {
  token: string;
  roomId: string;
  restoreFromStorage?: boolean;
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

type MenuSection = "members" | "invite" | "profile" | "polls" | "extra" | "leader" | null;

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
  if (role === "creator") return "방장";
  if (role === "leader") return "조장";
  return "조원";
}

function getRoleTone(role: RoomMemberSummary["role"]) {
  if (role === "creator") return "brand" as const;
  if (role === "leader") return "info" as const;
  return "neutral" as const;
}

function mergeMessageLists(
  olderMessages: RoomMessageSummary[],
  currentMessages: RoomMessageSummary[],
) {
  const nextMessages = [...olderMessages];
  const seen = new Set(olderMessages.map((message) => message.id));
  for (const message of currentMessages) {
    if (seen.has(message.id)) continue;
    nextMessages.push(message);
    seen.add(message.id);
  }
  return nextMessages;
}

export function RoomFlow({ token: initialToken, roomId: initialRoomId, restoreFromStorage }: RoomFlowProps) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [roomId, setRoomId] = useState(initialRoomId);
  const [detail, setDetail] = useState<RoomPayload | null>(null);
  const [inviteDetails, setInviteDetails] = useState<InviteDetailsPayload["invite"] | null>(null);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MenuSection>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Restore token/roomId from localStorage if URL params are empty
  useEffect(() => {
    if (token && roomId) return;
    if (!restoreFromStorage) return;
    const stored = loadStudentSession();
    if (!stored?.token || !stored?.roomId) return;
    setToken(stored.token);
    setRoomId(stored.roomId);
  }, [token, roomId, restoreFromStorage]);

  const loadRoom = useCallback(
    async (withLoading = false) => {
      if (!token || !roomId) {
        setDetail(null);
        setIsLoading(false);
        return null;
      }
      if (withLoading) setIsLoading(true);
      try {
        const payload = await fetch(`/api/rooms/${roomId}`, {
          headers: { "x-access-token": token },
        }).then(readJson<RoomPayload>);
        setDetail(payload);
        setRequestExtraMembers(String(payload.room.requestExtraMembers));
        setRequestExtraReason(payload.room.requestExtraReason ?? "");
        return payload;
      } finally {
        if (withLoading) setIsLoading(false);
      }
    },
    [roomId, token],
  );

  const loadPolls = useCallback(async () => {
    if (!token || !roomId) { setPolls([]); return []; }
    const payload = await fetch(`/api/rooms/${roomId}/polls`, {
      headers: { "x-access-token": token },
    }).then(readJson<{ polls: StudyPollSummary[] }>);
    setPolls(payload.polls);
    return payload.polls;
  }, [roomId, token]);

  const loadInviteDetails = useCallback(async () => {
    if (!token || !roomId) { setInviteDetails(null); return null; }
    const payload = await fetch(`/api/rooms/${roomId}/invite`, {
      headers: { "x-access-token": token },
    }).then(readJson<InviteDetailsPayload>);
    setInviteDetails(payload.invite);
    return payload.invite;
  }, [roomId, token]);

  useEffect(() => {
    void loadRoom(true).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "조 방 정보를 불러오지 못했습니다.");
      setIsLoading(false);
    });
  }, [loadRoom]);

  useEffect(() => { void loadPolls().catch(() => undefined); }, [loadPolls]);
  useEffect(() => { void loadInviteDetails().catch(() => undefined); }, [loadInviteDetails]);
  useEffect(() => { if (typeof window !== "undefined") setPageOrigin(window.location.origin); }, []);

  // Save session to localStorage when room loads
  useEffect(() => {
    if (!token || !roomId || !detail) return;
    saveStudentSession({ token, roomId, track: detail.room.track });
  }, [token, roomId, detail]);

  const leaderTransferCandidates = useMemo(
    () => (detail?.members ?? []).filter((member) => member.role === "member"),
    [detail?.members],
  );

  useEffect(() => {
    setNextLeaderStudentId((current) =>
      leaderTransferCandidates.some((m) => m.studentId === current)
        ? current : leaderTransferCandidates[0]?.studentId ?? "",
    );
  }, [leaderTransferCandidates]);

  const selectedLeaderCandidate =
    leaderTransferCandidates.find((m) => m.studentId === nextLeaderStudentId) ?? null;
  const viewerMember =
    detail?.members.find((m) => m.studentId === detail.room.viewerStudentId) ?? null;

  useEffect(() => {
    setProfileIntro(viewerMember?.intro ?? "");
    setProfileShowPhone(Boolean(viewerMember?.showPhone));
  }, [viewerMember?.intro, viewerMember?.showPhone]);

  useEffect(() => {
    setVoteDrafts(
      polls.reduce<Record<string, string[]>>((acc, poll) => {
        acc[poll.id] = poll.selectedOptionIds;
        return acc;
      }, {}),
    );
  }, [polls]);

  const track = detail ? TRACKS[detail.room.track] : TRACKS.police;
  const isRoomClosed = detail?.room.status === "closed";
  const isApplyClosed = detail?.room.applyWindowStatus === "after_close";
  const canMutateRoomData = !isRoomClosed && !isApplyClosed;
  const canManageRoom = detail?.viewerRole === "creator" || detail?.viewerRole === "leader";
  const canManageMutableRoomData = canManageRoom && canMutateRoomData;
  const canTransferLeader = canManageMutableRoomData && leaderTransferCandidates.length > 0;
  const requiresLeaderTransferBeforeLeave = detail?.viewerRole === "leader" && leaderTransferCandidates.length > 0;
  const canLeaveRoom = !isApplyClosed && !isRoomClosed;
  const canSendMessage = !isRoomClosed;

  const refreshRoom = async () => { await loadRoom(false); };
  const refreshAll = async () => { await Promise.all([loadRoom(false), loadPolls(), loadInviteDetails()]); };

  const inviteLink = pageOrigin
    ? `${pageOrigin}/join/${detail?.room.inviteCode ?? inviteDetails?.inviteCode ?? ""}`
    : "";

  const copyInviteValue = async (label: string, value: string) => {
    if (!value) { toast.error(`${label} 정보가 없습니다.`); return; }
    try {
      if (!navigator.clipboard) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(value);
      toast.success(`${label}를 복사했습니다.`);
    } catch { toast.error(`${label}를 복사하지 못했습니다.`); }
  };

  // ===== Actions =====

  const handleSendMessage = () => {
    if (!token || !roomId || !messageInput.trim() || !canSendMessage) return;
    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch(`/api/rooms/${roomId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", "x-access-token": token },
            body: JSON.stringify({ message: messageInput.trim() }),
          }).then(readJson<{ message: RoomMessageSummary }>);
          setDetail((c) => c ? { ...c, messages: [...c.messages, payload.message] } : c);
          setMessageInput("");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "댓글을 등록하지 못했습니다.");
        }
      })();
    });
  };

  const handleRefreshComments = useCallback(() => {
    void loadRoom(false).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "댓글을 새로 불러오지 못했습니다.");
    });
  }, [loadRoom]);

  const handleLoadOlderMessages = async () => {
    const nextCursor = detail?.messagePageInfo.nextCursor;
    if (!token || !roomId || !detail?.messagePageInfo.hasMore || !nextCursor || isLoadingOlderMessages) return;
    setIsLoadingOlderMessages(true);
    try {
      const payload = await fetch(
        `/api/rooms/${roomId}/messages?limit=50&before=${encodeURIComponent(nextCursor)}`,
        { headers: { "x-access-token": token } },
      ).then(readJson<{ messages: RoomMessageSummary[]; pageInfo: { hasMore: boolean; nextCursor: string | null } }>);
      setDetail((c) => c ? { ...c, messages: mergeMessageLists(payload.messages, c.messages), messagePageInfo: payload.pageInfo } : c);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "이전 댓글을 불러오지 못했습니다.");
    } finally { setIsLoadingOlderMessages(false); }
  };

  const handleLeaveRoom = () => {
    if (!token || !roomId || !canLeaveRoom) return;
    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/rooms/${roomId}/leave`, {
            method: "POST",
            headers: { "x-access-token": token },
          }).then(readJson<{ roomId: string; movedToWaitingPool: boolean }>);
          clearStudentSession();
          toast.success("조 방을 나가고 대기자 목록으로 이동했습니다.");
          router.push(`/status?token=${token}`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "조 탈퇴를 처리하지 못했습니다.");
        }
      })();
    });
  };

  const openLeaveConfirm = () => {
    if (!canLeaveRoom) {
      toast.error(isApplyClosed ? "지원 마감 후에는 조 탈퇴를 할 수 없습니다." : "종료된 조 방에서는 탈퇴를 진행할 수 없습니다.");
      return;
    }
    if (requiresLeaderTransferBeforeLeave) {
      toast.error("조장은 다른 조원에게 조장을 위임한 뒤 탈퇴할 수 있습니다.");
      return;
    }
    setLeaveConfirmOpen(true);
  };

  const handleTransferLeader = () => {
    if (!token || !roomId || !selectedLeaderCandidate || !canMutateRoomData) return;
    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch(`/api/rooms/${roomId}/leader`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json; charset=utf-8", "x-access-token": token },
            body: JSON.stringify({ leaderStudentId: selectedLeaderCandidate.studentId }),
          }).then(readJson<LeaderTransferPayload>);
          setLeaderConfirmOpen(false);
          await refreshRoom();
          setDetail((c) => c ? { ...c, viewerRole: payload.viewerRole } : c);
          toast.success(`${payload.leaderName} 님에게 조장을 위임했습니다.`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "조장 위임을 처리하지 못했습니다.");
        }
      })();
    });
  };

  const handleSaveProfile = () => {
    if (!token || !canMutateRoomData) return;
    startTransition(() => {
      void (async () => {
        try {
          await fetch("/api/students/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json; charset=utf-8", "x-access-token": token },
            body: JSON.stringify({ intro: profileIntro, showPhone: profileShowPhone }),
          }).then(readJson<{ profile: { studentId: string } }>);
          await refreshRoom();
          toast.success("내 프로필을 저장했습니다.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "내 프로필을 저장하지 못했습니다.");
        }
      })();
    });
  };

  const handleSaveExtraRequest = () => {
    if (!token || !roomId || !canManageMutableRoomData) return;
    const parsed = Number.parseInt(requestExtraMembers, 10);
    startTransition(() => {
      void (async () => {
        try {
          const normalized = Number.isNaN(parsed) ? -1 : parsed;
          const payload = await fetch(`/api/rooms/${roomId}/request-members`, {
            method: normalized > 0 ? "POST" : "DELETE",
            headers: normalized > 0
              ? { "Content-Type": "application/json; charset=utf-8", "x-access-token": token }
              : { "x-access-token": token },
            body: normalized > 0 ? JSON.stringify({ requestedMembers: normalized, reason: requestExtraReason }) : undefined,
          }).then(readJson<{ requestExtraMembers: number; requestExtraReason: string | null }>);
          setRequestExtraMembers(String(payload.requestExtraMembers));
          setRequestExtraReason(payload.requestExtraReason ?? "");
          await refreshRoom();
          toast.success(payload.requestExtraMembers > 0 ? "추가 인원 요청을 저장했습니다." : "추가 인원 요청을 취소했습니다.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "추가 인원 요청을 처리하지 못했습니다.");
        }
      })();
    });
  };

  const updatePollOption = (index: number, value: string) => {
    if (!canManageMutableRoomData) return;
    setPollOptions((c) => c.map((o, i) => i === index ? value : o));
  };
  const addPollOption = () => {
    if (!canManageMutableRoomData) return;
    setPollOptions((c) => c.length >= 8 ? c : [...c, ""]);
  };
  const removePollOption = (index: number) => {
    if (!canManageMutableRoomData) return;
    setPollOptions((c) => c.length <= 2 ? c : c.filter((_, i) => i !== index));
  };
  const toggleVoteDraft = (pollId: string, optionId: string) => {
    if (!canMutateRoomData) return;
    setVoteDrafts((c) => {
      const sel = c[pollId] ?? [];
      return { ...c, [pollId]: sel.includes(optionId) ? sel.filter((i) => i !== optionId) : [...sel, optionId] };
    });
  };

  const handleCreatePoll = () => {
    if (!token || !roomId || !canManageMutableRoomData) return;
    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/rooms/${roomId}/polls`, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", "x-access-token": token },
            body: JSON.stringify({ title: pollTitle, options: pollOptions }),
          }).then(readJson<PollCreatePayload>);
          setPollTitle(""); setPollOptions(["", ""]);
          await refreshAll();
          toast.success("투표를 만들었습니다.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "투표를 만들지 못했습니다.");
        }
      })();
    });
  };

  const handleVotePoll = (pollId: string) => {
    if (!token || !roomId || !canMutateRoomData) return;
    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/rooms/${roomId}/polls/${pollId}/vote`, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", "x-access-token": token },
            body: JSON.stringify({ selectedOptionIds: voteDrafts[pollId] ?? [] }),
          }).then(readJson<{ pollId: string }>);
          await loadPolls();
          toast.success("투표를 저장했습니다.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "투표를 저장하지 못했습니다.");
        }
      })();
    });
  };

  const handleClosePoll = () => {
    if (!token || !roomId || !closePollId || !canManageMutableRoomData) return;
    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/rooms/${roomId}/polls/${closePollId}`, {
            method: "PATCH",
            headers: { "x-access-token": token },
          }).then(readJson<{ pollId: string }>);
          setClosePollId(null);
          await refreshAll();
          toast.success("투표를 마감했습니다.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "투표를 마감하지 못했습니다.");
        }
      })();
    });
  };

  const openSection = (section: MenuSection) => {
    setActiveSection(section);
    setMenuOpen(false);
  };

  // ===== Missing token/roomId =====

  if (!token || !roomId) {
    return (
      <main className="student-container space-y-5">
        <SectionCard title="조 방" description="조 방 접속에 필요한 정보가 부족합니다.">
          <div className="space-y-3">
            <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              토큰 또는 방 정보가 없습니다. 지원 페이지에서 다시 시작해 주세요.
            </div>
            <Link href="/student" className="inline-flex items-center justify-center rounded-[10px] border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700">
              학생 메인으로 돌아가기
            </Link>
          </div>
        </SectionCard>
      </main>
    );
  }

  // ===== Render =====

  const menuItems: { key: MenuSection; label: string; show: boolean }[] = [
    { key: "members", label: `조원 목록 (${detail?.members.length ?? 0}명)`, show: true },
    { key: "invite", label: "초대 정보 · 공유", show: true },
    { key: "profile", label: "내 프로필 설정", show: true },
    { key: "polls", label: `스터디 투표 (${polls.length}개)`, show: true },
    { key: "extra", label: "추가 인원 요청", show: canManageRoom || Boolean(detail?.room.requestExtraMembers) },
    { key: "leader", label: "조장 위임", show: canManageRoom },
  ];

  return (
    <main
      className="student-container space-y-0 pb-0"
      style={
        {
          "--division-color": track.color,
          "--division-color-light": track.lightColor,
          "--division-color-dark": track.darkColor,
        } as CSSProperties
      }
    >
      {/* ===== Header ===== */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-sm md:-mx-6 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* 섹션이 열려있으면 댓글로 복귀, 아니면 방 아이콘만 표시 */}
            {activeSection ? (
              <button
                type="button"
                onClick={() => setActiveSection(null)}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--division-color-light)] text-[var(--division-color)]"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--division-color-light)] text-[var(--division-color)]">
                <UsersRound className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900">
                {activeSection ? (
                  {
                    members: "조원 목록",
                    invite: "초대 정보",
                    profile: "내 프로필",
                    polls: "스터디 투표",
                    extra: "추가 인원 요청",
                    leader: "조장 위임",
                  }[activeSection] ?? "조 방"
                ) : (detail?.room.roomName ?? "조 방")}
              </h1>
              <p className="text-xs text-slate-500">
                {activeSection
                  ? "← 탭하면 댓글로 돌아갑니다"
                  : isLoading ? "불러오는 중..." : `${detail?.members.length ?? 0}/${detail?.room.maxMembers ?? 0}명 · ${detail?.room.inviteCode ?? ""}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!activeSection && (
              <Badge tone={detail?.room.status === "closed" ? "neutral" : "info"}>
                {detail?.room.status === "recruiting" ? "모집중" : detail?.room.status === "formed" ? "편성완료" : detail?.room.status ?? "..."}
              </Badge>
            )}
            <button
              type="button"
              onClick={() => { setMenuOpen(!menuOpen); if (activeSection) setActiveSection(null); }}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* ===== Dropdown Menu ===== */}
        {menuOpen && (
          <div className="absolute right-4 top-full z-30 mt-1 w-60 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-lg">
            {menuItems.filter((i) => i.show).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => openSection(item.key)}
                className="flex w-full items-center px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {item.label}
              </button>
            ))}
            <div className="border-t border-slate-100" />
            <button
              type="button"
              onClick={() => { setMenuOpen(false); openLeaveConfirm(); }}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              조 탈퇴
            </button>
            <div className="border-t border-slate-100" />
            <Link
              href="/student"
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-400 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              학생 메인으로 나가기
            </Link>
          </div>
        )}
      </div>

      {/* ===== Active Section Panel ===== */}
      {activeSection && (
        <div className="space-y-4 pt-4 pb-6">

          {/* Members */}
          {activeSection === "members" && (
            <SectionCard title="조원 목록" description="방장, 조장, 조원 역할과 간단한 소개를 한 번에 확인할 수 있습니다.">
              <div className="space-y-3">
                {(detail?.members ?? []).map((member) => (
                  <div key={member.id} className="flex items-start justify-between rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--division-color-light)] text-[var(--division-color)]">
                        {member.role === "creator" || member.role === "leader" ? <Crown className="h-5 w-5" /> : <UsersRound className="h-5 w-5" />}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                        <p className="text-xs text-slate-500">{member.region} · {member.series} · 필기 {member.score ?? "-"}</p>
                        {member.intro && <p className="mt-1 text-xs leading-5 text-slate-600">{member.intro}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {member.showPhone || member.studentId === detail?.room.viewerStudentId ? (
                            <a href={`tel:${member.phone.replaceAll("-", "")}`} className="inline-flex items-center gap-1 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                              <Phone className="h-3 w-3" />
                              {member.phone}
                            </a>
                          ) : (
                            <span className="inline-flex rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">연락처 비공개</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge tone={getRoleTone(member.role)}>{getRoleLabel(member.role)}</Badge>
                  </div>
                ))}
                {!isLoading && (detail?.members.length ?? 0) === 0 && (
                  <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    아직 조원이 없습니다.
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Invite */}
          {activeSection === "invite" && (
            <>
              <SectionCard title="초대 정보" description="조원에게 보낼 초대 링크와 비밀번호를 바로 복사할 수 있습니다.">
                <div className="space-y-3">
                  {[
                    { label: "초대 코드", value: inviteDetails?.inviteCode ?? detail?.room.inviteCode ?? "-" },
                    { label: "방 비밀번호", value: inviteDetails?.password ?? "-" },
                    { label: "초대 링크", value: inviteLink || "-" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                        <p className="mt-1 truncate text-sm font-medium text-slate-900">{item.value}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyInviteValue(item.label, item.value === "-" ? "" : item.value)}
                        className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-500"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </>
          )}

          {/* Profile */}
          {activeSection === "profile" && (
            <SectionCard title="내 프로필" description="조원 목록에 보일 자기소개와 연락처 공개 여부를 설정합니다.">
              <div className="space-y-3">
                <textarea
                  value={profileIntro}
                  onChange={(e) => setProfileIntro(e.target.value)}
                  maxLength={100}
                  disabled={!canMutateRoomData}
                  className="min-h-[104px] w-full rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-sm"
                  placeholder="예: 대전 일반 직렬입니다. 평일 저녁 스터디 가능합니다."
                />
                <label className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <input type="checkbox" checked={profileShowPhone} onChange={(e) => setProfileShowPhone(e.target.checked)} disabled={!canMutateRoomData} className="h-4 w-4 rounded border-slate-300" />
                  조원에게 연락처를 공개합니다.
                </label>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>자기소개는 최대 100자</span>
                  <span>{profileIntro.length}/100</span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={isPending || !canMutateRoomData}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  프로필 저장
                </button>
              </div>
            </SectionCard>
          )}

          {/* Polls */}
          {activeSection === "polls" && (
            <SectionCard title="스터디 일정 투표" description="조원들이 가능한 시간대를 선택합니다." action={<Badge tone={polls.length > 0 ? "brand" : "neutral"}>투표 {polls.length}개</Badge>}>
              <div className="space-y-4">
                {canManageRoom && (
                  <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
                    <input value={pollTitle} onChange={(e) => setPollTitle(e.target.value)} maxLength={80} disabled={!canManageMutableRoomData} className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm" placeholder="투표 제목" />
                    <div className="space-y-2">
                      {pollOptions.map((opt, i) => (
                        <div key={`po-${i}`} className="flex gap-2">
                          <input value={opt} onChange={(e) => updatePollOption(i, e.target.value)} disabled={!canManageMutableRoomData} className="flex-1 rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm" placeholder={`옵션 ${i + 1}`} />
                          <button type="button" onClick={() => removePollOption(i)} disabled={pollOptions.length <= 2 || !canManageMutableRoomData} className="rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 disabled:opacity-50">삭제</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between gap-3">
                      <button type="button" onClick={addPollOption} disabled={pollOptions.length >= 8 || !canManageMutableRoomData} className="inline-flex items-center gap-1 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 disabled:opacity-50">
                        <Plus className="h-3.5 w-3.5" />옵션 추가
                      </button>
                      <button type="button" onClick={handleCreatePoll} disabled={isPending || !canManageMutableRoomData} className="inline-flex items-center gap-1 rounded-[10px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                        {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}투표 만들기
                      </button>
                    </div>
                  </div>
                )}
                {polls.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">아직 투표가 없습니다.</div>
                ) : (
                  <div className="space-y-3">
                    {polls.map((poll) => (
                      <div key={poll.id} className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2"><p className="text-sm font-semibold text-slate-900">{poll.title}</p><Badge tone={poll.isClosed ? "neutral" : "info"}>{poll.isClosed ? "마감" : "진행 중"}</Badge></div>
                            <p className="text-xs text-slate-500">{poll.createdByName} · {formatDateTime(poll.createdAt)}</p>
                          </div>
                          {poll.canManage && !poll.isClosed && (
                            <button type="button" onClick={() => setClosePollId(poll.id)} disabled={isPending} className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">투표 마감</button>
                          )}
                        </div>
                        <div className="mt-3 space-y-2">
                          {poll.options.map((opt) => {
                            const sel = (voteDrafts[poll.id] ?? []).includes(opt.id);
                            return (
                              <label key={opt.id} className={`flex items-start gap-3 rounded-[10px] border px-3 py-3 ${sel ? "border-[var(--division-color)] bg-[var(--division-color-light)]/40" : "border-slate-200 bg-slate-50"} ${poll.isClosed ? "cursor-default" : "cursor-pointer"}`}>
                                <input type="checkbox" checked={sel} onChange={() => toggleVoteDraft(poll.id, opt.id)} disabled={poll.isClosed || isPending || !canMutateRoomData} className="sr-only" />
                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${sel ? "border-[var(--division-color)] bg-[var(--division-color)] text-white" : "border-slate-300 bg-white text-transparent"}`}><Check className="h-3 w-3" /></span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                                  <p className="mt-1 text-xs text-slate-500">{opt.voteCount}명 선택{opt.voterNames.length > 0 ? ` · ${opt.voterNames.join(", ")}` : ""}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        {!poll.isClosed && (
                          <div className="mt-3 flex justify-end">
                            <button type="button" onClick={() => handleVotePoll(poll.id)} disabled={isPending || !canMutateRoomData} className="inline-flex items-center gap-1 rounded-[10px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}투표 저장
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Extra Members */}
          {activeSection === "extra" && (
            <SectionCard title="추가 인원 요청" description="관리자에게 추가 인원 배정을 요청합니다." action={<Badge tone={detail?.room.requestExtraMembers ? "warning" : "neutral"}>{detail?.room.requestExtraMembers ? `요청 ${detail.room.requestExtraMembers}명` : "요청 없음"}</Badge>}>
              <div className="space-y-3">
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">현재 정원 {detail?.room.maxMembers ?? 0}명</div>
                {canManageRoom && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-500">추가 인원 수</span>
                        <input type="number" min={0} max={5} value={requestExtraMembers} onChange={(e) => setRequestExtraMembers(e.target.value)} disabled={!canManageMutableRoomData} className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm" />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-500">요청 사유</span>
                        <input value={requestExtraReason} onChange={(e) => setRequestExtraReason(e.target.value)} disabled={!canManageMutableRoomData} className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="예: 여성 조원 1명" />
                      </label>
                    </div>
                    <button type="button" onClick={handleSaveExtraRequest} disabled={isPending || !canManageMutableRoomData} className="inline-flex w-full items-center justify-center rounded-[10px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                      {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "요청 저장"}
                    </button>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Leader Transfer */}
          {activeSection === "leader" && canManageRoom && (
            <SectionCard title="조장 위임" description="다른 조원에게 조장을 넘길 수 있습니다." action={<Badge tone={canTransferLeader ? "brand" : "neutral"}>{canTransferLeader ? "위임 가능" : "위임 대상 없음"}</Badge>}>
              <div className="space-y-3">
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">조장을 바꾸면 기존 조장은 일반 조원으로 전환됩니다.</div>
                <select value={nextLeaderStudentId} onChange={(e) => setNextLeaderStudentId(e.target.value)} disabled={!canTransferLeader} className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50">
                  <option value="">위임할 조원 선택</option>
                  {leaderTransferCandidates.map((m) => <option key={m.studentId} value={m.studentId}>{m.name} · {m.region}</option>)}
                </select>
                <button type="button" onClick={() => setLeaderConfirmOpen(true)} disabled={isPending || !selectedLeaderCandidate || !canTransferLeader} className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}조장 위임
                </button>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ===== Main: Comments (default view) ===== */}
      {!activeSection && (
        <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 120px)" }}>
          {/* Chat area with subtle background */}
          <div className="flex-1 -mx-4 bg-[var(--division-color-light)]/30 px-4 py-3 md:-mx-6 md:px-6">
            <div className="space-y-3">
              {detail?.messagePageInfo.hasMore && (
                <div className="flex justify-center py-1">
                  <button type="button" onClick={() => void handleLoadOlderMessages()} disabled={isLoadingOlderMessages} className="inline-flex items-center gap-2 rounded-[10px] bg-white/80 px-4 py-2 text-xs font-medium text-slate-500 shadow-sm backdrop-blur-sm disabled:opacity-50">
                    {isLoadingOlderMessages && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                    이전 댓글 더 보기
                  </button>
                </div>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <LoaderCircle className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : (detail?.messages ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-sm text-slate-400">
                  <MessageSquareText className="mb-3 h-10 w-10" />
                  <p>아직 댓글이 없습니다.</p>
                  <p className="mt-1 text-xs">조원들에게 첫 인사를 남겨보세요!</p>
                </div>
              ) : (
                (detail?.messages ?? []).map((message) =>
                  message.isSystem ? (
                    <div key={message.id} className="flex justify-center py-1">
                      <span className="rounded-[10px] bg-slate-500/10 px-3 py-1.5 text-[11px] text-slate-500">
                        {message.message}
                      </span>
                    </div>
                  ) : message.studentId === detail?.room.viewerStudentId ? (
                    /* 내 메시지 — 오른쪽 */
                    <div key={message.id} className="flex justify-end gap-1.5">
                      <span className="self-end text-[10px] text-slate-400">{formatDateTime(message.createdAt)}</span>
                      <div className="max-w-[75%] rounded-[10px] rounded-tr-sm bg-[var(--division-color)] px-3.5 py-2.5 shadow-sm">
                        <p className="text-sm leading-relaxed text-white">{message.message}</p>
                      </div>
                    </div>
                  ) : (
                    /* 상대 메시지 — 왼쪽 */
                    <div key={message.id} className="flex gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-xs font-bold text-[var(--division-color)] shadow-sm">
                        {message.senderName?.charAt(0) ?? "?"}
                      </div>
                      <div className="max-w-[75%]">
                        <p className="mb-1 text-xs font-semibold text-slate-600">{message.senderName}</p>
                        <div className="rounded-[10px] rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm">
                          <p className="text-sm leading-relaxed text-slate-800">{message.message}</p>
                        </div>
                      </div>
                      <span className="self-end text-[10px] text-slate-400">{formatDateTime(message.createdAt)}</span>
                    </div>
                  ),
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Refresh pill */}
          <div className="flex justify-center -mt-4 mb-1 relative z-10">
            <button
              type="button"
              onClick={handleRefreshComments}
              disabled={isLoading || isPending}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              새 댓글 확인
            </button>
          </div>

          {/* Message input — 카카오톡 스타일 */}
          <div className="sticky bottom-0 -mx-4 border-t border-slate-100 bg-white px-3 py-2 md:-mx-6 md:px-5">
            <div className="flex items-end gap-2">
              <input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                disabled={!canSendMessage}
                maxLength={500}
                className="flex-1 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-[var(--division-color)] focus:outline-none focus:ring-1 focus:ring-[var(--division-color)]/20"
                placeholder={canSendMessage ? "메시지를 입력하세요" : "메시지를 작성할 수 없습니다"}
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={isPending || !messageInput.trim() || !canSendMessage}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--division-color)] text-white shadow-sm transition-opacity disabled:opacity-40"
              >
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Confirm Dialogs ===== */}
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
        description={selectedLeaderCandidate ? `${selectedLeaderCandidate.name} 님에게 조장을 넘깁니다.` : "위임할 조원을 먼저 선택해 주세요."}
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
