"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import {
  COURSE_TYPE_LABEL,
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
  ENROLL_SOURCE_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { EnrollmentDetailData, LeaveRecordRow } from "./page";
import { EnrollmentHistorySection } from "./enrollment-history-section";
import { EnrollmentHistoryTimeline } from "./enrollment-history-timeline";

type CohortOption = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  activeCount: number;
};

type Props = {
  enrollment: EnrollmentDetailData;
  initialModal?: string;
  initialLeaveRecordId?: string;
};

const today = new Date().toISOString().split("T")[0];

export function EnrollmentDetailClient({
  enrollment: initial,
  initialModal,
  initialLeaveRecordId,
}: Props) {
  const [enrollment, setEnrollment] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [didHandleInitialModal, setDidHandleInitialModal] = useState(false);

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState<boolean>(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState<boolean>(false);
  const [isChangeClassModalOpen, setIsChangeClassModalOpen] = useState<boolean>(false);
  const [leaveDate, setLeaveDate] = useState(today);
  const [leaveReason, setLeaveReason] = useState("");
  const [statusChangeReason, setStatusChangeReason] = useState("");
  const [returnDate, setReturnDate] = useState(today);
  const [activeLeaveId, setActiveLeaveId] = useState<string | null>(null);
  // 반 변경 상태
  const [cohortOptions, setCohortOptions] = useState<CohortOption[]>([]);
  const [cohortOptionsLoading, setCohortOptionsLoading] = useState<boolean>(false);
  const [selectedCohortId, setSelectedCohortId] = useState<string>("");
  const [changeClassReason, setChangeClassReason] = useState<string>("");

  const courseName =
    enrollment.cohortName ??
    enrollment.specialLectureName ??
    enrollment.productName ??
    "-";

  const courseTypeLabel =
    COURSE_TYPE_LABEL[enrollment.courseType as keyof typeof COURSE_TYPE_LABEL] ??
    enrollment.courseType;

  const enrollSourceLabel = enrollment.enrollSource
    ? (ENROLL_SOURCE_LABEL[
        enrollment.enrollSource as keyof typeof ENROLL_SOURCE_LABEL
      ] ?? enrollment.enrollSource)
    : "-";

  const activeLeavePending = enrollment.leaveRecords.find(
    (l) => l.returnDate === null,
  );

  function openLeave() {
    setLeaveDate(today);
    setLeaveReason("");
    setError(null);
    setIsLeaveModalOpen(true);
  }

  function openReturn(leaveId: string) {
    setActiveLeaveId(leaveId);
    setReturnDate(today);
    setError(null);
    setIsReturnModalOpen(true);
  }

  useEffect(() => {
    if (didHandleInitialModal) return;

    if (initialModal === "leave") {
      if (enrollment.status === "ACTIVE") {
        openLeave();
      } else {
        const leaveId = initialLeaveRecordId ?? activeLeavePending?.id ?? null;
        if (leaveId) {
          openReturn(leaveId);
        }
      }
      setDidHandleInitialModal(true);
      return;
    }

    if (initialModal === "return") {
      const leaveId = initialLeaveRecordId ?? activeLeavePending?.id ?? null;
      if (leaveId) {
        openReturn(leaveId);
      }
      setDidHandleInitialModal(true);
      return;
    }

    if (initialModal) {
      setDidHandleInitialModal(true);
    }
  }, [
    activeLeavePending?.id,
    didHandleInitialModal,
    enrollment.status,
    initialLeaveRecordId,
    initialModal,
  ]);

  function handleLeave() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/enrollments/${enrollment.id}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveDate, reason: leaveReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "휴원 처리 실패");
        return;
      }
      setEnrollment((prev) => ({
        ...prev,
        status: "SUSPENDED",
        leaveRecords: [data.leaveRecord, ...prev.leaveRecords],
      }));
      setIsLeaveModalOpen(false);
    });
  }

  function handleReturn() {
    if (!activeLeaveId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/enrollments/${enrollment.id}/leave`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveRecordId: activeLeaveId, returnDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "복귀 처리 실패");
        return;
      }
      setEnrollment((prev) => ({
        ...prev,
        status: "ACTIVE",
        leaveRecords: prev.leaveRecords.map((l) =>
          l.id === activeLeaveId ? data.leaveRecord : l,
        ),
      }));
      setIsReturnModalOpen(false);
    });
  }

  function openChangeClass() {
    setSelectedCohortId(enrollment.cohortId ?? "");
    setChangeClassReason("");
    setError(null);
    setIsChangeClassModalOpen(true);
    // 기수 목록 로드
    setCohortOptionsLoading(true);
    fetch("/api/settings/cohorts")
      .then((res) => res.json())
      .then((data) => {
        const list: CohortOption[] = (data.cohorts ?? []).map(
          (c: { id: string; name: string; startDate: string; endDate: string; activeCount: number }) => ({
            id: c.id,
            name: c.name,
            startDate: c.startDate,
            endDate: c.endDate,
            activeCount: c.activeCount ?? 0,
          }),
        );
        setCohortOptions(list);
      })
      .catch(() => setCohortOptions([]))
      .finally(() => setCohortOptionsLoading(false));
  }

  function handleChangeClass() {
    if (!selectedCohortId) {
      setError("새로운 기수를 선택해주세요.");
      return;
    }
    if (selectedCohortId === enrollment.cohortId) {
      setError("현재와 동일한 기수입니다. 다른 기수를 선택해주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/enrollments/${enrollment.id}/change-class`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newCohortId: selectedCohortId, reason: changeClassReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "반 변경 처리 실패");
        return;
      }
      const newCohort = cohortOptions.find((c) => c.id === selectedCohortId);
      setEnrollment((prev) => ({
        ...prev,
        cohortId: selectedCohortId,
        cohortName: newCohort?.name ?? prev.cohortName,
      }));
      setIsChangeClassModalOpen(false);
    });
  }

  async function handleStatusChange(status: string, closeModal: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/enrollments/${enrollment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "처리 실패");
        return;
      }
      setEnrollment((prev) => ({ ...prev, status: data.enrollment.status }));
      setStatusChangeReason("");
      closeModal();
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 기본 정보 카드 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{courseName}</h2>
            <p className="mt-1 text-sm text-slate">
              <span
                className={`mr-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                  enrollment.courseType === "COMPREHENSIVE"
                    ? "border-forest/20 bg-forest/10 text-forest"
                    : "border-sky-200 bg-sky-50 text-sky-700"
                }`}
              >
                {courseTypeLabel}
              </span>
              {enrollment.isRe && (
                <span className="mr-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  재수강
                </span>
              )}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${ENROLLMENT_STATUS_COLOR[enrollment.status as keyof typeof ENROLLMENT_STATUS_COLOR] ?? "border-ink/10 bg-mist text-slate"}`}
          >
            {ENROLLMENT_STATUS_LABEL[enrollment.status as keyof typeof ENROLLMENT_STATUS_LABEL] ??
              enrollment.status}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <InfoRow label="학생" value={`${enrollment.studentName} (${enrollment.examNumber})`} />
          <InfoRow label="연락처" value={enrollment.studentPhone ?? "-"} />
          <InfoRow label="수강 시작" value={formatDate(enrollment.startDate)} />
          <InfoRow
            label="수강 종료"
            value={enrollment.endDate ? formatDate(enrollment.endDate) : "미정"}
          />
          <InfoRow label="정가" value={`${enrollment.regularFee.toLocaleString()}원`} />
          <InfoRow
            label="할인"
            value={
              enrollment.discountAmount > 0
                ? `-${enrollment.discountAmount.toLocaleString()}원`
                : "-"
            }
          />
          <InfoRow
            label="최종 수강료"
            value={`${enrollment.finalFee.toLocaleString()}원`}
            bold
          />
          <InfoRow label="등록 경로" value={enrollSourceLabel} />
          <InfoRow label="등록 직원" value={enrollment.staffName} />
          <InfoRow label="등록일" value={formatDate(enrollment.createdAt)} />
        </div>
      </div>

      {/* 휴원/복귀 인라인 상태 액션 */}
      {(enrollment.status === "ACTIVE" || enrollment.status === "SUSPENDED") && (
        <div
          id="leave-management"
          className={`flex items-center justify-between rounded-[20px] border px-5 py-4 ${
            enrollment.status === "SUSPENDED"
              ? "border-amber-200 bg-amber-50"
              : "border-forest/20 bg-forest/5"
          }`}
        >
          <div>
            <p
              className={`text-sm font-semibold ${
                enrollment.status === "SUSPENDED" ? "text-amber-800" : "text-forest"
              }`}
            >
              {enrollment.status === "SUSPENDED"
                ? "현재 휴원 중입니다."
                : "현재 수강 중입니다."}
            </p>
            <p className="mt-0.5 text-xs text-slate">
              {enrollment.status === "SUSPENDED"
                ? activeLeavePending
                  ? `휴원일: ${formatDate(activeLeavePending.leaveDate)}${activeLeavePending.returnDate ? ` · 복귀 예정: ${formatDate(activeLeavePending.returnDate)}` : ""}`
                  : "복귀 처리를 통해 수강 상태로 전환할 수 있습니다."
                : "휴원 처리를 통해 일시 중단할 수 있습니다."}
            </p>
          </div>
          <div>
            {enrollment.status === "ACTIVE" && (
              <button
                type="button"
                onClick={openLeave}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-5 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-200 disabled:opacity-50"
              >
                휴원 처리
              </button>
            )}
            {enrollment.status === "SUSPENDED" && activeLeavePending && (
              <button
                type="button"
                onClick={() => openReturn(activeLeavePending.id)}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-forest/30 bg-forest/15 px-5 py-2 text-sm font-semibold text-forest transition hover:bg-forest/25 disabled:opacity-50"
              >
                복귀 처리
              </button>
            )}
          </div>
        </div>
      )}

      {/* 수강증 */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/enrollments/${enrollment.id}/documents`}
          className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest transition hover:border-forest/50 hover:bg-forest/20"
        >
          서류 발급
        </Link>
        <Link
          href={`/admin/enrollments/${enrollment.id}/edit`}
          className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:border-ember/50 hover:bg-ember/10"
        >
          수정
        </Link>
        {enrollment.courseType === "COMPREHENSIVE" &&
          (enrollment.status === "ACTIVE" ||
            enrollment.status === "SUSPENDED" ||
            enrollment.status === "PENDING") && (
            <Link
              href={`/admin/enrollments/${enrollment.id}/transfer`}
              className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:border-forest/50 hover:bg-forest/10"
            >
              반 이동
            </Link>
          )}
        <Link
          href={`/admin/enrollments/${enrollment.id}/card`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border border-forest/20 px-4 py-2 text-sm font-semibold text-forest transition hover:border-forest/50"
        >
          수강증 출력
        </Link>
        <Link
          href={`/admin/enrollments/${enrollment.id}/certificate`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border border-forest/20 px-4 py-2 text-sm font-semibold text-forest transition hover:border-forest/50"
        >
          수강등록확인서
        </Link>
        <Link
          href={`/admin/enrollments/${enrollment.id}/confirmation`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border border-forest/20 px-4 py-2 text-sm font-semibold text-forest transition hover:border-forest/50"
        >
          수강확인서
        </Link>
        <Link
          href={`/admin/enrollments/${enrollment.id}/contract`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          수강계약서
          {!enrollment.contractExists ? (
            <span className="text-[10px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
              미발행
            </span>
          ) : enrollment.contractPrintedAt ? (
            <span className="text-[10px] font-medium bg-[#1F4D3A]/10 text-[#1F4D3A] px-1.5 py-0.5 rounded-full">
              발행완료 ({new Date(enrollment.contractPrintedAt).toLocaleDateString("ko-KR")})
            </span>
          ) : (
            <span className="text-[10px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
              미출력
            </span>
          )}
        </Link>
        <Link
          href={`/admin/enrollments/${enrollment.id}/payment-plan`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border border-forest/20 px-4 py-2 text-sm font-semibold text-forest transition hover:border-forest/50"
        >
          납부 계획서
        </Link>
        <Link
          href={`/admin/members/${enrollment.examNumber}/payments`}
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
        >
          회원 수납 이력
        </Link>
        <Link
          href={`/admin/enrollments/${enrollment.id}/payments`}
          className="inline-flex items-center rounded-full border border-ember/20 px-4 py-2 text-sm font-semibold text-ember transition hover:border-ember/50"
        >
          수납 등록
        </Link>
        {enrollment.status === "ACTIVE" && (
          <button
            type="button"
            onClick={openLeave}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-400 disabled:opacity-50"
          >
            휴원 처리
          </button>
        )}
        {enrollment.status === "SUSPENDED" && activeLeavePending && (
          <button
            type="button"
            onClick={() => openReturn(activeLeavePending.id)}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-forest/20 px-4 py-2 text-sm font-semibold text-forest transition hover:border-forest/50 disabled:opacity-50"
          >
            복귀 처리
          </button>
        )}
        {enrollment.courseType === "COMPREHENSIVE" &&
          (enrollment.status === "ACTIVE" ||
            enrollment.status === "SUSPENDED" ||
            enrollment.status === "PENDING") && (
          <button
            type="button"
            onClick={openChangeClass}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-ember/20 px-4 py-2 text-sm font-semibold text-ember transition hover:border-ember/50 disabled:opacity-50"
          >
            반 변경
          </button>
        )}
        {(enrollment.status === "ACTIVE" || enrollment.status === "SUSPENDED") && (
          <button
            type="button"
            onClick={() => { setStatusChangeReason(""); setError(null); setIsCompleteModalOpen(true); }}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:border-sky-400 disabled:opacity-50"
          >
            수료 처리
          </button>
        )}
        {(enrollment.status === "ACTIVE" || enrollment.status === "SUSPENDED" || enrollment.status === "PENDING") && (
          <button
            type="button"
            onClick={() => { setStatusChangeReason(""); setError(null); setIsWithdrawModalOpen(true); }}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:border-red-400 disabled:opacity-50"
          >
            퇴원 처리
          </button>
        )}
        {enrollment.status === "PENDING" && (
          <button
            type="button"
            onClick={() => { setStatusChangeReason(""); setError(null); setIsCancelModalOpen(true); }}
            disabled={isPending}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 disabled:opacity-50"
          >
            취소
          </button>
        )}
      </div>

      {/* 학원법 환불 안내 */}
      {enrollment.endDate && (enrollment.status === "ACTIVE" || enrollment.status === "SUSPENDED") && (
        <RefundCalculator
          startDate={enrollment.startDate}
          endDate={enrollment.endDate}
          finalFee={enrollment.finalFee}
        />
      )}

      {/* 휴원 이력 */}
      <div>
        <h3 className="text-lg font-semibold">휴원 이력</h3>
        {enrollment.leaveRecords.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            휴원 이력이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">휴원일</th>
                  <th className="px-5 py-3.5 font-semibold">복귀일</th>
                  <th className="px-5 py-3.5 font-semibold">기간</th>
                  <th className="px-5 py-3.5 font-semibold">사유</th>
                  <th className="px-5 py-3.5 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {enrollment.leaveRecords.map((leave) => {
                  const days = leave.returnDate
                    ? Math.ceil(
                        (new Date(leave.returnDate).getTime() -
                          new Date(leave.leaveDate).getTime()) /
                          (1000 * 60 * 60 * 24),
                      )
                    : null;
                  return (
                    <tr key={leave.id}>
                      <td className="px-5 py-3.5">{formatDate(leave.leaveDate)}</td>
                      <td className="px-5 py-3.5">
                        {leave.returnDate ? formatDate(leave.returnDate) : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-slate">
                        {days !== null ? `${days}일` : "진행 중"}
                      </td>
                      <td className="px-5 py-3.5 text-slate">{leave.reason ?? "-"}</td>
                      <td className="px-5 py-3.5">
                        {leave.returnDate ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                            복귀 완료
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            휴원 중
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 휴원 처리 모달 */}
      <ActionModal
        open={isLeaveModalOpen}
        badgeLabel="수강 관리"
        title="휴원 처리"
        description="수강 상태를 휴원으로 변경합니다."
        confirmLabel="휴원 처리"
        cancelLabel="취소"
        onClose={() => setIsLeaveModalOpen(false)}
        onConfirm={handleLeave}
        isPending={isPending}
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate">휴원일 *</label>
            <input
              type="date"
              value={leaveDate}
              onChange={(e) => setLeaveDate(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate">사유 (선택)</label>
            <input
              type="text"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              placeholder="예: 개인 사정, 군 입대 대기 등"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
          <p className="text-xs text-slate">
            휴원 처리 시 수강 상태가 &lsquo;휴원&rsquo;으로 변경됩니다. 복귀 처리 시 &lsquo;수강 중&rsquo;으로 돌아옵니다.
          </p>
        </div>
      </ActionModal>

      {/* 복귀 처리 모달 */}
      <ActionModal
        open={isReturnModalOpen}
        badgeLabel="수강 관리"
        title="복귀 처리"
        description="수강 상태를 수강 중으로 변경합니다."
        confirmLabel="복귀 처리"
        cancelLabel="취소"
        onClose={() => setIsReturnModalOpen(false)}
        onConfirm={handleReturn}
        isPending={isPending}
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate">복귀일 *</label>
            <input
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
          <p className="text-xs text-slate">
            복귀 처리 시 수강 상태가 &lsquo;수강 중&rsquo;으로 변경됩니다.
          </p>
        </div>
      </ActionModal>

      {/* 수료 처리 모달 */}
      <ActionModal
        open={isCompleteModalOpen}
        badgeLabel="수강 관리"
        title="수료 처리"
        description="수강 상태를 수료로 변경합니다."
        confirmLabel="수료 처리"
        cancelLabel="취소"
        onClose={() => setIsCompleteModalOpen(false)}
        onConfirm={() => handleStatusChange("COMPLETED", () => setIsCompleteModalOpen(false))}
        isPending={isPending}
      >
        <div className="space-y-3">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <p className="text-sm text-slate">수강 상태를 <strong>수료</strong>로 변경합니다. 이 작업은 되돌릴 수 없습니다.</p>
        </div>
      </ActionModal>

      {/* 퇴원 처리 모달 */}
      <ActionModal
        open={isWithdrawModalOpen}
        badgeLabel="수강 관리"
        title="퇴원 처리"
        description="수강 상태를 퇴원으로 변경합니다."
        confirmLabel="퇴원 처리"
        cancelLabel="취소"
        confirmTone="danger"
        onClose={() => setIsWithdrawModalOpen(false)}
        onConfirm={() => handleStatusChange("WITHDRAWN", () => setIsWithdrawModalOpen(false))}
        isPending={isPending}
      >
        <div className="space-y-3">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <p className="text-sm text-slate">수강 상태를 <strong>퇴원</strong>으로 변경합니다. 수납 내역은 그대로 유지됩니다.</p>
        </div>
      </ActionModal>

      {/* 취소 모달 */}
      <ActionModal
        open={isCancelModalOpen}
        badgeLabel="수강 관리"
        title="수강 취소"
        description="수강 신청을 취소합니다."
        confirmLabel="취소 처리"
        cancelLabel="닫기"
        confirmTone="danger"
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={() => handleStatusChange("CANCELLED", () => setIsCancelModalOpen(false))}
        isPending={isPending}
      >
        <div className="space-y-3">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <p className="text-sm text-slate">수강 신청을 <strong>취소</strong>합니다. 아직 수납이 없는 경우에만 사용하세요.</p>
        </div>
      </ActionModal>

      {/* 반 변경 모달 */}
      <ActionModal
        open={isChangeClassModalOpen}
        badgeLabel="수강 관리"
        title="반/기수 변경"
        description="수강 중인 기수를 다른 기수로 변경합니다."
        confirmLabel="변경 처리"
        cancelLabel="취소"
        onClose={() => setIsChangeClassModalOpen(false)}
        onConfirm={handleChangeClass}
        isPending={isPending}
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate">현재 기수</label>
            <p className="rounded-2xl border border-ink/10 bg-mist/40 px-4 py-3 text-sm text-ink">
              {enrollment.cohortName ?? "미배정"}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate">새 기수 선택 *</label>
            {cohortOptionsLoading ? (
              <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-slate">
                기수 목록 불러오는 중...
              </div>
            ) : cohortOptions.length === 0 ? (
              <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-slate">
                활성화된 기수가 없습니다.
              </div>
            ) : (
              <select
                value={selectedCohortId}
                onChange={(e) => setSelectedCohortId(e.target.value)}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
              >
                <option value="">-- 기수 선택 --</option>
                {cohortOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.id === enrollment.cohortId ? " (현재)" : ""}
                    {" "}· 수강생 {c.activeCount}명
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate">변경 사유 (선택)</label>
            <input
              type="text"
              value={changeClassReason}
              onChange={(e) => setChangeClassReason(e.target.value)}
              placeholder="예: 시간표 변경, 레벨 조정 등"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
          <p className="text-xs text-slate">
            반 변경 시 기존 출결 기록은 유지되며, 이후 출결은 새 기수 기준으로 관리됩니다.
          </p>
        </div>
      </ActionModal>

      {/* 수강 이력 타임라인 */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <EnrollmentHistoryTimeline
          createdAt={enrollment.createdAt}
          startDate={enrollment.startDate}
          endDate={enrollment.endDate}
          status={enrollment.status}
          leaveRecords={enrollment.leaveRecords}
          courseName={
            enrollment.cohortName ??
            enrollment.specialLectureName ??
            enrollment.productName ??
            "수강"
          }
        />
      </div>

      {/* 변경 이력 */}
      <EnrollmentHistorySection logs={enrollment.auditLogs} />
    </div>
  );
}

function RefundCalculator({
  startDate,
  endDate,
  finalFee,
}: {
  startDate: string;
  endDate: string;
  finalFee: number;
}) {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const elapsedDays = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const elapsedRatio = elapsedDays / totalDays;

  let refundRate = 0;
  let refundLabel = "";
  let refundColor = "text-forest";

  if (elapsedDays <= 0) {
    refundRate = 1;
    refundLabel = "수강 개시 전 → 전액 환불";
    refundColor = "text-forest";
  } else if (elapsedRatio < 1 / 3) {
    refundRate = 2 / 3;
    refundLabel = `수강 기간 1/3 미경과 (${elapsedDays}일/${totalDays}일) → 2/3 환불`;
    refundColor = "text-forest";
  } else if (elapsedRatio < 1 / 2) {
    refundRate = 1 / 2;
    refundLabel = `수강 기간 1/3~1/2 경과 (${elapsedDays}일/${totalDays}일) → 1/2 환불`;
    refundColor = "text-amber-700";
  } else {
    refundRate = 0;
    refundLabel = `수강 기간 1/2 이상 경과 (${elapsedDays}일/${totalDays}일) → 환불 없음`;
    refundColor = "text-red-600";
  }

  const refundAmount = Math.round(finalFee * refundRate);

  return (
    <div className="rounded-[20px] border border-ink/10 bg-mist/40 p-5">
      <h3 className="text-sm font-semibold text-ink mb-3">학원법 §18 환불 기준 (참고용)</h3>
      <p className={`text-sm font-medium ${refundColor}`}>{refundLabel}</p>
      {refundRate > 0 ? (
        <p className="mt-2 text-xl font-bold text-ember tabular-nums">
          권장 환불액: {refundAmount.toLocaleString()}원
          <span className="ml-2 text-sm font-normal text-slate">
            ({finalFee.toLocaleString()}원 × {Math.round(refundRate * 100)}%)
          </span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate">학원법 기준 환불 대상이 아닙니다.</p>
      )}
      <p className="mt-2 text-xs text-slate">* 실제 환불은 별도 협의가 필요하며, 위 금액은 참고용입니다.</p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate">{label}</dt>
      <dd className={`mt-1 ${bold ? "font-semibold text-ember" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

