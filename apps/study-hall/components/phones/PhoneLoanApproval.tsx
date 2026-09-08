"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kstDate, type ManagementPolicy } from "@/lib/management-policy";

export function PhoneLoanApproval({ divisionSlug, policy, students, periods }: {
  divisionSlug: string;
  policy: ManagementPolicy;
  students: { id: string; name: string; studentNumber: string }[];
  periods: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [periodId, setPeriodId] = useState(policy.controlledPeriods[0]?.periodId ?? "");
  const [until, setUntil] = useState("");
  const [place, setPlace] = useState("5층 지정공간");
  const [purpose, setPurpose] = useState("");

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const today = kstDate();
      const response = await fetch(`/api/${divisionSlug}/phone-submissions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, periodId, records: [{ studentId, status: "RENTED", rentalNote: purpose, loanApproval: { until: `${today}T${until}:00+09:00`, place, purpose } }] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "승인을 저장하지 못했습니다.");
      toast.success("승인과 반출 시각을 기록했습니다. 반납 시 교시별 체크에서 제출로 처리해 주세요.");
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "승인에 실패했습니다."); }
    finally { setPending(false); }
  }

  return <section className="admin-section">
    <h2 className="admin-section-title">휴대폰 예외 사전승인</h2>
    <p className="admin-help">{policy.phone.shortLoanMinutes}분을 넘는 용무나 휴대폰 전용 학습앱은 관리자가 시간·장소·목적을 확인합니다. 반출 전 또는 기존 반납기한 안에 승인하며, 기한이 지난 건은 사후 연장할 수 없습니다.</p>
    <form onSubmit={approve} className="admin-filter-bar">
      <label className="admin-field"><span className="admin-label">학생</span><select required value={studentId} disabled={pending} onChange={(e) => setStudentId(e.target.value)}><option value="">학생 선택</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.studentNumber})</option>)}</select></label>
      <label className="admin-field"><span className="admin-label">대상 교시</span><select required value={periodId} disabled={pending} onChange={(e) => setPeriodId(e.target.value)}>{periods.filter((p) => policy.controlledPeriods.some((c) => c.periodId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="admin-field"><span className="admin-label">오늘 반납기한</span><input type="time" required max={policy.closingTime} value={until} disabled={pending} onChange={(e) => setUntil(e.target.value)} /></label>
      <label className="admin-field"><span className="admin-label">사용 장소</span><input required maxLength={80} value={place} disabled={pending} onChange={(e) => setPlace(e.target.value)} /></label>
      <label className="admin-field"><span className="admin-label">승인 목적</span><input required maxLength={200} value={purpose} disabled={pending} onChange={(e) => setPurpose(e.target.value)} /></label>
      <button className="admin-button admin-button-primary" disabled={pending}>승인 후 반출 기록</button>
    </form>
  </section>;
}
