"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SessionRow = {
  subjectId: string;
  subjectName: string;
  lectureName: string;
  price: number;
  instructorRate: number;
  amount: number;
};

type SettlementRow = {
  id: string;
  month: string;
  totalSessions: number;
  totalAmount: number;
  isPaid: boolean;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
};

interface Props {
  instructorId: string;
  instructorName: string;
  currentMonth: string;
  calculatedAmount: number;
  calculatedSessions: number;
  currentMonthSessions: SessionRow[];
  existingCurrentMonth: SettlementRow | null;
  settlements: SettlementRow[];
}

export function SettlementClient({
  instructorId,
  instructorName,
  currentMonth,
  calculatedAmount,
  calculatedSessions,
  currentMonthSessions,
  existingCurrentMonth,
  settlements,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state for creating a new settlement
  const [formMonth, setFormMonth] = useState(currentMonth);
  const [formSessions, setFormSessions] = useState(calculatedSessions);
  const [formAmount, setFormAmount] = useState(calculatedAmount);
  const [formNote, setFormNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Track which settlement is being processed for paid action
  const [payingId, setPayingId] = useState<string | null>(null);

  function handleCreateSettlement() {
    setFormError(null);
    setFormSuccess(null);
    if (!formMonth) { setFormError("월을 입력하세요."); return; }
    if (formSessions < 0) { setFormError("수업 횟수를 올바르게 입력하세요."); return; }
    if (formAmount < 0) { setFormError("금액을 올바르게 입력하세요."); return; }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/instructors/${instructorId}/settlements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month: formMonth,
            totalSessions: formSessions,
            totalAmount: formAmount,
            note: formNote.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "정산 생성 실패");
        setFormSuccess(`${formMonth} 정산서가 생성되었습니다.`);
        setFormNote("");
        router.refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "정산 생성 실패");
      }
    });
  }

  function handleMarkPaid(settlement: SettlementRow) {
    setPayingId(settlement.id);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/instructors/${instructorId}/settlements/${settlement.month}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isPaid: true }),
          },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "처리 실패");
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "납부 처리 실패");
      } finally {
        setPayingId(null);
      }
    });
  }

  function handleMarkUnpaid(settlement: SettlementRow) {
    setPayingId(settlement.id);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/instructors/${instructorId}/settlements/${settlement.month}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isPaid: false }),
          },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "처리 실패");
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "처리 실패");
      } finally {
        setPayingId(null);
      }
    });
  }

  function handleExportCsv(settlement: SettlementRow) {
    // Build CSV from the passed currentMonthSessions (only if same month)
    // For simplicity, we always export current month sessions
    const rows: string[][] = [
      ["과목명", "특강명", "수업료", "배분율(%)", "강사금액"],
    ];
    if (settlement.month === currentMonth && currentMonthSessions.length > 0) {
      for (const s of currentMonthSessions) {
        rows.push([
          s.subjectName,
          s.lectureName,
          String(s.price),
          String(s.instructorRate),
          String(s.amount),
        ]);
      }
    }
    rows.push([]);
    rows.push(["", "", "", "합계", String(settlement.totalAmount)]);

    const csvContent =
      "\uFEFF" + // BOM for Excel Korean support
      rows.map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `정산_${instructorName}_${settlement.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allSettlements = settlements;

  return (
    <div className="mt-8 space-y-8">
      {/* Current month preview card */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">이번달 자동 계산 ({currentMonth})</h2>
            <p className="mt-0.5 text-xs text-slate">
              이번달 진행 중인 특강 과목 기준으로 자동 계산됩니다.
            </p>
          </div>
          {existingCurrentMonth && (
            <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              정산서 있음
            </span>
          )}
        </div>

        {currentMonthSessions.length === 0 ? (
          <p className="text-sm text-slate">이번달 진행 중인 과목이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate">과목명</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate">특강명</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate text-right">수업료</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate text-center">배분율</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate text-right">강사 금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {currentMonthSessions.map((s) => (
                  <tr key={s.subjectId} className="hover:bg-mist/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">{s.subjectName}</td>
                    <td className="px-4 py-3 text-slate">{s.lectureName}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {s.price.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold">
                        {s.instructorRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ember">
                      {s.amount.toLocaleString()}원
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-ink/20">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-right text-ink">
                    합계
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                    {calculatedAmount.toLocaleString()}원
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Settlement creation form */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="mb-5 text-base font-semibold text-ink">정산서 생성</h2>

        {formError && (
          <div className="mb-4 rounded-[12px] bg-red-50 px-4 py-3 text-sm text-red-600">
            {formError}
          </div>
        )}
        {formSuccess && (
          <div className="mb-4 rounded-[12px] bg-green-50 px-4 py-3 text-sm text-green-700">
            {formSuccess}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">정산월 *</label>
            <input
              type="month"
              value={formMonth}
              onChange={(e) => {
                setFormMonth(e.target.value);
                setFormSuccess(null);
              }}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">수업 횟수</label>
            <input
              type="number"
              min={0}
              value={formSessions}
              onChange={(e) => setFormSessions(Number(e.target.value))}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">정산 금액 (원) *</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={formAmount}
              onChange={(e) => setFormAmount(Number(e.target.value))}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">메모</label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="선택사항"
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate">
            자동계산 금액: <span className="font-semibold text-forest">{calculatedAmount.toLocaleString()}원</span>
            {" "}({calculatedSessions}개 과목)
            <button
              type="button"
              onClick={() => { setFormAmount(calculatedAmount); setFormSessions(calculatedSessions); }}
              className="ml-2 text-xs text-ember underline-offset-2 hover:underline"
            >
              자동계산값 적용
            </button>
          </p>
          <button
            onClick={handleCreateSettlement}
            disabled={isPending}
            className="rounded-[28px] bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "정산서 생성"}
          </button>
        </div>
      </section>

      {/* Settlement history table */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="mb-5 text-base font-semibold text-ink">정산 내역 (최근 12개월)</h2>

        {allSettlements.length === 0 ? (
          <p className="text-sm text-slate">정산 내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate">정산월</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate text-center">수업 횟수</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate text-right">정산 금액</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate text-center">지급 상태</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate">지급일</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate">메모</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {allSettlements.map((s) => (
                  <tr key={s.id} className="hover:bg-mist/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-sm font-medium text-ink">
                      {s.month}
                    </td>
                    <td className="px-5 py-3.5 text-center text-slate">
                      {s.totalSessions}회
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                      {s.totalAmount.toLocaleString()}원
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          s.isPaid
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {s.isPaid ? "지급완료" : "미지급"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate text-xs">
                      {s.paidAt
                        ? new Date(s.paidAt).toLocaleDateString("ko-KR")
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-slate text-xs max-w-[160px] truncate">
                      {s.note ?? "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {!s.isPaid ? (
                          <button
                            onClick={() => handleMarkPaid(s)}
                            disabled={isPending && payingId === s.id}
                            className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
                          >
                            납부완료
                          </button>
                        ) : (
                          <button
                            onClick={() => handleMarkUnpaid(s)}
                            disabled={isPending && payingId === s.id}
                            className="rounded-full border border-ink/10 px-3 py-1 text-xs text-slate transition hover:border-ink/30"
                          >
                            취소
                          </button>
                        )}
                        <button
                          onClick={() => handleExportCsv(s)}
                          className="rounded-full border border-ink/10 px-3 py-1 text-xs text-slate transition hover:border-ink/30"
                        >
                          CSV
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
