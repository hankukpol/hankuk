"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kstDate, type ManagementPolicy } from "@/lib/management-policy";

export function OptionalStudyEnrollment({ divisionSlug, policy, students, periods }: {
  divisionSlug: string;
  policy: ManagementPolicy;
  students: { id: string; name: string; studentNumber: string }[];
  periods: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [dateFrom, setDateFrom] = useState(kstDate());
  const [dateTo, setDateTo] = useState(kstDate());
  const [periodId, setPeriodId] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const choices = policy.controlledPeriods.filter((p) => p.optional && periods.some(period => period.id === p.periodId));
  const optional = choices.find((p) => p.periodId === periodId);
  const selectedDays = weekdays.filter(day => optional?.weekdays.includes(day));
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const canSave = !!studentId && !!optional && selectedDays.length > 0 && dateTo >= dateFrom;
  const names = useMemo(() => new Map(students.map((s) => [s.id, `${s.name} (${s.studentNumber})`])), [students]);

  async function save(body: unknown, message: string) {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/${divisionSlug}/management-policy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "신청을 저장하지 못했습니다.");
      toast.success(message);
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "저장에 실패했습니다."); }
    finally { setPending(false); }
  }

  function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !optional) return;
    void save({ action: "enroll", enrollment: { studentId, periodId: optional.periodId, dateFrom, dateTo, weekdays: selectedDays } }, "선택자습 신청을 저장했습니다.");
  }

  if (!choices.length) return <p className="admin-empty-state">관리규정의 교시·출결에서 관리 대상을 신청 학생으로 지정해 주세요.</p>;
  return <section className="admin-section" id="optional-study">
    <h2 className="admin-section-title">선택자습 신청</h2>
    <p className="admin-help">신청한 날짜와 요일에만 출입통제·휴대폰 제출·지각 규정을 적용합니다. 신청 종료 시 오늘과 과거 기록은 유지합니다.</p>
    <form onSubmit={enroll} className="space-y-4">
      <div className="admin-filter-bar">
      <label className="admin-field"><span className="admin-label">학생</span><select required value={studentId} disabled={pending} onChange={(e) => setStudentId(e.target.value)}><option value="">학생 선택</option>{students.map((s) => <option key={s.id} value={s.id}>{names.get(s.id)}</option>)}</select></label>
      <label className="admin-field"><span className="admin-label">교시</span><select aria-label="선택자습 교시" required value={periodId} disabled={pending} onChange={e => { setPeriodId(e.target.value); setWeekdays([]); }}><option value="">교시 선택</option>{choices.map(p => <option key={p.periodId} value={p.periodId}>{periods.find(period => period.id === p.periodId)?.name}</option>)}</select></label>
      <label className="admin-field"><span className="admin-label">시작일</span><input type="date" required value={dateFrom} disabled={pending} onChange={(e) => { setDateFrom(e.target.value); if (dateTo < e.target.value) setDateTo(e.target.value); }} /></label>
      <label className="admin-field"><span className="admin-label">종료일</span><input type="date" required min={dateFrom} value={dateTo} disabled={pending} onChange={(e) => setDateTo(e.target.value)} /></label>
      </div>
      <fieldset disabled={pending || !optional} className="min-w-0"><legend className="admin-label">적용 요일</legend><div className="flex flex-wrap gap-4">{[1,2,3,4,5,6,0].map(day => <label key={day} className="flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`선택자습 ${dayNames[day]}요일`} disabled={!optional?.weekdays.includes(day)} checked={selectedDays.includes(day)} onChange={e => { const checked=e.target.checked; setWeekdays(current => checked ? [...current, day].sort() : current.filter(value => value !== day)); }}/><span>{dayNames[day]}</span></label>)}</div></fieldset>
      <div className="admin-workspace-toolbar"><p className="admin-help" aria-live="polite">{canSave ? `${names.get(studentId)} · ${periods.find(p => p.id === periodId)?.name} · ${dateFrom} ~ ${dateTo} · ${selectedDays.map(day => dayNames[day]).join("·")}` : "학생·교시·기간·적용 요일을 선택해 주세요."}</p><button className="admin-button admin-button-primary" disabled={pending || !canSave}>신청 저장</button></div>
    </form>
    <div className="admin-table-frame"><table><thead><tr><th>학생</th><th>교시</th><th>기간</th><th>요일</th><th>신청 종료</th></tr></thead><tbody>
      {policy.optionalEnrollments.length ? policy.optionalEnrollments.map((e, i) => <tr key={`${e.studentId}:${e.dateFrom}:${i}`}><td>{names.get(e.studentId) ?? "학생 정보 확인 필요"}</td><td>{periods.find((p) => p.id === e.periodId)?.name}</td><td>{e.dateFrom} ~ {e.dateTo}</td><td>{e.weekdays.map((d) => ["일", "월", "화", "수", "목", "금", "토"][d]).join("·")}</td><td>{e.dateTo > kstDate() ? <button className="admin-button" disabled={pending} onClick={() => void save({ action: "end-enrollment", enrollment: e }, "내일 이후 신청을 종료했습니다. 오늘과 과거 기록은 유지합니다.")}>내일부터 종료</button> : "종료"}</td></tr>) : <tr><td colSpan={5}>선택자습 신청자가 없습니다.</td></tr>}
    </tbody></table></div>
  </section>;
}
