"use client";

import Link from "next/link";
import type { StaffWorkloadItem } from "@/app/api/admin/staff/workload/route";
import { ROLE_LABEL } from "@/lib/constants";
import type { AdminRole } from "@prisma/client";

// ── 업무 부하 상태 계산 ───────────────────────────────────────────────────────

type WorkloadStatus = "과부하" | "보통" | "여유";

function getWorkloadStatus(item: StaffWorkloadItem): WorkloadStatus {
  if (item.recentCounseledStudents > 50 || item.pendingProspects > 5) return "과부하";
  if (item.recentCounseledStudents >= 30 || item.pendingProspects >= 3) return "보통";
  return "여유";
}

const STATUS_DOT: Record<WorkloadStatus, string> = {
  과부하: "bg-red-500",
  보통: "bg-amber-400",
  여유: "bg-emerald-500",
};

const STATUS_BADGE: Record<WorkloadStatus, string> = {
  과부하: "border-red-200 bg-red-50 text-red-700",
  보통: "border-amber-200 bg-amber-50 text-amber-800",
  여유: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  workload: StaffWorkloadItem[];
  today: string; // ISO string
};

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkloadClient({ workload, today }: Props) {
  const totalTodayAppointments = workload.reduce((s, w) => s + w.todayAppointments, 0);
  const totalPending = workload.reduce((s, w) => s + w.pendingProspects, 0);

  // 막대 그래프용 최대값 계산
  const maxStudents = Math.max(...workload.map((w) => w.recentCounseledStudents), 1);

  const todayLabel = new Date(today).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="space-y-8">
      {/* KPI 요약 */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">총 상담 직원</p>
          <p className="mt-3 text-4xl font-bold text-ink">
            {workload.length}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">COUNSELOR 이상 활성 계정</p>
        </div>

        <div className="rounded-[28px] border border-sky-200 bg-sky-50/60 p-6">
          <p className="text-sm text-slate">오늘 예약 면담</p>
          <p className="mt-3 text-4xl font-bold text-sky-700">
            {totalTodayAppointments}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">오늘 SCHEDULED 상태 예약</p>
        </div>

        <div
          className={`rounded-[28px] border p-6 ${
            totalPending > 10
              ? "border-red-200 bg-red-50/60"
              : totalPending > 0
                ? "border-amber-200 bg-amber-50/60"
                : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">미처리 상담예약자</p>
          <p
            className={`mt-3 text-4xl font-bold ${
              totalPending > 10
                ? "text-red-600"
                : totalPending > 0
                  ? "text-amber-700"
                  : "text-ink"
            }`}
          >
            {totalPending}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">INQUIRY / VISITING / DECIDING 단계</p>
        </div>
      </section>

      {/* 직원별 막대 그래프 */}
      {workload.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-lg font-semibold text-ink">담당 학생 수 비교</h2>
          <p className="mt-1 text-xs text-slate">최근 30일 상담 기록 기준 · 고유 학생 수</p>
          <div className="mt-6 space-y-3">
            {[...workload]
              .sort((a, b) => b.recentCounseledStudents - a.recentCounseledStudents)
              .map((item) => {
                const pct =
                  maxStudents > 0
                    ? Math.round((item.recentCounseledStudents / maxStudents) * 100)
                    : 0;
                const status = getWorkloadStatus(item);
                return (
                  <div key={item.adminUserId} className="flex items-center gap-3">
                    <div className="w-20 shrink-0 text-sm font-medium text-ink truncate">
                      {item.name}
                    </div>
                    <div className="relative flex h-8 flex-1 items-center overflow-hidden rounded-full bg-ink/5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          status === "과부하"
                            ? "bg-red-400"
                            : status === "보통"
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                        }`}
                        style={{ width: `${pct}%`, minWidth: pct > 0 ? "2rem" : "0" }}
                      />
                      <span className="absolute left-3 text-xs font-semibold text-ink/70">
                        {item.recentCounseledStudents}명
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* 범례 */}
          <div className="mt-5 flex flex-wrap gap-3 border-t border-ink/5 pt-4">
            {(["여유", "보통", "과부하"] as WorkloadStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-xs text-slate">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT[s]}`} />
                {s}
              </span>
            ))}
            <span className="ml-auto text-xs text-slate">
              과부하: 담당 학생 50명 초과 또는 미처리 5건 초과
            </span>
          </div>
        </section>
      )}

      {/* 직원별 현황 테이블 */}
      <section className="rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/5 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">직원별 상세 현황</h2>
            <p className="text-xs text-slate">기준일: {todayLabel}</p>
          </div>
        </div>

        {workload.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            COUNSELOR 이상 역할의 활성 계정이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/80 text-left">
                  <th className="px-6 py-3.5 font-semibold text-ink/60">이름</th>
                  <th className="px-6 py-3.5 font-semibold text-ink/60">역할</th>
                  <th className="px-6 py-3.5 text-right font-semibold text-ink/60">
                    담당 학생
                    <span className="ml-1 text-xs font-normal">(최근 30일)</span>
                  </th>
                  <th className="px-6 py-3.5 text-right font-semibold text-ink/60">오늘 예약</th>
                  <th className="px-6 py-3.5 text-right font-semibold text-ink/60">미처리</th>
                  <th className="px-6 py-3.5 text-right font-semibold text-ink/60">
                    이번달 면담
                  </th>
                  <th className="px-6 py-3.5 text-center font-semibold text-ink/60">상태</th>
                  <th className="px-6 py-3.5 text-right font-semibold text-ink/60"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {workload.map((item) => {
                  const status = getWorkloadStatus(item);
                  return (
                    <tr
                      key={item.adminUserId}
                      className="transition hover:bg-mist/40"
                    >
                      <td className="px-6 py-4 font-semibold text-ink">{item.name}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-xs text-slate">
                          {ROLE_LABEL[item.role as AdminRole]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-semibold text-ink">
                        {item.recentCounseledStudents}
                        <span className="ml-1 text-xs font-normal text-slate">명</span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        <span
                          className={
                            item.todayAppointments > 0 ? "font-semibold text-sky-700" : "text-slate"
                          }
                        >
                          {item.todayAppointments}건
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        <span
                          className={
                            item.pendingProspects > 5
                              ? "font-semibold text-red-600"
                              : item.pendingProspects > 0
                                ? "font-semibold text-amber-700"
                                : "text-slate"
                          }
                        >
                          {item.pendingProspects}건
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate">
                        {item.thisMonthCounselingCount}건
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}
                        >
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`}
                          />
                          {status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/admin/dashboard/staff-performance?period=month`}
                          className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
                        >
                          성과 보기
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 부하 기준 안내 */}
      <section className="rounded-[28px] border border-ink/10 bg-mist/60 p-5">
        <h3 className="text-sm font-semibold text-ink">업무 부하 판정 기준</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              여유
            </p>
            <p className="mt-2 text-xs text-slate">
              담당 학생 30명 미만 <span className="text-ink/40">AND</span> 미처리 3건 미만
            </p>
          </div>
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
              보통
            </p>
            <p className="mt-2 text-xs text-slate">
              담당 학생 30~50명 <span className="text-ink/40">OR</span> 미처리 3~5건
            </p>
          </div>
          <div className="rounded-[22px] border border-red-200 bg-red-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
              과부하
            </p>
            <p className="mt-2 text-xs text-slate">
              담당 학생 50명 초과 <span className="text-ink/40">OR</span> 미처리 5건 초과
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
