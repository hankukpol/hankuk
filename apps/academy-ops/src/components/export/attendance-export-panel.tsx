"use client";

import { useState } from "react";

export function AttendanceExportPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [type, setType] = useState<"classroom" | "lecture">("classroom");

  function download(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format, type });

    if (from) params.set("from", from);
    if (to) params.set("to", to);

    window.location.href = `/api/export/attendance?${params.toString()}`;
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <h2 className="text-xl font-semibold">출결 내역 내보내기</h2>
      <p className="mt-2 text-sm leading-7 text-slate">
        날짜 범위와 출결 유형(담임반 / 강의)으로 필터링한 출결 기록을 CSV 또는 xlsx로 내려받습니다.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">시작일</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">종료일</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">출결 유형</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "classroom" | "lecture")}
            className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
          >
            <option value="classroom">담임반 출결</option>
            <option value="lecture">강의 출결</option>
          </select>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => download("xlsx")}
          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
        >
          xlsx 다운로드
        </button>
        <button
          type="button"
          onClick={() => download("csv")}
          className="rounded-full border border-ember/30 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10"
        >
          CSV 다운로드
        </button>
      </div>
    </section>
  );
}
