"use client";

import { useState } from "react";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/constants";
import { EnrollmentStatus } from "@prisma/client";

type CohortOption = {
  id: string;
  name: string;
};

type StudentEnrollmentExportPanelProps = {
  cohorts: CohortOption[];
};

export function StudentEnrollmentExportPanel({ cohorts }: StudentEnrollmentExportPanelProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [cohortId, setCohortId] = useState("");
  const [enrollmentStatus, setEnrollmentStatus] = useState("");
  const [startDateFrom, setStartDateFrom] = useState("");
  const [startDateTo, setStartDateTo] = useState(today);

  function download(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format });

    if (cohortId) params.set("cohortId", cohortId);
    if (enrollmentStatus) params.set("enrollmentStatus", enrollmentStatus);
    if (startDateFrom) params.set("startDateFrom", startDateFrom);
    if (startDateTo) params.set("startDateTo", startDateTo);

    window.location.href = `/api/export/enrollments-export?${params.toString()}`;
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
      <h2 className="text-xl font-semibold">수강 등록 기반 명단</h2>
      <p className="mt-2 text-sm leading-7 text-slate">
        수강반, 등록 상태, 수강 시작일 범위로 필터링한 수강 등록 내역을 CSV 또는 xlsx로 내려받습니다.
        수강료·납부액·미납액 등 결제 정보가 포함됩니다.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">수강반</label>
          <select
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체 수강반</option>
            {cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">수강 상태</label>
          <select
            value={enrollmentStatus}
            onChange={(e) => setEnrollmentStatus(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체 상태</option>
            {(Object.keys(ENROLLMENT_STATUS_LABEL) as EnrollmentStatus[]).map((status) => (
              <option key={status} value={status}>
                {ENROLLMENT_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">수강 시작일 (이후)</label>
          <input
            type="date"
            value={startDateFrom}
            onChange={(e) => setStartDateFrom(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">수강 시작일 (이전)</label>
          <input
            type="date"
            value={startDateTo}
            onChange={(e) => setStartDateTo(e.target.value)}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-ink/5 bg-white/60 px-4 py-3 text-xs text-slate">
        포함 컬럼: 수험번호, 이름, 연락처, 기수, 반, 직렬, 신규/기존, 수강반, 수강유형, 수강상태, 시작일, 종료일, 수강료, 할인액, 최종금액, 납부액, 미납액, 대기순번, 등록일
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
