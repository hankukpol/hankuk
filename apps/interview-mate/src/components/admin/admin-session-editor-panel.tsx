"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { useSessionSelection } from "@/components/admin/use-session-selection";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { TRACKS, type Track } from "@/lib/constants";
import type { SessionSummary } from "@/lib/sessions";

type AdminSessionEditorPanelProps = {
  adminKey: string;
  sessions: SessionSummary[];
  initialSessionId?: string;
  sessionId?: string;
  onSessionIdChange?: (sessionId: string) => void;
  hideSessionField?: boolean;
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
  sessionId: controlledSessionId,
  onSessionIdChange,
  hideSessionField = false,
  onUpdated,
}: AdminSessionEditorPanelProps) {
  const { sessionId, setSessionId, selectedSession } = useSessionSelection({
    sessions,
    initialSessionId,
    sessionId: controlledSessionId,
    onSessionIdChange,
  });
  const [form, setForm] = useState<SessionEditForm>(() => createEditForm(null));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setForm(createEditForm(selectedSession));
  }, [selectedSession]);

  const canSubmit = Boolean(selectedSession && form.name.trim());

  const handleSubmit = () => {
    if (!selectedSession) {
      toast.error("수정할 면접 회차를 선택해 주세요.");
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
          toast.success("면접반 설정을 저장했습니다.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "면접반 설정을 저장하지 못했습니다.",
          );
        }
      })();
    });
  };

  return (
    <SectionCard
      title="면접반 설정"
      description="선택한 면접 회차의 이름, 일정, 조 편성 기준 인원을 수정합니다."
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
        {!hideSessionField && (
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-slate-500">수정할 회차</span>
          <select
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">면접 회차 선택</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </label>
        )}

        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-slate-500">회차 이름</span>
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="예: 2026 상반기 경찰 면접반"
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
        여기서 바꾼 회차 정보는 공개 화면의 예약 기간, 지원 기간, 조 편성 기준에도
        바로 반영됩니다.
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
          면접반 저장
        </button>
      </div>
    </SectionCard>
  );
}
