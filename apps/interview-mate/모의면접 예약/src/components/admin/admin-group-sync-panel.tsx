"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionSummary } from "@/lib/sessions";

type AdminGroupSyncPanelProps = {
  adminKey: string;
  sessions: SessionSummary[];
  initialSessionId?: string;
  onImported?: (sessionId: string) => void;
};

type DownloadTarget = "study-groups" | "sms" | null;

type ImportSummary = {
  roomCount: number;
  assignedCount: number;
  waitingCount: number;
  unmatchedCount: number;
  rooms: Array<{
    roomId: string;
    roomName: string;
    inviteCode: string;
    password: string;
    memberCount: number;
  }>;
  unmatchedRows: Array<{
    name: string;
    phone: string;
    groupNumber: number | null;
  }>;
};

async function extractErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };

  return payload.message ?? "요청을 처리하지 못했습니다.";
}

function getFileNameFromDisposition(value: string | null) {
  if (!value) {
    return null;
  }

  const encodedMatch = value.match(/filename\*=UTF-8''([^;]+)/i);

  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const plainMatch = value.match(/filename=\"?([^\"]+)\"?/i);
  return plainMatch?.[1] ?? null;
}

export function AdminGroupSyncPanel({
  adminKey,
  sessions,
  initialSessionId,
  onImported,
}: AdminGroupSyncPanelProps) {
  const [sessionId, setSessionId] = useState(initialSessionId ?? "");
  const [downloadTarget, setDownloadTarget] = useState<DownloadTarget>(null);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const headers = useMemo(
    () => ({
      "x-admin-key": adminKey,
    }),
    [adminKey],
  );

  useEffect(() => {
    if (!sessionId && initialSessionId) {
      setSessionId(initialSessionId);
    }
  }, [initialSessionId, sessionId]);

  const selectedSession = sessions.find((session) => session.id === sessionId) ?? null;

  const handleDownload = async (target: Exclude<DownloadTarget, null>) => {
    if (!sessionId) {
      toast.error("먼저 세션을 선택해 주세요.");
      return;
    }

    setDownloadTarget(target);

    try {
      const path =
        target === "study-groups"
          ? `/api/admin/exports/study-groups?session_id=${sessionId}`
          : `/api/admin/sms?session_id=${sessionId}`;
      const response = await fetch(path, { headers });

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
        target === "study-groups"
          ? "조 편성 CSV를 내려받았습니다."
          : "SMS CSV를 내려받았습니다.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "파일을 내려받지 못했습니다.",
      );
    } finally {
      setDownloadTarget(null);
    }
  };

  const handleImport = async () => {
    if (!sessionId) {
      toast.error("먼저 세션을 선택해 주세요.");
      return;
    }

    if (!importFile) {
      toast.error("가져올 조 편성 결과 파일을 선택해 주세요.");
      return;
    }

    setImporting(true);

    try {
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("file", importFile);

      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const payload = (await response.json()) as ImportSummary;
      setSummary(payload);
      setImportFile(null);
      setFileInputKey((current) => current + 1);
      onImported?.(sessionId);
      toast.success(
        `${payload.roomCount}개 조 방과 ${payload.assignedCount}명 배정을 반영했습니다.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "조 편성 결과를 가져오지 못했습니다.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <SectionCard
      title="조 편성 연동"
      description="기존 조 편성 프로그램과 호환되는 CSV를 내보내고, 편성 결과를 다시 가져와 조 방과 SMS 발송 데이터를 한 번에 준비합니다."
    >
      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
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

          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            {selectedSession
              ? `${selectedSession.name} 세션 기준으로 조 편성 CSV와 SMS CSV를 처리합니다.`
              : "세션을 선택하면 조 편성 CSV 다운로드, 결과 가져오기, SMS CSV 다운로드를 진행할 수 있습니다."}
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => void handleDownload("study-groups")}
              disabled={downloadTarget !== null || importing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloadTarget === "study-groups" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              조 편성 CSV 다운로드
            </button>

            <input
              key={fileInputKey}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
            />

            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing || downloadTarget !== null}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              조 편성 결과 가져오기
            </button>

            <button
              type="button"
              onClick={() => void handleDownload("sms")}
              disabled={downloadTarget !== null || importing}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloadTarget === "sms" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              SMS CSV 다운로드
            </button>
          </div>

          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600">
            조 편성 CSV 헤더는 `이름,연락처,성별,직렬,지역,나이,필기성적,조` 형식을 유지합니다.
            결과 파일을 가져오면 기존 조 방과 대기자 배정 상태를 세션 단위로 다시 구성합니다.
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-[16px] border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">가져오기 결과</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {summary ? `${summary.roomCount}개 조 방 반영` : "아직 가져오기 전"}
                </p>
              </div>
              <Badge tone={summary ? "success" : "neutral"}>
                {summary ? "latest import" : "pending"}
              </Badge>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs text-slate-500">배정 완료</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {summary?.assignedCount ?? 0}명
                </p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs text-slate-500">대기 유지</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {summary?.waitingCount ?? 0}명
                </p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs text-slate-500">매칭 실패</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {summary?.unmatchedCount ?? 0}건
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {summary?.rooms.slice(0, 6).map((room) => (
                <div
                  key={room.roomId}
                  className="rounded-[10px] border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {room.roomName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {room.memberCount}명 쨌 초대코드 {room.inviteCode} 쨌 비밀번호 {room.password}
                      </p>
                    </div>
                    <Badge tone="brand">room</Badge>
                  </div>
                </div>
              ))}
              {summary && summary.rooms.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  생성된 조 방이 없습니다.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[16px] border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">매칭 실패 미리보기</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {summary?.unmatchedCount
                    ? `${summary.unmatchedCount}건 확인 필요`
                    : "문제 없음"}
                </p>
              </div>
              <Badge tone={summary?.unmatchedCount ? "warning" : "success"}>
                {summary?.unmatchedCount ? "check rows" : "clean"}
              </Badge>
            </div>

            <div className="mt-5 grid gap-3">
              {summary?.unmatchedRows.map((row, index) => (
                <div
                  key={`${row.phone}-${index}`}
                  className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-4"
                >
                  <p className="text-sm font-semibold text-amber-900">{row.name}</p>
                  <p className="mt-1 text-xs text-amber-800">
                    {row.phone} 쨌 조 {row.groupNumber ?? "-"}
                  </p>
                </div>
              ))}
              {summary && summary.unmatchedRows.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  현재 세션 학생과 모두 정상 매칭됐습니다.
                </div>
              ) : null}
              {!summary ? (
                <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  조 편성 결과를 가져오면 매칭 실패 행을 여기에서 바로 확인할 수 있습니다.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
