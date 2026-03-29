"use client";

import { useState, useTransition, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MakeupRow = {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  subjectName: string;
  instructorName: string | null;
  cohortId: string;
  cohortName: string;
  makeupDate: string | null;
  makeupStatus: "pending" | "scheduled" | "completed";
  note: string;
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function MakeupStatusBadge({ status }: { status: MakeupRow["makeupStatus"] }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        보강 미정
      </span>
    );
  }
  if (status === "scheduled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        보강 예정
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
      <span className="h-1.5 w-1.5 rounded-full bg-forest" />
      보강 완료
    </span>
  );
}

// ─── Inline edit row ──────────────────────────────────────────────────────────

function MakeupEditRow({
  row,
  onSaved,
}: {
  row: MakeupRow;
  onSaved: (updated: Pick<MakeupRow, "id" | "makeupDate" | "makeupStatus" | "note">) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [makeupDate, setMakeupDate] = useState(row.makeupDate ?? "");
  const [noteText, setNoteText] = useState(row.note);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/makeups", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: row.id,
            makeupDate: makeupDate || null,
            note: noteText,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "저장 실패");
          return;
        }
        const data = json.data;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let newStatus: MakeupRow["makeupStatus"] = "pending";
        if (data.makeupDate) {
          const mDt = new Date(data.makeupDate + "T00:00:00");
          newStatus = mDt < today ? "completed" : "scheduled";
        }

        onSaved({
          id: row.id,
          makeupDate: data.makeupDate,
          makeupStatus: newStatus,
          note: data.note,
        });
        setEditing(false);
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      }
    });
  }, [row.id, makeupDate, noteText, onSaved]);

  const handleCancel = () => {
    setMakeupDate(row.makeupDate ?? "");
    setNoteText(row.note);
    setError(null);
    setEditing(false);
  };

  const handleClear = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/makeups", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: row.id,
            makeupDate: null,
            note: row.note,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "삭제 실패");
          return;
        }
        setMakeupDate("");
        onSaved({ id: row.id, makeupDate: null, makeupStatus: "pending", note: json.data.note });
        setEditing(false);
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      }
    });
  }, [row.id, row.note, onSaved]);

  // Format session date for display
  const sessionDt = new Date(row.sessionDate);
  const m = sessionDt.getMonth() + 1;
  const d = sessionDt.getDate();
  const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = DAY_KO[sessionDt.getDay()];
  const sessionLabel = `${m}/${d}(${dow})`;

  return (
    <div className="border-b border-ink/5 last:border-b-0">
      {/* Main row */}
      <div className="flex flex-wrap items-start gap-4 px-6 py-4">
        {/* Left: session info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{row.subjectName}</span>
            {row.instructorName && (
              <span className="text-xs text-slate">{row.instructorName} 강사</span>
            )}
            <MakeupStatusBadge status={row.makeupStatus} />
          </div>

          <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate">
            <span>
              취소일: <span className="font-medium text-ink">{sessionLabel}</span>
            </span>
            <span>
              시간: <span className="font-medium text-ink">{row.startTime} ~ {row.endTime}</span>
            </span>
            <span>
              기수: <span className="font-medium text-ink">{row.cohortName}</span>
            </span>
          </div>

          {row.makeupDate && !editing && (
            <div className="mt-1.5 text-xs">
              <span className="text-slate">보강 예정일: </span>
              <span className="font-semibold text-amber-700">{row.makeupDate}</span>
            </div>
          )}

          {row.note && !editing && (
            <div className="mt-1 text-xs text-slate/70">
              메모: {row.note}
            </div>
          )}
        </div>

        {/* Right: action */}
        <div className="flex-shrink-0">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate transition hover:border-ember/30 hover:text-ember"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M13.488 2.513a1.75 1.75 0 00-2.475 0L6.75 6.774a2.75 2.75 0 00-.714 1.278l-.6 2.498a.75.75 0 00.914.914l2.498-.6a2.75 2.75 0 001.278-.714l4.261-4.263a1.75 1.75 0 000-2.474zM4.75 14A2.75 2.75 0 002 11.25v-.5a.75.75 0 011.5 0v.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25v-.5a.75.75 0 011.5 0v.5A2.75 2.75 0 0111.25 14h-6.5z" />
              </svg>
              보강 설정
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-ember px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
              >
                {isPending ? "저장 중..." : "저장"}
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate transition hover:border-ink/30"
              >
                취소
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="mx-6 mb-4 rounded-2xl border border-ink/10 bg-mist/60 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate">
                보강 날짜 <span className="font-normal text-slate/60">(보강 예정일을 선택하세요)</span>
              </label>
              <input
                type="date"
                value={makeupDate}
                onChange={(e) => setMakeupDate(e.target.value)}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ember/20"
              />
              {makeupDate && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isPending}
                  className="mt-1.5 text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  보강 날짜 삭제
                </button>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate">
                메모 <span className="font-normal text-slate/60">(선택)</span>
              </label>
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="보강 관련 메모를 입력하세요"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ember/20"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

type FilterStatus = "all" | "pending" | "scheduled" | "completed";

export function MakeupClient({
  initialRows,
  cohorts,
}: {
  initialRows: MakeupRow[];
  cohorts: Array<{ id: string; name: string }>;
}) {
  const [rows, setRows] = useState<MakeupRow[]>(initialRows);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterCohort, setFilterCohort] = useState<string>("all");

  const handleSaved = useCallback(
    (updated: Pick<MakeupRow, "id" | "makeupDate" | "makeupStatus" | "note">) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === updated.id
            ? { ...r, makeupDate: updated.makeupDate, makeupStatus: updated.makeupStatus, note: updated.note }
            : r
        )
      );
    },
    []
  );

  // Filter
  const filtered = rows.filter((r) => {
    if (filterStatus !== "all" && r.makeupStatus !== filterStatus) return false;
    if (filterCohort !== "all" && r.cohortId !== filterCohort) return false;
    return true;
  });

  // KPI counts
  const pendingCount = rows.filter((r) => r.makeupStatus === "pending").length;
  const scheduledCount = rows.filter((r) => r.makeupStatus === "scheduled").length;
  const completedCount = rows.filter((r) => r.makeupStatus === "completed").length;

  return (
    <div>
      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-3">
        <button
          onClick={() => setFilterStatus(filterStatus === "pending" ? "all" : "pending")}
          className={[
            "rounded-[28px] border p-6 text-left transition hover:shadow-md",
            filterStatus === "pending"
              ? "border-red-300 bg-red-50 shadow-sm"
              : "border-red-200 bg-red-50/60",
          ].join(" ")}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">보강 미정</p>
          <p className="mt-3 text-3xl font-bold text-red-600">
            {pendingCount}
            <span className="ml-1 text-base font-normal text-red-500">건</span>
          </p>
          <p className="mt-1 text-xs text-red-500">아직 보강 날짜가 설정되지 않음</p>
        </button>

        <button
          onClick={() => setFilterStatus(filterStatus === "scheduled" ? "all" : "scheduled")}
          className={[
            "rounded-[28px] border p-6 text-left transition hover:shadow-md",
            filterStatus === "scheduled"
              ? "border-amber-300 bg-amber-50 shadow-sm"
              : "border-amber-200 bg-amber-50/60",
          ].join(" ")}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">보강 예정</p>
          <p className="mt-3 text-3xl font-bold text-amber-700">
            {scheduledCount}
            <span className="ml-1 text-base font-normal text-amber-600">건</span>
          </p>
          <p className="mt-1 text-xs text-amber-600">보강 날짜 설정 완료, 아직 미래</p>
        </button>

        <button
          onClick={() => setFilterStatus(filterStatus === "completed" ? "all" : "completed")}
          className={[
            "rounded-[28px] border p-6 text-left transition hover:shadow-md",
            filterStatus === "completed"
              ? "border-forest/30 bg-forest/10 shadow-sm"
              : "border-forest/15 bg-forest/5",
          ].join(" ")}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest">보강 완료</p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {completedCount}
            <span className="ml-1 text-base font-normal text-forest/70">건</span>
          </p>
          <p className="mt-1 text-xs text-forest/70">보강 날짜가 지난 완료 건</p>
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-3 rounded-[28px] border border-ink/10 bg-mist/40 p-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate">상태:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-sm"
          >
            <option value="all">전체</option>
            <option value="pending">보강 미정</option>
            <option value="scheduled">보강 예정</option>
            <option value="completed">보강 완료</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate">기수:</label>
          <select
            value={filterCohort}
            onChange={(e) => setFilterCohort(e.target.value)}
            className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-sm"
          >
            <option value="all">전체 기수</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center text-xs text-slate">
          {filtered.length}건 표시
        </div>
      </div>

      {/* List */}
      <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-mist">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6 text-slate">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink">해당 조건의 보강 항목이 없습니다.</p>
            <p className="mt-1 text-xs text-slate">취소된 강의가 없거나 필터 조건을 변경해 보세요.</p>
          </div>
        ) : (
          <div>
            <div className="border-b border-ink/5 bg-mist/40 px-6 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                취소된 강의 목록 ({filtered.length}건)
              </p>
            </div>
            {filtered.map((row) => (
              <MakeupEditRow key={row.id} row={row} onSaved={handleSaved} />
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-slate/60">
        * 보강 날짜는 취소된 강의의 메모 필드에 저장됩니다. 보강 완료 여부는 보강 날짜가 오늘보다 이전인지로 판단합니다.
      </p>
    </div>
  );
}
