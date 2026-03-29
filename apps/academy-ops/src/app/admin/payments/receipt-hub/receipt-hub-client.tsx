'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

export type ReceiptHubRow = {
  id: string;
  examNumber: string | null;
  studentName: string | null;
  studentMobile: string | null;
  enrollmentSummary: string;
  itemNames: string;
  netAmount: number;
  method: string;
  category: string;
  processedAt: string;
  enrollmentId: string | null;
};

type Props = {
  payments: ReceiptHubRow[];
  totalAmount: number;
  receiptReadyCount: number;
  initialFrom: string;
  initialTo: string;
  initialSearch: string;
};

const METHOD_LABEL: Record<string, string> = {
  CASH: '현금',
  CARD: '카드',
  TRANSFER: '계좌이체',
  POINT: '포인트',
  MIXED: '혼합',
};

const CATEGORY_LABEL: Record<string, string> = {
  TUITION: '수강료',
  FACILITY: '시설비',
  TEXTBOOK: '교재',
  MATERIAL: '교구·모의물',
  SINGLE_COURSE: '단과',
  PENALTY: '위약금',
  ETC: '기타',
};

function formatKRW(amount: number) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function methodBadgeClass(method: string) {
  switch (method) {
    case 'CASH':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'CARD':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'TRANSFER':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'POINT':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700';
  }
}

