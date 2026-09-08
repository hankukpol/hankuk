"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kstDate, type ManagementPolicy, type AttendancePenaltyCandidate } from "@/lib/management-policy";

type Props = { divisionSlug: string; initialPolicy: ManagementPolicy; students: { id: string; name: string; studentNumber: string }[]; periods: { id: string; name: string; startTime: string; endTime: string }[] };

export function ManagementPolicyPanel({ divisionSlug, initialPolicy, students, periods }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(kstDate());
  const [candidates, setCandidates] = useState<AttendancePenaltyCandidate[] | null>(null);
  const [pending, setPending] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [dateFrom, setDateFrom] = useState(kstDate());
  const [dateTo, setDateTo] = useState(kstDate());
  const [loanStudentId, setLoanStudentId] = useState("");
  const [loanPeriodId, setLoanPeriodId] = useState(initialPolicy.controlledPeriods[0]?.periodId ?? "");
  const [loanUntil, setLoanUntil] = useState("");
  const [loanPlace, setLoanPlace] = useState("5층 지정공간");
  const [loanPurpose, setLoanPurpose] = useState("");
  const optional = initialPolicy.controlledPeriods.find((p) => p.optional);
  const names = new Map(students.map((s) => [s.id, `${s.name} (${s.studentNumber})`]));

  async function request(body?: unknown) {
    const response = await fetch(`/api/${divisionSlug}/management-policy${body ? "" : `?date=${date}`}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
    return data;
  }
  async function preview() {
    setPending(true);
    try { const data = await request(); setCandidates(data.candidates); }
    catch (e) { setCandidates(null); toast.error(e instanceof Error ? e.message : "조회 실패"); }
    finally { setPending(false); }
  }
  async function confirm() {
    if (pending || candidates === null) return;
    setPending(true);
    try { const data = await request({ action: "confirm-attendance", date }); toast.success(`${data.confirmedCount}건 확정. 수정된 출결은 재확정 시 중복 없이 반영됩니다.`); setCandidates(null); router.refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "확정 실패"); }
    finally { setPending(false); }
  }
  async function enroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || !optional) return;
    setPending(true);
    try { await request({ action: "enroll", enrollment: { studentId, periodId: optional.periodId, dateFrom, dateTo, weekdays: optional.weekdays } }); toast.success("선택자습 신청을 저장했습니다."); router.refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "저장 실패"); }
    finally { setPending(false); }
  }
  async function endEnrollment(enrollment: ManagementPolicy["optionalEnrollments"][number]) {
    setPending(true);
    try { await request({ action: "end-enrollment", enrollment }); toast.success("내일 이후 신청을 종료했습니다. 오늘과 과거 기록은 유지합니다."); router.refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "종료 실패"); }
    finally { setPending(false); }
  }
  async function approveLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return; setPending(true);
    try {
      const response = await fetch(`/api/${divisionSlug}/phone-submissions`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({date:kstDate(), periodId:loanPeriodId, records:[{studentId:loanStudentId,status:"RENTED",rentalNote:loanPurpose,loanApproval:{until:`${kstDate()}T${loanUntil}:00+09:00`,place:loanPlace,purpose:loanPurpose}}]}) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "승인을 저장하지 못했습니다.");
      toast.success("관리자 승인 시간·장소·목적과 반출 시각을 기록했습니다. 반납은 휴대폰 관리에서 제출로 처리해 주세요."); router.refresh();
    } catch(e) { toast.error(e instanceof Error ? e.message : "승인 실패"); } finally { setPending(false); }
  }
  return <>
    <section className="admin-section"><h2 className="admin-section-title">출결 벌점 확인·확정</h2>
      <p className="admin-help">조교 출결 입력만으로 벌점을 확정하지 않습니다. 사전일정·인정사유를 출석 관리에서 먼저 확인해 주세요. 전체 무단결석은 마지막 시간통제 교시 종료 후 모든 대상 교시가 결석일 때만 1건으로 계산합니다.</p>
      <div className="flex flex-wrap items-end gap-4"><label className="admin-field"><span className="admin-label">확인 날짜</span><input type="date" min={initialPolicy.effectiveFrom} max={kstDate()} value={date} disabled={pending} onChange={(e) => { setDate(e.target.value); setCandidates(null); }} /></label><button className="admin-button" onClick={preview} disabled={pending}>벌점 후보 조회</button></div>
      {candidates !== null && <><div className="admin-table-frame"><table><thead><tr><th>학생</th><th>사유</th><th>벌점</th></tr></thead><tbody>{candidates.length ? candidates.map((c) => <tr key={`${c.studentId}:${c.notes}`}><td>{names.get(c.studentId) ?? "학생 정보 확인 필요"}</td><td className="admin-table-name">{c.notes.slice(c.notes.lastIndexOf("]") + 1).trim()}</td><td>{c.points}점</td></tr>) : <tr><td colSpan={3}>현재 확정할 벌점 후보가 없습니다.</td></tr>}</tbody></table></div>
        <p className="admin-help">확정 시 최신 출결로 다시 계산합니다. 후보가 없는 날짜를 확정하면 그 날짜의 기존 자동 출결 벌점만 해제됩니다.</p>
        <div><button className="admin-button admin-button-primary" disabled={pending} onClick={confirm}>{pending ? "처리 중…" : "확인한 출결 벌점 확정"}</button></div></>}
    </section>
    {optional && <section className="admin-section"><h2 className="admin-section-title">평일 선택자습 신청</h2><p className="admin-help">신청한 날짜·요일에만 출입통제·휴대폰 제출·지각 규정을 적용합니다. 신청하지 않은 학생에게 소급 적용하지 않습니다.</p>
      <form onSubmit={enroll} className="flex flex-wrap items-end gap-4">
        <label className="admin-field"><span className="admin-label">학생</span><select required value={studentId} disabled={pending} onChange={(e) => setStudentId(e.target.value)}><option value="">학생 선택</option>{students.map((s) => <option key={s.id} value={s.id}>{names.get(s.id)}</option>)}</select></label>
        <label className="admin-field"><span className="admin-label">시작일</span><input type="date" required min={kstDate()} value={dateFrom} disabled={pending} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label className="admin-field"><span className="admin-label">종료일</span><input type="date" required min={dateFrom} value={dateTo} disabled={pending} onChange={(e) => setDateTo(e.target.value)} /></label>
        <button className="admin-button admin-button-primary" disabled={pending}>신청 저장</button>
      </form>
      <div className="admin-table-frame"><table><thead><tr><th>학생</th><th>교시</th><th>기간</th><th>요일</th><th>신청 종료</th></tr></thead><tbody>{initialPolicy.optionalEnrollments.length ? initialPolicy.optionalEnrollments.map((e, i) => <tr key={i}><td>{names.get(e.studentId) ?? "학생 정보 확인 필요"}</td><td>{periods.find((p) => p.id === e.periodId)?.name}</td><td>{e.dateFrom} ~ {e.dateTo}</td><td>{e.weekdays.map((d) => ["일", "월", "화", "수", "목", "금", "토"][d]).join("·")}</td><td>{e.dateTo > kstDate() ? <button className="admin-button" disabled={pending} onClick={() => endEnrollment(e)}>내일부터 종료</button> : "종료"}</td></tr>) : <tr><td colSpan={5}>선택자습 신청자가 없습니다.</td></tr>}</tbody></table></div>
    </section>}
    <section className="admin-section"><h2 className="admin-section-title">휴대폰 예외 사전승인</h2><p className="admin-help">{initialPolicy.phone.shortLoanMinutes}분을 넘는 용무·휴대폰 전용 학습앱은 시간·장소·목적을 확인합니다. 본 자습실 반입과 장시간 일괄 대여는 허용하지 않습니다. 현재 반출할 때 기록하며, 이미 대여 중인 건의 기한은 연장하지 않습니다.</p>
      <form onSubmit={approveLoan} className="flex flex-wrap items-end gap-4">
        <label className="admin-field"><span className="admin-label">학생</span><select required value={loanStudentId} disabled={pending} onChange={e=>setLoanStudentId(e.target.value)}><option value="">학생 선택</option>{students.map(s=><option key={s.id} value={s.id}>{names.get(s.id)}</option>)}</select></label>
        <label className="admin-field"><span className="admin-label">대상 교시</span><select required value={loanPeriodId} disabled={pending} onChange={e=>setLoanPeriodId(e.target.value)}>{periods.filter(p=>initialPolicy.controlledPeriods.some(c=>c.periodId===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="admin-field"><span className="admin-label">오늘 반납기한</span><input type="time" required max={initialPolicy.closingTime} value={loanUntil} disabled={pending} onChange={e=>setLoanUntil(e.target.value)}/></label>
        <label className="admin-field"><span className="admin-label">사용 장소</span><input required maxLength={80} value={loanPlace} disabled={pending} onChange={e=>setLoanPlace(e.target.value)}/></label>
        <label className="admin-field"><span className="admin-label">승인 목적</span><input required maxLength={200} value={loanPurpose} disabled={pending} onChange={e=>setLoanPurpose(e.target.value)}/></label>
        <button className="admin-button admin-button-primary" disabled={pending}>승인 후 반출 기록</button>
      </form>
    </section>
  </>;
}
