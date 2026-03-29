import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
const HOUR_RANGE = Array.from({ length: 14 }, (_, i) => i + 8); // 08~21
const ANALYSIS_WEEKS = 8; // how many weeks of history to analyze

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getKoWeekday(date: Date): number {
  // Returns 0=Mon … 6=Sun
  return (date.getDay() + 6) % 7;
}

function cellBg(count: number, max: number): string {
  if (max === 0 || count === 0) return "bg-ink/5 text-slate/30";
  const ratio = count / max;
  if (ratio >= 0.75) return "bg-red-400 text-white font-semibold";
  if (ratio >= 0.5) return "bg-amber-400 text-white font-semibold";
  if (ratio >= 0.25) return "bg-forest/60 text-white";
  return "bg-forest/20 text-forest";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudyRoomPeakHoursPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - ANALYSIS_WEEKS * 7);

  // Fetch all active rooms
  const rooms = await prisma.studyRoom.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // Fetch bookings in analysis window
  const bookings = await prisma.studyRoomBooking.findMany({
    where: {
      bookingDate: { gte: startDate, lte: today },
      status: { in: ["CONFIRMED", "NOSHOW"] },
    },
    select: {
      roomId: true,
      bookingDate: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });

  // ── Build heatmap: dayOfWeek(0-6) × hour(8-21) → count ─────────────────────
  // A booking covers every hour from startHour to endHour-1
  type HeatCell = number[][];
  const heatmap: HeatCell = Array.from({ length: 7 }, () => Array(14).fill(0));

  // Per-room daily booking count map: roomId → weekday → count[]
  const roomDailyMap: Record<string, number[]> = {};
  for (const room of rooms) {
    roomDailyMap[room.id] = Array(7).fill(0);
  }

  // Count distinct days for averaging
  const dayCount = Array(7).fill(0);
  const seenDays = new Set<string>();

  for (const b of bookings) {
    const d = new Date(b.bookingDate);
    const weekday = getKoWeekday(d);
    const dateKey = `${d.toISOString().slice(0, 10)}-${weekday}`;
    if (!seenDays.has(dateKey)) {
      seenDays.add(dateKey);
      dayCount[weekday]++;
    }

    // Parse hours
    const startH = parseInt(b.startTime.slice(0, 2), 10);
    const endH = parseInt(b.endTime.slice(0, 2), 10);

    for (let h = startH; h < endH; h++) {
      const hIdx = h - 8;
      if (hIdx >= 0 && hIdx < 14) {
        heatmap[weekday][hIdx]++;
      }
    }

    // Per-room daily count
    if (roomDailyMap[b.roomId]) {
      roomDailyMap[b.roomId][weekday]++;
    }
  }

  // Max value in heatmap for color scaling
  const maxCell = Math.max(...heatmap.flat(), 1);

  // ── Top 3 peak hours (flatten heatmap cells) ──────────────────────────────
  type PeakSlot = { day: number; hour: number; count: number };
  const allSlots: PeakSlot[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 14; h++) {
      if (heatmap[d][h] > 0) {
        allSlots.push({ day: d, hour: h + 8, count: heatmap[d][h] });
      }
    }
  }
  allSlots.sort((a, b) => b.count - a.count);
  const top3 = allSlots.slice(0, 3);

  // ── Low-demand slots (bottom quartile, only if any bookings exist) ─────────
  const nonZero = allSlots.filter((s) => s.count > 0);
  const q1Threshold =
    nonZero.length > 0 ? nonZero[Math.floor(nonZero.length * 0.75)]?.count ?? 0 : 0;
  const lowSlots = allSlots
    .filter((s) => s.count > 0 && s.count <= q1Threshold)
    .slice(-3)
    .reverse();

  // ── Per-room avg daily bookings ───────────────────────────────────────────
  const roomStats = rooms.map((room) => {
    const totals = roomDailyMap[room.id] ?? Array(7).fill(0);
    const totalBookings = totals.reduce((s, n) => s + n, 0);
    const totalDays = dayCount.reduce((s, n) => s + n, 0);
    const avgPerDay = totalDays > 0 ? totalBookings / totalDays : 0;
    return { ...room, avgPerDay: Math.round(avgPerDay * 10) / 10, totalBookings, totals };
  });

  const maxAvgPerDay = Math.max(...roomStats.map((r) => r.avgPerDay), 1);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">스터디룸 피크 시간 분석</h1>
          <p className="mt-3 text-sm leading-7 text-slate">
            최근 {ANALYSIS_WEEKS}주간 예약 데이터를 기반으로 요일별·시간대별 이용 패턴을
            분석합니다.
          </p>
        </div>
        <Link
          href="/admin/study-rooms"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 스터디룸 목록
        </Link>
      </div>

      {/* Peak / Low highlights */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* Top 3 peak */}
        <div className="rounded-[20px] border border-red-100 bg-red-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-700">
            피크 시간대 TOP 3
          </p>
          {top3.length === 0 ? (
            <p className="mt-3 text-sm text-slate">데이터 없음</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {top3.map((s, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-400 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    {DAY_NAMES[s.day]}요일 {String(s.hour).padStart(2, "0")}:00
                  </span>
                  <span className="ml-auto text-xs text-red-700 font-medium">
                    누적 {s.count}건
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Low demand */}
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">
            비수기 시간 (스케줄 최적화)
          </p>
          {lowSlots.length === 0 ? (
            <p className="mt-3 text-sm text-slate">데이터 없음</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {lowSlots.map((s, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest/30 text-xs font-bold text-forest">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    {DAY_NAMES[s.day]}요일 {String(s.hour).padStart(2, "0")}:00
                  </span>
                  <span className="ml-auto text-xs text-forest font-medium">
                    누적 {s.count}건
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-ink">요일 × 시간 히트맵</h2>
        <p className="mt-1 text-xs text-slate">
          색상: <span className="text-forest font-medium">초록 (낮음)</span> →{" "}
          <span className="text-amber-600 font-medium">주황 (중간)</span> →{" "}
          <span className="text-red-500 font-medium">빨강 (높음)</span>
        </p>

        <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10 bg-white">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-mist px-3 py-2 text-left text-xs font-semibold text-slate">
                  요일 \ 시간
                </th>
                {HOUR_RANGE.map((h) => (
                  <th
                    key={h}
                    className="min-w-[36px] bg-mist px-1 py-2 text-center font-semibold text-slate"
                  >
                    {h}시
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_NAMES.map((dayName, di) => (
                <tr key={di}>
                  <td className="sticky left-0 border-t border-ink/5 bg-mist px-3 py-2 font-semibold text-ink">
                    {dayName}
                  </td>
                  {HOUR_RANGE.map((h, hi) => {
                    const count = heatmap[di][hi];
                    return (
                      <td
                        key={h}
                        className={`border-t border-ink/5 px-1 py-2 text-center text-[11px] transition-all ${cellBg(count, maxCell)}`}
                        title={`${dayName}요일 ${h}시 · ${count}건`}
                      >
                        {count > 0 ? count : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-room bar chart (horizontal) */}
      {roomStats.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-ink">룸별 일평균 예약 건수</h2>
          <div className="mt-4 space-y-3">
            {roomStats
              .slice()
              .sort((a, b) => b.avgPerDay - a.avgPerDay)
              .map((room) => (
                <div key={room.id} className="flex items-center gap-3">
                  <Link
                    href={`/admin/study-rooms/${room.id}`}
                    className="w-28 shrink-0 text-sm font-semibold text-ink hover:text-ember truncate"
                  >
                    {room.name}
                  </Link>
                  <div className="flex-1">
                    <div className="h-5 w-full overflow-hidden rounded-full bg-ink/5">
                      <div
                        className="h-full rounded-full bg-forest transition-all"
                        style={{ width: `${(room.avgPerDay / maxAvgPerDay) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs font-semibold text-slate">
                    평균 {room.avgPerDay}건/일
                  </span>
                </div>
              ))}
          </div>

          {/* Per-room weekday breakdown */}
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead className="bg-mist">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">룸</th>
                  {DAY_NAMES.map((d) => (
                    <th
                      key={d}
                      className="px-3 py-3 text-center text-xs font-semibold text-slate"
                    >
                      {d}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {roomStats.map((room) => (
                  <tr key={room.id} className="hover:bg-mist/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/study-rooms/${room.id}`}
                        className="hover:text-ember"
                      >
                        {room.name}
                      </Link>
                    </td>
                    {room.totals.map((cnt, di) => (
                      <td key={di} className="px-3 py-3 text-center text-xs text-ink">
                        {cnt > 0 ? cnt : <span className="text-slate/30">-</span>}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center text-xs font-semibold text-ink">
                      {room.totalBookings}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
