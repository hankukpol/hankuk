"use client";

import { useState } from "react";
import Link from "next/link";

type SuspendedStudent = {
  enrollmentId: string;
  examNumber: string;
  studentName: string;
  cohortName: string | null;
  cohortId: string | null;
  suspendedDate: string; // ISO
  expectedReturn: string | null; // ISO
  daysSuspended: number;
  reason: string | null;
};

type MonthlyBarData = {
  month: string; // YYYY-MM
  suspensions: number;
  reinstatements: number;
};

type CohortSuspensionData = {
  cohortId: string;
  cohortName: string;
  totalEnrollments: number;
  suspendedCount: number;
  suspensionRate: number;
};

type Props = {
  currentSuspendedStudents: SuspendedStudent[];
  monthlyData: MonthlyBarData[];
  cohortData: CohortSuspensionData[];
  totalCurrentSuspended: number;
  newThisMonth: number;
  reinstatementRate: number;
  avgSuspensionDays: number;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function getMonthLabel(monthStr: string) {
  const [y, m] = monthStr.split("-");
  return `${y.slice(2)}/${m}`;
}

export function SuspensionClient({
  currentSuspendedStudents,
  monthlyData,
  cohortData,
  totalCurrentSuspended,
  newThisMonth,
  reinstatementRate,
  avgSuspensionDays,
}: Props) {
  const [activeTab, setActiveTab] = useState<"students" | "cohort">("students");

  const maxBar = Math.max(
    ...monthlyData.map((d) => Math.max(d.suspensions, d.reinstatements)),
    1
  );

  return (
    <div className="mt-8 space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
            현재 휴원 중
          </p>
          <p className="mt-3 text-2xl font-bold text-amber-700">
            {totalCurrentSuspended.toLocaleString("ko-KR")}
            <span className="ml-1 text-sm font-normal">명</span>
          </p>
          <p className="mt-1 text-xs text-amber-600">활성 수강 중 휴원</p>
        </div>
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-600">
            이번달 신규 휴원
          </p>
          <p className="mt-3 text-2xl font-bold text-red-700">
            {newThisMonth.toLocaleString("ko-KR")}
            <span className="ml-1 text-sm font-normal">명</span>
          </p>
          <p className="mt-1 text-xs text-red-500">이번달 휴원 시작</p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">
            복귀율
          </p>
          <p className="mt-3 text-2xl font-bold text-forest">
            {reinstatementRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-forest/70">전체 휴원 대비 복귀</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">
            평균 휴원 기간
          </p>
          <p className="mt-3 text-2xl font-bold text-ink">
            {Math.round(avgSuspensionDays)}
            <span className="ml-1 text-sm font-normal text-slate">일</span>
          </p>
          <p className="mt-1 text-xs text-slate">복귀 완료 건 기준</p>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h3 className="text-sm font-semibold text-ink">월별 휴원/복귀 현황</h3>
        <p className="mt-1 text-xs text-slate">최근 12개월</p>
        {monthlyData.length === 0 ? (
          <div className="mt-8 py-12 text-center text-slate">
            데이터가 없습니다.
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-end gap-1">
              {monthlyData.map((d) => {
                const suspH = maxBar > 0 ? Math.max((d.suspensions / maxBar) * 120, d.suspensions > 0 ? 4 : 0) : 0;
                const reinH = maxBar > 0 ? Math.max((d.reinstatements / maxBar) * 120, d.reinstatements > 0 ? 4 : 0) : 0;
                return (
                  <div key={d.month} className="flex flex-1 flex-col items-center gap-0.5">
                    <div className="flex w-full items-end justify-center gap-0.5">
                      <div
                        className="w-1/2 rounded-t bg-amber-400 transition-all"
                        style={{ height: `${suspH}px` }}
                        title={`휴원: ${d.suspensions}`}
                      />
                      <div
                        className="w-1/2 rounded-t bg-forest/50 transition-all"
                        style={{ height: `${reinH}px` }}
                        title={`복귀: ${d.reinstatements}`}
                      />
                    </div>
                    <span className="text-[9px] text-slate">
                      {getMonthLabel(d.month)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-slate">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-amber-400" />
                <span>신규 휴원</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-forest/50" />
                <span>복귀</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Tab */}
      <div className="flex gap-1 rounded-xl border border-ink/10 bg-white p-1 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab("students")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === "students"
              ? "bg-forest text-white shadow-sm"
              : "text-slate hover:text-ink"
          }`}
        >
          현재 휴원 학생
        </button>
        <button
          onClick={() => setActiveTab("cohort")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === "cohort"
              ? "bg-forest text-white shadow-sm"
              : "text-slate hover:text-ink"
          }`}
        >
          기수별 비교
        </button>
      </div>

      {/* Currently suspended students */}
      {activeTab === "students" && (
        <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-base font-semibold text-ink">
              현재 휴원 중인 학생
              <span className="ml-2 text-sm font-normal text-slate">
                ({currentSuspendedStudents.length}명)
              </span>
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-forest/5">
                <th className="px-5 py-3 text-left font-semibold text-forest">
                  학생
                </th>
                <th className="px-5 py-3 text-left font-semibold text-forest">
                  기수
                </th>
                <th className="px-5 py-3 text-center font-semibold text-forest">
                  휴원 시작일
                </th>
                <th className="px-5 py-3 text-center font-semibold text-forest">
                  복귀 예정일
                </th>
                <th className="px-5 py-3 text-right font-semibold text-forest">
                  경과 일수
                </th>
                <th className="px-5 py-3 text-left font-semibold text-forest">
                  사유
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {currentSuspendedStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-slate"
                  >
                    현재 휴원 중인 학생이 없습니다.
                  </td>
                </tr>
              ) : (
                currentSuspendedStudents.map((s) => (
                  <tr
                    key={s.enrollmentId}
                    className={`transition-colors hover:bg-mist/50 ${
                      s.daysSuspended > 90 ? "bg-red-50/30" : ""
                    }`}
                  >
                    <td className="px-5 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/students/${s.examNumber}`}
                        className="transition-colors hover:text-forest hover:underline underline-offset-2"
                      >
                        {s.studentName}
                      </Link>
                      <span className="ml-1.5 text-xs text-slate">
                        {s.examNumber}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate">
                      {s.cohortId ? (
                        <Link
                          href={`/admin/cohorts/${s.cohortId}`}
                          className="hover:text-forest hover:underline"
                        >
                          {s.cohortName ?? "-"}
                        </Link>
                      ) : (
                        s.cohortName ?? "-"
                      )}
                    </td>
                    <td className="px-5 py-3 text-center text-ink">
                      {formatDate(s.suspendedDate)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {s.expectedReturn ? (
                        <span
                          className={
                            new Date(s.expectedReturn) < new Date()
                              ? "text-red-600 font-medium"
                              : "text-ink"
                          }
                        >
                          {formatDate(s.expectedReturn)}
                          {new Date(s.expectedReturn) < new Date() && (
                            <span className="ml-1 text-xs">(초과)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate">미정</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={
                          s.daysSuspended > 60
                            ? "font-semibold text-red-600"
                            : s.daysSuspended > 30
                            ? "font-medium text-amber-700"
                            : "text-ink"
                        }
                      >
                        {s.daysSuspended}일
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate">
                      {s.reason ? (
                        <span className="max-w-[160px] truncate block">
                          {s.reason}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Cohort comparison */}
      {activeTab === "cohort" && (
        <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-base font-semibold text-ink">기수별 휴원율 비교</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-forest/5">
                <th className="px-5 py-3 text-left font-semibold text-forest">
                  기수명
                </th>
                <th className="px-5 py-3 text-right font-semibold text-forest">
                  수강생 수
                </th>
                <th className="px-5 py-3 text-right font-semibold text-forest">
                  휴원 경험
                </th>
                <th className="px-5 py-3 text-right font-semibold text-forest">
                  휴원율
                </th>
                <th className="px-5 py-3 text-left font-semibold text-forest">
                  시각화
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {cohortData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                cohortData.map((row) => (
                  <tr
                    key={row.cohortId}
                    className="transition-colors hover:bg-mist/50"
                  >
                    <td className="px-5 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/cohorts/${row.cohortId}`}
                        className="hover:text-forest hover:underline"
                      >
                        {row.cohortName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right text-ink">
                      {row.totalEnrollments}명
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-amber-700">
                      {row.suspendedCount}명
                    </td>
                    <td className="px-5 py-3 text-right font-bold">
                      <span
                        className={
                          row.suspensionRate > 15
                            ? "text-red-600"
                            : row.suspensionRate > 8
                            ? "text-amber-700"
                            : "text-forest"
                        }
                      >
                        {row.suspensionRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className={`h-full rounded-full transition-all ${
                            row.suspensionRate > 15
                              ? "bg-red-500"
                              : row.suspensionRate > 8
                              ? "bg-amber-500"
                              : "bg-forest/60"
                          }`}
                          style={{
                            width: `${Math.min(row.suspensionRate * 4, 100)}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-1 text-xs text-slate">
        <p>
          * 휴원은 CourseEnrollment.status = SUSPENDED 기준입니다.
        </p>
        <p>
          * 복귀율은 과거 SUSPENDED였다가 ACTIVE 상태로 변경된 수강 건 / 전체 휴원 경험 건 기준입니다.
        </p>
        <p>
          * 복귀 예정일(빨간색)은 LeaveRecord.returnDate가 현재 날짜보다 이전인 경우입니다.
        </p>
      </div>
    </div>
  );
}
