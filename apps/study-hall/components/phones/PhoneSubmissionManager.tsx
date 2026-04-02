"use client";

import { AlertTriangle, Check, Phone, RefreshCcw, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import type { PhoneCheckRecord } from "@/lib/services/phone-submission.service";
import type { PointRuleItem } from "@/lib/services/point.service";

type PhoneSubmissionManagerProps = {
  divisionSlug: string;
  initialRecords?: PhoneCheckRecord[];
  phonePointRule?: PointRuleItem | null;
  pointsEnabled?: boolean;
};

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getMonthStart() {
  const today = getKstToday();
  return `${today.slice(0, 7)}-01`;
}

function findPhonePointRule(rules: PointRuleItem[]) {
  return (
    rules.find(
      (rule) =>
        rule.isActive &&
        rule.points < 0 &&
        (rule.name.includes("휴대폰") ||
          rule.name.includes("핸드폰") ||
          rule.name.toLowerCase().includes("phone")),
    ) ?? null
  );
}

export function PhoneSubmissionManager({
  divisionSlug,
  initialRecords = [],
  phonePointRule: initialPhonePointRule = null,
  pointsEnabled = true,
}: PhoneSubmissionManagerProps) {
  const [records, setRecords] = useState<PhoneCheckRecord[]>(initialRecords);
  const [phonePointRule, setPhonePointRule] = useState<PointRuleItem | null>(initialPhonePointRule);
  const [dateFrom, setDateFrom] = useState(getMonthStart());
  const [dateTo, setDateTo] = useState(getKstToday());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const hasBootstrapped = useRef(false);

  const notSubmittedList = useMemo(
    () => records.filter((record) => record.status === "NOT_SUBMITTED"),
    [records],
  );
  const submittedCount = useMemo(
    () => records.filter((record) => record.status === "SUBMITTED").length,
    [records],
  );
  const notSubmittedCount = notSubmittedList.length;
  const rentedCount = useMemo(
    () => records.filter((record) => record.status === "RENTED").length,
    [records],
  );

  const handleSearch = useCallback(async () => {
    setIsLoading(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/${divisionSlug}/phone-submissions?${params}`);
      if (!res.ok) {
        toast.error("데이터를 불러오는 데 실패했습니다.");
        return;
      }
      const { records: data } = (await res.json()) as { records: PhoneCheckRecord[] };
      setRecords(data);
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, divisionSlug]);

  const loadPhonePointRule = useCallback(async () => {
    try {
      const response = await fetch(`/api/${divisionSlug}/point-rules?activeOnly=true`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { rules?: PointRuleItem[] };
      setPhonePointRule(findPhonePointRule(data.rules ?? []));
    } catch {
      // Optional helper metadata load failure should not block the page.
    }
  }, [divisionSlug]);

  useEffect(() => {
    if (hasBootstrapped.current) {
      return;
    }

    hasBootstrapped.current = true;

    if (initialRecords.length === 0) {
      void handleSearch();
    }

    if (pointsEnabled && !initialPhonePointRule) {
      void loadPhonePointRule();
    }
  }, [handleSearch, initialPhonePointRule, initialRecords.length, loadPhonePointRule, pointsEnabled]);

  function toggleSelect(studentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function selectAllNotSubmitted() {
    setSelectedIds(new Set(notSubmittedList.map((r) => r.studentId)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleGrantPoints() {
    if (!pointsEnabled) {
      toast.error("상벌점 기능이 현재 비활성화되어 있습니다.");
      return;
    }

    const studentIds = Array.from(selectedIds);
    if (studentIds.length === 0) {
      toast.error("벌점을 부여할 학생을 선택해주세요.");
      return;
    }

    const points = phonePointRule ? phonePointRule.points : -1;
    const confirmMsg = phonePointRule
      ? `선택한 ${studentIds.length}명에게 "${phonePointRule.name}" 규칙으로 ${points}점을 부여하시겠습니까?`
      : `선택한 ${studentIds.length}명에게 벌점 1점을 부여하시겠습니까?\n(휴대폰 미반납 규칙이 없어 직접 부여됩니다.)`;

    if (!confirm(confirmMsg)) return;

    setIsGranting(true);
    try {
      const today = getKstToday();
      const res = await fetch(`/api/${divisionSlug}/points/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds,
          ruleId: phonePointRule?.id ?? null,
          points: phonePointRule ? undefined : points,
          notes: "휴대폰 미반납",
          date: today,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "벌점 부여에 실패했습니다.");
        return;
      }

      toast.success(`${studentIds.length}명에게 벌점이 부여되었습니다.`);
      setSelectedIds(new Set());
    } finally {
      setIsGranting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 검색 필터 */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">시작일</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">종료일</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          조회
        </button>
      </div>

      {/* 요약 통계 */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
          반납 {submittedCount}건
        </span>
        <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
          미반납 {notSubmittedCount}건
        </span>
        <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 ring-1 ring-inset ring-sky-700/20">
          대여 {rentedCount}건
        </span>
      </div>

      {/* 미반납자 벌점 부여 */}
      {notSubmittedCount > 0 && pointsEnabled && (
        <div className="rounded-[10px] border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <p className="text-sm font-semibold text-rose-700">미반납자 벌점 부여</p>
          </div>
          <p className="mt-2 text-xs text-rose-600">
            {phonePointRule
              ? `규칙: "${phonePointRule.name}" (${phonePointRule.points}점) · 선택 후 일괄 부여`
              : "휴대폰 미반납 벌점 규칙이 설정되지 않았습니다. 벌점 -1점이 직접 부여됩니다."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllNotSubmitted}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              미반납자 전체 선택 ({notSubmittedCount}명)
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  선택 해제
                </button>
                <button
                  type="button"
                  onClick={handleGrantPoints}
                  disabled={isGranting}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                >
                  {isGranting ? "처리 중..." : `선택 ${selectedIds.size}명 벌점 부여`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {notSubmittedCount > 0 && !pointsEnabled && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">상벌점 기능이 비활성화되었습니다.</p>
          </div>
          <p className="mt-2 text-xs text-amber-700">
            휴대폰 미반납 체크는 유지되지만 상벌점 기능이 꺼져 있어 별도 벌점 일괄 부여는 사용할 수 없습니다.
          </p>
        </div>
      )}

      {/* 기록 목록 */}
      {records.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-16 text-center">
          <Smartphone className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">해당 기간의 기록이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="pb-3 pr-4 font-semibold text-slate-600" style={{ width: "2.5rem" }}>
                  선택
                </th>
                <th className="pb-3 pr-4 font-semibold text-slate-600">날짜</th>
                <th className="pb-3 pr-4 font-semibold text-slate-600">교시</th>
                <th className="pb-3 pr-4 font-semibold text-slate-600">이름</th>
                <th className="pb-3 pr-4 font-semibold text-slate-600">수험번호</th>
                <th className="pb-3 pr-4 font-semibold text-slate-600">상태</th>
                <th className="pb-3 font-semibold text-slate-600">대여 사유</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((item) => (
                <tr
                  key={item.id}
                  className={
                    item.status === "NOT_SUBMITTED" && selectedIds.has(item.studentId)
                      ? "bg-rose-50"
                      : ""
                  }
                >
                  <td className="py-3 pr-4">
                    {item.status === "NOT_SUBMITTED" && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.studentId)}
                        onChange={() => toggleSelect(item.studentId)}
                        className="h-4 w-4 rounded"
                      />
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{item.date}</td>
                  <td className="py-3 pr-4 text-slate-600">{item.periodName}</td>
                  <td className="py-3 pr-4 font-medium text-slate-900">{item.studentName}</td>
                  <td className="py-3 pr-4 text-slate-600">{item.studentNumber}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        item.status === "SUBMITTED"
                          ? "bg-green-50 text-green-700 ring-green-600/20"
                          : item.status === "NOT_SUBMITTED"
                            ? "bg-red-50 text-red-700 ring-red-600/20"
                            : "bg-sky-50 text-sky-700 ring-sky-700/20"
                      }`}
                    >
                      {item.status === "SUBMITTED" ? (
                        <>
                          <Check className="h-3 w-3" />반납
                        </>
                      ) : item.status === "NOT_SUBMITTED" ? (
                        <>
                          <X className="h-3 w-3" />미반납
                        </>
                      ) : (
                        <>
                          <Phone className="h-3 w-3" />대여
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-slate-500">{item.rentalNote ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
