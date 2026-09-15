"use client";

import { useEffect, useState } from "react";
import { type ArrivalStudent } from "@/lib/arrivals";
import { getKstTodayYmd } from "@/lib/date-utils";
import { SlideOver } from "@/components/ui/SlideOver";
import { StudentSearchField } from "@/components/ui/StudentSearchField";
import { ArrivalFeedback } from "./ArrivalFeedback";
import { useArrivalQuery } from "./arrival-client";
import { type ArrivalSelection } from "./ArrivalStudentDetail";

export function ArrivalStudentPicker({ divisionSlug, initialDate, onClose, onSelect }: {
  divisionSlug: string; initialDate: string; onClose: () => void; onSelect: (student: ArrivalSelection) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const query = useArrivalQuery<{ students: ArrivalStudent[] }>(`/api/${divisionSlug}/arrivals/students?q=${encodeURIComponent(term)}`);
  const searching = search.trim() !== term || query.loading;
  return <SlideOver open title="누락 기록 추가" description="학생과 날짜를 선택한 뒤 기존 기록을 확인하고 추가합니다." onClose={onClose}>
    <div className="space-y-4">
      <label className="block"><span className="admin-label mb-2 block">기록 날짜</span><input type="date" value={date} max={getKstTodayYmd()} required className="w-full" onChange={event => setDate(event.target.value)} /></label>
      <StudentSearchField label="추가할 학생 검색" value={search} onChange={setSearch} hint="이름 또는 수험번호로 검색한 뒤 학생을 선택합니다." />
      <ArrivalFeedback error={query.error} loading={searching} onRetry={() => void query.reload()} loginHref="/login" />
      {query.data && !searching && !query.error && <div className="admin-table-frame"><table className="admin-arrival-list"><thead><tr><th scope="col">학생 선택</th><th scope="col">수험번호</th></tr></thead><tbody>{query.data.students.map(student => <tr key={student.id}><td className="admin-table-name"><button type="button" className="admin-table-link" disabled={!date || date > getKstTodayYmd()} onClick={() => onSelect({ studentId: student.id, name: student.name, studentNumber: student.studentNumber, date })}>{student.name}</button></td><td className="break-all whitespace-normal">{student.studentNumber}</td></tr>)}</tbody></table></div>}
      {query.data?.students.length === 0 && !searching && <p className="admin-empty-state">검색 결과가 없습니다. 이름 또는 수험번호를 확인해 주세요.</p>}
    </div>
  </SlideOver>;
}
