"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import Link from "next/link";
import {
  BookOpenCheck,
  ChevronRight,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { getSeatPositionKey } from "@/lib/seat-layout";
import type { AttendanceSnapshot } from "@/lib/services/attendance.service";
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

type AttendanceStatusKey =
  | "PRESENT"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE"
  | "UNPROCESSED";

type PanelTab = "info" | "attendance" | "payment" | "points";

type SeatStatusBoardProps = {
  divisionSlug: string;
  initialRooms: StudyRoomItem[];
  initialLayout: SeatLayout;
  initialStudents: StudentListItem[];
  todaySnapshot: AttendanceSnapshot;
  attendanceEnabled: boolean;
  paymentEnabled: boolean;
  pointsEnabled: boolean;
  studentManagementEnabled: boolean;
};

type SelectedSeatInfo = {
  seat: SeatMapSeat;
  dayStatus: AttendanceStatusKey | null;
  periodRecords: Array<{
    periodId: string;
    periodName: string;
    status: AttendanceStatusKey;
  }>;
};

// ─── 상수 ────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<AttendanceStatusKey, string> = {
  PRESENT: "출석",
  TARDY: "지각",
  ABSENT: "결석",
  EXCUSED: "공결",
  HOLIDAY: "휴가",
  HALF_HOLIDAY: "반차",
  NOT_APPLICABLE: "해당없음",
  UNPROCESSED: "미처리",
};

const STATUS_BADGE_CLASS: Record<AttendanceStatusKey, string> = {
  PRESENT: "border border-slate-200-slate-200 bg-white text-emerald-600 font-medium",
  TARDY: "border border-slate-200-slate-200 bg-white text-amber-600 font-medium",
  ABSENT: "border border-slate-200-slate-200 bg-white text-rose-600 font-medium",
  EXCUSED: "border border-slate-200-slate-200 bg-white text-blue-600 font-medium",
  HOLIDAY: "border border-slate-200-slate-200 bg-white text-blue-600 font-medium",
  HALF_HOLIDAY: "border border-slate-200-slate-200 bg-white text-indigo-600 font-medium",
  NOT_APPLICABLE: "border border-slate-200-slate-200 bg-slate-50 text-slate-500",
  UNPROCESSED: "border border-slate-200-slate-200 bg-slate-50 text-slate-500",
};

const QUICK_ATTENDANCE_STATUSES: AttendanceStatusKey[] = [
  "PRESENT",
  "TARDY",
  "ABSENT",
  "EXCUSED",
];

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function getSeatToneClasses(
  status: AttendanceStatusKey | null,
  hasStudent: boolean,
  isActive: boolean,
): string {
  if (!isActive) return "border-dashed border-slate-200 bg-slate-50 text-slate-400";
  if (!hasStudent) return "border-slate-200 bg-white text-slate-500";
  switch (status) {
    case "PRESENT":
      return "border-slate-200 text-white font-medium";
    case "TARDY":
      return "border-slate-200 text-white font-medium";
    case "ABSENT":
      return "border-slate-200 text-white font-medium";
    case "EXCUSED":
    case "HOLIDAY":
    case "HALF_HOLIDAY":
      return "border-slate-200 text-white font-medium";
    case "UNPROCESSED":
      return "border-slate-200 text-white font-medium";
    default:
      return "border-slate-200 text-white font-medium";
  }
}

function getAssignedSeatStyle(
  seat: Pick<SeatMapSeat, "isActive" | "assignedStudent">,
): CSSProperties | undefined {
  if (!seat.isActive || !seat.assignedStudent) {
    return undefined;
  }

  return {
    backgroundColor: "rgb(var(--division-color-rgb) / 0.8)",
    borderColor: "rgb(var(--division-color-rgb) / 0.95)",
  };
}

function computeDayStatusFromStudentRecords(
  studentRecords: AttendanceSnapshot["records"],
  periods: AttendanceSnapshot["periods"],
): AttendanceStatusKey | null {
  const mandatoryPeriods = periods.filter((p) => p.isActive && p.isMandatory);
  const statuses = studentRecords.map((r) => r.status as AttendanceStatusKey);

  if (statuses.includes("ABSENT")) return "ABSENT";

  const recordedPeriodIds = new Set(studentRecords.map((r) => r.periodId));
  for (const p of mandatoryPeriods) {
    if (!recordedPeriodIds.has(p.id)) return "UNPROCESSED";
  }

  if (statuses.includes("TARDY")) return "TARDY";
  if (statuses.some((s) => s === "HOLIDAY" || s === "HALF_HOLIDAY")) return "HOLIDAY";
  if (statuses.includes("EXCUSED")) return "EXCUSED";
  if (studentRecords.length === 0 && mandatoryPeriods.length === 0) return null;
  return "PRESENT";
}


