"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { type ArrivalDayResult, ARRIVAL_SOURCE_LABELS, formatArrivalTime } from "@/lib/arrivals";
import { getKstTodayYmd } from "@/lib/date-utils";
import { StudentSearchField } from "@/components/ui/StudentSearchField";
import { ArrivalFeedback } from "./ArrivalFeedback";
import { ArrivalStudentDetail, type ArrivalSelection } from "./ArrivalStudentDetail";
import { ArrivalStudentPicker } from "./ArrivalStudentPicker";
import { shiftArrivalDate, useArrivalQuery } from "./arrival-client";

export function ArrivalsManager({ divisionSlug }: { divisionSlug: string }) {
  const [date, setDate] = useState(getKstTodayYmd);
  const [filter, setFilter] = useState<"recorded" | "missing">("recorded");
  const [search, setSearch] = useState("");
  const [descending, setDescending] = useState(true);
  const [selection, setSelection] = useState<ArrivalSelection | null>(null);
  const [adding, setAdding] = useState(false);
  const query = useArrivalQuery<ArrivalDayResult>(`/api/${divisionSlug}/arrivals?date=${date}`, 5000);
  const today = query.data?.today ?? getKstTodayYmd();
  const effectiveFilter = date === today ? filter : "recorded";
  const term = search.trim().toLocaleLowerCase();
  const rows = (query.data?.rows ?? []).filter(row => {
    const recorded = !!row.record && !row.record.cancelledAt;
    return (effectiveFilter === "recorded" ? recorded : !recorded && row.isEligible) && (!term || `${row.name} ${row.studentNumber}`.toLocaleLowerCase().includes(term));
  }).sort((a, b) => {
    const left = a.record && !a.record.cancelledAt ? a.record.effectiveAt : "";
    const right = b.record && !b.record.cancelledAt ? b.record.effectiveAt : "";
    return (descending ? right.localeCompare(left) : left.localeCompare(right)) || a.name.localeCompare(b.name, "ko") || a.studentNumber.localeCompare(b.studentNumber);
  });

  return <div className="admin-flat-page">
    <header className="max-md:sr-only"><h1 className="admin-page-title">등원 현황</h1><p className="admin-page-description">공용 기기 입력과 관리자 정정 기록을 날짜별로 확인합니다.</p></header>
    <section aria-label="등원 조회 조건">
      <div className="admin-filter-bar">
        <label className="block"><span className="admin-label mb-2 block">조회 날짜</span><input type="date" value={date} min="1900-01-01" max={today} onChange={event => { if (event.target.value && event.target.value <= today) setDate(event.target.value); }} /></label>
        <StudentSearchField label="등원 명단 검색" value={search} onChange={setSearch} />
        <Link className="admin-text-action" href={`/${divisionSlug}/admin/settings/rules/arrivals`}>등원 설정·공용 기기 관리</Link>
      </div>
    </section>
    <div className="admin-workspace-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="admin-button" aria-label="이전 날짜" disabled={date <= "1900-01-01"} onClick={() => setDate(shiftArrivalDate(date, -1))}><ChevronLeft className="h-4 w-4" /></button>
        <span className="tabular-nums font-semibold">{date}</span>
        <button type="button" className="admin-button" aria-label="다음 날짜" disabled={date >= today} onClick={() => setDate(shiftArrivalDate(date, 1))}><ChevronRight className="h-4 w-4" /></button>
        <button type="button" className="admin-text-action" onClick={() => setDate(getKstTodayYmd())}>오늘</button>
      </div>
      <div className="flex flex-wrap gap-3"><button type="button" className="admin-text-action" disabled={query.loading} onClick={() => void query.reload()}>새로고침</button><button type="button" className="admin-button admin-button-primary" onClick={() => setAdding(true)}>누락 기록 추가</button></div>
    </div>
    <div className="admin-choice-group" aria-label="등원 기록 필터">
      <button type="button" className="admin-choice-button" aria-pressed={effectiveFilter === "recorded"} onClick={() => setFilter("recorded")}>기록 있음 {query.data?.recordedCount ?? ""}</button>
      {date === today && <button type="button" className="admin-choice-button" aria-pressed={effectiveFilter === "missing"} onClick={() => setFilter("missing")}>미기록 {query.data?.missingCount ?? ""}</button>}
    </div>
    <ArrivalFeedback error={query.error} loading={!query.data && query.loading} onRetry={() => void query.reload()} loginHref="/login" />
    {query.data && <>
      <p className="admin-help">조회 결과 {rows.length}명 / 전체 기록 {query.data.recordedCount}명. 화면이 보일 때 5초마다 갱신합니다. 최근 갱신 {formatArrivalTime(query.data.refreshedAt, true)}</p>
      {rows.length ? <div className="admin-table-frame"><table className="admin-arrival-list">
        <thead><tr><th scope="col">학생</th><th scope="col" className="hidden md:table-cell">수험번호</th><th scope="col" aria-sort={descending ? "descending" : "ascending"}><button type="button" className="admin-table-link" onClick={() => setDescending(current => !current)}>등원 시각 {descending ? "↓" : "↑"}</button></th><th scope="col" className="hidden md:table-cell">출처</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.studentId}>
          <td className="admin-table-name"><button type="button" className="admin-table-link" onClick={() => setSelection({ studentId: row.studentId, name: row.name, studentNumber: row.studentNumber, date })}>{row.name}</button><span className="block break-all text-admin-text-muted md:hidden">{row.studentNumber}</span></td>
          <td className="hidden break-all whitespace-normal md:table-cell">{row.studentNumber}</td>
          <td>{row.record && !row.record.cancelledAt ? <><span className="tabular-nums">{formatArrivalTime(row.record.effectiveAt, true)}</span><span className="block text-admin-text-muted md:hidden">{ARRIVAL_SOURCE_LABELS[row.record.source]}</span></> : <span className="text-admin-text-muted">미기록</span>}</td>
          <td className="hidden md:table-cell">{row.record && !row.record.cancelledAt ? ARRIVAL_SOURCE_LABELS[row.record.source] : "미기록"}</td>
        </tr>)}</tbody>
      </table></div> : <p className="admin-empty-state">{search ? "검색 조건에 맞는 학생이 없습니다." : effectiveFilter === "missing" ? "오늘 미기록 학생이 없습니다." : `${date}에 유효한 등원 기록이 없습니다.`}</p>}
      {date !== today && <p className="admin-help">과거 날짜는 저장된 기록만 표시합니다. 취소 이력은 학생 상세 달력에서 확인할 수 있습니다.</p>}
    </>}
    {selection && <ArrivalStudentDetail key={selection.studentId} divisionSlug={divisionSlug} selection={selection} onClose={() => setSelection(null)} onSaved={() => void query.reload()} />}
    {adding && <ArrivalStudentPicker divisionSlug={divisionSlug} initialDate={date} onClose={() => setAdding(false)} onSelect={student => { setAdding(false); setSelection(student); }} />}
  </div>;
}
