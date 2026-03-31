"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock4,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PushSubscribeCard } from "@/components/pwa/push-subscribe-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import {
  clearStudentSession,
  loadStudentSession,
  saveStudentSession,
} from "@/hooks/use-student-session";
import type { Track } from "@/lib/constants";
import type { StudentSummary } from "@/lib/students";

type StatusFlowProps = {
  token: string;
  restoreFromStorage?: boolean;
};

type RoomSummary = {
  id: string;
  roomName: string | null;
  inviteCode: string;
  status: string;
};

type WaitingPayload = {
  waiting: {
    id: string;
    createdAt: string;
    assignedRoomId: string | null;
    assignedRoom?: RoomSummary | null;
  } | null;
};

type StudentPayload = {
  student: StudentSummary;
  waiting: {
    id: string;
    assignedRoomId: string | null;
    createdAt: string;
  } | null;
  joinedRoom: RoomSummary | null;
};

type DeleteStudentPayload = {
  deleted: boolean;
  deletedRoomId: string | null;
  redirectPath: string;
};

const STATUS_POLL_INTERVAL_MS = 30_000;

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "요청을 처리하지 못했습니다.");
  }

  return payload;
}

function getStatusTone(waiting: WaitingPayload["waiting"], joinedRoom: RoomSummary | null) {
  if (waiting?.assignedRoom || joinedRoom) {
    return "success" as const;
  }

  if (waiting) {
    return "warning" as const;
  }

  return "neutral" as const;
}

function getStatusLabel(waiting: WaitingPayload["waiting"], joinedRoom: RoomSummary | null) {
  if (joinedRoom) {
    return "조 참여 중";
  }

  if (waiting?.assignedRoom) {
    return "배정 완료";
  }

  if (waiting) {
    return "편성 대기 중";
  }

  return "상태 확인 필요";
}

