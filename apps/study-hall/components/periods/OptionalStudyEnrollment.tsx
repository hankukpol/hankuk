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
  const optional = policy.controlledPeriods.find((p) => p.optional);
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
    if (!optional) return;
    void save({ action: "enroll", enrollment: { studentId, periodId: optional.periodId, dateFrom, dateTo, weekdays: optional.weekdays } }, "선택자습 신청을 저장했습니다.");
  }

  if (!optional) return null;
  return <section className="admin-section" id="optional-study">
    <h2 className="admin-section-title">평일 선택자습 신청</h2>
    <p className="admin-help">신청한 날짜와 요일에만 출입통제·휴대폰 제출·지각 규정을 적용합니다. 신청 종료 시 오늘과 과거 기록은 유지합니다.</p>
    <form onSubmit={enroll} className="admin-filter-bar">
      <label className="admin-field"><span className="admin-label">학생</span><select required value={studentId} disabled={pending} onChange={(e) => setStudentId(e.target.value)}><option value="">학생 선택</option>{students.map((s) => <option key={s.id} value={s.id}>{names.get(s.id)}</option>)}</select></label>
      <label className="admin-field"><span className="admin-label">시작일</span><input type="date" required min={kstDate()} value={dateFrom} disabled={pending} onChange={(e) => { setDateFrom(e.target.value); if (dateTo < e.target.value) setDateTo(e.target.value); }} /></label>
      <label className="admin-field"><span className="admin-label">종료일</span><input type="date" required min={dateFrom} value={dateTo} disabled={pending} onChange={(e) => setDateTo(e.target.value)} /></label>
      <button className="admin-button admin-button-primary" disabled={pending}>신청 저장</button>
    </form>
    <div className="admin-table-frame"><table><thead><tr><th>학생</th><th>교시</th><th>기간</th><th>요일</th><th>신청 종료</th></tr></thead><tbody>
      {policy.optionalEnrollments.length ? policy.optionalEnrollments.map((e, i) => <tr key={`${e.studentId}:${e.dateFrom}:${i}`}><td>{names.get(e.studentId) ?? "학생 정보 확인 필요"}</td><td>{periods.find((p) => p.id === e.periodId)?.name}</td><td>{e.dateFrom} ~ {e.dateTo}</td><td>{e.weekdays.map((d) => ["일", "월", "화", "수", "목", "금", "토"][d]).join("·")}</td><td>{e.dateTo > kstDate() ? <button className="admin-button" disabled={pending} onClick={() => void save({ action: "end-enrollment", enrollment: e }, "내일 이후 신청을 종료했습니다. 오늘과 과거 기록은 유지합니다.")}>내일부터 종료</button> : "종료"}</td></tr>) : <tr><td colSpan={5}>선택자습 신청자가 없습니다.</td></tr>}
    </tbody></table></div>
  </section>;
}
