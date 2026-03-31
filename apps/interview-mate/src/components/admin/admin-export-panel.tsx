"use client";

import { useMemo, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { useSessionSelection } from "@/components/admin/use-session-selection";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionSummary } from "@/lib/sessions";

type AdminExportPanelProps = {
  adminKey: string;
  sessions: SessionSummary[];
  initialSessionId?: string;
  sessionId?: string;
  onSessionIdChange?: (sessionId: string) => void;
  hideSessionField?: boolean;
};

type ExportTarget = "reservations" | "rooms" | null;

async function extractErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  return payload.message ?? "파일을 내려받지 못했습니다.";
}

function getFileNameFromDisposition(value: string | null) {
  if (!value) {
    return null;
  }

  const encodedMatch = value.match(/filename\*=UTF-8''([^;]+)/i);

  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const plainMatch = value.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] ?? null;
}

export function AdminExportPanel({
  adminKey,
  sessions,
  initialSessionId,
  sessionId: controlledSessionId,
  onSessionIdChange,
  hideSessionField = false,
}: AdminExportPanelProps) {
  const { sessionId, setSessionId } = useSessionSelection({
    sessions,
    initialSessionId,
    sessionId: controlledSessionId,
    onSessionIdChange,
  });
  const [exportTarget, setExportTarget] = useState<ExportTarget>(null);

  const headers = useMemo(
    () => ({
      "x-admin-key": adminKey,
    }),
    [adminKey],
  );

  const selectedSession = sessions.find((session) => session.id === sessionId) ?? null;

  const handleExport = async (target: Exclude<ExportTarget, null>) => {
    if (!sessionId) {
      toast.error("내보낼 면접 회차를 먼저 선택해 주세요.");
      return;
    }

    setExportTarget(target);

    try {
      const response = await fetch(
        `/api/admin/exports/${target}?session_id=${sessionId}`,
        {
          headers,
        },
      );

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const blob = await response.blob();
      const filename =
        getFileNameFromDisposition(response.headers.get("Content-Disposition")) ??
        `${target}-${sessionId}.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      toast.success(
        target === "reservations"
          ? "예약 CSV를 내려받았습니다."
          : "조 편성 CSV를 내려받았습니다.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "파일을 내려받지 못했습니다.",
      );
    } finally {
      setExportTarget(null);
    }
  };

  return (
    <SectionCard
      title="내보내기"
      description="예약 현황과 조 편성 결과를 CSV로 내려받아 엑셀 검수나 운영 보고에 바로 사용할 수 있습니다."
    >
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3">
          {!hideSessionField && (
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
          )}
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            {selectedSession
              ? `${selectedSession.name} 회차의 예약 현황과 조 편성 결과를 각각 CSV로 다운로드합니다.`
              : "먼저 면접 회차를 선택하면 예약/조 편성 데이터를 내려받을 수 있습니다."}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[10px] border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">모의면접 예약 CSV</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  모의면접 예약 내보내기
                </p>
              </div>
              <Badge tone="info">reservation</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              이름, 연락처, 예약 상태, 예약 시간, 예약 경로, 취소 사유까지 한 파일로
              내려받습니다.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void handleExport("reservations")}
                disabled={exportTarget !== null}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exportTarget === "reservations" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                예약 CSV 다운로드
              </button>
            </div>
          </div>

          <div className="rounded-[10px] border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">조 편성 CSV</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  방 배정 결과 내보내기
                </p>
              </div>
              <Badge tone="brand">room</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              방 정보, 비밀번호, 멤버 역할, 연락처, 지역, 점수, 입장 시각까지 현재
              편성 기준으로 내려받습니다.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void handleExport("rooms")}
                disabled={exportTarget !== null}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exportTarget === "rooms" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                조 편성 CSV 다운로드
              </button>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
