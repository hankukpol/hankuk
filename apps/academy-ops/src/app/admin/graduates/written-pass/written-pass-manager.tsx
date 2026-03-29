"use client";

import { useState } from "react";
import Link from "next/link";
import type { WrittenPassRow } from "./page";

const EXAM_TYPE_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

function getDaysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getDdayLabel(days: number | null): string {
  if (days === null) return "-";
  return `필기합격 후 D+${days}일`;
}

function getDdayColor(days: number | null): string {
  if (days === null) return "text-slate";
  if (days < 30) return "text-amber-700";
  if (days <= 90) return "text-forest";
  return "text-slate";
}

function getDdayBadgeColor(days: number | null): string {
  if (days === null) return "border-ink/10 bg-ink/5 text-slate";
  if (days < 30) return "border-amber-200 bg-amber-50 text-amber-700";
  if (days <= 90) return "border-forest/20 bg-forest/10 text-forest";
  return "border-ink/20 bg-ink/5 text-slate";
}

function getDdayStatusLabel(days: number | null): string {
  if (days === null) return "-";
  if (days < 30) return "준비중";
  if (days <= 90) return "진행중";
  return "확인필요";
}

interface Props {
  initialRecords: WrittenPassRow[];
}

export function WrittenPassManager({ initialRecords }: Props) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "CONCLUDED">("ALL");

  const urgentRecords = initialRecords.filter((r) => {
    if (r.finalPassDate) return false;
    const days = getDaysSince(r.writtenPassDate);
    return days !== null && days > 60;
  });

  const displayed = initialRecords.filter((r) => {
    if (filterStatus === "PENDING" && r.finalPassDate) return false;
    if (filterStatus === "CONCLUDED" && !r.finalPassDate) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.student.name.toLowerCase().includes(q) &&
        !r.examNumber.includes(q) &&
        !r.examName.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  return (
    <div>
      {/* Urgent Alert */}
      {urgentRecords.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-[16px] border border-amber-200 bg-amber-50 px-5 py-4">
          <span className="mt-0.5 text-amber-600">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4.5Zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              면접 소식을 확인하지 않은 필기합격자가 있습니다.
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              필기합격 후 60일이 지난 학생 {urgentRecords.length}명 —{" "}
              {urgentRecords.map((r) => r.student.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름·학번·시험명 검색"
          className="rounded-[12px] border border-ink/20 px-4 py-2 text-sm outline-none focus:border-forest w-56"
        />

        {/* Status filter tabs */}
        <div className="flex gap-1">
          {(["ALL", "PENDING", "CONCLUDED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filterStatus === s
                  ? "bg-ink text-white"
                  : "border border-ink/20 text-slate hover:border-ink/40"
              }`}
            >
              {s === "ALL" ? "전체" : s === "PENDING" ? "면접 대기중" : "결과 확정"}
            </button>
          ))}
        </div>

        <Link
          href="/admin/graduates"
          className="ml-auto rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
        >
          ← 합격자 전체 목록
        </Link>
      </div>

      {/* Result count */}
      <p className="text-xs text-slate mb-3">{displayed.length}건</p>

      {/* Table */}
      {displayed.length === 0 ? (
        <div className="rounded-[20px] border border-ink/10 bg-mist/50 py-12 text-center text-slate text-sm">
          필기합격자 기록이 없습니다.
        </div>
      ) : (
        <div className="rounded-[20px] border border-ink/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-mist border-b border-ink/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">학번/이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">시험명</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">수험 유형</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">필기합격일</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate">면접 D-day</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">최근 연락</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate">메모</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {displayed.map((r) => {
                const days = getDaysSince(r.writtenPassDate);
                const isConcluded = !!r.finalPassDate;

                return (
                  <tr key={r.id} className={`hover:bg-mist/40 ${isConcluded ? "opacity-60" : ""}`}>
                    {/* 학번/이름 */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${r.examNumber}`}
                        className="font-medium hover:text-forest transition-colors"
                      >
                        {r.student.name}
                      </Link>
                      <p className="text-xs text-slate">
                        {r.examNumber}
                        {r.student.generation ? ` · ${r.student.generation}기` : ""}
                      </p>
                    </td>

                    {/* 시험명 */}
                    <td className="px-4 py-3 text-slate text-xs">{r.examName}</td>

                    {/* 수험 유형 */}
                    <td className="px-4 py-3 text-center text-xs text-slate">
                      {EXAM_TYPE_LABEL[r.student.examType] ?? r.student.examType}
                    </td>

                    {/* 필기합격일 */}
                    <td className="px-4 py-3 text-xs text-slate">
                      {r.writtenPassDate
                        ? new Date(r.writtenPassDate).toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })
                        : "-"}
                    </td>

                    {/* 면접 D-day */}
                    <td className="px-4 py-3 text-center">
                      {isConcluded ? (
                        <span className="rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                          최종합격 완료
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getDdayBadgeColor(days)}`}
                          >
                            {getDdayStatusLabel(days)}
                          </span>
                          <span className={`text-[10px] ${getDdayColor(days)}`}>
                            {getDdayLabel(days)}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 최근 연락 */}
                    <td className="px-4 py-3 text-xs text-slate">
                      {r.student.phone ?? "-"}
                    </td>

                    {/* 메모 */}
                    <td className="px-4 py-3 text-xs text-slate max-w-[160px]">
                      <span className="block truncate" title={r.note ?? ""}>
                        {r.note ?? "-"}
                      </span>
                    </td>

                    {/* 액션 */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/graduates/${r.id}`}
                          className="rounded-[12px] border border-forest/30 bg-forest/5 px-3 py-1 text-xs font-medium text-forest hover:bg-forest/10 transition-colors"
                        >
                          최종합격 처리
                        </Link>
                        <Link
                          href={`/admin/graduates/${r.id}`}
                          className="rounded-[12px] border border-ink/20 px-3 py-1 text-xs font-medium text-slate hover:border-ink/40 hover:text-ink transition-colors"
                        >
                          상세보기
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate">
        <span className="font-medium">D-day 기준:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400"></span>
          준비중 (30일 미만)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-forest"></span>
          진행중 (30~90일)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-slate/40"></span>
          확인필요 (90일 초과)
        </span>
      </div>
    </div>
  );
}
