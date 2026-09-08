"use client";

import { AlertTriangle, Check, Phone, RefreshCcw, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { getAttendanceStatusLabel } from "@/lib/attendance-meta";
import type { PhoneCheckRecord } from "@/lib/services/phone-submission.service";
import type { PointRuleItem } from "@/lib/services/point.service";

type PhoneSubmissionManagerProps = {
  divisionSlug: string;
  initialRecords?: PhoneCheckRecord[];
  phonePointRule?: PointRuleItem | null;
  pointsEnabled?: boolean;
  isActive?: boolean;
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

function getAttendanceBadgeClassName(record: PhoneCheckRecord) {
  if (record.attendanceStatus === null && record.attendanceCheckable) {
    return "bg-slate-50 text-slate-500 ring-slate-200";
  }

  switch (record.attendanceStatus) {
    case "PRESENT":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "TARDY":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    case "ABSENT":
    case "EXCUSED":
      return "bg-rose-50 text-rose-700 ring-rose-600/20";
    case "HOLIDAY":
    case "HALF_HOLIDAY":
    case "NOT_APPLICABLE":
      return "bg-slate-50 text-slate-500 ring-slate-200";
    default:
      return "bg-indigo-50 text-indigo-700 ring-indigo-600/20";
  }
}

export function PhoneSubmissionManager({
  divisionSlug,
  initialRecords = [],
  phonePointRule: initialPhonePointRule = null,
  pointsEnabled = true,
  isActive = true,
}: PhoneSubmissionManagerProps) {
  const [records, setRecords] = useState<PhoneCheckRecord[]>(initialRecords);
  const [phonePointRule, setPhonePointRule] = useState<PointRuleItem | null>(initialPhonePointRule);
  const [dateFrom, setDateFrom] = useState(getMonthStart());
  const [dateTo, setDateTo] = useState(getKstToday());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const hasBootstrapped = useRef(false);
  const wasActive = useRef(false);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  const { confirm, confirmDialog } = useConfirmDialog();

  const notSubmittedList = useMemo(
    () => records.filter((record) => record.status === "NOT_SUBMITTED" && record.attendanceCheckable),
    [records],
  );
  const submittedCount = useMemo(
    () => records.filter((record) => record.status === "SUBMITTED" && record.attendanceCheckable).length,
    [records],
  );
  const notSubmittedCount = notSubmittedList.length;
  const rentedCount = useMemo(
    () => records.filter((record) => record.status === "RENTED" && record.attendanceCheckable).length,
    [records],
  );

  const handleSearch = useCallback(async (preserveSelection = false) => {
    setIsLoading(true);
    if (!preserveSelection) setSelectedIds(new Set());
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
      if (preserveSelection) {
        const eligible = new Set(data.filter((record) => record.status === "NOT_SUBMITTED" && record.attendanceCheckable).map((record) => record.studentId));
        setSelectedIds((current) => new Set(Array.from(current).filter((id) => eligible.has(id))));
      }
    } catch {
      toast.error("휴대폰 이력을 불러오지 못했습니다. 다시 조회해 주세요.");
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
    if (!isActive) {
      wasActive.current = false;
      return;
    }
    if (wasActive.current) return;
    wasActive.current = true;
    if (hasBootstrapped.current || initialRecords.length === 0) {
      void handleSearch(true);
    }
    if (!hasBootstrapped.current && pointsEnabled && !initialPhonePointRule) {
      void loadPhonePointRule();
    }
    hasBootstrapped.current = true;
  }, [handleSearch, initialPhonePointRule, initialRecords.length, isActive, loadPhonePointRule, pointsEnabled]);

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

    const confirmed = await confirm({
      title: "벌점 일괄 부여",
      description: confirmMsg.replace("\n", " "),
      confirmLabel: "부여",
      cancelLabel: "취소",
      variant: "warning",
    });

    if (!confirmed) return;

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
      showActionComplete({
        title: "벌점 부여 완료",
        description: `${studentIds.length}명에게 휴대폰 미반납 벌점을 부여했습니다.`,
        notice: "부여된 벌점은 상벌점 합계, 최근 내역, 랭킹 화면에 바로 반영됩니다.",
      });
    } finally {
      setIsGranting(false);
    }
  }

  return (
    <>
      <div className="space-y-5">
      {/* 검색 필터 */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">시작일</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm transition"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">종료일</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm transition"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={isLoading}
          className="admin-button"
        >
          <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          조회
        </button>
      </div>

      {/* 요약 통계 */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
          반납 {submittedCount}건
        </span>
        <span className="inline-flex items-center rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
          미반납 {notSubmittedCount}건
        </span>
        <span className="inline-flex items-center rounded-lg bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 ring-1 ring-inset ring-sky-700/20">
          대여 {rentedCount}건
        </span>
      </div>

      {/* 미반납자 벌점 부여 */}
      {notSubmittedCount > 0 && pointsEnabled && (
        <div className="admin-notice admin-notice-danger">
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
              className="admin-button admin-button-primary"
            >
              미반납자 전체 선택 ({notSubmittedCount}명)
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="admin-button"
                >
                  선택 해제
                </button>
                <button
                  type="button"
                  onClick={handleGrantPoints}
                  disabled={isGranting}
                  className="admin-button admin-button-danger-outline"
                >
                  {isGranting ? "처리 중..." : `선택 ${selectedIds.size}명 벌점 부여`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {notSubmittedCount > 0 && !pointsEnabled && (
        <div className="admin-notice admin-notice-warning">
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
        <div className="admin-help px-4 py-16 text-center">
          <Smartphone className="mx-auto h-8 w-8 text-slate-300" />
          <p className="admin-help mt-3">해당 기간의 기록이 없습니다.</p>
        </div>
      ) : (
        <div className="admin-table-frame overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th style={{ width: "2.5rem" }}>
                  선택
                </th>
                <th>날짜</th>
                <th>교시</th>
                <th>이름</th>
                <th>수험번호</th>
                <th>출석 상태</th>
                <th>상태</th>
                <th>대여 사유</th>
              </tr>
            </thead>
            <tbody>
              {records.map((item) => (
                <tr
                  key={item.id}
                  className={
                    item.status === "NOT_SUBMITTED" && selectedIds.has(item.studentId)
                      ? "bg-rose-50"
                      : ""
                  }
                >
                  <td>
                    {item.status === "NOT_SUBMITTED" && item.attendanceCheckable && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.studentId)}
                        onChange={() => toggleSelect(item.studentId)}
                        className="h-4 w-4 rounded"
                      />
                    )}
                  </td>
                  <td>{item.date}</td>
                  <td>{item.periodName}</td>
                  <td>{item.studentName}</td>
                  <td>{item.studentNumber}</td>
                  <td>
                    <span
                      className={`inline-flex rounded-lg px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getAttendanceBadgeClassName(item)}`}
                    >
                      {item.attendanceStatus === null && item.attendanceCheckable
                        ? "출결 연동 없음"
                        : getAttendanceStatusLabel(item.attendanceStatus)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ item.status === "SUBMITTED" ? "bg-green-50 text-green-700 ring-green-600/20" : item.status === "NOT_SUBMITTED" ? "bg-red-50 text-red-700 ring-red-600/20" : "bg-sky-50 text-sky-700 ring-sky-700/20" }`}
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
                  <td>{item.rentalNote ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
      {confirmDialog}
      {actionCompleteModal}
    </>
  );
}
