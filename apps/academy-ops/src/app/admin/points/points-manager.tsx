"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { PointType } from "@prisma/client";
import type { PointLogRow, PointsKpi } from "./page";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type StudentSearchResult = {
  examNumber: string;
  name: string;
  mobile: string | null;
};

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json()) as { error?: string } & T;
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "요청에 실패했습니다.");
  return data as T;
}

// ─── KPI 카드 ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  unit = "P",
  accent = false,
}: {
  label: string;
  value: number;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6">
      <p className="text-xs font-medium text-slate">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${
          accent ? "text-ember" : "text-ink"
        }`}
      >
        {value.toLocaleString()}
        <span className="ml-1 text-sm font-normal text-slate">{unit}</span>
      </p>
    </div>
  );
}

// ─── 수동 지급 모달 ─────────────────────────────────────────────────────────────

function ManualGrantModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [searchInput, setSearchInput] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();

  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [grantError, setGrantError] = useState<string | null>(null);
  const [isGranting, startGrant] = useTransition();

  function handleSearch() {
    const q = searchInput.trim();
    if (!q) return;
    setSearchError(null);
    setSelectedStudent(null);
    startSearch(async () => {
      try {
        type Res = { student: { examNumber: string; name: string; phone: string | null }; balance: number };
        const res = await requestJson<Res>(`/api/points/student/${encodeURIComponent(q)}`);
        setSelectedStudent({
          examNumber: res.student.examNumber,
          name: res.student.name,
          mobile: res.student.phone,
        });
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "학생 조회 실패");
      }
    });
  }

  function handleGrant() {
    if (!selectedStudent) return;
    const numPoints = Number(points);
    if (!Number.isFinite(numPoints) || numPoints <= 0) {
      setGrantError("포인트는 1 이상의 숫자여야 합니다.");
      return;
    }
    if (!reason.trim()) {
      setGrantError("지급 사유를 입력하세요.");
      return;
    }
    setGrantError(null);
    startGrant(async () => {
      try {
        await requestJson("/api/points/policies/manual-grant", {
          method: "POST",
          body: JSON.stringify({
            studentId: selectedStudent.examNumber,
            points: numPoints,
            reason: reason.trim(),
          }),
        });
        toast.success(`${numPoints.toLocaleString()}P 지급이 완료되었습니다.`);
        onSuccess();
        onClose();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "지급 실패";
        setGrantError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">포인트 수동 지급</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate hover:bg-mist transition"
            aria-label="닫기"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 학생 검색 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">학생 검색 (학번 또는 이름)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="학번 또는 이름 입력"
                className="flex-1 rounded-xl border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchInput.trim()}
                className="rounded-xl bg-ember px-4 py-2 text-sm font-medium text-white hover:bg-ember/90 disabled:opacity-50 transition"
              >
                {isSearching ? "조회…" : "조회"}
              </button>
            </div>
            {searchError && <p className="mt-1.5 text-xs text-red-600">{searchError}</p>}
          </div>

          {/* 선택된 학생 */}
          {selectedStudent && (
            <div className="rounded-2xl border border-forest/20 bg-forest/5 px-4 py-3">
              <p className="text-sm font-semibold text-ink">
                {selectedStudent.name}
                <span className="ml-2 text-xs font-normal text-slate">({selectedStudent.examNumber})</span>
              </p>
              {selectedStudent.mobile && (
                <p className="text-xs text-slate mt-0.5">{selectedStudent.mobile}</p>
              )}
            </div>
          )}

          {/* 포인트 금액 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">포인트 금액 (P)</label>
            <input
              type="number"
              min="1"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="예: 500"
              disabled={!selectedStudent}
              className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40 disabled:bg-mist disabled:text-slate"
            />
          </div>

          {/* 지급 사유 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate">지급 사유</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 성적 우수 수동 지급"
              disabled={!selectedStudent}
              className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40 disabled:bg-mist disabled:text-slate"
            />
          </div>

          {grantError && <p className="text-sm text-red-600">{grantError}</p>}

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-full border border-ink/10 py-2.5 text-sm font-medium text-ink hover:bg-mist transition"
            >
              취소
            </button>
            <button
              onClick={handleGrant}
              disabled={isGranting || !selectedStudent || !points || !reason.trim()}
              className="flex-1 rounded-full bg-forest py-2.5 text-sm font-semibold text-white hover:bg-forest/90 disabled:opacity-50 transition"
            >
              {isGranting
                ? "처리 중…"
                : `${points ? Number(points).toLocaleString() : "0"}P 지급`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 포인트 타입 배지 ──────────────────────────────────────────────────────────

function PointTypeBadge({
  type,
  labelMap,
}: {
  type: PointType;
  labelMap: Record<PointType, string>;
}) {
  const colorMap: Record<PointType, string> = {
    PERFECT_ATTENDANCE: "border-forest/30 bg-forest/10 text-forest",
    SCORE_EXCELLENCE: "border-sky-200 bg-sky-50 text-sky-700",
    ESSAY_EXCELLENCE: "border-amber-200 bg-amber-50 text-amber-700",
    MANUAL: "border-ember/30 bg-ember/10 text-ember",
    USE_PAYMENT: "border-red-200 bg-red-50 text-red-700",
    USE_RENTAL: "border-red-200 bg-red-50 text-red-700",
    ADJUST: "border-slate/20 bg-slate/10 text-slate",
    EXPIRE: "border-ink/20 bg-ink/5 text-slate",
    REFUND_CANCEL: "border-purple-200 bg-purple-50 text-purple-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorMap[type] ?? "border-ink/10 bg-ink/5 text-slate"}`}
    >
      {labelMap[type] ?? type}
    </span>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function PointsDashboard({
  kpi,
  initialLogs,
  pointTypeLabelMap,
}: {
  kpi: PointsKpi;
  initialLogs: PointLogRow[];
  pointTypeLabelMap: Record<PointType, string>;
}) {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [logs, setLogs] = useState<PointLogRow[]>(initialLogs);
  const [refreshing, startRefresh] = useTransition();

  function handleSuccess() {
    startRefresh(async () => {
      try {
        type AdminRes = {
          data: Array<{
            id: number;
            examNumber: string;
            student: { name: string; phone: string | null };
            type: PointType;
            amount: number;
            reason: string;
            grantedAt: string;
            grantedBy: string | null;
          }>;
        };
        const res = await requestJson<AdminRes>("/api/points/admin?pageSize=10");
        setLogs(
          res.data.map((log) => ({
            id: log.id,
            examNumber: log.examNumber,
            studentName: log.student.name,
            studentMobile: log.student.phone,
            type: log.type,
            amount: log.amount,
            reason: log.reason,
            grantedAt: log.grantedAt,
            grantedBy: log.grantedBy,
          })),
        );
      } catch {
        // 실패 시 기존 목록 유지
      }
    });
  }

  return (
    <>
      {showModal && (
        <ManualGrantModal onClose={() => setShowModal(false)} onSuccess={handleSuccess} />
      )}

      {/* KPI 카드 */}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="전체 발행량" value={kpi.totalIssued} />
        <KpiCard label="이번 달 지급" value={kpi.thisMonthIssued} accent />
        <KpiCard label="총 잔액" value={kpi.totalBalance} />
        <KpiCard label="활성 수혜자" value={kpi.beneficiaryCount} unit="명" />
      </div>

      {/* 최근 지급 이력 */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">최근 지급 이력</h2>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest/90 transition"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            수동 지급
          </button>
        </div>

        {refreshing ? (
          <div className="px-6 py-8 text-center text-sm text-slate">갱신 중…</div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate">
            포인트 지급 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-ink/5 text-left text-xs font-medium text-slate">
                  <th className="px-6 py-3">이름</th>
                  <th className="px-3 py-3">학번</th>
                  <th className="px-3 py-3">유형</th>
                  <th className="px-3 py-3 text-right">포인트</th>
                  <th className="px-3 py-3">사유</th>
                  <th className="px-3 py-3">날짜</th>
                  <th className="px-3 py-3">지급자</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-ink/5 last:border-0 hover:bg-mist/60 transition-colors"
                  >
                    <td className="px-6 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/students/${log.examNumber}`}
                        className="hover:text-forest transition-colors"
                      >
                        {log.studentName}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate">
                      <Link
                        href={`/admin/students/${log.examNumber}`}
                        className="hover:text-forest transition-colors"
                      >
                        {log.examNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <PointTypeBadge type={log.type} labelMap={pointTypeLabelMap} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span
                        className={`font-semibold tabular-nums ${
                          log.amount >= 0 ? "text-forest" : "text-red-600"
                        }`}
                      >
                        {log.amount >= 0 ? "+" : ""}
                        {log.amount.toLocaleString()}P
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate max-w-[180px] truncate">{log.reason}</td>
                    <td className="px-3 py-3 text-xs text-slate whitespace-nowrap">
                      {new Date(log.grantedAt).toLocaleDateString("ko-KR", {
                        year: "2-digit",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate">{log.grantedBy ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 전체 이력 링크 */}
        <div className="border-t border-ink/5 px-6 py-3 text-right">
          <Link
            href="/admin/points/history"
            className="text-xs font-medium text-forest hover:underline"
          >
            전체 이력 보기 →
          </Link>
        </div>
      </div>
    </>
  );
}
