"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ArrivalRecord, formatArrivalTime } from "@/lib/arrivals";
import { shiftArrivalMonth } from "./arrival-client";

export function ArrivalCalendar({ month, today, records, selectedDate, onMonthChange, onSelectDate, disabled = false, unavailable = false }: {
  month: string; today: string; records: ArrivalRecord[]; selectedDate?: string;
  onMonthChange: (month: string) => void; onSelectDate?: (date: string) => void; disabled?: boolean; unavailable?: boolean;
}) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const count = Math.ceil((first.getUTCDay() + lastDay) / 7) * 7;
  const byDate = new Map(records.map(record => [record.date, record]));
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" className="admin-button" aria-label="이전 달" disabled={disabled || month <= "1900-01"} onClick={() => onMonthChange(shiftArrivalMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></button>
        <label className="min-w-0"><span className="sr-only">등원 조회 월</span><input type="month" className="w-full" value={month} min="1900-01" max={today.slice(0, 7)} disabled={disabled} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value) && event.target.value <= today.slice(0, 7)) onMonthChange(event.target.value); }} /></label>
        <button type="button" className="admin-button" aria-label="다음 달" disabled={disabled || month >= today.slice(0, 7)} onClick={() => onMonthChange(shiftArrivalMonth(month, 1))}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <button type="button" className="admin-text-action" disabled={disabled} onClick={() => onMonthChange(today.slice(0, 7))}>이번 달</button>
    </div>
    <div className="admin-table-frame">
      <table className="admin-arrival-calendar" aria-label={`${month} 등원 달력`}>
        <thead><tr>{["일", "월", "화", "수", "목", "금", "토"].map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: count / 7 }, (_, week) => <tr key={week}>
          {Array.from({ length: 7 }, (_, weekday) => {
            const day = week * 7 + weekday - first.getUTCDay() + 1;
            if (day < 1 || day > lastDay) return <td key={weekday} aria-hidden="true" />;
            const date = `${month}-${String(day).padStart(2, "0")}`;
            const record = byDate.get(date);
            const status = unavailable ? "조회 필요" : record?.cancelledAt ? "취소" : record ? formatArrivalTime(record.effectiveAt) : date > today ? "" : "기록 없음";
            const sourceLabel = record && !record.cancelledAt && !unavailable ? record.source === "ADMIN_CORRECTED" ? "정정" : record.source === "ADMIN_ADDED" ? "추가" : "" : "";
            const content = <><span className="admin-arrival-day-number" data-today={date === today}>{day}</span><span className={record?.cancelledAt ? "text-admin-text-muted" : record ? "text-admin-accent" : "text-admin-text-muted"}>{status}</span>{sourceLabel && <span className="text-admin-text-muted">{sourceLabel}</span>}</>;
            return <td key={weekday} data-selected={selectedDate === date}>
              {onSelectDate ? <button type="button" className="admin-arrival-day" disabled={disabled || date > today} aria-label={`${date}${date === today ? " 오늘" : ""}, ${status}${sourceLabel ? `, 관리자 ${sourceLabel}` : ""}`} aria-pressed={selectedDate === date} onClick={() => onSelectDate(date)}>{content}</button> : <div className="admin-arrival-day" aria-label={`${date}${date === today ? " 오늘" : ""}, ${status}${sourceLabel ? `, 관리자 ${sourceLabel}` : ""}`}>{content}</div>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="admin-help">한국 시간 기준입니다. 등원 기록은 출석·지각·벌점·학습시간에 반영되지 않습니다.</p>
  </div>;
}
