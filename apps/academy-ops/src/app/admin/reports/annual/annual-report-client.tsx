"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type MonthData = {
  month: string;
  monthLabel: string;
  paymentNet: number;
  paymentGross: number;
  paymentCount: number;
  refundTotal: number;
  refundCount: number;
  newEnrollments: number;
  cancelledEnrollments: number;
  writtenPass: number;
  finalPass: number;
};

type AnnualSummary = {
  paymentNet: number;
  paymentGross: number;
  paymentCount: number;
  refundTotal: number;
  refundCount: number;
  newEnrollments: number;
  cancelledEnrollments: number;
  writtenPass: number;
  finalPass: number;
};

type Props = {
  year: number;
  months: MonthData[];
  annual: AnnualSummary;
  currentActiveEnrollments: number;
};

function fmtKRW(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function fmtM(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString("ko-KR");
}

function SummaryCard({
  title,
  value,
  sub,
  highlight,
  warn,
}: {
  title: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">{title}</p>
      <p
        className={`mt-3 text-2xl font-bold ${
          warn ? "text-red-600" : highlight ? "text-ember" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate">{sub}</p>}
    </div>
  );
}

export function AnnualReportClient({
  year,
  months,
  annual,
  currentActiveEnrollments,
}: Props) {
  const paymentChartData = months.map((m) => ({
    name: m.monthLabel,
    수납액: m.paymentNet,
    환불액: m.refundTotal,
  }));

  const enrollChartData = months.map((m) => ({
    name: m.monthLabel,
    신규등록: m.newEnrollments,
    퇴원취소: m.cancelledEnrollments,
  }));

  const passChartData = months.map((m) => ({
    name: m.monthLabel,
    필기합격: m.writtenPass,
    최종합격: m.finalPass,
  }));

  const netRate =
    annual.paymentGross > 0
      ? Math.round(((annual.paymentGross - annual.refundTotal) / annual.paymentGross) * 1000) / 10
      : null;

  return (
    <div className="space-y-8">
      {/* ── 연간 합계 요약 카드 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">연간 핵심 지표</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard
            title="연간 수납 총액"
            value={fmtKRW(annual.paymentNet)}
            sub={`${fmtNum(annual.paymentCount)}건 · 총수납 ${fmtKRW(annual.paymentGross)}`}
            highlight
          />
          <SummaryCard
            title="연간 환불 총액"
            value={fmtKRW(annual.refundTotal)}
            sub={`${fmtNum(annual.refundCount)}건 환불`}
            warn={annual.refundTotal > 0}
          />
          <SummaryCard
            title="신규 수강 등록"
            value={`${fmtNum(annual.newEnrollments)}명`}
            sub={`현재 수강생 ${fmtNum(currentActiveEnrollments)}명`}
          />
          <SummaryCard
            title="필기합격자"
            value={`${fmtNum(annual.writtenPass)}명`}
            sub={`최종합격 ${fmtNum(annual.finalPass)}명`}
          />
          <SummaryCard
            title="순수납률"
            value={netRate !== null ? `${netRate}%` : "-"}
            sub="(총수납 - 환불) / 총수납"
          />
        </div>
      </section>

      {/* ── 월별 수납 추이 LineChart ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">월별 수납 추이</h2>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={paymentChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => fmtM(v)} tick={{ fontSize: 11 }} width={60} />
              <Tooltip
                formatter={(value) => [fmtKRW(value as number), ""]}
                labelStyle={{ fontWeight: 600 }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="수납액"
                stroke="#C55A11"
                strokeWidth={2.5}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="환불액"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── 월별 신규 등록 BarChart ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">월별 수강 등록·퇴원</h2>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={enrollChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(value) => [`${value}명`, ""]}
                labelStyle={{ fontWeight: 600 }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
              />
              <Legend />
              <Bar dataKey="신규등록" fill="#1F4D3A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="퇴원취소" fill="#fca5a5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── 월별 합격자 BarChart ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">월별 합격자 현황</h2>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={passChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(value) => [`${value}명`, ""]}
                labelStyle={{ fontWeight: 600 }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
              />
              <Legend />
              <Bar dataKey="필기합격" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="최종합격" fill="#1F4D3A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── 12개월 상세 테이블 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">월별 상세 집계</h2>
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-4 py-3 text-left font-semibold text-ink">월</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">수납액</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">수납건</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">환불액</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">신규등록</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">퇴원·취소</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">필기합격</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">최종합격</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {months.map((m) => (
                  <tr key={m.month} className="transition-colors hover:bg-mist/50">
                    <td className="px-4 py-3 font-medium text-ink">{year}년 {m.monthLabel}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ember">
                      {m.paymentNet > 0 ? fmtKRW(m.paymentNet) : <span className="text-slate">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate">{m.paymentCount > 0 ? `${m.paymentCount}건` : "-"}</td>
                    <td className="px-4 py-3 text-right">
                      {m.refundTotal > 0 ? (
                        <span className="text-red-600">{fmtKRW(m.refundTotal)}</span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-forest">
                      {m.newEnrollments > 0 ? `${m.newEnrollments}명` : <span className="text-slate">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.cancelledEnrollments > 0 ? (
                        <span className="text-amber-600">{m.cancelledEnrollments}명</span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sky-600">
                      {m.writtenPass > 0 ? `${m.writtenPass}명` : <span className="text-slate">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-forest">
                      {m.finalPass > 0 ? `${m.finalPass}명` : <span className="text-slate">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/10 bg-forest text-white">
                  <td className="px-4 py-3 font-bold">연간 합계</td>
                  <td className="px-4 py-3 text-right font-bold">{fmtKRW(annual.paymentNet)}</td>
                  <td className="px-4 py-3 text-right">{annual.paymentCount}건</td>
                  <td className="px-4 py-3 text-right">{annual.refundTotal > 0 ? fmtKRW(annual.refundTotal) : "-"}</td>
                  <td className="px-4 py-3 text-right">{annual.newEnrollments}명</td>
                  <td className="px-4 py-3 text-right">{annual.cancelledEnrollments}명</td>
                  <td className="px-4 py-3 text-right">{annual.writtenPass}명</td>
                  <td className="px-4 py-3 text-right">{annual.finalPass}명</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* 인쇄 스타일 */}
      {/* eslint-disable-next-line react/no-danger */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            "@media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }",
        }}
      />
    </div>
  );
}
