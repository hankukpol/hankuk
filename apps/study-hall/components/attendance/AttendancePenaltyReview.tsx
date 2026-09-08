"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kstDate, type AttendancePenaltyCandidate } from "@/lib/management-policy";

export function AttendancePenaltyReview({ divisionSlug, effectiveFrom, students }: {
  divisionSlug: string;
  effectiveFrom: string;
  students: { id: string; name: string; studentNumber: string }[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(kstDate());
  const [candidates, setCandidates] = useState<AttendancePenaltyCandidate[] | null>(null);
  const [pending, setPending] = useState(false);
  const names = useMemo(() => new Map(students.map((s) => [s.id, `${s.name} (${s.studentNumber})`])), [students]);

  async function preview() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/${divisionSlug}/management-policy?date=${date}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "벌점 후보를 불러오지 못했습니다.");
      setCandidates(data.candidates);
    } catch (error) {
      setCandidates(null);
      toast.error(error instanceof Error ? error.message : "조회에 실패했습니다.");
    } finally { setPending(false); }
  }

  async function confirm() {
    if (pending || candidates === null) return;
    setPending(true);
    try {
      const response = await fetch(`/api/${divisionSlug}/management-policy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm-attendance", date }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "벌점을 확정하지 못했습니다.");
      toast.success(`${data.confirmedCount}건 확정했습니다. 수정된 출결도 중복 없이 반영했습니다.`);
      setCandidates(null);
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "확정에 실패했습니다."); }
    finally { setPending(false); }
  }

  return <section className="admin-section" id="penalty-review">
    <h2 className="admin-section-title">출결 벌점 확인·확정</h2>
    <p className="admin-help">조교의 출결 입력 후 관리자가 사전일정과 인정사유를 확인하여 확정합니다. 전체 무단결석은 마지막 시간통제 교시가 끝난 뒤 모든 대상 교시가 결석일 때 하루 1건으로 계산합니다.</p>
    <div className="admin-filter-bar">
      <label className="admin-field"><span className="admin-label">확인 날짜</span><input type="date" required min={effectiveFrom} max={kstDate()} value={date} disabled={pending} onChange={(e) => { setDate(e.target.value); setCandidates(null); }} /></label>
      <button className="admin-button" onClick={preview} disabled={pending || !date}>벌점 후보 조회</button>
    </div>
    {candidates !== null && <>
      <div className="admin-table-frame"><table><thead><tr><th>학생</th><th>사유</th><th>벌점</th></tr></thead><tbody>
        {candidates.length ? candidates.map((c) => <tr key={`${c.studentId}:${c.notes}`}><td>{names.get(c.studentId) ?? "학생 정보 확인 필요"}</td><td className="admin-table-name">{c.notes.slice(c.notes.lastIndexOf("]") + 1).trim()}</td><td>{c.points}점</td></tr>) : <tr><td colSpan={3}>현재 확정할 벌점 후보가 없습니다.</td></tr>}
      </tbody></table></div>
      <p className="admin-help">확정할 때 최신 출결로 다시 계산합니다. 후보가 없는 날짜를 확정하면 그 날짜의 기존 자동 출결 벌점만 해제됩니다.</p>
      <div><button className="admin-button admin-button-primary" disabled={pending} onClick={confirm}>{pending ? "처리 중…" : "확인한 출결 벌점 확정"}</button></div>
    </>}
  </section>;
}