// ─── 통계 카드 ───────────────────────────────────────────────────────────────


// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export const SeatStatusBoard = memo(function SeatStatusBoard({
  divisionSlug,
  initialRooms,
  initialLayout,
  initialStudents,
  todaySnapshot,
  attendanceEnabled,
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

  // 출결 탭
  const [savingPeriodId, setSavingPeriodId] = useState<string | null>(null);
  const [localPeriodRecords, setLocalPeriodRecords] = useState<
    Array<{ periodId: string; periodName: string; status: AttendanceStatusKey }>
  >([]);

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

  const today = todaySnapshot.date;
  const activePeriods = useMemo(
    () => todaySnapshot.periods.filter((period) => period.isActive),
    [todaySnapshot.periods],
  );
  const recordsByStudentId = useMemo(() => {
    const grouped = new Map<string, AttendanceSnapshot["records"]>();

    todaySnapshot.records.forEach((record) => {
      const current = grouped.get(record.studentId);

      if (current) {
        current.push(record);
        return;
      }

      grouped.set(record.studentId, [record]);
    });

    return grouped;
  }, [todaySnapshot.records]);
  const dayStatusByStudentId = useMemo(() => {
    const grouped = new Map<string, AttendanceStatusKey | null>();

    layout.seats.forEach((seat) => {
      const studentId = seat.assignedStudent?.id;

      if (!studentId || grouped.has(studentId)) {
        return;
      }

      grouped.set(
        studentId,
        computeDayStatusFromStudentRecords(recordsByStudentId.get(studentId) ?? [], activePeriods),
      );
    });

    return grouped;
  }, [activePeriods, layout.seats, recordsByStudentId]);
  const stats = useMemo(() => {
    const activeSeats = layout.seats.filter((seat) => seat.isActive);
    const assignedSeats = activeSeats.filter((seat) => seat.assignedStudent?.status === "ACTIVE");
    const emptyCount = activeSeats.filter((seat) => !seat.assignedStudent).length;
    const presentCount = assignedSeats.filter((seat) => {
      const studentId = seat.assignedStudent?.id;
      return studentId ? dayStatusByStudentId.get(studentId) === "PRESENT" : false;
    }).length;

    return {
      totalSeats: activeSeats.length,
      assignedCount: assignedSeats.length,
      emptyCount,
      presentRate:
        assignedSeats.length > 0 ? Math.round((presentCount / assignedSeats.length) * 100) : 0,
    };
  }, [dayStatusByStudentId, layout.seats]);

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
      (panelTab === "attendance" && !attendanceEnabled) ||
      (panelTab === "payment" && !paymentEnabled) ||
      (panelTab === "points" && !pointsEnabled);

    if (isDisabledTab) {
      setPanelTab("info");
    }
  }, [attendanceEnabled, panelTab, paymentEnabled, pointsEnabled]);

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

  // 출결 상태 저장
  async function handleAttendanceSave(periodId: string, status: AttendanceStatusKey) {
    const studentId = panelInfo?.seat.assignedStudent?.id;
    if (!studentId) return;
    setSavingPeriodId(periodId);
    try {
      const res = await fetch(`/api/${divisionSlug}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId,
          date: today,
          records: [{ studentId, status }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "출결 저장에 실패했습니다.");
      setLocalPeriodRecords((prev) =>
        prev.map((r) => (r.periodId === periodId ? { ...r, status } : r)),
      );
      toast.success("출결이 저장되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "출결 저장에 실패했습니다.");
    } finally {
      setSavingPeriodId(null);
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
      const studentId = seat.assignedStudent.id;
      const dayStatus = dayStatusByStudentId.get(studentId) ?? null;
      const studentRecords = recordsByStudentId.get(studentId) ?? [];
      const periodRecords = activePeriods
        .map((p) => {
          const rec = studentRecords.find((r) => r.periodId === p.id);
          return {
            periodId: p.id,
            periodName: `${p.name}${p.label ? ` (${p.label})` : ""}`,
            status: (rec?.status ?? "UNPROCESSED") as AttendanceStatusKey,
          };
        });
      setPanelInfo({ seat, dayStatus, periodRecords });
      setLocalPeriodRecords(periodRecords);
      setPanelTab("info");
      setTargetRoomId(null);
      setTargetLayout(null);
    },
    [activePeriods, dayStatusByStudentId, recordsByStudentId],
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
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "전체 좌석", value: stats.totalSeats, unit: "석", color: "text-slate-700" },
          { label: "배정 학생", value: stats.assignedCount, unit: "명", color: "text-emerald-700" },
          { label: "공석", value: stats.emptyCount, unit: "석", color: "text-slate-500" },
          {
            label: "오늘 출석률",
            value: stats.presentRate,
            unit: "%",
            color: stats.presentRate >= 80 ? "text-emerald-700" : "text-amber-700",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[10px] border border-slate-200-black/5 bg-white px-5 py-4 shadow-[0_8px_24px_rgba(18,32,56,0.05)]"
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className={`mt-1 text-3xl font-extrabold tracking-tight ${card.color}`}>
              {card.value}
              <span className="ml-1 text-base font-medium">{card.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 자습실 탭 + 배치도 */}
      <div className="rounded-[10px] border border-slate-200-black/5 bg-white shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        {/* 자습실 탭 */}
        {rooms.length > 1 && (
          <div className="flex gap-1 border-b border-slate-100 px-5 pt-4">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => handleRoomSelect(room.id)}
                disabled={loadingRoomId !== null}
                className={`relative rounded-t-xl px-4 py-2 text-sm font-medium transition ${
                  selectedRoomId === room.id
                    ? "bg-[var(--division-color)] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-700"
                }`}
              >
                {room.name}
                {loadingRoomId === room.id && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="p-5">
          {/* 상단 바: 검색 + 범례 + 설정 링크 */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {/* 검색 */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름 또는 수험번호 검색"
                className="h-8 rounded-full border border-slate-200-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {(
                [
                  ["PRESENT", "출석"],
                  ["TARDY", "지각"],
                  ["ABSENT", "결석"],
                  ["EXCUSED", "공결/휴가"],
                  ["UNPROCESSED", "미처리"],
                ] as [AttendanceStatusKey, string][]
              ).map(([status, label]) => (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${STATUS_BADGE_CLASS[status]}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {label}
                </span>
              ))}
            </div>
            <Link
              href={`/${divisionSlug}/admin/settings/seats`}
              className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-600"
            >
              <MapPin className="h-3 w-3" />
              좌석 배치 편집
            </Link>
          </div>

          {/* 출입구 표시 */}
          <div className="mb-3 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-500">
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
                        className="flex min-h-[108px] items-center justify-center rounded-[10px] border border-slate-200-dashed border-slate-200 bg-white text-xs font-semibold tracking-widest text-slate-400"
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
                        className="min-h-[108px] rounded-[10px] border border-slate-200-dashed border-slate-100 bg-slate-50"
                      />
                    );
                  }

                  const student = seat.assignedStudent;
                  const dayStatus = student ? dayStatusByStudentId.get(student.id) ?? null : null;
                  const tone = getSeatToneClasses(dayStatus, !!student, seat.isActive);
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
                      className={`relative flex min-h-[108px] w-full flex-col justify-between rounded-[10px] border p-3 text-left transition hover:opacity-80 ${tone} ${
                        isSelected ? "ring-2 ring-slate-900 ring-offset-1" : ""
                      } ${isDragging ? "cursor-grabbing opacity-40" : canDrag ? "cursor-grab" : ""} ${
                        isDropTarget
                          ? "border-slate-200 bg-white ring-2 ring-blue-400 ring-offset-1"
                          : ""
                      } ${isDimmed ? "opacity-25" : ""}`}
                      style={assignedSeatStyle}
                    >
                      {/* 이동 중 로딩 오버레이 */}
                      {isMoving && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-slate-900/40 backdrop-blur-sm">
                          <LoaderCircle className="h-5 w-5 animate-spin text-white" />
                        </div>
                      )}

                      {/* 상단: 좌석번호 + 상태 */}
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-semibold tracking-widest">
                          {seat.isActive ? seat.label : ""}
                        </span>
                        {student && dayStatus && (
                          <span
                            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_CLASS[dayStatus]}`}
                          >
                            {STATUS_LABEL[dayStatus]}
                          </span>
                        )}
                      </div>

                      {/* 하단: 학생 정보 */}
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold">
                          {student?.name ??
                            (seat.isActive ? (isDropTarget ? "여기에 놓기" : "공석") : "비활성")}
                        </p>
                        {student ? (
                          <>
                            <p className="text-xs opacity-70">{student.studentNumber}</p>
                            <p className="text-[10px] font-medium opacity-80">
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

      <Modal
        open={assignSeat !== null}
        title="공석 좌석 배정"
        badge="좌석 배정"
        description={`좌석 ${assignSeat?.label ?? ""}에 현재 수강 명단의 학생을 배정합니다.`}
        onClose={closePanel}
        widthClassName="max-w-2xl"
      >
        {assignSeat && (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              검색 후 학생을 선택하면 바로 배정됩니다. 이미 다른 좌석이 있는 학생을 선택하면 현재 좌석에서 이 좌석으로 이동합니다.
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={assignSearchQuery}
                onChange={(event) => setAssignSearchQuery(event.target.value)}
                placeholder="이름, 수험번호, 현재 좌석으로 검색"
                className="w-full rounded-[10px] border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-slate-400"
              />
            </div>

            {filteredAssignableStudents.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
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
                    className="flex w-full items-center justify-between rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-left transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStudyTrackBadgeClasses(student.studyTrack)}`}
                        >
                          {getStudyTrackShortLabel(student.studyTrack)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{student.studentNumber}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {student.seatDisplay ? `현재 좌석 ${student.seatDisplay}` : "현재 좌석 미배정"}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
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
      </Modal>

      {/* 좌석 클릭 시 모달 */}
      <Modal
        open={panelInfo !== null}
        title={panelInfo?.seat.assignedStudent?.name ?? ""}
        badge="학생 현황"
        description={`좌석 ${panelInfo?.seat.label ?? ""} · ${formatStudyTrackLabel(panelInfo?.seat.assignedStudent?.studyTrack)}`}
        onClose={closePanel}
      >
        {panelInfo?.seat.assignedStudent && (
          <div className="space-y-4">
            {/* 탭 버튼 */}
            <div className="flex gap-1 rounded-[10px] bg-slate-100 p-1.5">
              {(
                [
                  { key: "info", label: "기본 정보" },
                  { key: "attendance", label: "출결" },
                  { key: "payment", label: "수납" },
                  { key: "points", label: "상벌점" },
                ] as { key: PanelTab; label: string }[]
              )
                .filter(({ key }) => {
                  if (key === "attendance") return attendanceEnabled;
                  if (key === "payment") return paymentEnabled;
                  if (key === "points") return pointsEnabled;
                  return true;
                })
                .map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPanelTab(key)}
                  className={`flex-1 rounded-[10px] py-3 text-sm font-semibold transition ${
                    panelTab === key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── 기본 정보 탭 ── */}
            {panelTab === "info" && (
              <div className="space-y-4">
                {/* 학생 기본 정보 */}
                <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500">수험번호</p>
                      <p className="mt-0.5 font-semibold text-slate-800">
                        {panelInfo.seat.assignedStudent.studentNumber}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStudyTrackBadgeClasses(panelInfo.seat.assignedStudent.studyTrack)}`}
                    >
                      {getStudyTrackShortLabel(panelInfo.seat.assignedStudent.studyTrack)}
                    </span>
                  </div>

                  {panelInfo.dayStatus && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-slate-500">오늘 종합</span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[panelInfo.dayStatus]}`}
                      >
                        {STATUS_LABEL[panelInfo.dayStatus]}
                      </span>
                    </div>
                  )}
                </div>

                {/* 교시별 출석 요약 */}
                {localPeriodRecords.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                      오늘 교시별
                    </p>
                    <div className="space-y-1.5">
                      {localPeriodRecords.map((rec) => (
                        <div
                          key={rec.periodId}
                          className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-100 bg-white px-3 py-2"
                        >
                          <span className="text-sm text-slate-600">{rec.periodName}</span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[rec.status]}`}
                          >
                            {STATUS_LABEL[rec.status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 자습실 간 이동 */}
                {rooms.length > 1 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
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
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                              targetRoomId === room.id
                                ? "border-slate-800 bg-slate-800 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                            }`}
                          >
                            {room.name}
                          </button>
                        ))}
                    </div>

                    {targetRoomId && (
                      <div className="mt-3">
                        {isLoadingTarget ? (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            빈 좌석 불러오는 중...
                          </div>
                        ) : (
                          <>
                            {targetLayout &&
                            targetLayout.seats.filter((s) => s.isActive && !s.assignedStudent)
                              .length === 0 ? (
                              <p className="text-xs text-slate-400">빈 좌석이 없습니다.</p>
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
                                      className="flex items-center gap-1 rounded-full border border-slate-200-slate-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-slate-50 disabled:opacity-50"
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
                    className="flex w-full items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-400" />
                      학생 상세 보기
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  ) : null}

                  {attendanceEnabled ? (
                    <Link
                    href={`/${divisionSlug}/admin/attendance`}
                    onClick={closePanel}
                    className="flex w-full items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <BookOpenCheck className="h-4 w-4 text-slate-400" />
                      출석부로 이동
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  ) : null}
                </div>
              </div>
            )}

            {/* ── 출결 탭 ── */}
            {attendanceEnabled && panelTab === "attendance" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  교시를 선택해 출결 상태를 변경합니다. 저장은 즉시 반영됩니다.
                </p>
                {localPeriodRecords.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">교시가 없습니다.</p>
                ) : (
                  localPeriodRecords.map((rec) => (
                    <div key={rec.periodId} className="rounded-[10px] border border-slate-200-slate-100 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">{rec.periodName}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[rec.status]}`}
                        >
                          {STATUS_LABEL[rec.status]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_ATTENDANCE_STATUSES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={savingPeriodId !== null}
                            onClick={() => void handleAttendanceSave(rec.periodId, s)}
                            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                              rec.status === s
                                ? STATUS_BADGE_CLASS[s]
                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                            }`}
                          >
                            {savingPeriodId === rec.periodId && (
                              <LoaderCircle className="h-3 w-3 animate-spin" />
                            )}
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── 수납 탭 ── */}
            {panelTab === "payment" && (
              <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
                {/* 기존 수납 내역 */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                    수납 내역
                  </p>
                  {isLoadingPayments ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      불러오는 중...
                    </div>
                  ) : fetchedPayments.length === 0 ? (
                    <p className="py-4 text-sm text-slate-400">수납 내역이 없습니다.</p>
                  ) : (
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {fetchedPayments.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-[10px] border border-slate-200-slate-100 bg-white px-3 py-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800">
                              {new Intl.NumberFormat("ko-KR").format(p.amount)}원
                            </span>
                            <span className="text-xs text-slate-500">{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("ko-KR") : "-"}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
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
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    수납 등록
                  </p>

                  {/* 등록 플랜 카드 */}
                  {tuitionPlans.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-600">등록 플랜 선택</p>
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
                            className={`rounded-[10px] border p-3 text-left transition ${
                              selectedPlanId === plan.id
                                ? "border-slate-800 bg-slate-800 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                            }`}
                          >
                            <p className="text-sm font-semibold">{plan.name}</p>
                            <p className={`mt-0.5 text-xs ${selectedPlanId === plan.id ? "text-white/70" : "text-slate-500"}`}>
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
                    <label className="block text-xs font-medium text-slate-600">
                      수납 유형 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={paymentTypeId}
                      onChange={(e) => setPaymentTypeId(e.target.value)}
                      disabled={isLoadingPaymentMeta}
                      className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
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
                      <label className="block text-xs font-medium text-slate-600">납부일</label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600">
                        납부 금액 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600">납부 방식</label>
                    <PaymentMethodSelect
                      value={paymentMethod}
                      onChange={setPaymentMethod}
                      required
                      selectClassName="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                      inputClassName="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600">메모</label>
                    <input
                      type="text"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder="선택 사항"
                      className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!paymentTypeId || !paymentAmount || isSavingPayment || isLoadingPaymentMeta}
                    onClick={() => void handlePaymentSave()}
                    className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    {isSavingPayment ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    수납 등록
                  </button>
                </div>
              </div>
            )}

            {/* ── 상벌점 탭 ── */}
            {panelTab === "points" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-600">규칙 선택</label>
                  <select
                    value={pointRuleId}
                    onChange={(e) => {
                      setPointRuleId(e.target.value);
                      setPointsValue("");
                    }}
                    disabled={isLoadingPointRules}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
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
                  <div className="rounded-[10px] border border-slate-200-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        selectedRule.points > 0
                          ? "bg-white border border-slate-200-slate-200 text-emerald-700"
                          : "bg-white border border-slate-200-slate-200 text-rose-700"
                      }`}>
                        {selectedRule.points > 0 ? "+" : ""}{selectedRule.points}점
                      </span>
                      <span className="text-sm font-medium text-slate-800">{selectedRule.name}</span>
                    </div>
                    {selectedRule.description && (
                      <p className="mt-1.5 text-xs text-slate-500">{selectedRule.description}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600">
                      직접 점수 입력 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={pointsValue}
                      onChange={(e) => setPointsValue(e.target.value)}
                      placeholder="예: +3 또는 -2"
                      className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600">사유 메모</label>
                  <input
                    type="text"
                    value={pointsNotes}
                    onChange={(e) => setPointsNotes(e.target.value)}
                    placeholder="사유 입력 (선택)"
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                  />
                </div>

                <button
                  type="button"
                  disabled={(!pointRuleId && !pointsValue) || isSavingPoints || isLoadingPointRules}
                  onClick={() => void handlePointsSave()}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {isSavingPoints ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  상벌점 부여
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
});
