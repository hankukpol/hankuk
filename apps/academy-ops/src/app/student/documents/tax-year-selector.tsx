"use client";

import Link from "next/link";

type Props = {
  currentYear: number;
  prevYear: number;
  selectedYear: number | null;
  currentYearTotal: number;
  prevYearTotal: number;
};

function formatAmount(value: number) {
  if (value === 0) return "납입 내역 없음";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function TaxYearSelector({
  currentYear,
  prevYear,
  selectedYear,
  currentYearTotal,
  prevYearTotal,
}: Props) {
  const years = [
    { year: currentYear, total: currentYearTotal },
    { year: prevYear, total: prevYearTotal },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
        과세연도 선택
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        {years.map(({ year, total }) => {
          const isSelected = selectedYear === year;
          const hasPayments = total > 0;

          return (
            <Link
              key={year}
              href={`/student/documents?year=${year}`}
              className={`relative flex flex-col gap-1.5 rounded-[20px] border p-4 transition ${
                isSelected
                  ? "border-ember/30 bg-ember/5 shadow-sm"
                  : hasPayments
                    ? "border-ink/15 bg-white hover:border-ember/20 hover:bg-ember/5"
                    : "border-ink/10 bg-mist/50 hover:border-ink/20"
              }`}
            >
              {/* Year badge */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-base font-bold ${
                    isSelected ? "text-ember" : "text-ink"
                  }`}
                >
                  {year}년도
                </span>
                {isSelected && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ember text-white">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3 w-3"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                )}
              </div>

              {/* Total amount */}
              <p
                className={`text-sm font-semibold ${
                  hasPayments
                    ? isSelected
                      ? "text-ember"
                      : "text-ink"
                    : "text-slate/50"
                }`}
              >
                {formatAmount(total)}
              </p>

              {/* Label */}
              <p className="text-xs text-slate">
                {hasPayments ? "연말정산 소득공제 가능" : "납입 내역 없음"}
              </p>
            </Link>
          );
        })}
      </div>

      {selectedYear === null && (
        <p className="text-center text-xs text-slate pt-1">
          연도를 선택하면 교육비 납입증명서를 발급할 수 있습니다.
        </p>
      )}
    </div>
  );
}
