"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { useSessionSelection } from "@/components/admin/use-session-selection";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { TRACKS } from "@/lib/constants";
import type { SessionSummary } from "@/lib/sessions";

type AdminStatsPanelProps = {
  adminKey: string;
  sessions: SessionSummary[];
  initialSessionId?: string;
  sessionId?: string;
  onSessionIdChange?: (sessionId: string) => void;
  hideSessionField?: boolean;
};

type StatsPayload = {
  session: {
    id: string;
    name: string;
    track: "police" | "fire";
    status: "active" | "archived";
    interview_date: string | null;
  };
  overview: {
    registeredCount: number;
    applicantCount: number;
    waitingCount: number;
    roomCount: number;
    confirmedReservationCount: number;
    cancelledReservationCount: number;
    slotCount: number;
    activeSlotCount: number;
    slotCapacity: number;
    slotReservedCount: number;
    totalJoinedMembers: number;
    averageRoomSize: number;
    extraRequestRoomCount: number;
  };
  roomStatus: Array<{
    label: string;
    key: "recruiting" | "formed" | "closed";
    count: number;
  }>;
  regionDistribution: Array<{
    label: string;
    count: number;
  }>;
  seriesDistribution: Array<{
    label: string;
    count: number;
  }>;
  roomOccupancy: Array<{
    roomId: string;
    roomName: string;
    status: "recruiting" | "formed" | "closed";
    memberCount: number;
    maxMembers: number;
    occupancyRate: number;
    requestExtraMembers: number;
  }>;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "통계 데이터를 불러오지 못했습니다.");
  }

  return payload;
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

