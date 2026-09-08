"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PhoneCheckRecord } from "@/lib/services/phone-submission.service";

export function OutstandingPhoneReturns({ divisionSlug, records }: {
  divisionSlug: string;
  records: PhoneCheckRecord[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function recordReturn(record: PhoneCheckRecord) {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/${divisionSlug}/phone-submissions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: record.date.slice(0, 10), periodId: record.periodId, records: [{ studentId: record.studentId, status: "SUBMITTED" }] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "반납을 저장하지 못했습니다.");
      toast.success(`${record.studentName} 학생의 반납을 기록했습니다.`);
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "반납 저장에 실패했습니다."); }
    finally { setPending(false); }
  }
  if (!records.length) return null;
  return <section className="admin-section">
    <h2 className="admin-section-title">출결 변경 학생의 반납 대기</h2>
    <p className="admin-help">반출 후 외출·사유결석 등으로 출석 상태가 바뀐 학생입니다. 실제 휴대폰을 돌려받았을 때 반납을 기록해 주세요.</p>
    <ul className="space-y-4">{records.map((record) => <li className="admin-workspace-toolbar" key={record.id}>
      <span>{record.studentName} ({record.studentNumber}) · {record.periodName}</span>
      <button className="admin-button" disabled={pending} onClick={() => void recordReturn(record)}>{record.studentName} 반납 기록</button>
    </li>)}</ul>
  </section>;
}
