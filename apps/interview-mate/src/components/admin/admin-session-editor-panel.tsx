"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { LoaderCircle, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { TRACKS, type Track } from "@/lib/constants";
import type { SessionSummary } from "@/lib/sessions";

type AdminSessionEditorPanelProps = {
  adminKey: string;
  sessions: SessionSummary[];
  initialSessionId?: string;
  onUpdated: (session: SessionSummary) => void;
};

type SessionEditForm = {
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

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "요청을 처리하지 못했습니다.");
  }

  return payload;
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function createEditForm(session: SessionSummary | null): SessionEditForm {
  return {
    name: session?.name ?? "",
    track: session?.track ?? "police",
    reservationOpenAt: toDatetimeLocalValue(session?.reservationOpenAt ?? null),
    reservationCloseAt: toDatetimeLocalValue(session?.reservationCloseAt ?? null),
    applyOpenAt: toDatetimeLocalValue(session?.applyOpenAt ?? null),
    applyCloseAt: toDatetimeLocalValue(session?.applyCloseAt ?? null),
    interviewDate: session?.interviewDate ?? "",
    maxGroupSize: session?.maxGroupSize ?? 10,
    minGroupSize: session?.minGroupSize ?? 6,
  };
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function AdminSessionEditorPanel({
  adminKey,
  sessions,
  initialSessionId,
  onUpdated,
}: AdminSessionEditorPanelProps) {
  const [sessionId, setSessionId] = useState(initialSessionId ?? "");
  const [form, setForm] = useState<SessionEditForm>(() => createEditForm(null));
  const [isPending, startTransition] = useTransition();

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

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessionId, sessions],
  );

  useEffect(() => {
    setForm(createEditForm(selectedSession));
  }, [selectedSession]);

  const canSubmit = Boolean(selectedSession && form.name.trim());

  const handleSubmit = () => {
    if (!selectedSession) {
      toast.error("수정할 세션을 선택해주세요.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = await fetch(`/api/admin/sessions/${selectedSession.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-admin-key": adminKey,
            },
            body: JSON.stringify({
              name: form.name.trim(),
              track: form.track,
              reservationOpenAt: toIsoOrNull(form.reservationOpenAt),
              reservationCloseAt: toIsoOrNull(form.reservationCloseAt),
              applyOpenAt: toIsoOrNull(form.applyOpenAt),
              applyCloseAt: toIsoOrNull(form.applyCloseAt),
              interviewDate: form.interviewDate || null,
              maxGroupSize: form.maxGroupSize,
              minGroupSize: form.minGroupSize,
            }),
          }).then(readJson<{ session: SessionSummary }>);

          onUpdated(payload.session);
          toast.success("세션 설정을 저장했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "세션 설정을 저장하지 못했습니다.",
          );
        }
      })();
    });
  };

  return (
    <SectionCard
      title="세션 수정"
      description="운영 중이거나 종료된 세션의 이름, 기간, 면접일, 조 편성 기준 인원을 다시 조정합니다."
      action={
        selectedSession ? (
          <div className="flex items-center gap-2">
            <Badge tone="brand">{TRACKS[selectedSession.track].label}</Badge>
            <Badge tone={selectedSession.status === "active" ? "success" : "neutral"}>
              {selectedSession.status}
            </Badge>
          </div>
        ) : null
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-slate-500">대상 세션</span>
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
        </label>

        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-slate-500">세션 이름</span>
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="세션 이름"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">직렬</span>
          <select
            value={form.track}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                track: event.target.value as Track,
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="police">경찰</option>
            <option value="fire">소방</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">면접일</span>
          <input
            type="date"
            value={form.interviewDate}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                interviewDate: event.target.value,
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">예약 시작일시</span>
          <input
            type="datetime-local"
            value={form.reservationOpenAt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                reservationOpenAt: event.target.value,
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">예약 마감일시</span>
          <input
            type="datetime-local"
            value={form.reservationCloseAt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                reservationCloseAt: event.target.value,
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">지원 시작일시</span>
          <input
            type="datetime-local"
            value={form.applyOpenAt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                applyOpenAt: event.target.value,
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">지원 마감일시</span>
          <input
            type="datetime-local"
            value={form.applyCloseAt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                applyCloseAt: event.target.value,
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">최대 조 인원</span>
          <input
            type="number"
            min={1}
            value={form.maxGroupSize}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                maxGroupSize: Number(event.target.value),
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">최소 조 인원</span>
          <input
            type="number"
            min={1}
            value={form.minGroupSize}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                minGroupSize: Number(event.target.value),
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        세션 수정은 관리자 전용 설정이며, 공개 화면에서는 같은 세션 정보를 예약/지원 기간 계산에 그대로 사용합니다.
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
          className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <PencilLine className="h-4 w-4" />
          )}
          세션 저장
        </button>
      </div>
    </SectionCard>
  );
}
