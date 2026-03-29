"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Link2, LoaderCircle, LockKeyhole, LogIn } from "lucide-react";
import { toast } from "sonner";

import { PhoneVerify } from "@/components/phone-verify";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { TRACKS } from "@/lib/constants";
import type { StudentSummary } from "@/lib/students";

type JoinRoomFlowProps = {
  inviteCode: string;
};

type InviteRoom = {
  id: string;
  roomName: string | null;
  inviteCode: string;
  status: "recruiting" | "formed" | "closed";
  sessionName: string;
  track: "police" | "fire" | null;
  memberCount: number;
  maxMembers: number;
};

type RegisteredStudent = {
  name: string;
  phone: string;
};

type ApiErrorPayload = {
  message?: string;
  lockedUntil?: string | null;
  remainingAttempts?: number | null;
};

class ApiError extends Error {
  lockedUntil: string | null;
  remainingAttempts: number | null;

  constructor(message: string, payload?: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.lockedUntil = payload?.lockedUntil ?? null;
    this.remainingAttempts = payload?.remainingAttempts ?? null;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T &
    ApiErrorPayload;

  if (!response.ok) {
    throw new ApiError(
      payload.message ?? "요청을 처리하지 못했습니다.",
      payload,
    );
  }

  return payload;
}

function formatRemainingLock(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}분 ${seconds.toString().padStart(2, "0")}초`;
}

export function JoinRoomFlow({ inviteCode }: JoinRoomFlowProps) {
  const router = useRouter();
  const [room, setRoom] = useState<InviteRoom | null>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [registeredStudent, setRegisteredStudent] =
    useState<RegisteredStudent | null>(null);
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsLoading(true);
    void fetch(`/api/rooms/invite/${inviteCode}`)
      .then(readJson<{ room: InviteRoom }>)
      .then((payload) => setRoom(payload.room))
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "초대 링크 정보를 불러오지 못했습니다.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [inviteCode]);

  useEffect(() => {
    if (!lockedUntil) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const lockRemainingMs = useMemo(() => {
    if (!lockedUntil) {
      return 0;
    }

    return new Date(lockedUntil).getTime() - now;
  }, [lockedUntil, now]);

  useEffect(() => {
    if (lockedUntil && lockRemainingMs <= 0) {
      setLockedUntil(null);
    }
  }, [lockRemainingMs, lockedUntil]);

  const isLocked = Boolean(lockedUntil && lockRemainingMs > 0);

  const trackInfo = useMemo(() => {
    if (!room?.track) {
      return TRACKS.police;
    }

    return TRACKS[room.track];
  }, [room?.track]);

  const verifyNotice = isLoading
    ? "초대 링크 정보를 불러오는 중입니다."
    : room
      ? "먼저 본인 연락처로 기존 지원 정보를 확인해야 조 방에 입장할 수 있습니다."
      : "유효한 초대 링크가 아닙니다.";

  const lockNotice = isLocked
    ? `현재 잠금 상태입니다. ${formatRemainingLock(lockRemainingMs)} 후 다시 시도할 수 있습니다.`
    : "비밀번호를 5회 연속 틀리면 5분 동안 입장이 잠깁니다.";

  const handleVerify = async () => {
    if (!room?.track || !phone.trim()) {
      return;
    }

    setIsVerifying(true);

    try {
      const payload = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          track: room.track,
          phone,
        }),
      }).then(
        readJson<{
          registeredStudent: RegisteredStudent;
          student: StudentSummary | null;
        }>,
      );

      if (!payload.student) {
        throw new ApiError(
          "먼저 지원 페이지에서 지원 정보를 완료해주세요.",
        );
      }

      setRegisteredStudent(payload.registeredStudent);
      setStudent(payload.student);
      setPhone(payload.registeredStudent.phone);
      toast.success("기존 지원 정보를 확인했습니다.");
    } catch (error) {
      setRegisteredStudent(null);
      setStudent(null);
      toast.error(
        error instanceof Error ? error.message : "본인 확인에 실패했습니다.",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleJoin = () => {
    if (!room || !student?.accessToken || !password.trim()) {
      toast.error("본인 확인과 비밀번호 입력이 필요합니다.");
      return;
    }

    if (isLocked) {
      toast.error(lockNotice);
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          await fetch(`/api/rooms/${room.id}/join`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-access-token": student.accessToken,
            },
            body: JSON.stringify({
              password,
            }),
          }).then(readJson<{ roomId: string }>);

          setLockedUntil(null);
          toast.success("조 방에 입장했습니다.");
          router.push(`/room?token=${student.accessToken}&roomId=${room.id}`);
        } catch (error) {
          if (error instanceof ApiError) {
            setLockedUntil(error.lockedUntil);
          }

          setPassword("");
          toast.error(
            error instanceof Error ? error.message : "조 방 입장에 실패했습니다.",
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
        title="조 방 입장"
        description="초대 링크 확인 후 비밀번호를 입력하면 조 방에 입장합니다."
        action={<Badge tone="brand">초대 코드 {inviteCode}</Badge>}
      >
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          {room
            ? `${room.sessionName} · ${room.roomName ?? "조 방"} · ${room.memberCount}/${room.maxMembers}명`
            : "초대 링크 정보를 확인하는 중입니다."}
        </div>
      </SectionCard>

      <SectionCard
        title="링크 확인"
        description="공유받은 초대 링크와 조 방 상태를 확인합니다."
      >
        <div className="flex items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-4 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--division-color-light)] text-[var(--division-color)]">
            <Link2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {room?.roomName ?? "조 방"} 초대 링크 확인
            </p>
            <p className="text-xs text-slate-500">
              본인 확인 후 비밀번호를 입력하면 입장할 수 있습니다.
            </p>
          </div>
        </div>
      </SectionCard>

      <PhoneVerify
        title="본인 확인"
        description="기존 지원을 완료한 학생만 입장할 수 있습니다."
        actionLabel="지원 정보 확인"
        phone={phone}
        onPhoneChange={setPhone}
        onSubmit={handleVerify}
        isPending={isVerifying}
        disabled={!room?.track || !phone.trim()}
        notice={verifyNotice}
      />

      <SectionCard
        title="비밀번호 입력"
        description="조 방 비밀번호를 확인한 뒤 입장합니다."
        action={
          registeredStudent ? <Badge tone="success">{registeredStudent.name}</Badge> : null
        }
      >
        <div className="space-y-3">
          <div
            className={`rounded-[10px] border px-4 py-3 text-sm ${
              isLocked
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <LockKeyhole className="h-4 w-4" />
              {isLocked ? "입장 잠금 활성화" : "비밀번호 입력 안내"}
            </div>
            <p className="mt-1 text-xs leading-5">{lockNotice}</p>
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">방 비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="비밀번호를 입력해주세요"
            />
          </label>

          <button
            type="button"
            onClick={handleJoin}
            disabled={isPending || isLocked || !student?.accessToken || !password.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                <LogIn className="h-4 w-4" />
              </>
            )}
            {isLocked ? "잠금 해제 대기 중" : "입장하기"}
          </button>
        </div>
      </SectionCard>
    </main>
  );
}
