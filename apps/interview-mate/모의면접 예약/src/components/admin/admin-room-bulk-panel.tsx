"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { CheckSquare, LoaderCircle, PlusSquare, Square } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionSummary } from "@/lib/sessions";

type AdminRoomBulkPanelProps = {
  adminKey: string;
  sessions: SessionSummary[];
  initialSessionId?: string;
  onCreated?: () => void;
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

type BulkCreatedRoom = {
  id: string;
  roomName: string | null;
  inviteCode: string;
  password: string;
  status: "recruiting" | "formed" | "closed";
  maxMembers: number;
  memberCount: number;
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

export function AdminRoomBulkPanel({
  adminKey,
  sessions,
  initialSessionId,
  onCreated,
}: AdminRoomBulkPanelProps) {
  const [sessionId, setSessionId] = useState(initialSessionId ?? "");
  const [waitingStudents, setWaitingStudents] = useState<WaitingStudent[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const [maxMembers, setMaxMembers] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastCreatedRoom, setLastCreatedRoom] = useState<BulkCreatedRoom | null>(null);
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

  const isReadOnly = selectedSession?.status !== "active";
  const allSelected =
    waitingStudents.length > 0 && selectedStudentIds.length === waitingStudents.length;

  useEffect(() => {
    if (sessionId) {
      return;
    }

    const defaultSessionId =
      initialSessionId ||
      sessions.find((session) => session.status === "active")?.id ||
      sessions[0]?.id ||
      "";

    if (defaultSessionId) {
      setSessionId(defaultSessionId);
    }
  }, [initialSessionId, sessionId, sessions]);

  const loadWaitingStudents = useCallback(
    async (nextSessionId: string) => {
      if (!nextSessionId) {
        setWaitingStudents([]);
        setSelectedStudentIds([]);
        return;
      }

      setIsLoading(true);

      try {
        const payload = await fetch(
          `/api/admin/waiting-pool?session_id=${nextSessionId}`,
          {
            headers,
          },
        ).then(readJson<{ waitingStudents: WaitingStudent[] }>);

        setWaitingStudents(payload.waitingStudents);
        setSelectedStudentIds((current) =>
          current.filter((studentId) =>
            payload.waitingStudents.some((student) => student.studentId === studentId),
          ),
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "대기자 목록을 불러오지 못했습니다.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [headers],
  );

  useEffect(() => {
    void loadWaitingStudents(sessionId);
  }, [loadWaitingStudents, sessionId]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((item) => item !== studentId)
        : [...current, studentId],
    );
  };

  const handleToggleAll = () => {
    setSelectedStudentIds(
      allSelected ? [] : waitingStudents.map((student) => student.studentId),
    );
  };

  const handleBulkCreate = () => {
    if (!sessionId) {
      toast.error("세션을 먼저 선택해 주세요.");
      return;
    }

    if (selectedStudentIds.length === 0) {
      toast.error("조 방에 넣을 대기자를 먼저 선택해 주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch("/api/admin/rooms/bulk", {
            method: "POST",
            headers,
            body: JSON.stringify({
              sessionId,
              studentIds: selectedStudentIds,
              roomName: roomName.trim() || undefined,
              password: password.trim() || undefined,
              maxMembers: maxMembers ? Number(maxMembers) : undefined,
            }),
          }).then(readJson<{ room: BulkCreatedRoom }>);

          setLastCreatedRoom(payload.room);
          setSelectedStudentIds([]);
          setRoomName("");
          setPassword("");
          setMaxMembers("");
          await loadWaitingStudents(sessionId);
          onCreated?.();
          toast.success("관리자 일괄 조 방 생성을 완료했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "조 방을 일괄 생성하지 못했습니다.",
          );
        }
      })();
    });
  };

  return (
    <SectionCard
      title="조 방 일괄 생성"
      description="대기자 여러 명을 선택해서 새 조 방을 한 번에 만들 수 있습니다. 생성된 방은 학생 `/join`·`/room` 흐름에서 바로 소비됩니다."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isReadOnly ? "neutral" : "success"}>
            {isReadOnly ? "읽기 전용" : "생성 가능"}
          </Badge>
          <Badge tone="warning">대기 {waitingStudents.length}</Badge>
          <Badge tone="info">선택 {selectedStudentIds.length}</Badge>
        </div>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.86fr)_minmax(320px,0.74fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[220px_auto]">
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
            <button
              type="button"
              onClick={handleToggleAll}
              disabled={waitingStudents.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allSelected ? (
                <CheckSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {allSelected ? "전체 해제" : "전체 선택"}
            </button>
          </div>

          <div className="grid gap-3">
            {waitingStudents.map((student) => {
              const checked = selectedStudentIds.includes(student.studentId);

              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => toggleStudent(student.studentId)}
                  className={`rounded-[10px] border px-4 py-4 text-left transition ${
                    checked
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{student.name}</p>
                        <Badge tone={checked ? "warning" : "neutral"}>
                          {student.gender}
                        </Badge>
                        <Badge tone={checked ? "info" : "brand"}>
                          {student.series}
                        </Badge>
                      </div>
                      <p
                        className={`mt-1 text-xs ${
                          checked ? "text-white/75" : "text-slate-500"
                        }`}
                      >
                        {student.phone} · {student.region}
                        {student.score !== null ? ` · ${student.score}점` : ""}
                      </p>
                      <p
                        className={`mt-2 text-xs ${
                          checked ? "text-white/60" : "text-slate-400"
                        }`}
                      >
                        대기 등록 {formatDateTime(student.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                        checked
                          ? "border-white/40 bg-white/10 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {checked ? "✓" : ""}
                    </span>
                  </div>
                </button>
              );
            })}

            {!isLoading && waitingStudents.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                현재 세션의 대기자가 없습니다.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[10px] border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">생성 설정</p>
            <p className="mt-1 text-sm text-slate-500">
              방 이름과 비밀번호를 직접 정하거나 비워 두고 자동 생성할 수 있습니다.
            </p>

            <div className="mt-4 space-y-3">
              <input
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                disabled={isReadOnly || isPending}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="방 이름(미입력 시 자동)"
              />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isReadOnly || isPending}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="비밀번호(미입력 시 자동)"
              />
              <input
                type="number"
                min={Math.max(selectedStudentIds.length, 1)}
                value={maxMembers}
                onChange={(event) => setMaxMembers(event.target.value)}
                disabled={isReadOnly || isPending}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="정원(미입력 시 자동)"
              />
            </div>

            <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              선택한 학생 {selectedStudentIds.length}명으로 새 조 방을 만듭니다.
              세션 최소 인원 이상이면 자동으로 `편성 완료`, 미만이면 `모집 중` 상태로 생성됩니다.
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleBulkCreate}
                disabled={isReadOnly || isPending || selectedStudentIds.length === 0}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <PlusSquare className="h-4 w-4" />
                )}
                조 방 생성
              </button>
            </div>
          </div>

          <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">최근 생성 결과</p>
            {lastCreatedRoom ? (
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>
                  <span className="font-semibold text-slate-900">방 이름</span>{" "}
                  {lastCreatedRoom.roomName ?? "-"}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">초대코드</span>{" "}
                  {lastCreatedRoom.inviteCode}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">비밀번호</span>{" "}
                  {lastCreatedRoom.password}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">인원</span>{" "}
                  {lastCreatedRoom.memberCount}/{lastCreatedRoom.maxMembers}명
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                아직 생성한 조 방이 없습니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