export function StatusFlow({ token: initialToken, restoreFromStorage }: StatusFlowProps) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [waiting, setWaiting] = useState<WaitingPayload["waiting"]>(null);
  const [joinedRoom, setJoinedRoom] = useState<RoomSummary | null>(null);
  const [resumeTrack, setResumeTrack] = useState<Track | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const assignedRoomToastRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = loadStudentSession();

    if (stored?.track === "police" || stored?.track === "fire") {
      setResumeTrack(stored.track);
    }

    if (token || !restoreFromStorage || !stored?.token) {
      return;
    }

    setToken(stored.token);
  }, [restoreFromStorage, token]);

  const currentRoom = waiting?.assignedRoom ?? joinedRoom;

  const loadStatus = useCallback(async () => {
    if (!token) {
      setStudent(null);
      setWaiting(null);
      setJoinedRoom(null);
      setIsLoading(false);
      return;
    }

    const [studentPayload, waitingPayload] = await Promise.all([
      fetch("/api/students", {
        headers: {
          "x-access-token": token,
        },
      }).then(readJson<StudentPayload>),
      fetch("/api/waiting-pool", {
        headers: {
          "x-access-token": token,
        },
      }).then(readJson<WaitingPayload>),
    ]);

    setStudent(studentPayload.student);
    setWaiting(waitingPayload.waiting);
    setJoinedRoom(studentPayload.joinedRoom);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void loadStatus()
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "진행 상태를 불러오지 못했습니다.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [loadStatus, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadStatus().catch(() => undefined);
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadStatus, token]);

  useEffect(() => {
    if (!currentRoom?.id) {
      assignedRoomToastRef.current = null;
      return;
    }

    if (assignedRoomToastRef.current === currentRoom.id) {
      return;
    }

    assignedRoomToastRef.current = currentRoom.id;

    const stored = loadStudentSession();
    const nextTrack =
      stored?.track === "police" || stored?.track === "fire"
        ? stored.track
        : resumeTrack ?? undefined;
    const nextName = student?.name ?? stored?.name;

    saveStudentSession({
      token,
      roomId: currentRoom.id,
      ...(nextTrack ? { track: nextTrack } : {}),
      ...(nextName ? { name: nextName } : {}),
    });

    toast.success(
      currentRoom.roomName
        ? `${currentRoom.roomName} 배정이 완료되었습니다.`
        : "조 방 배정이 완료되었습니다.",
    );
  }, [currentRoom?.id, currentRoom?.roomName, resumeTrack, student?.name, token]);

  const handleRefreshStatus = useCallback(() => {
    if (!token) {
      return;
    }

    setIsRefreshing(true);
    void loadStatus()
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "진행 상태를 새로고침하지 못했습니다.",
        );
      })
      .finally(() => setIsRefreshing(false));
  }, [loadStatus, token]);

  const steps = [
    {
      icon: CheckCircle2,
      label: "지원 정보 등록 완료",
      active: Boolean(student),
    },
    {
      icon: waiting || currentRoom ? FileSearch : Clock4,
      label: currentRoom
        ? "편성 검토 완료"
        : waiting
          ? "관리자 편성 검토 중"
          : "지원 접수 확인",
      active: Boolean(waiting || currentRoom),
    },
    {
      icon: currentRoom ? CheckCircle2 : Clock4,
      label: currentRoom ? "조 방 입장 가능" : "조 방 편성 대기",
      active: Boolean(currentRoom),
    },
  ];

  const handleDeleteStudent = () => {
    setIsDeleting(true);

    void fetch("/api/students", {
      method: "DELETE",
      headers: {
        "x-access-token": token,
      },
    })
      .then(readJson<DeleteStudentPayload>)
      .then((payload) => {
        clearStudentSession();
        setDeleteConfirmOpen(false);
        toast.success("지원 정보가 삭제되었습니다.");
        router.push(payload.redirectPath);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "지원 취소를 처리하지 못했습니다.",
        );
      })
      .finally(() => setIsDeleting(false));
  };

  return (
    <>
      <main className="student-container space-y-4">
        <SectionCard
          title="지원 진행 현황"
          description="개인 지원 후 조 편성 진행 상태와 방 배정 여부를 여기에서 확인할 수 있습니다."
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshStatus}
                disabled={!token || isRefreshing}
                className="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRefreshing ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                새로고침
              </button>
              <Badge tone={getStatusTone(waiting, joinedRoom)}>
                {getStatusLabel(waiting, joinedRoom)}
              </Badge>
            </div>
          }
        >
          <div
            className={`rounded-[10px] px-4 py-4 text-sm leading-6 ${
              currentRoom
                ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                : waiting
                  ? "border border-amber-200 bg-amber-50 text-amber-900"
                  : "border border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {isLoading
              ? "현재 상태를 불러오고 있습니다."
              : currentRoom
                ? "조 방 입장 준비가 완료되었습니다. 아래 버튼으로 바로 입장할 수 있습니다."
                : waiting
                  ? "현재 조 편성 검토 중입니다. 관리자가 배정하면 자동으로 상태가 갱신됩니다."
                  : "유효한 진행 정보가 없습니다. 지원 페이지에서 다시 확인해 주세요."}
            <p className="mt-3 text-xs opacity-80">
              30초마다 자동으로 갱신됩니다. 필요하면 직접 새로고침할 수 있습니다.
            </p>
          </div>
          <div className="mt-4">
            <PushSubscribeCard token={token} />
          </div>
        </SectionCard>

        <SectionCard
          title="현재 상태"
          description="지원 등록, 편성 검토, 조 방 입장 가능 여부를 순서대로 보여줍니다."
        >
          <div className="space-y-3">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <div
                  key={step.label}
                  className={`flex items-center gap-3 rounded-[10px] border px-4 py-4 ${
                    step.active
                      ? "border-sky-200 bg-sky-50 text-sky-900"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{step.label}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard
          title="지원자 정보"
          description="확인된 학생 정보와 조 방 입장 링크를 함께 보여줍니다."
          action={
            student ? (
              <div className="flex flex-wrap items-center gap-2">
                {resumeTrack ? (
                  <Link
                    href={`/apply?track=${resumeTrack}`}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    정보 수정
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  지원 취소
                </button>
              </div>
            ) : null
          }
        >
          {student ? (
            <div className="grid gap-3 text-sm text-slate-700">
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-3">
                {student.name} · {student.phone}
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-3">
                {student.region} · {student.gender} · {student.age ?? "-"}세 · 필기{" "}
                {student.score ?? "-"} · 면접 경험{" "}
                {student.interviewExperience === true
                  ? "있음"
                  : student.interviewExperience === false
                    ? "없음"
                    : "-"}
              </div>
              {currentRoom ? (
                <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900">
                  <p className="text-sm font-semibold">
                    참여 가능 조: {currentRoom.roomName ?? "조 방"} · 초대코드{" "}
                    {currentRoom.inviteCode}
                  </p>
                  <p className="mt-1 text-xs">방 상태: {currentRoom.status}</p>
                  <Link
                    href={`/room?token=${token}&roomId=${currentRoom.id}`}
                    className="mt-3 inline-flex rounded-[10px] bg-emerald-700 px-4 py-2 text-xs font-semibold text-white"
                  >
                    조 방 바로 입장
                  </Link>
                </div>
              ) : (
                <div className="rounded-[10px] border border-rose-100 bg-rose-50 px-4 py-4 text-xs leading-6 text-rose-700">
                  정보 수정은 지원 상태를 유지한 채 가능합니다. 지원 취소를 누르면
                  입력한 정보가 모두 삭제되고, 조에 소속된 경우 자동 탈퇴 후
                  삭제됩니다.
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              유효한 토큰이 아니거나 지원자 정보가 없습니다.
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="토큰 확인"
          description="문자를 분실했을 때 복구에 사용할 현재 access token입니다."
        >
          <code className="block rounded-[10px] border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100">
            {token || "토큰 없음"}
          </code>
        </SectionCard>

        <ConfirmDialog
          open={deleteConfirmOpen}
          title="지원을 취소하시겠습니까?"
          description="입력한 정보가 모두 삭제됩니다. 조에 소속된 경우 자동 탈퇴됩니다."
          confirmText="지원 취소"
          tone="danger"
          isPending={isDeleting}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeleteStudent}
        />
      </main>
      <StudentBottomNav />
    </>
  );
}
