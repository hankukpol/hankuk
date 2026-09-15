"use client";

import { useState } from "react";
import { type ArrivalMonthResult, ARRIVAL_SOURCE_LABELS, formatArrivalTime } from "@/lib/arrivals";
import { getKstTodayYmd } from "@/lib/date-utils";
import { PortalMetricCard, PortalSectionHeader } from "@/components/student-view/StudentPortalUi";
import { ArrivalCalendar } from "./ArrivalCalendar";
import { ArrivalFeedback } from "./ArrivalFeedback";
import { useArrivalQuery } from "./arrival-client";

export function StudentArrivals({ divisionSlug }: { divisionSlug: string }) {
  const today = getKstTodayYmd();
  const [month, setMonth] = useState(today.slice(0, 7));
  const endpoint = `/api/${divisionSlug}/student/arrivals`;
  const query = useArrivalQuery<ArrivalMonthResult>(`${endpoint}?month=${month}`, 15000);
  const currentQuery = useArrivalQuery<ArrivalMonthResult>(month === today.slice(0, 7) ? null : `${endpoint}?month=${today.slice(0, 7)}`, 15000);
  const todayData = month === today.slice(0, 7) ? query.data : currentQuery.data;
  const todayRecord = todayData?.records.find(record => record.date === today && !record.cancelledAt);

  return <section className="min-w-0 space-y-4" aria-label="내 등원 기록">
    <PortalSectionHeader title="내 등원 기록" action={<button type="button" className="admin-text-action" disabled={query.loading || currentQuery.loading} onClick={() => { void query.reload(); void currentQuery.reload(); }}>새로고침</button>} />
    <div className="admin-portal-summary">
      <PortalMetricCard label="오늘 등원 시각" value={todayData ? todayRecord ? formatArrivalTime(todayRecord.effectiveAt, true) : "기록 없음" : "확인 중"} caption={todayRecord ? `${today} / ${ARRIVAL_SOURCE_LABELS[todayRecord.source]}` : today} />
      <PortalMetricCard label="조회 월 등원 기록" value={query.data ? `${query.data.records.filter(record => !record.cancelledAt).length}일` : "확인 중"} caption={month} />
    </div>
    <ArrivalFeedback error={query.error || currentQuery.error} loading={!query.data && query.loading} onRetry={() => { void query.reload(); void currentQuery.reload(); }} loginHref={`/${divisionSlug}/student/login`} />
    <ArrivalCalendar month={month} today={query.data?.today ?? today} records={query.data?.records ?? []} onMonthChange={setMonth} unavailable={!query.data} />
    {query.data?.records.length === 0 && <p className="admin-empty-state">{month}에 기록된 등원이 없습니다.</p>}
  </section>;
}