function DistributionList({
  title,
  items,
  accentClass,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
  accentClass: string;
}) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="rounded-[10px] border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{title}</p>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <div key={item.label} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">{item.label}</span>
              <span className="text-slate-500">{item.count}명</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full ${accentClass}`}
                style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }}
              />
            </div>
          </div>
        ))}
        {items.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            표시할 데이터가 없습니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminStatsPanel({
  adminKey,
  sessions,
  initialSessionId,
  sessionId: controlledSessionId,
  onSessionIdChange,
  hideSessionField = false,
}: AdminStatsPanelProps) {
  const { sessionId, setSessionId } = useSessionSelection({
    sessions,
    initialSessionId,
    sessionId: controlledSessionId,
    onSessionIdChange,
  });
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setStats(null);
      return;
    }

    setIsLoading(true);

    void fetch(`/api/admin/stats?session_id=${sessionId}`, {
      headers: {
        "x-admin-key": adminKey,
      },
    })
      .then(readJson<StatsPayload>)
      .then((payload) => {
        setStats(payload);
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "통계 데이터를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [adminKey, sessionId]);

  const statsSession = stats?.session ?? null;
  const trackKey =
    statsSession?.track === "fire" || statsSession?.track === "police"
      ? statsSession.track
      : "police";
  const track = TRACKS[trackKey];
  const overview = stats?.overview ?? {
    registeredCount: 0,
    applicantCount: 0,
    waitingCount: 0,
    roomCount: 0,
    confirmedReservationCount: 0,
    cancelledReservationCount: 0,
    slotCount: 0,
    activeSlotCount: 0,
    slotCapacity: 0,
    slotReservedCount: 0,
    totalJoinedMembers: 0,
    averageRoomSize: 0,
    extraRequestRoomCount: 0,
  };
  const regionDistribution = stats?.regionDistribution ?? [];
  const seriesDistribution = stats?.seriesDistribution ?? [];
  const roomOccupancy = stats?.roomOccupancy ?? [];
  const reservationFillRate = percent(
    overview.slotReservedCount,
    overview.slotCapacity,
  );
  const applicantRate = percent(
    overview.applicantCount,
    overview.registeredCount,
  );
  const waitingRate = percent(
    overview.waitingCount,
    overview.applicantCount,
  );

  const roomStatusItems = useMemo(
    () =>
      (stats?.roomStatus ?? []).map((item) => ({
        label: item.label,
        count: item.count,
      })),
    [stats?.roomStatus],
  );

  return (
    <SectionCard
      title="운영 통계"
      description="면접 회차별 예약, 지원, 대기자, 조 편성 현황을 한 번에 확인합니다."
      action={
        <div className="flex items-center gap-2">
          {statsSession ? <Badge tone="brand">{track.label}</Badge> : null}
          <BarChart3 className="h-5 w-5 text-slate-400" />
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {!hideSessionField && (
          <select
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm md:max-w-sm"
          >
            <option value="">면접 회차 선택</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
          )}

          {statsSession ? (
            <div className="flex flex-wrap gap-2">
              <Badge
                tone={statsSession.status === "active" ? "success" : "neutral"}
              >
                {statsSession.status === "active" ? "운영 중" : "종료"}
              </Badge>
              {statsSession.interview_date ? (
                <Badge tone="info">면접일 {statsSession.interview_date}</Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">
            <div className="mx-auto inline-flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              통계 데이터를 불러오는 중입니다.
            </div>
          </div>
        ) : null}

        {!isLoading && !stats ? (
          <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-16 text-center text-sm text-slate-500">
            면접 회차를 선택하면 운영 통계를 확인할 수 있습니다.
          </div>
        ) : null}

        {!isLoading && stats ? (
          <>
            <div
              className="rounded-[10px] border p-5"
              style={{
                borderColor: track.lightColor,
                background: `linear-gradient(135deg, ${track.lightColor} 0%, #ffffff 100%)`,
              }}
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[12px] bg-white/80 px-4 py-4">
                  <p className="text-sm text-slate-500">등록 명단 대비 지원</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {overview.applicantCount} / {overview.registeredCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">지원율 {applicantRate}%</p>
                </div>
                <div className="rounded-[12px] bg-white/80 px-4 py-4">
                  <p className="text-sm text-slate-500">예약 확정</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {overview.confirmedReservationCount}건
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    예약 시간 충원율 {reservationFillRate}%
                  </p>
                </div>
                <div className="rounded-[12px] bg-white/80 px-4 py-4">
                  <p className="text-sm text-slate-500">대기자</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {overview.waitingCount}명
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    지원자 대비 {waitingRate}%
                  </p>
                </div>
                <div className="rounded-[12px] bg-white/80 px-4 py-4">
                  <p className="text-sm text-slate-500">조 방 운영</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {overview.roomCount}개
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    평균 {overview.averageRoomSize}명 / 추가 요청 {overview.extraRequestRoomCount}건
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">예약 시간</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {overview.activeSlotCount} / {overview.slotCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">활성 예약 시간 수</p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">예약 취소</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {overview.cancelledReservationCount}건
                </p>
                <p className="mt-1 text-xs text-slate-500">운영 중 취소 이력</p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">조 배정 인원</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {overview.totalJoinedMembers}명
                </p>
                <p className="mt-1 text-xs text-slate-500">현재 방에 배정된 인원</p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-500">추가 요청 방</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {overview.extraRequestRoomCount}개
                </p>
                <p className="mt-1 text-xs text-slate-500">추가 인원 요청이 남은 방</p>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="space-y-5">
                <DistributionList
                  title="지역 분포"
                  items={regionDistribution}
                  accentClass="bg-slate-900"
                />
                <DistributionList
                  title="직렬 분포"
                  items={seriesDistribution}
                  accentClass="bg-slate-400"
                />
              </div>

              <div className="space-y-5">
                <DistributionList
                  title="방 상태 분포"
                  items={roomStatusItems}
                  accentClass="bg-[var(--division-color)]"
                />

                <div className="rounded-[10px] border border-slate-200 bg-white p-5">
                  <p className="text-sm text-slate-500">방 충원 현황</p>
                  <div className="mt-4 grid gap-3">
                    {roomOccupancy.map((room) => (
                      <div key={room.roomId} className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {room.roomName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {room.memberCount}/{room.maxMembers}명 · {room.status}
                              {room.requestExtraMembers > 0
                                ? ` · 추가 요청 ${room.requestExtraMembers}명`
                                : ""}
                            </p>
                          </div>
                          <Badge
                            tone={
                              room.status === "formed"
                                ? "success"
                                : room.status === "closed"
                                  ? "neutral"
                                  : "info"
                            }
                          >
                            {room.occupancyRate}%
                          </Badge>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-[var(--division-color)]"
                            style={{ width: `${Math.max(room.occupancyRate, 6)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {roomOccupancy.length === 0 ? (
                      <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        생성된 조 방이 없습니다.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}
