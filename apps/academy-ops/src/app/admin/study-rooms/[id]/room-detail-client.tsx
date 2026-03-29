"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookingStatus } from "@prisma/client";
import { BOOKING_STATUS_LABEL } from "@/lib/constants";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlyStats {
  monthLabel: string;
  totalBookings: number;
  confirmedBookings: number;
  bookedHours: number;
  availableHours: number;
  utilizationRate: number;
  topBookers: Array<{ examNumber: string; name: string; count: number }>;
}

export interface RoomDetailProps {
  room: {
    id: string;
    name: string;
    capacity: number;
    description: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
  };
  recentBookings: BookingRowDetail[];
  stats: {
    totalBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    noshowBookings: number;
    uniqueStudents: number;
  };
  monthlyStats: MonthlyStats;
}

export interface BookingRowDetail {
  id: string;
  roomId: string;
  examNumber: string;
  bookingDate: string; // ISO string
  startTime: string;
  endTime: string;
  status: string;
  note: string | null;
  createdAt: string;
  student: {
    examNumber: string;
    name: string;
    generation: number | null;
    phone: string | null;
  };
  assigner: { name: string };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: "bg-forest/10 text-forest border-forest/20",
  CANCELLED: "bg-ink/5 text-slate border-ink/10",
  NOSHOW: "bg-red-50 text-red-600 border-red-200",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateKo(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatDateTimeKo(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Toggle active button ────────────────────────────────────────────────────

function ToggleActiveButton({
  roomId,
  isActive,
}: {
  roomId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localActive, setLocalActive] = useState(isActive);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/study-rooms/${roomId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !localActive }),
        });
        const data = (await res.json()) as { room?: { isActive: boolean }; error?: string };
        if (!res.ok) throw new Error(data.error ?? "상태 변경 실패");
        setLocalActive(data.room?.isActive ?? !localActive);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "상태 변경 실패");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
          localActive
            ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
            : "border border-forest/30 bg-forest/10 text-forest hover:bg-forest/20"
        }`}
      >
        {isPending ? "처리 중…" : localActive ? "비활성화" : "활성화"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RoomDetailClient({ room, recentBookings, stats, monthlyStats }: RoomDetailProps) {
  return (
    <div className="space-y-8">
      {/* ── Room info card ──────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-8 py-5">
          <h2 className="text-base font-semibold text-ink">스터디룸 정보</h2>
        </div>
        <div className="px-8 py-6">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* 호실명 */}
            <div>
              <dt className="text-xs font-medium text-slate">호실명</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{room.name}</dd>
            </div>

            {/* 수용 인원 */}
            <div>
              <dt className="text-xs font-medium text-slate">수용 인원</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{room.capacity}명</dd>
            </div>

            {/* 정렬 순서 */}
            <div>
              <dt className="text-xs font-medium text-slate">정렬 순서</dt>
              <dd className="mt-1 text-sm text-ink">{room.sortOrder}</dd>
            </div>

            {/* 활성 여부 */}
            <div>
              <dt className="text-xs font-medium text-slate">활성 여부</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-semibold ${
                    room.isActive
                      ? "border-forest/20 bg-forest/10 text-forest"
                      : "border-ink/10 bg-ink/5 text-slate"
                  }`}
                >
                  {room.isActive ? "활성" : "비활성"}
                </span>
              </dd>
            </div>

            {/* 설명 */}
            {room.description && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate">설명</dt>
                <dd className="mt-1 text-sm text-ink">{room.description}</dd>
              </div>
            )}

            {/* 등록일 */}
            <div>
              <dt className="text-xs font-medium text-slate">등록일</dt>
              <dd className="mt-1 text-sm text-ink">{formatDateTimeKo(room.createdAt)}</dd>
            </div>

            {/* 최종 수정 */}
            <div>
              <dt className="text-xs font-medium text-slate">최종 수정</dt>
              <dd className="mt-1 text-sm text-ink">{formatDateTimeKo(room.updatedAt)}</dd>
            </div>
          </dl>

          {/* Status toggle */}
          <div className="mt-6 border-t border-ink/10 pt-5">
            <p className="mb-3 text-xs font-medium text-slate">상태 변경</p>
            <ToggleActiveButton roomId={room.id} isActive={room.isActive} />
          </div>
        </div>
      </div>

      {/* ── All-time statistics ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="총 예약" value={stats.totalBookings} unit="건" />
        <StatCard label="확정" value={stats.confirmedBookings} unit="건" color="forest" />
        <StatCard label="취소" value={stats.cancelledBookings} unit="건" />
        <StatCard label="노쇼" value={stats.noshowBookings} unit="건" color="red" />
        <StatCard label="이용 학생" value={stats.uniqueStudents} unit="명" />
      </div>

      {/* ── Monthly statistics ───────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-8 py-5">
          <h2 className="text-base font-semibold text-ink">
            이달 통계{" "}
            <span className="ml-2 text-sm font-normal text-slate">{monthlyStats.monthLabel}</span>
          </h2>
        </div>
        <div className="px-8 py-6 space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-[16px] border border-ink/10 bg-mist/40 px-5 py-4">
              <p className="text-xs font-medium text-slate">이달 예약</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {monthlyStats.totalBookings}
                <span className="ml-1 text-sm font-normal text-slate">건</span>
              </p>
            </div>
            <div className="rounded-[16px] border border-forest/20 bg-forest/5 px-5 py-4">
              <p className="text-xs font-medium text-slate">확정</p>
              <p className="mt-1 text-2xl font-bold text-forest">
                {monthlyStats.confirmedBookings}
                <span className="ml-1 text-sm font-normal text-slate">건</span>
              </p>
            </div>
            <div className="rounded-[16px] border border-ink/10 bg-mist/40 px-5 py-4">
              <p className="text-xs font-medium text-slate">예약 시간</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {monthlyStats.bookedHours}
                <span className="ml-1 text-sm font-normal text-slate">h</span>
              </p>
            </div>
            <div className="rounded-[16px] border border-ember/20 bg-ember/5 px-5 py-4">
              <p className="text-xs font-medium text-slate">이용률</p>
              <p className="mt-1 text-2xl font-bold text-ember">
                {monthlyStats.utilizationRate}
                <span className="ml-1 text-sm font-normal text-slate">%</span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate">
                {monthlyStats.availableHours}h 기준
              </p>
            </div>
          </div>

          {/* Top bookers */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">이달 TOP 3 이용 학생</h3>
            {monthlyStats.topBookers.length === 0 ? (
              <p className="text-sm text-slate">이달 확정 예약이 없습니다.</p>
            ) : (
              <ol className="space-y-2">
                {monthlyStats.topBookers.map((booker, idx) => (
                  <li
                    key={booker.examNumber}
                    className="flex items-center gap-3 rounded-[12px] border border-ink/10 bg-mist/30 px-4 py-3"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        idx === 0
                          ? "bg-amber-400 text-white"
                          : idx === 1
                            ? "bg-slate/30 text-ink"
                            : "bg-orange-200 text-orange-800"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <Link
                      href={`/admin/students/${booker.examNumber}`}
                      className="text-sm font-medium text-forest hover:underline"
                    >
                      {booker.name}
                    </Link>
                    <span className="text-xs text-slate">{booker.examNumber}</span>
                    <span className="ml-auto text-sm font-semibold text-ink">
                      {booker.count}건
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent bookings ──────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-ink/10 px-8 py-5">
          <h2 className="text-base font-semibold text-ink">예약 이력</h2>
          <span className="text-xs text-slate">최근 50건</span>
        </div>

        {recentBookings.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate">예약 이력이 없습니다.</div>
        ) : (
          <div className="divide-y divide-ink/5">
            {recentBookings.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-8 py-4"
              >
                {/* Status badge */}
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[b.status] ?? ""}`}
                >
                  {BOOKING_STATUS_LABEL[b.status as BookingStatus]}
                </span>

                {/* Date */}
                <span className="text-sm font-medium text-ink">
                  {formatDateKo(b.bookingDate)}
                </span>

                {/* Time range */}
                <span className="text-xs text-slate">
                  {b.startTime} ~ {b.endTime}
                </span>

                {/* Student */}
                <Link
                  href={`/admin/students/${b.student.examNumber}`}
                  className="text-sm font-medium text-forest hover:underline"
                >
                  {b.student.name}
                </Link>
                {b.student.generation != null && (
                  <span className="text-xs text-slate">{b.student.generation}기</span>
                )}
                <span className="text-xs text-slate/70">{b.student.examNumber}</span>

                {/* Note */}
                {b.note && (
                  <span className="text-xs italic text-slate">{b.note}</span>
                )}

                {/* Assigner */}
                <span className="ml-auto text-xs text-slate">배정: {b.assigner.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color?: "forest" | "red";
}) {
  const valueClass =
    color === "forest"
      ? "text-forest"
      : color === "red"
        ? "text-red-600"
        : "text-ink";

  return (
    <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
      <p className="text-xs font-medium text-slate">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>
        {value}
        <span className="ml-1 text-sm font-normal text-slate">{unit}</span>
      </p>
    </div>
  );
}