export function ReceiptHubClient({
  payments,
  totalAmount,
  receiptReadyCount,
  initialFrom,
  initialTo,
  initialSearch,
}: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return payments;

    return payments.filter((payment) => {
      const fields = [
        payment.studentName,
        payment.examNumber,
        payment.studentMobile,
        payment.enrollmentSummary,
        payment.itemNames,
        CATEGORY_LABEL[payment.category] ?? payment.category,
        METHOD_LABEL[payment.method] ?? payment.method,
      ];

      return fields.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    });
  }, [payments, search]);

  const visibleIds = filtered.map((payment) => payment.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const selectedRows = useMemo(
    () => payments.filter((payment) => selectedIds.has(payment.id)),
    [payments, selectedIds],
  );

  const selectedEnrollmentRows = selectedRows.filter((row) => row.enrollmentId);

  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allVisibleSelected, visibleIds]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  function openUrls(urls: string[]) {
    if (urls.length === 0) {
      window.alert('열 수 있는 문서가 없습니다.');
      return;
    }

    urls.forEach((url) => window.open(url, '_blank', 'noopener,noreferrer'));
  }

  function handleExport() {
    const params = new URLSearchParams({
      from: initialFrom,
      to: initialTo,
      format: 'csv',
    });
    params.append('status', 'APPROVED');
    params.append('status', 'PARTIAL_REFUNDED');
    window.open(`/api/export/payments?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">조회 결제 건수</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{payments.length.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">건</p>
        </article>
        <article className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">실수납 합계</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{formatKRW(totalAmount)}</p>
          <p className="mt-1 text-xs text-slate">승인 및 부분 환불 기준</p>
        </article>
        <article className="rounded-[24px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest">영수증 출력 가능</p>
          <p className="mt-2 text-3xl font-semibold text-forest">{receiptReadyCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-forest/70">결제 영수증을 바로 열 수 있는 건수</p>
        </article>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="receipt-hub-from" className="text-xs font-medium text-slate">
              조회 기간
            </label>
            <div className="flex items-center gap-2">
              <input
                id="receipt-hub-from"
                type="date"
                name="from"
                defaultValue={initialFrom}
                className="rounded-2xl border border-ink/10 px-3 py-2 text-sm"
              />
              <span className="text-slate">~</span>
              <input
                type="date"
                name="to"
                defaultValue={initialTo}
                className="rounded-2xl border border-ink/10 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
          >
            기간 조회
          </button>
        </form>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="학생명, 학번, 연락처, 수강명 검색"
          className="w-full max-w-sm rounded-2xl border border-ink/10 px-4 py-2 text-sm"
        />

        <div className="flex-1" />

        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          CSV 다운로드
        </button>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ember/20 bg-ember/5 px-4 py-3">
          <span className="text-sm font-medium text-ember">선택 {selectedIds.size.toLocaleString()}건</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openUrls(selectedRows.map((row) => `/admin/payments/${row.id}/receipt`))}
              className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              선택 영수증 출력
            </button>
            <button
              type="button"
              onClick={() => openUrls(selectedEnrollmentRows.flatMap((row) => (row.enrollmentId ? [`/admin/enrollments/${row.enrollmentId}/payment-plan`] : [])))}
              className="rounded-full border border-ember/30 bg-white px-4 py-2 text-sm font-semibold text-ember transition hover:border-ember/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedEnrollmentRows.length === 0}
            >
              선택 납부계획표
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-6 py-4">
          <div>
            <h2 className="font-semibold text-ink">증빙 대상 결제 목록</h2>
            <p className="mt-1 text-xs text-slate">현재 목록 {filtered.length.toLocaleString()}건</p>
          </div>
          <button
            type="button"
            onClick={toggleAllVisible}
            className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            {allVisibleSelected ? '현재 목록 전체 해제' : '현재 목록 전체 선택'}
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate">선택한 기간에 표시할 결제 건이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-sm">
              <caption className="sr-only">영수증 출력 대상 결제 목록</caption>
              <thead>
                <tr className="border-b border-ink/10 bg-mist/50">
                  <th className="px-4 py-3 text-center">
                    <input
                      aria-label="현재 목록 전체 선택"
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate">결제일시</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">학생</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">연락처</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">수강내역</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">결제 항목</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">결제수단</th>
                  <th className="px-4 py-3 text-right font-medium text-slate">실수납액</th>
                  <th className="px-4 py-3 text-left font-medium text-slate">증빙</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payment) => (
                  <tr
                    key={payment.id}
                    className={[
                      'border-b border-ink/5 align-top last:border-0 hover:bg-mist/30',
                      selectedIds.has(payment.id) ? 'bg-ember/5' : '',
                    ].join(' ')}
                  >
                    <td className="px-4 py-4 text-center">
                      <input
                        aria-label={`${payment.studentName ?? payment.examNumber ?? payment.id} 선택`}
                        type="checkbox"
                        checked={selectedIds.has(payment.id)}
                        onChange={() => toggleOne(payment.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate">{formatDateTime(payment.processedAt)}</td>
                    <td className="px-4 py-4">
                      {payment.examNumber ? (
                        <Link href={`/admin/students/${payment.examNumber}`} className="font-medium text-ink hover:text-ember">
                          {payment.studentName ?? payment.examNumber}
                          <span className="ml-1 font-mono text-xs text-slate">{payment.examNumber}</span>
                        </Link>
                      ) : (
                        <span className="text-slate">{payment.studentName ?? '학생 정보 없음'}</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate">{payment.studentMobile ?? '연락처 없음'}</td>
                    <td className="px-4 py-4 text-slate">{payment.enrollmentSummary}</td>
                    <td className="px-4 py-4 text-slate">
                      <div className="space-y-1">
                        <div>{payment.itemNames}</div>
                        <div className="text-xs text-slate/70">{CATEGORY_LABEL[payment.category] ?? payment.category}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${methodBadgeClass(payment.method)}`}>
                        {METHOD_LABEL[payment.method] ?? payment.method}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-ink">{formatKRW(payment.netAmount)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => window.open(`/admin/payments/${payment.id}/receipt`, '_blank', 'noopener,noreferrer')}
                          className="rounded-full bg-forest/10 px-3 py-1.5 text-xs font-semibold text-forest transition hover:bg-forest/20"
                        >
                          영수증
                        </button>
                        {payment.enrollmentId ? (
                          <button
                            type="button"
                            onClick={() => window.open(`/admin/enrollments/${payment.enrollmentId}/payment-plan`, '_blank', 'noopener,noreferrer')}
                            className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/30"
                          >
                            납부계획표
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
