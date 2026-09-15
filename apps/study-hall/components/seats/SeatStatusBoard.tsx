"use client";

import { DialogActions } from "@/components/ui/DialogActions";
import { createTabListKeyHandler } from "@/lib/useTabListKeys";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import Link from "next/link";
import {
  ChevronRight,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { toast } from "@/lib/sonner";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SlideOver } from "@/components/ui/SlideOver";
import { getSeatPositionKey } from "@/lib/seat-layout";
import type { PaymentCategoryItem, PaymentItem } from "@/lib/services/payment.service";
import type { PointRuleItem } from "@/lib/services/point.service";
import type { SeatLayout, SeatMapSeat, StudyRoomItem } from "@/lib/services/seat.service";
import type { StudentListItem } from "@/lib/services/student.service";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";
import {
  formatStudyTrackLabel,
  getStudyTrackBadgeClasses,
  getStudyTrackShortLabel,
} from "@/lib/study-track-meta";
import { PaymentMethodSelect } from "@/components/payments/PaymentMethodSelect";

// ─── 타입 ────────────────────────────────────────────────────────────────────

type PanelTab = "info" | "payment" | "points";

type SeatStatusBoardProps = {
  divisionSlug: string;
  initialRooms: StudyRoomItem[];
  initialLayout: SeatLayout;
  initialStudents: StudentListItem[];
  paymentEnabled: boolean;
  pointsEnabled: boolean;
  studentManagementEnabled: boolean;
};

type SelectedSeatInfo = {
  seat: SeatMapSeat;
};

function getAssignedSeatStyle(
  seat: Pick<SeatMapSeat, "isActive" | "assignedStudent">,
): CSSProperties | undefined {
  if (!seat.isActive || !seat.assignedStudent) {
    return undefined;
  }

  return {
    backgroundColor: "var(--admin-seat-assigned-surface)",
    borderColor: "var(--admin-seat-assigned-line)",
  };
}

// ─── 통계 카드 ───────────────────────────────────────────────────────────────


// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export const SeatStatusBoard = memo(function SeatStatusBoard({
  divisionSlug,
  initialRooms,
  initialLayout,
  initialStudents,
  paymentEnabled,
  pointsEnabled,
  studentManagementEnabled,
}: SeatStatusBoardProps) {
  const [rooms] = useState<StudyRoomItem[]>(initialRooms);
  const [layout, setLayout] = useState<SeatLayout>(initialLayout);
  const [students, setStudents] = useState<StudentListItem[]>(initialStudents);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    initialLayout.room?.id ?? null,
  );
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const [panelInfo, setPanelInfo] = useState<SelectedSeatInfo | null>(null);
  const [assignSeat, setAssignSeat] = useState<SeatMapSeat | null>(null);
  const [assignSearchQuery, setAssignSearchQuery] = useState("");
  const [assigningStudentId, setAssigningStudentId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("info");

  // 검색
  const [searchQuery, setSearchQuery] = useState("");

  // 드래그앤드롭 상태
  const [draggingFromSeatId, setDraggingFromSeatId] = useState<string | null>(null);
  const [movingSeatId, setMovingSeatId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    fromSeat: SeatMapSeat;
    toSeat: SeatMapSeat;
  } | null>(null);
  const suppressSeatClickUntilRef = useRef(0);

  // 자습실 간 이동
  const [targetRoomId, setTargetRoomId] = useState<string | null>(null);
  const [targetLayout, setTargetLayout] = useState<SeatLayout | null>(null);
  const [isLoadingTarget, setIsLoadingTarget] = useState(false);
  const [isMovingToRoom, setIsMovingToRoom] = useState(false);

  // 수납 탭
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [paymentCategories, setPaymentCategories] = useState<PaymentCategoryItem[]>([]);
  const [tuitionPlans, setTuitionPlans] = useState<TuitionPlanItem[]>([]);
  const [isLoadingPaymentMeta, setIsLoadingPaymentMeta] = useState(false);
  const [paymentTypeId, setPaymentTypeId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 10),
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [fetchedPayments, setFetchedPayments] = useState<PaymentItem[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);

  // 상벌점 탭
  const [pointRuleId, setPointRuleId] = useState("");
  const [pointRules, setPointRules] = useState<PointRuleItem[]>([]);
  const [isLoadingPointRules, setIsLoadingPointRules] = useState(false);
  const [pointsValue, setPointsValue] = useState("");
  const [pointsNotes, setPointsNotes] = useState("");
  const [isSavingPoints, setIsSavingPoints] = useState(false);

  const selectedRule = pointRules.find((r) => r.id === pointRuleId) ?? null;
  const assignableStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );
  const filteredAssignableStudents = useMemo(() => {
    const query = assignSearchQuery.trim().toLowerCase();

    return [...assignableStudents]
      .filter((student) => {
        if (!query) {
          return true;
        }

        return [
          student.name,
          student.studentNumber,
          student.seatDisplay ?? "",
          formatStudyTrackLabel(student.studyTrack),
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        const leftAssigned = Boolean(left.seatLabel);
        const rightAssigned = Boolean(right.seatLabel);

        if (leftAssigned !== rightAssigned) {
          return leftAssigned ? 1 : -1;
        }

        return (
          left.name.localeCompare(right.name, "ko") ||
          left.studentNumber.localeCompare(right.studentNumber, "ko")
        );
      });
  }, [assignSearchQuery, assignableStudents]);

  const stats = useMemo(() => {
    const activeSeats = layout.seats.filter((seat) => seat.isActive);
    const assignedSeats = activeSeats.filter((seat) => Boolean(seat.assignedStudent));
    const emptyCount = activeSeats.filter((seat) => !seat.assignedStudent).length;
    return {
      totalSeats: activeSeats.length,
      assignedCount: assignedSeats.length,
      emptyCount,
    };
  }, [layout.seats]);

  async function refreshStudents() {
    const response = await fetch(`/api/${divisionSlug}/students`, { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "학생 목록을 불러오지 못했습니다.");
    }

    setStudents((data.students as StudentListItem[]) ?? []);
  }

  useEffect(() => {
    if (
      !paymentEnabled ||
      panelTab !== "payment" ||
      (paymentCategories.length > 0 && tuitionPlans.length > 0)
    ) {
      return;
    }

    let isMounted = true;
    setIsLoadingPaymentMeta(true);

    Promise.all([
      fetch(`/api/${divisionSlug}/payment-categories?activeOnly=true`).then((response) => response.json()),
      fetch(`/api/${divisionSlug}/tuition-plans?activeOnly=true`).then((response) => response.json()),
    ])
      .then(([paymentCategoryData, tuitionPlanData]) => {
        if (!isMounted) {
          return;
        }

        setPaymentCategories((paymentCategoryData.categories as PaymentCategoryItem[]) ?? []);
        setTuitionPlans((tuitionPlanData.plans as TuitionPlanItem[]) ?? []);
      })
      .catch(() => {
        if (isMounted) {
          toast.error("납부 기본 정보를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingPaymentMeta(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [divisionSlug, panelTab, paymentCategories.length, paymentEnabled, tuitionPlans.length]);

  useEffect(() => {
    if (!pointsEnabled || panelTab !== "points" || pointRules.length > 0) {
      return;
    }

    let isMounted = true;
    setIsLoadingPointRules(true);

    fetch(`/api/${divisionSlug}/point-rules?activeOnly=true`)
      .then((response) => response.json())
      .then((data) => {
        if (!isMounted) {
          return;
        }

        setPointRules((data.rules as PointRuleItem[]) ?? []);
      })
      .catch(() => {
        if (isMounted) {
          toast.error("상벌점 규칙을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingPointRules(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [divisionSlug, panelTab, pointRules.length, pointsEnabled]);

  // 수납 탭 열릴 때 결제 내역 fetch
  useEffect(() => {
    const studentId = panelInfo?.seat.assignedStudent?.id;
    if (!paymentEnabled || panelTab !== "payment" || !studentId) return;
    setIsLoadingPayments(true);
    fetch(`/api/${divisionSlug}/payments?studentId=${studentId}`)
      .then((r) => r.json())
      .then((d) => setFetchedPayments((d.payments as PaymentItem[]) ?? []))
      .catch(() => toast.error("수납 내역을 불러오지 못했습니다."))
      .finally(() => setIsLoadingPayments(false));
  }, [divisionSlug, panelInfo?.seat.assignedStudent?.id, panelTab, paymentEnabled]);

  useEffect(() => {
    const isDisabledTab =
      (panelTab === "payment" && !paymentEnabled) ||
      (panelTab === "points" && !pointsEnabled);

    if (isDisabledTab) {
      setPanelTab("info");
    }
  }, [panelTab, paymentEnabled, pointsEnabled]);

  // 다른 자습실 layout fetch
  useEffect(() => {
    if (!targetRoomId) return;
    setIsLoadingTarget(true);
    fetch(`/api/${divisionSlug}/seats?roomId=${targetRoomId}`)
      .then((r) => r.json())
      .then((d) => setTargetLayout(d.layout as SeatLayout))
      .catch(() => toast.error("자습실 좌석 정보를 불러오지 못했습니다."))
      .finally(() => setIsLoadingTarget(false));
  }, [targetRoomId, divisionSlug]);

  // 자습실 탭 전환
  const handleRoomSelect = useCallback(
    async (roomId: string) => {
      if (roomId === selectedRoomId || loadingRoomId) return;
      setLoadingRoomId(roomId);
      try {
        const res = await fetch(`/api/${divisionSlug}/seats?roomId=${roomId}`);
        if (res.ok) {
          const data = await res.json();
          setLayout(data.layout as SeatLayout);
          setSelectedRoomId(roomId);
          setPanelInfo(null);
          setAssignSeat(null);
          setAssignSearchQuery("");
        }
      } finally {
        setLoadingRoomId(null);
      }
    },
    [divisionSlug, selectedRoomId, loadingRoomId],
  );

  // 좌석 이동 확인
  async function handleConfirmMove() {
    if (!pendingMove) return;
    const { fromSeat, toSeat } = pendingMove;
    const student = fromSeat.assignedStudent;
    if (!student) return;

    setMovingSeatId(toSeat.id);
    try {
      const res = await fetch(`/api/${divisionSlug}/seats/${toSeat.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "좌석 이동에 실패했습니다.");
      setLayout(data.layout as SeatLayout);
      setPanelInfo(null);
      toast.success(`${student.name} 학생을 ${toSeat.label}로 이동했습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "좌석 이동에 실패했습니다.");
    } finally {
      setMovingSeatId(null);
      setPendingMove(null);
    }
  }

  // 다른 자습실로 이동
  async function handleMoveToRoom(targetSeatId: string) {
    const student = panelInfo?.seat.assignedStudent;
    if (!student) return;
    setIsMovingToRoom(true);
    try {
      const res = await fetch(`/api/${divisionSlug}/seats/${targetSeatId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "좌석 이동에 실패했습니다.");
      // 현재 room layout도 갱신
      const currentRoomRes = await fetch(
        `/api/${divisionSlug}/seats?roomId=${selectedRoomId}`,
      );
      if (currentRoomRes.ok) {
        const currentData = await currentRoomRes.json();
        setLayout(currentData.layout as SeatLayout);
      }
      setPanelInfo(null);
      const targetRoom = rooms.find((r) => r.id === targetRoomId);
      const targetSeat = targetLayout?.seats.find((s) => s.id === targetSeatId);
      toast.success(
        `${student.name} 학생을 ${targetRoom?.name ?? ""}의 ${targetSeat?.label ?? ""}로 이동했습니다.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "좌석 이동에 실패했습니다.");
    } finally {
      setIsMovingToRoom(false);
    }
  }

  async function handleAssignStudentToSeat(student: StudentListItem) {
    if (!assignSeat) {
      return;
    }

    setAssigningStudentId(student.id);

    try {
      const res = await fetch(`/api/${divisionSlug}/seats/${assignSeat.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "좌석 배정에 실패했습니다.");
      }

      setLayout(data.layout as SeatLayout);
      await refreshStudents().catch(() => undefined);
      toast.success(`${student.name} 학생을 ${assignSeat.label}에 배정했습니다.`);
      setAssignSeat(null);
      setAssignSearchQuery("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "좌석 배정에 실패했습니다.");
    } finally {
      setAssigningStudentId(null);
    }
  }

  // 수납 저장
  async function handlePaymentSave() {
    const studentId = panelInfo?.seat.assignedStudent?.id;
    if (!studentId || !paymentTypeId || !paymentAmount) return;
    setIsSavingPayment(true);
    try {
      const res = await fetch(`/api/${divisionSlug}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          paymentTypeId,
          amount: Number(paymentAmount),
          paymentDate,
          method: paymentMethod,
          notes: paymentNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "수납 저장에 실패했습니다.");
      toast.success("수납이 등록되었습니다.");
      setPaymentTypeId("");
      setPaymentAmount("");
      setPaymentNotes("");
      // 목록 갱신
      if (studentId) {
        void fetch(`/api/${divisionSlug}/payments?studentId=${studentId}`)
          .then((r) => r.json())
          .then((d) => setFetchedPayments((d.payments as PaymentItem[]) ?? []));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수납 저장에 실패했습니다.");
    } finally {
      setIsSavingPayment(false);
    }
  }

  // 상벌점 저장
  async function handlePointsSave() {
    const studentId = panelInfo?.seat.assignedStudent?.id;
    if (!studentId || (!pointRuleId && !pointsValue)) return;
    setIsSavingPoints(true);
    try {
      const res = await fetch(`/api/${divisionSlug}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          ruleId: pointRuleId || null,
          points: pointRuleId ? null : Number(pointsValue),
          notes: pointsNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "상벌점 저장에 실패했습니다.");
      toast.success("상벌점이 부여되었습니다.");
      setPointRuleId("");
      setPointsValue("");
      setPointsNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "상벌점 저장에 실패했습니다.");
    } finally {
      setIsSavingPoints(false);
    }
  }

  // 패널 닫기 시 초기화
  function closePanel() {
    setPanelInfo(null);
    setAssignSeat(null);
    setAssignSearchQuery("");
    setAssigningStudentId(null);
    setDraggingFromSeatId(null);
    setPanelTab("info");
    setTargetRoomId(null);
    setTargetLayout(null);
    setSelectedPlanId("");
    setPaymentTypeId("");
    setPaymentAmount("");
    setPaymentMethod("card");
    setPaymentNotes("");
    setFetchedPayments([]);
    setPointRuleId("");
    setPointsValue("");
    setPointsNotes("");
  }

  // 좌석 클릭 → 패널 열기
  const handleSeatClick = useCallback(
    (seat: SeatMapSeat) => {
      if (!seat.isActive) {
        return;
      }

      if (!seat.assignedStudent) {
        setPanelInfo(null);
        setAssignSeat(seat);
        setAssignSearchQuery("");
        return;
      }

      setAssignSeat(null);
      setAssignSearchQuery("");
      setPanelInfo({ seat });
      setPanelTab("info");
      setTargetRoomId(null);
      setTargetLayout(null);
    },
    [],
  );

  const suppressSeatClick = useCallback((durationMs = 250) => {
    suppressSeatClickUntilRef.current = Date.now() + durationMs;
  }, []);

  // 좌석 그리드 렌더링
  const { columns, rows, aisleColumns } = layout;
  const seatMap = useMemo(
    () =>
      new Map(layout.seats.map((seat) => [getSeatPositionKey(seat.positionX, seat.positionY), seat])),
    [layout.seats],
  );

  return (
    <div className="admin-flat-page">
      {/* 통계 카드 */}
      <div className="admin-portal-summary admin-portal-summary-3">
        {[
          { label: "전체 좌석", value: stats.totalSeats, unit: "석", color: "text-slate-700" },
          { label: "배정 학생", value: stats.assignedCount, unit: "명", color: "text-admin-success" },
          { label: "공석", value: stats.emptyCount, unit: "석", color: "text-slate-500" },
        ].map((card) => (
          <div
            key={card.label}
            className="admin-section"
          >
            <p className="admin-help">{card.label}</p>
            <p className={`mt-1 text-3xl font-extrabold tracking-tight ${card.color}`}>
              {card.value}
              <span className="ml-1 text-base font-medium">{card.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 자습실 탭 + 배치도 */}
      <div className="rounded-lg border border-slate-200 bg-white">
        {/* 자습실 탭 */}
        {rooms.length > 1 && (
          <div className="flex gap-1 border-b border-slate-100 px-5 pt-4">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => handleRoomSelect(room.id)}
                disabled={loadingRoomId !== null}
                className="admin-choice-button admin-choice-button-auto" data-active={selectedRoomId === room.id} aria-pressed={selectedRoomId === room.id}
              >
                {room.isActive ? room.name : `${room.name} (비활성)`}
                {loadingRoomId === room.id && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="p-5">
          {/* 상단 바: 검색 + 설정 링크 */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {/* 검색 */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름 또는 수험번호 검색"
                className="h-8 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400"
              />
            </div>

            <Link
              href={`/${divisionSlug}/admin/settings/seats`}
              className="admin-table-link inline-flex items-center gap-1 text-xs"
            >
              <MapPin className="h-3 w-3" />
              좌석 배치 편집
            </Link>
          </div>

          {/* 출입구 표시 */}
          <div className="admin-help mb-3 text-center">
            칠판
          </div>

          {/* 좌석 그리드 */}
          <div className="overflow-x-auto">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(88px, 1fr))` }}
            >
              {Array.from({ length: rows }).flatMap((_, rowIndex) =>
                Array.from({ length: columns }).map((__, colIndex) => {
                  const positionX = colIndex + 1;
                  const positionY = rowIndex + 1;

                  if (aisleColumns.includes(positionX)) {
                    return (
                      <div
                        key={`aisle-${positionX}-${positionY}`}
                        className="admin-help flex min-h-[108px] items-center justify-center text-xs font-semibold"
                      >
                        복도
                      </div>
                    );
                  }

                  const seat = seatMap.get(getSeatPositionKey(positionX, positionY)) ?? null;

                  if (!seat) {
                    return (
                      <div
                        key={`empty-${positionX}-${positionY}`}
                        className="admin-help min-h-[108px]"
                      />
                    );
                  }

                  const student = seat.assignedStudent;
                  const tone = !seat.isActive
                    ? "border-dashed border-slate-200 bg-slate-50 text-slate-400"
                    : student ? "border-slate-200 text-white font-medium" : "border-slate-200 bg-white text-slate-500";
                  const assignedSeatStyle = getAssignedSeatStyle(seat);
                  const isSelected = panelInfo?.seat.id === seat.id || assignSeat?.id === seat.id;
                  const canDrag =
                    seat.isActive &&
                    (student?.status === "ACTIVE" || student?.status === "ON_LEAVE");
                  const isDragging = draggingFromSeatId === seat.id;
                  const isDropTarget =
                    draggingFromSeatId !== null &&
                    seat.isActive &&
                    seat.id !== draggingFromSeatId &&
                    !student;
                  const isMoving = movingSeatId === seat.id;

                  // 검색 dimming: 검색어 있고 학생이 있는데 매칭 안 되면 흐리게
                  const isDimmed =
                    searchQuery.trim().length > 0 &&
                    student !== null &&
                    student !== undefined &&
                    !student.name.includes(searchQuery.trim()) &&
                    !student.studentNumber.includes(searchQuery.trim());

                  return (
                    <button
                      key={`seat-${positionX}-${positionY}`}
                      type="button"
                      draggable={canDrag}
                      onClick={() => {
                        const shouldSuppressClick = Date.now() < suppressSeatClickUntilRef.current;

                        if (draggingFromSeatId) {
                          setDraggingFromSeatId(null);
                        }

                        if (shouldSuppressClick) {
                          return;
                        }

                        handleSeatClick(seat);
                      }}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", seat.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingFromSeatId(seat.id);
                        suppressSeatClick();
                      }}
                      onDragEnd={() => {
                        setDraggingFromSeatId(null);
                        suppressSeatClick();
                      }}
                      onDragOver={(e) => {
                        if (seat.isActive && !student) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!seat.isActive || student) return;
                        const fromSeatId = e.dataTransfer.getData("text/plain");
                        if (!fromSeatId || fromSeatId === seat.id) return;
                        const fromSeat = layout.seats.find((s) => s.id === fromSeatId);
                        if (!fromSeat) return;
                        setPendingMove({ fromSeat, toSeat: seat });
                        setDraggingFromSeatId(null);
                        suppressSeatClick();
                      }}
                      data-selected={isSelected}
                      data-drop-target={isDropTarget}
                      className={`admin-seat-card relative flex min-h-[108px] w-full flex-col justify-between rounded-lg border p-3 text-left transition ${tone} ${isDragging ? "cursor-grabbing opacity-40" : canDrag ? "cursor-grab" : ""} ${isDimmed ? "opacity-25" : ""}`}
                      style={assignedSeatStyle}
                    >
                      {/* 이동 중 로딩 오버레이 */}
                      {isMoving && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/40">
                          <LoaderCircle className="h-5 w-5 animate-spin text-white" />
                        </div>
                      )}

                      {/* 상단: 좌석번호 */}
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-semibold">
                          {seat.isActive ? seat.label : ""}
                        </span>
                      </div>

                      {/* 하단: 학생 정보 */}
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">
                          {student?.name ??
                            (seat.isActive ? (isDropTarget ? "여기에 놓기" : "공석") : "비활성")}
                        </p>
                        {student ? (
                          <>
                            <p className="text-xs opacity-70">{student.studentNumber}</p>
                            <p className="text-[13px] font-medium opacity-80">
                              {getStudyTrackShortLabel(student.studyTrack)}
                            </p>
                          </>
                        ) : null}
                      </div>
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 좌석 이동 확인 다이얼로그 */}
      <ConfirmDialog
        open={pendingMove !== null}
        title="좌석 이동"
        description={
          pendingMove
            ? `${pendingMove.fromSeat.assignedStudent?.name ?? "학생"}을(를) ${pendingMove.fromSeat.label}에서 ${pendingMove.toSeat.label}로 이동하시겠습니까?`
            : undefined
        }
        confirmLabel="이동"
        variant="default"
        isLoading={movingSeatId !== null}
        onConfirm={() => void handleConfirmMove()}
        onCancel={() => setPendingMove(null)}
      />

      <SlideOver
        open={assignSeat !== null}
        title="공석 좌석 배정"
        badge="좌석 배정"
        description={`좌석 ${assignSeat?.label ?? ""}에 현재 수강 명단의 학생을 배정합니다.`}
        onClose={closePanel}

      >
        {assignSeat && (
          <div className="space-y-4">
            <div className="admin-notice">
              검색 후 학생을 선택하면 바로 배정됩니다. 이미 다른 좌석이 있는 학생을 선택하면 현재 좌석에서 이 좌석으로 이동합니다.
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={assignSearchQuery}
                onChange={(event) => setAssignSearchQuery(event.target.value)}
                placeholder="이름, 수험번호, 현재 좌석으로 검색"
                className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 transition"
              />
            </div>

            {filteredAssignableStudents.length === 0 ? (
              <div className="admin-help px-4 py-10 text-center">
                배정 가능한 학생을 찾지 못했습니다.
              </div>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {filteredAssignableStudents.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    disabled={assigningStudentId !== null}
                    onClick={() => void handleAssignStudentToSeat(student)}
                    className="admin-button w-full"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                        <span
                          className={`rounded-lg border px-2 py-1 text-[13px] font-semibold ${getStudyTrackBadgeClasses(student.studyTrack)}`}
                        >
                          {getStudyTrackShortLabel(student.studyTrack)}
                        </span>
                      </div>
                      <p className="admin-help mt-1">{student.studentNumber}</p>
                      <p className="admin-help mt-1">
                        {student.seatDisplay ? `현재 좌석 ${student.seatDisplay}` : "현재 좌석 미배정"}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-lg bg-admin-accent px-3 py-2 text-xs font-medium text-white">
                      {assigningStudentId === student.id ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {student.seatDisplay ? "이 좌석으로 이동" : "배정"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </SlideOver>

      {/* 좌석 클릭 시 모달 */}
      <SlideOver
        open={panelInfo !== null}
        title={panelInfo?.seat.assignedStudent?.name ?? ""}
        badge="학생 현황"
        description={`좌석 ${panelInfo?.seat.label ?? ""} · ${formatStudyTrackLabel(panelInfo?.seat.assignedStudent?.studyTrack)}`}
        onClose={closePanel}
      >
        {panelInfo?.seat.assignedStudent && (
          <div className="space-y-4">
            {/* 탭 버튼 */}
            <div className="admin-subtabs" role="tablist" aria-label="좌석 학생 정보">
              {(
                [
                  { key: "info", label: "기본 정보" },
                  { key: "payment", label: "수납" },
                  { key: "points", label: "상벌점" },
                ] as { key: PanelTab; label: string }[]
              )
                .filter(({ key }) => {
                  if (key === "payment") return paymentEnabled;
                  if (key === "points") return pointsEnabled;
                  return true;
                })
                .map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`seat-student-${key}`}
                  aria-controls={`seat-student-panel-${key}`}
                  aria-selected={panelTab === key}
                  tabIndex={panelTab === key ? 0 : -1}
                  onClick={() => setPanelTab(key)}
                  onKeyDown={createTabListKeyHandler<PanelTab>(
                    ["info", ...(paymentEnabled ? ["payment" as const] : []), ...(pointsEnabled ? ["points" as const] : [])],
                    panelTab,
                    setPanelTab,
                  )}
                  className="admin-subtab"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── 기본 정보 탭 ── */}
            {panelTab === "info" && (
              <div className="space-y-4" role="tabpanel" id="seat-student-panel-info" aria-labelledby="seat-student-info">
                {/* 학생 기본 정보 */}
                <div className="admin-section">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="admin-help">수험번호</p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {panelInfo.seat.assignedStudent.studentNumber}
                      </p>
                    </div>
                    <span
                      className={`rounded-lg border px-3 py-1 text-xs font-semibold ${getStudyTrackBadgeClasses(panelInfo.seat.assignedStudent.studyTrack)}`}
                    >
                      {getStudyTrackShortLabel(panelInfo.seat.assignedStudent.studyTrack)}
                    </span>
                  </div>

                </div>

                {/* 자습실 간 이동 */}
                {rooms.length > 1 && (
                  <div>
                    <p className="admin-label mb-2">
                      다른 자습실로 이동
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {rooms
                        .filter((r) => r.id !== selectedRoomId)
                        .map((room) => (
                          <button
                            key={room.id}
                            type="button"
                            onClick={() =>
                              setTargetRoomId(targetRoomId === room.id ? null : room.id)
                            }
                            className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${ targetRoomId === room.id ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400" }`}
                          >
                            {room.name}
                          </button>
                        ))}
                    </div>

                    {targetRoomId && (
                      <div className="mt-3">
                        {isLoadingTarget ? (
                          <div className="flex items-center gap-2 admin-help">
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            빈 좌석 불러오는 중...
                          </div>
                        ) : (
                          <>
                            {targetLayout &&
                            targetLayout.seats.filter((s) => s.isActive && !s.assignedStudent)
                              .length === 0 ? (
                              <p className="admin-help">빈 좌석이 없습니다.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {targetLayout?.seats
                                  .filter((s) => s.isActive && !s.assignedStudent)
                                  .map((s) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      disabled={isMovingToRoom}
                                      onClick={() => void handleMoveToRoom(s.id)}
                                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-admin-success transition hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      {isMovingToRoom ? (
                                        <LoaderCircle className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Plus className="h-3 w-3" />
                                      )}
                                      {s.label}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 바로가기 버튼 */}
                <div className="space-y-2">
                  {studentManagementEnabled ? (
                    <Link
                    href={`/${divisionSlug}/admin/students/${panelInfo.seat.assignedStudent.id}`}
                    onClick={closePanel}
                    className="admin-button w-full"
                  >
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-400" />
                      학생 상세 보기
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  ) : null}

                </div>
              </div>
            )}

            {/* ── 수납 탭 ── */}
            {panelTab === "payment" && (
              <div className="grid gap-4" role="tabpanel" id="seat-student-panel-payment" aria-labelledby="seat-student-payment">
                {/* 기존 수납 내역 */}
                <div>
                  <p className="admin-label mb-2">
                    수납 내역
                  </p>
                  {isLoadingPayments ? (
                    <div className="flex items-center gap-2 py-4 admin-help">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      불러오는 중...
                    </div>
                  ) : fetchedPayments.length === 0 ? (
                    <p className="py-4 admin-help">수납 내역이 없습니다.</p>
                  ) : (
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {fetchedPayments.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-lg border border-slate-100 bg-white px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800">
                              {new Intl.NumberFormat("ko-KR").format(p.amount)}원
                            </span>
                            <span className="admin-help">{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("ko-KR") : "-"}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 admin-help">
                            <span>{p.paymentTypeName}</span>
                            {p.method && <span>· {p.method}</span>}
                            {p.notes && <span>· {p.notes}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 수납 등록 폼 */}
                <div className="space-y-3">
                  <p className="admin-label">
                    수납 등록
                  </p>

                  {/* 등록 플랜 카드 */}
                  {tuitionPlans.length > 0 && (
                    <div>
                      <p className="admin-help mb-2">등록 플랜 선택</p>
                      <div className="grid grid-cols-2 gap-2">
                        {tuitionPlans.map((plan) => (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => {
                              setSelectedPlanId(plan.id);
                              setPaymentAmount(String(plan.amount));
                              setPaymentNotes(plan.name);
                            }}
                            className={`rounded-lg border p-3 text-left transition ${ selectedPlanId === plan.id ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400" }`}
                          >
                            <p className="text-sm font-semibold">{plan.name}</p>
                            <p className={`mt-1 text-xs ${selectedPlanId === plan.id ? "text-white/70" : "text-slate-500"}`}>
                              {new Intl.NumberFormat("ko-KR").format(plan.amount)}원
                              {plan.durationDays ? ` · ${plan.durationDays}일` : ""}
                            </p>
                            {plan.description && (
                              <p className={`mt-1 text-xs ${selectedPlanId === plan.id ? "text-white/60" : "text-slate-400"}`}>
                                {plan.description}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="admin-help block">
                      수납 유형 <span className="text-admin-danger">*</span>
                    </label>
                    <select
                      value={paymentTypeId}
                      onChange={(e) => setPaymentTypeId(e.target.value)}
                      disabled={isLoadingPaymentMeta}
                      className="w-full"
                    >
                      <option value="">유형 선택</option>
                      {paymentCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="admin-help block">납부일</label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="admin-help block">
                        납부 금액 <span className="text-admin-danger">*</span>
                      </label>
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="admin-help block">납부 방식</label>
                    <PaymentMethodSelect
                      value={paymentMethod}
                      onChange={setPaymentMethod}
                      required
                      selectClassName="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      inputClassName="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="admin-help block">메모</label>
                    <input
                      type="text"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder="선택 사항"
                      className="w-full"
                    />
                  </div>

                  <DialogActions>
<button
                    type="button"
                    disabled={!paymentTypeId || !paymentAmount || isSavingPayment || isLoadingPaymentMeta}
                    onClick={() => void handlePaymentSave()}
                    className="admin-button admin-button-primary"
                  >
                    {isSavingPayment ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    수납 등록
                  </button>
</DialogActions>
                </div>
              </div>
            )}

            {/* ── 상벌점 탭 ── */}
            {panelTab === "points" && (
              <div className="space-y-3" role="tabpanel" id="seat-student-panel-points" aria-labelledby="seat-student-points">
                <div className="space-y-2">
                  <label className="admin-help block">규칙 선택</label>
                  <select
                    value={pointRuleId}
                    onChange={(e) => {
                      setPointRuleId(e.target.value);
                      setPointsValue("");
                    }}
                    disabled={isLoadingPointRules}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                  >
                    <option value="">직접 점수 입력</option>
                    {pointRules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.name} · {rule.points > 0 ? "+" : ""}{rule.points}점
                      </option>
                    ))}
                  </select>
                </div>

                {pointRuleId && selectedRule ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${ selectedRule.points > 0 ? "bg-white border border-slate-200 text-admin-success" : "bg-white border border-slate-200 text-admin-danger" }`}>
                        {selectedRule.points > 0 ? "+" : ""}{selectedRule.points}점
                      </span>
                      <span className="text-sm font-medium text-slate-800">{selectedRule.name}</span>
                    </div>
                    {selectedRule.description && (
                      <p className="admin-help mt-2">{selectedRule.description}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="admin-help block">
                      직접 점수 입력 <span className="text-admin-danger">*</span>
                    </label>
                    <input
                      type="number"
                      value={pointsValue}
                      onChange={(e) => setPointsValue(e.target.value)}
                      placeholder="예: +3 또는 -2"
                      className="w-full"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="admin-help block">사유 메모</label>
                  <input
                    type="text"
                    value={pointsNotes}
                    onChange={(e) => setPointsNotes(e.target.value)}
                    placeholder="사유 입력 (선택)"
                    className="w-full"
                  />
                </div>

                <DialogActions>
<button
                  type="button"
                  disabled={(!pointRuleId && !pointsValue) || isSavingPoints || isLoadingPointRules}
                  onClick={() => void handlePointsSave()}
                  className="admin-button admin-button-primary"
                >
                  {isSavingPoints ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  상벌점 부여
                </button>
</DialogActions>
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </div>
  );
});
