"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  DoorOpen,
  LoaderCircle,
  UserSquare2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { StudentBottomNav } from "@/components/student-bottom-nav";

import { PhoneVerify } from "@/components/phone-verify";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { POLICE_REGIONS, FIRE_REGIONS, TRACKS, type Track } from "@/lib/constants";
import type { SessionSummary } from "@/lib/sessions";
import type { StudentSummary } from "@/lib/students";
import {
  saveStudentSession,
  loadStudentSession,
} from "@/hooks/use-student-session";

type ApplyFlowProps = {
  track: Track;
};

type RegisteredStudent = {
  id: string;
  session_id: string;
  name: string;
  phone: string;
  gender: "남" | "여" | null;
  series: string | null;
  interview_experience: boolean | null;
  created_at: string;
};

type ApplyFormState = {
  name: string;
  gender: "남" | "여" | "";
  series: string;
  region: string;
  age: string;
  score: string;
  interviewExperience: "" | "있음" | "없음";
};

type RoomSummary = {
  id: string;
  roomName: string | null;
  inviteCode: string;
  status: string;
};

const defaultFormState: ApplyFormState = {
  name: "",
  gender: "",
  series: "",
  region: "",
  age: "",
  score: "",
  interviewExperience: "",
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

function createFormState(
  registeredStudent: RegisteredStudent,
  student: StudentSummary | null,
): ApplyFormState {
  return {
    name: student?.name ?? registeredStudent.name,
    gender: student?.gender ?? registeredStudent.gender ?? "",
    series: student?.series ?? registeredStudent.series ?? "",
    region: student?.region ?? "",
    age: student?.age ? String(student.age) : "",
    score: student?.score !== null && student?.score !== undefined
      ? String(student.score)
      : "",
    interviewExperience:
      student?.interviewExperience === true
        ? "있음"
        : student?.interviewExperience === false
          ? "없음"
          : registeredStudent.interview_experience === true
            ? "있음"
            : registeredStudent.interview_experience === false
              ? "없음"
              : "",
  };
}

function createRegisteredStudentFromStudent(student: StudentSummary): RegisteredStudent {
  return {
    id: student.id,
    session_id: student.sessionId,
    name: student.name,
    phone: student.phone,
    gender: student.gender,
    series: student.series,
    interview_experience: student.interviewExperience,
    created_at: student.createdAt,
  };
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

export function ApplyFlow({ track }: ApplyFlowProps) {
  const trackInfo = TRACKS[track];
  const regions = track === "police" ? POLICE_REGIONS : FIRE_REGIONS;
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [registeredStudent, setRegisteredStudent] =
    useState<RegisteredStudent | null>(null);
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [joinedRoom, setJoinedRoom] = useState<RoomSummary | null>(null);
  const [hasExistingWaiting, setHasExistingWaiting] = useState(false);
  const [form, setForm] = useState<ApplyFormState>(defaultFormState);
  const [roomName, setRoomName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [roomMaxMembers, setRoomMaxMembers] = useState("6");
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isSessionArchived = session?.status === "archived";

  // Restore previous session from localStorage
  useEffect(() => {
    const stored = loadStudentSession();
    if (!stored?.token) {
      setIsRestoringSession(false);
      return;
    }

    void (async () => {
      try {
        const payload = await fetch("/api/students", {
          headers: { "x-access-token": stored.token },
        }).then(
          readJson<{
            student: StudentSummary;
            waiting: { id: string; assignedRoomId: string | null; createdAt: string } | null;
            joinedRoom: RoomSummary | null;
          }>,
        );

        setStudent(payload.student);
        setHasExistingWaiting(Boolean(payload.waiting) && !payload.joinedRoom);

        if (payload.joinedRoom) {
          setJoinedRoom(payload.joinedRoom);
          setRegisteredStudent(createRegisteredStudentFromStudent(payload.student));
          setForm(
            createFormState(
              createRegisteredStudentFromStudent(payload.student),
              payload.student,
            ),
          );
          saveStudentSession({
            token: stored.token,
            roomId: payload.joinedRoom.id,
            track,
            name: payload.student.name,
          });
        } else if (payload.waiting) {
          // Keep the user on the apply page so they can review or update the profile.
          const restoredStudent = createRegisteredStudentFromStudent(payload.student);

          setRegisteredStudent(restoredStudent);
          setForm(createFormState(restoredStudent, payload.student));
          saveStudentSession({
            token: stored.token,
            track,
            name: payload.student.name,
          });
        }
      } catch {
        // Token invalid — clear and proceed normally
      } finally {
        setIsRestoringSession(false);
      }
    })();
  }, [router, track]);

  useEffect(() => {
    setIsLoadingSession(true);
    void fetch(`/api/sessions/active?track=${track}`)
      .then(readJson<{ session: SessionSummary | null }>)
      .then((payload) => setSession(payload.session))
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "운영 중인 면접반을 불러오지 못했습니다.",
        );
      })
      .finally(() => setIsLoadingSession(false));
  }, [track]);

  const applyNotice = useMemo(() => {
    if (isLoadingSession) {
      return "운영 중인 면접반 정보를 불러오고 있습니다.";
    }

    if (!session) {
      return "운영 중인 면접반이 없습니다.";
    }

    if (isSessionArchived) {
      return "이 면접반은 종료되었습니다.";
    }

    if (session.applyWindowStatus === "before_open") {
      return `지원 오픈 전입니다. 오픈 일시: ${formatDateTime(session.applyOpenAt)}`;
    }

    if (session.applyWindowStatus === "after_close") {
      return "지원이 마감되었습니다.";
    }

    return "등록 명단 확인 후 조 편성 지원을 진행할 수 있습니다.";
  }, [isLoadingSession, isSessionArchived, session]);

  const canVerify = Boolean(
    session &&
      session.status === "active" &&
      session.applyWindowStatus === "open" &&
      phone.trim(),
  );
  const canSubmitPersonal = Boolean(
    session &&
      registeredStudent &&
      !joinedRoom &&
      form.name.trim() &&
      form.gender &&
      form.series.trim() &&
      form.region &&
      form.age.trim() &&
      form.score.trim(),
  );
  const canCreateRoom = Boolean(canSubmitPersonal && roomPassword.trim());

  const handleVerify = async () => {
    if (!canVerify) {
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
          track,
          phone,
        }),
      }).then(
        readJson<{
          session: SessionSummary;
          registeredStudent: RegisteredStudent;
          student: StudentSummary | null;
        }>,
      );

      setSession(payload.session);
      setRegisteredStudent(payload.registeredStudent);
      setStudent(payload.student);
      setPhone(payload.registeredStudent.phone);
      setForm(createFormState(payload.registeredStudent, payload.student));
      setJoinedRoom(null);
      setHasExistingWaiting(false);
      setRoomName((current) =>
        current || `${payload.registeredStudent.name}의 조`,
      );
      setRoomMaxMembers(
        String(payload.session.maxGroupSize ?? payload.session.minGroupSize ?? 6),
      );

      // Check if already in a room or waiting pool
      if (payload.student?.accessToken) {
        try {
          const studentPayload = await fetch("/api/students", {
            headers: { "x-access-token": payload.student.accessToken },
          }).then(
            readJson<{
              student: StudentSummary;
              waiting: { id: string; assignedRoomId: string | null; createdAt: string } | null;
              joinedRoom: RoomSummary | null;
            }>,
          );

          if (studentPayload.joinedRoom) {
            setJoinedRoom(studentPayload.joinedRoom);
            setHasExistingWaiting(false);
            saveStudentSession({
              token: payload.student.accessToken,
              roomId: studentPayload.joinedRoom.id,
              track,
              name: payload.student.name,
            });
            toast.success("이미 소속된 조가 있습니다. 조 방으로 이동할 수 있습니다.");
            return;
          }

          if (studentPayload.waiting) {
            setHasExistingWaiting(true);
            saveStudentSession({
              token: payload.student.accessToken,
              track,
              name: payload.student.name,
            });
            toast.success("이미 개인지원이 완료된 상태입니다. 진행 현황을 확인하거나 정보를 수정할 수 있습니다.");
            return;
          }
        } catch {
          // Could not check room status — continue with normal flow
        }
      }

      toast.success(
        payload.student
          ? "기존 지원 정보를 불러왔습니다."
          : "등록 명단을 확인했습니다.",
      );
    } catch (error) {
      setRegisteredStudent(null);
      setStudent(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "연락처 확인에 실패했습니다.",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const saveStudentProfile = async () => {
    if (!session || !registeredStudent) {
      throw new Error("학생 정보를 먼저 확인해주세요.");
    }

    const payload = await fetch("/api/students", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        sessionId: session.id,
        phone: registeredStudent.phone,
        name: form.name,
        gender: form.gender,
        series: form.series,
        region: form.region,
        age: Number(form.age),
        score: Number(form.score),
        interviewExperience:
          form.interviewExperience === "있음"
            ? true
            : form.interviewExperience === "없음"
              ? false
              : null,
      }),
    }).then(
      readJson<{
        created: boolean;
        student: StudentSummary;
      }>,
    );

    setStudent(payload.student);
    setHasExistingWaiting(false);

    return payload;
  };

  const handlePersonalApply = () => {
    if (!session || !registeredStudent || !canSubmitPersonal) {
      toast.error("지원 정보를 모두 입력해주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const studentPayload = await saveStudentProfile();

          await fetch("/api/waiting-pool", {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-access-token": studentPayload.student.accessToken,
            },
          }).then(
            readJson<{
              waiting: {
                id: string;
                assignedRoomId: string | null;
                createdAt: string;
              };
            }>,
          );

          saveStudentSession({
            token: studentPayload.student.accessToken,
            track,
            name: studentPayload.student.name,
          });
          setHasExistingWaiting(true);

          toast.success(
            studentPayload.created
              ? "개인지원이 완료되었습니다."
              : "지원 정보를 저장하고 진행 상태를 갱신했습니다.",
          );

          router.push(`/status?token=${studentPayload.student.accessToken}`);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "개인지원을 완료하지 못했습니다.",
          );
        }
      })();
    });
  };

  const handleCreateRoom = () => {
    if (!canCreateRoom) {
      toast.error("지원 정보와 방 비밀번호를 모두 입력해주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const studentPayload = await saveStudentProfile();
          const roomPayload = await fetch("/api/rooms", {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-access-token": studentPayload.student.accessToken,
            },
            body: JSON.stringify({
              roomName,
              password: roomPassword,
              maxMembers: Number(roomMaxMembers),
            }),
          }).then(
            readJson<{
              room: {
                id: string;
                roomName: string | null;
                inviteCode: string;
              };
            }>,
          );

          saveStudentSession({
            token: studentPayload.student.accessToken,
            roomId: roomPayload.room.id,
            track,
            name: studentPayload.student.name,
          });

          toast.success("조 방을 만들었습니다.");
          router.push(
            `/room?token=${studentPayload.student.accessToken}&roomId=${roomPayload.room.id}`,
          );
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "조 방을 만들지 못했습니다.",
          );
        }
      })();
    });
  };

  if (isRestoringSession) {
    return (
      <>
      <main
        className="student-container flex items-center justify-center py-20"
        style={
          {
            "--division-color": trackInfo.color,
            "--division-color-light": trackInfo.lightColor,
            "--division-color-dark": trackInfo.darkColor,
          } as CSSProperties
        }
      >
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          이전 지원 정보를 확인하고 있습니다...
        </div>
      </main>
      <StudentBottomNav />
      </>
    );
  }

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

      {/* Already in a room — show shortcut */}
      {joinedRoom && student ? (
        <SectionCard
          title="이미 소속된 조가 있습니다"
          description="현재 참여 중인 조 방으로 바로 이동할 수 있습니다."
          action={<Badge tone="success">조 참여 중</Badge>}
        >
          <div className="space-y-4">
            <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
              <p className="font-semibold">
                {joinedRoom.roomName ?? "조 방"} · 초대코드 {joinedRoom.inviteCode}
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                방 상태: {joinedRoom.status === "recruiting" ? "모집 중" : joinedRoom.status === "formed" ? "편성 완료" : "마감"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href={`/room?token=${student.accessToken}&roomId=${joinedRoom.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                <DoorOpen className="h-4 w-4" />
                조 방 입장하기
              </Link>
              <Link
                href={`/status?token=${student.accessToken}`}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
              >
                진행 현황 확인
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : (
        <>
          {hasExistingWaiting && student ? (
            <SectionCard
              title="이미 지원 대기 상태입니다"
              description="현재 대기 상태를 유지한 채 진행 현황을 확인하거나 정보를 수정할 수 있습니다."
              action={<Badge tone="warning">편성 대기 중</Badge>}
            >
              <div className="space-y-4">
                <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                  현재 대기 상태를 바로 확인할 수 있고, 아래 입력값을 수정한 뒤 다시
                  저장해도 대기 상태는 그대로 유지됩니다.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link
                    href={`/status?token=${student.accessToken}`}
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    진행 현황 확인
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const formSection = document.getElementById("apply-profile-form");
                      formSection?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
                  >
                    정보 수정
                  </button>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title={`${trackInfo.label} 조 편성 지원`}
            description="본인 확인 후 자기 정보 입력, 조 생성 또는 개인 지원으로 이어지는 흐름입니다."
            action={<Badge tone="brand">지원 페이지</Badge>}
          >
            <div className="grid gap-3">
              {[
                "등록 명단에 있는 연락처인지 먼저 확인",
                "지역, 나이, 필기성적 등 프로필 입력",
                "개인 지원 또는 조 생성으로 다음 단계 진행",
              ].map((step) => (
                <div
                  key={step}
                  className="flex items-center gap-3 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                >
                  <CheckCircle2 className="h-4 w-4 text-[var(--division-color)]" />
                  {step}
                </div>
              ))}
            </div>
          </SectionCard>

          <PhoneVerify
            title="지원 자격 확인"
            description="명단에 등록된 학생만 지원할 수 있습니다."
            actionLabel="등록 여부 확인"
            phone={phone}
            onPhoneChange={setPhone}
            onSubmit={handleVerify}
            isPending={isVerifying}
            disabled={!canVerify}
            notice={applyNotice}
          />

          {registeredStudent ? (
            <>
              <div id="apply-profile-form">
              <SectionCard
                title="지원 정보 입력"
                description="지원 완료 후 access token이 발급되고, 상태 조회와 이후 조 방 기능에 사용됩니다."
                action={
                  student ? <Badge tone="info">기존 지원 정보 불러옴</Badge> : null
                }
              >
                <div className="grid gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-500">이름</span>
                    <input
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="이름"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">성별</span>
                      <select
                        value={form.gender}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            gender: event.target.value as ApplyFormState["gender"],
                          }))
                        }
                        className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">성별 선택</option>
                        <option value="남">남</option>
                        <option value="여">여</option>
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">지역</span>
                      <select
                        value={form.region}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            region: event.target.value,
                          }))
                        }
                        className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">지역 선택</option>
                        {regions.map((region) => (
                          <option key={region} value={region}>
                            {region}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-500">직렬 / 응시 계열</span>
                    <input
                      value={form.series}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          series: event.target.value,
                        }))
                      }
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="직렬 또는 응시 계열"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">나이</span>
                      <input
                        type="number"
                        min={18}
                        max={60}
                        value={form.age}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            age: event.target.value,
                          }))
                        }
                        className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="나이"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">필기 성적</span>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={form.score}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            score: event.target.value,
                          }))
                        }
                        className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="필기성적"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">면접 경험 여부</span>
                      <select
                        value={form.interviewExperience}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            interviewExperience:
                              event.target.value as ApplyFormState["interviewExperience"],
                          }))
                        }
                        className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">선택 안 함</option>
                        <option value="있음">있음</option>
                        <option value="없음">없음</option>
                      </select>
                    </label>
                  </div>
                </div>
              </SectionCard>
              </div>

              <div className="grid gap-4">
                <SectionCard
                  title="이미 조원이 있는 경우"
                  description="조 방을 만들고 초대 링크와 비밀번호를 조원에게 공유할 수 있습니다."
                >
                  <div className="space-y-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">조 이름</span>
                      <input
                        value={roomName}
                        onChange={(event) => setRoomName(event.target.value)}
                        className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="예: 1조, 서울 스터디 조"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-500">방 비밀번호</span>
                        <input
                          type="password"
                          value={roomPassword}
                          onChange={(event) => setRoomPassword(event.target.value)}
                          className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                          placeholder="방 비밀번호"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-500">최대 인원</span>
                        <input
                          type="number"
                          min={2}
                          max={session?.maxGroupSize ?? 10}
                          value={roomMaxMembers}
                          onChange={(event) => setRoomMaxMembers(event.target.value)}
                          className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                          placeholder="최대 인원"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateRoom}
                      disabled={isPending || !canCreateRoom}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Users className="h-4 w-4" />
                      )}
                      새 조 방 만들기
                    </button>
                  </div>
                </SectionCard>

                <SectionCard
                  title="개인 지원"
                  description="조원이 없는 경우 편성 대기 상태로 등록되고 관리자 배정을 기다립니다."
                >
                  <button
                    type="button"
                    onClick={handlePersonalApply}
                    disabled={isPending || !canSubmitPersonal}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserSquare2 className="h-4 w-4" />
                    )}
                    개인으로 지원하기
                  </button>
                </SectionCard>
              </div>
            </>
          ) : null}
        </>
      )}
    </main>
    <StudentBottomNav />
    </>
  );
}
