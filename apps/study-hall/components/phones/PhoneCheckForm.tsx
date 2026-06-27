"use client";

import dynamic from "next/dynamic";

import { LayoutGrid, Phone, RefreshCcw, Save, Search, Table2, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { PhoneCheckTable } from "@/components/phones/PhoneCheckTable";
import type { PhoneSaveState } from "@/components/phones/PhoneCheckTable";
import {
  PHONE_CHECK_STATUS_OPTIONS,
  PhoneStatusCheckButton,
} from "@/components/phones/PhoneStatusCheckButton";
import { Modal } from "@/components/ui/Modal";
import { getAttendanceStatusLabel } from "@/lib/attendance-meta";
import { hasStudentSearchQuery, matchesStudentSearch } from "@/lib/student-search";
import type {
  PhoneAttendanceCell,
  PhoneCheckStatus,
  PhoneDaySnapshot,
} from "@/lib/services/phone-submission.service";
import type { SeatLayout, StudyRoomItem } from "@/lib/services/seat.service";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";

const PhoneCheckSeatMap = dynamic(
  () => import("@/components/phones/PhoneCheckSeatMap").then((mod) => mod.PhoneCheckSeatMap),
  {
    loading: () => (
      <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-16 text-center text-sm text-slate-500">
        좌석 지도를 불러오는 중입니다.
      </div>
    ),
  },
);

export type LocalStatus = PhoneCheckStatus | null;

export type LocalPeriodState = {
  [studentId: string]: {
    status: LocalStatus;
    rentalNote: string;
  };
};

type AllPeriodsState = {
  [periodId: string]: LocalPeriodState;
};

type BulkRentalDraft = {
  startPeriodId: string;
  endPeriodId: string;
  rentalNote: string;
  overwriteExisting: boolean;
  selectedStudentIds: Set<string>;
};

type CellSaveState = {
  status: PhoneSaveState;
};

type StudentFilterMode = "all" | "unchecked";

function getPhoneCellKey(periodId: string, studentId: string) {
  return `${periodId}:${studentId}`;
}

function comparePhoneStudents(
  left: PhoneDaySnapshot["students"][number],
  right: PhoneDaySnapshot["students"][number],
) {
  const leftSeat = left.seatLabel ?? "";
  const rightSeat = right.seatLabel ?? "";
  const roomCompare = (left.studyRoomName ?? "").localeCompare(right.studyRoomName ?? "", "ko");
  if (roomCompare !== 0) return roomCompare;

  const seatCompare = leftSeat.localeCompare(rightSeat, "ko", { numeric: true });
  if (seatCompare !== 0) return seatCompare;

  return (
    left.name.localeCompare(right.name, "ko") ||
    left.studentNumber.localeCompare(right.studentNumber, "ko")
  );
}

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getCurrentKstMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour * 60 + minute;
}

function getSuggestedPeriodId(snapshot: PhoneDaySnapshot, targetDate: string) {
  if (targetDate !== getKstToday()) {
    return null;
  }

  const currentMinutes = getCurrentKstMinutes();
  const activePeriod =
    snapshot.periods.find((period) => {
      const start = timeToMinutes(period.startTime);
      const end = timeToMinutes(period.endTime) + 5;
      return currentMinutes >= start && currentMinutes <= end;
    }) ?? null;

  if (activePeriod) {
    return activePeriod.periodId;
  }

  const startedPeriods = snapshot.periods.filter(
    (period) => timeToMinutes(period.startTime) <= currentMinutes,
  );

  if (startedPeriods.length > 0) {
    return startedPeriods[startedPeriods.length - 1]?.periodId ?? null;
  }

  return snapshot.periods[0]?.periodId ?? null;
}

function resolveActivePeriodId(
  snapshot: PhoneDaySnapshot,
  targetDate: string,
  preferredPeriodId?: string,
) {
  return (
    getSuggestedPeriodId(snapshot, targetDate) ??
    preferredPeriodId ??
    snapshot.periods[0]?.periodId ??
    ""
  );
}

function getPeriodRange(periods: PhoneDaySnapshot["periods"], startPeriodId: string, endPeriodId: string) {
  const startIndex = periods.findIndex((period) => period.periodId === startPeriodId);
  const endIndex = periods.findIndex((period) => period.periodId === endPeriodId);

  if (startIndex === -1 || endIndex === -1) {
    return [];
  }

  const [fromIndex, toIndex] =
    startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

  return periods.slice(fromIndex, toIndex + 1);
}

function getAttendanceBadgeClassName(cell: PhoneAttendanceCell | undefined, enabled: boolean) {
  if (!enabled) return "border-slate-200 bg-slate-50 text-slate-500";

  switch (cell?.status) {
    case "PRESENT":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "TARDY":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "ABSENT":
    case "EXCUSED":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "HOLIDAY":
    case "HALF_HOLIDAY":
    case "NOT_APPLICABLE":
      return "border-slate-200 bg-slate-50 text-slate-500";
    default:
      return "border-indigo-200 bg-indigo-50 text-indigo-500";
  }
}

function getBulkRentalRangeBadgeClassName(checkableCount: number, totalCount: number, enabled: boolean) {
  if (!enabled) return "border-slate-200 bg-slate-50 text-slate-500";
  if (totalCount === 0 || checkableCount === 0) return "border-slate-200 bg-slate-100 text-slate-400";
  if (checkableCount === totalCount) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function buildInitialState(snapshot: PhoneDaySnapshot): AllPeriodsState {
  return buildStateFromSnapshot(snapshot);
}

function buildStateFromSnapshot(
  snapshot: PhoneDaySnapshot,
  previousState?: AllPeriodsState,
  preservedCellKeys: Set<string> = new Set(),
): AllPeriodsState {
  const state: AllPeriodsState = {};
  for (const period of snapshot.periods) {
    const recordByStudentId = new Map(period.records.map((record) => [record.studentId, record]));
    const attendanceByStudentId = new Map(
      period.attendance.map((cell) => [cell.studentId, cell]),
    );
    state[period.periodId] = {};
    for (const student of snapshot.students) {
      const key = getPhoneCellKey(period.periodId, student.id);
      if (previousState && preservedCellKeys.has(key)) {
        state[period.periodId][student.id] = previousState[period.periodId]?.[student.id] ?? {
          status: null,
          rentalNote: "",
        };
        continue;
      }

      const record = recordByStudentId.get(student.id);
      const attendanceCell = attendanceByStudentId.get(student.id);
      const isCheckable =
        !snapshot.attendanceIntegrationEnabled || Boolean(attendanceCell?.checkable);
      state[period.periodId][student.id] = {
        status: isCheckable && record ? record.status : null,
        rentalNote: isCheckable ? record?.rentalNote ?? "" : "",
      };
    }
  }
  return state;
}

function getBulkRentalAppliedCellKeys(
  snapshot: PhoneDaySnapshot,
  studentIds: Set<string>,
  periodIds: Set<string>,
) {
  const keys: string[] = [];
  for (const period of snapshot.periods) {
    if (!periodIds.has(period.periodId)) {
      continue;
    }

    for (const record of period.records) {
      if (record.status === "RENTED" && studentIds.has(record.studentId)) {
        keys.push(getPhoneCellKey(period.periodId, record.studentId));
      }
    }
  }
  return keys;
}

type PhoneCheckFormProps = {
  divisionSlug: string;
  initialDate: string;
  initialSnapshot: PhoneDaySnapshot;
  initialActivePeriodId?: string;
  seatRooms?: StudyRoomItem[];
  initialSeatLayout?: SeatLayout;
};

export function PhoneCheckForm({
  divisionSlug,
  initialDate,
  initialSnapshot,
  initialActivePeriodId,
  seatRooms,
  initialSeatLayout,
}: PhoneCheckFormProps) {
  const [date, setDate] = useState(initialDate);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [periodsState, setPeriodsState] = useState<AllPeriodsState>(() =>
    buildInitialState(initialSnapshot),
  );
  const hasSeatLayout = Boolean(seatRooms && seatRooms.length > 0 && initialSeatLayout);
  const [activePeriodId, setActivePeriodId] = useState<string>(
    resolveActivePeriodId(initialSnapshot, initialDate, initialActivePeriodId),
  );
  const [viewMode, setViewMode] = useState<"seat" | "table">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [studentFilterMode, setStudentFilterMode] = useState<StudentFilterMode>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [savingPeriodId, setSavingPeriodId] = useState<string | null>(null);
  const [dirtyCellKeys, setDirtyCellKeys] = useState<Set<string>>(() => new Set());
  const [cellSaveStates, setCellSaveStates] = useState<Record<string, CellSaveState>>({});
  const [bulkRentalDraft, setBulkRentalDraft] = useState<BulkRentalDraft | null>(null);
  const [isSavingBulkRental, setIsSavingBulkRental] = useState(false);
  const dirtyCellKeysRef = useRef(dirtyCellKeys);
  const cellSaveStatesRef = useRef(cellSaveStates);
  const saveSequenceRef = useRef<Record<string, number>>({});
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isDirty = dirtyCellKeys.size > 0;

  useEffect(() => {
    dirtyCellKeysRef.current = dirtyCellKeys;
  }, [dirtyCellKeys]);

  useEffect(() => {
    cellSaveStatesRef.current = cellSaveStates;
  }, [cellSaveStates]);

  const markDirty = useCallback((periodId: string, studentId: string) => {
    const key = getPhoneCellKey(periodId, studentId);
    setDirtyCellKeys((current) => {
      const next = new Set(current);
      next.add(key);
      dirtyCellKeysRef.current = next;
      return next;
    });
  }, []);

  const clearDirtyKeys = useCallback((keys: string[]) => {
    if (keys.length === 0) return;

    setDirtyCellKeys((current) => {
      const next = new Set(current);
      for (const key of keys) {
        next.delete(key);
      }
      dirtyCellKeysRef.current = next;
      return next;
    });
  }, []);

  const periods = snapshot.periods;
  const students = snapshot.students;
  const filteredStudents = useMemo(
    () =>
      students.filter((student) =>
        matchesStudentSearch(student, deferredSearchQuery, [student.studyRoomName]),
      ),
    [deferredSearchQuery, students],
  );
  const activePeriod = periods.find((p) => p.periodId === activePeriodId);
  const activePeriodState = useMemo(
    () => periodsState[activePeriodId] ?? {},
    [activePeriodId, periodsState],
  );
  const activeAttendanceByStudentId = useMemo(
    () => new Map((activePeriod?.attendance ?? []).map((cell) => [cell.studentId, cell])),
    [activePeriod],
  );
  const hasSearchQuery = hasStudentSearchQuery(searchQuery);

  const isStudentCheckableForPeriod = useCallback(
    (periodId: string, studentId: string) => {
      if (!snapshot.attendanceIntegrationEnabled) {
        return true;
      }

      const period = snapshot.periods.find((item) => item.periodId === periodId);
      return Boolean(period?.attendance.find((cell) => cell.studentId === studentId)?.checkable);
    },
    [snapshot.attendanceIntegrationEnabled, snapshot.periods],
  );

  async function loadSnapshot(newDate: string) {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/${divisionSlug}/phone-submissions?mode=snapshot&date=${newDate}`,
      );
      if (!res.ok) {
        toast.error("데이터를 불러오는 데 실패했습니다.");
        return;
      }
      const { snapshot: newSnapshot } = (await res.json()) as { snapshot: PhoneDaySnapshot };
      setSnapshot(newSnapshot);
      setPeriodsState(buildInitialState(newSnapshot));
      dirtyCellKeysRef.current = new Set();
      setDirtyCellKeys(new Set());
      setCellSaveStates({});
      const retainedPeriodId = newSnapshot.periods.find(
        (period) => period.periodId === activePeriodId,
      )?.periodId;

      setActivePeriodId(resolveActivePeriodId(newSnapshot, newDate, retainedPeriodId));
    } finally {
      setIsLoading(false);
    }
  }

  function handleDateChange(newDate: string) {
    if (newDate === date) {
      return;
    }

    setDate(newDate);
    void loadSnapshot(newDate);
  }

  async function savePhoneRecords(
    periodId: string,
    records: Array<{ studentId: string; status: LocalStatus; rentalNote?: string }>,
    dirtyKeysToClear: string[],
    options: { successToast?: string; periodSaving?: boolean } = {},
  ) {
    if (records.length === 0) {
      toast.error("저장할 학생이 없습니다.");
      return;
    }

    const sequences = dirtyKeysToClear.map((key) => {
      const nextSequence = (saveSequenceRef.current[key] ?? 0) + 1;
      saveSequenceRef.current[key] = nextSequence;
      return [key, nextSequence] as const;
    });

    setCellSaveStates((current) => {
      const next = { ...current };
      for (const key of dirtyKeysToClear) {
        next[key] = { status: "saving" };
      }
      return next;
    });

    if (options.periodSaving) {
      setSavingPeriodId(periodId);
    }

    try {
      const res = await fetch(`/api/${divisionSlug}/phone-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, periodId, records }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "저장에 실패했습니다.");
      }

      const isStale = sequences.some(
        ([key, sequence]) => saveSequenceRef.current[key] !== sequence,
      );
      const { snapshot: newSnapshot } = (await res.json()) as { snapshot: PhoneDaySnapshot };

      if (!isStale) {
        const savedKeySet = new Set(dirtyKeysToClear);
        setSnapshot(newSnapshot);
        setPeriodsState((prev) => {
          const updated = { ...prev };
          const savedPeriod = newSnapshot.periods.find((p) => p.periodId === periodId);
          if (savedPeriod) {
            const recordByStudentId = new Map(
              savedPeriod.records.map((record) => [record.studentId, record]),
            );
            const attendanceByStudentId = new Map(
              savedPeriod.attendance.map((cell) => [cell.studentId, cell]),
            );
            const newPeriodState: LocalPeriodState = {};
            for (const student of newSnapshot.students) {
              const key = getPhoneCellKey(periodId, student.id);
              if (dirtyCellKeysRef.current.has(key) && !savedKeySet.has(key)) {
                newPeriodState[student.id] = prev[periodId]?.[student.id] ?? {
                  status: null,
                  rentalNote: "",
                };
                continue;
              }

              const record = recordByStudentId.get(student.id);
              const attendanceCell = attendanceByStudentId.get(student.id);
              const isCheckable =
                !newSnapshot.attendanceIntegrationEnabled || Boolean(attendanceCell?.checkable);
              newPeriodState[student.id] = {
                status: isCheckable && record ? record.status : null,
                rentalNote: isCheckable ? record?.rentalNote ?? "" : "",
              };
            }
            updated[periodId] = newPeriodState;
          }
          return updated;
        });
        clearDirtyKeys(dirtyKeysToClear);
      }

      setCellSaveStates((current) => {
        const next = { ...current };
        for (const key of dirtyKeysToClear) {
          if (!isStale) {
            next[key] = { status: "saved" };
          }
        }
        return next;
      });

      if (options.successToast && !isStale) {
        toast.success(options.successToast);
      }
    } catch (error) {
      const failedKeys = sequences
        .filter(([key, sequence]) => saveSequenceRef.current[key] === sequence)
        .map(([key]) => key);

      if (failedKeys.length > 0) {
        setDirtyCellKeys((current) => {
          const next = new Set(current);
          for (const key of failedKeys) {
            next.add(key);
          }
          dirtyCellKeysRef.current = next;
          return next;
        });
      }

      setCellSaveStates((current) => {
        const next = { ...current };
        for (const key of failedKeys) {
          next[key] = { status: "error" };
        }
        return next;
      });
      toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      if (options.periodSaving) {
        setSavingPeriodId(null);
      }
    }
  }

  function setStudentStatus(periodId: string, studentId: string, status: LocalStatus) {
    if (!isStudentCheckableForPeriod(periodId, studentId)) {
      return;
    }

    const previousEntry = periodsState[periodId]?.[studentId] ?? {
      status: null,
      rentalNote: "",
    };
    const nextEntry = {
      status,
      rentalNote: status !== "RENTED" ? "" : previousEntry.rentalNote,
    };
    const key = getPhoneCellKey(periodId, studentId);

    setPeriodsState((prev) => ({
      ...prev,
      [periodId]: {
        ...prev[periodId],
        [studentId]: nextEntry,
      },
    }));

    clearDirtyKeys([key]);
    void savePhoneRecords(
      periodId,
      [{ studentId, status: nextEntry.status, rentalNote: nextEntry.rentalNote || undefined }],
      [key],
    );
  }

  function setRentalNote(periodId: string, studentId: string, note: string) {
    if (!isStudentCheckableForPeriod(periodId, studentId)) {
      return;
    }

    markDirty(periodId, studentId);
    setPeriodsState((prev) => ({
      ...prev,
      [periodId]: {
        ...prev[periodId],
        [studentId]: { ...prev[periodId]?.[studentId], rentalNote: note },
      },
    }));
  }

  function commitRentalNote(periodId: string, studentId: string) {
    const key = getPhoneCellKey(periodId, studentId);
    if (!dirtyCellKeysRef.current.has(key)) {
      return;
    }

    const value = periodsState[periodId]?.[studentId] ?? { status: null, rentalNote: "" };
    void savePhoneRecords(
      periodId,
      [{ studentId, status: value.status, rentalNote: value.rentalNote || undefined }],
      [key],
    );
  }

  function setAllForPeriod(
    periodId: string,
    status: PhoneCheckStatus,
    targetStudents: PhoneDaySnapshot["students"] = students,
  ) {
    const targets = targetStudents
      .filter((student) => isStudentCheckableForPeriod(periodId, student.id))
      .map((student) => {
        const rentalNote =
          status === "RENTED" ? (periodsState[periodId]?.[student.id]?.rentalNote ?? "") : "";
        return {
          student,
          record: {
            studentId: student.id,
            status,
            rentalNote: rentalNote || undefined,
          },
          nextEntry: {
            status,
            rentalNote,
          },
          key: getPhoneCellKey(periodId, student.id),
        };
      });

    setPeriodsState((prev) => {
      const next: LocalPeriodState = { ...(prev[periodId] ?? {}) };
      for (const target of targets) {
        next[target.student.id] = target.nextEntry;
      }
      return { ...prev, [periodId]: next };
    });

    if (targets.length === 0) {
      toast.error("저장할 학생이 없습니다.");
      return;
    }

    const records = targets.map((target) => target.record);
    const keys = targets.map((target) => target.key);
    clearDirtyKeys(keys);
    void savePhoneRecords(periodId, records, keys, {
      successToast: status === "SUBMITTED" ? "전원 반납 저장됨" : "전원 미반납 저장됨",
      periodSaving: true,
    });
  }

  async function savePeriod(periodId: string) {
    const periodStateMap = periodsState[periodId] ?? {};
    const records = students
      .filter(
        (student) =>
          isStudentCheckableForPeriod(periodId, student.id) ||
          (periodStateMap[student.id]?.status ?? null) !== null,
      )
      .map((student) => {
        const value = periodStateMap[student.id] ?? { status: null, rentalNote: "" };
        return {
          studentId: student.id,
          status: isStudentCheckableForPeriod(periodId, student.id)
            ? value.status
            : null,
          rentalNote: value.rentalNote || undefined,
        };
      });

    if (records.length === 0) {
      toast.error("저장할 학생이 없습니다.");
      return;
    }

    void savePhoneRecords(
      periodId,
      records,
      records.map((record) => getPhoneCellKey(periodId, record.studentId)),
      { successToast: "저장되었습니다.", periodSaving: true },
    );
  }

  function getCheckablePeriodCountForStudent(
    studentId: string,
    targetPeriods: PhoneDaySnapshot["periods"],
  ) {
    if (!snapshot.attendanceIntegrationEnabled) {
      return targetPeriods.length;
    }

    return targetPeriods.filter((period) =>
      isStudentCheckableForPeriod(period.periodId, studentId),
    ).length;
  }

  function openBulkRentalModal(studentId?: string) {
    if (!activePeriodId) {
      toast.error("교시를 선택해주세요.");
      return;
    }

    const targetPeriods = getPeriodRange(periods, activePeriodId, activePeriodId);
    const selectedStudentIds =
      studentId && getCheckablePeriodCountForStudent(studentId, targetPeriods) > 0
        ? new Set([studentId])
        : new Set<string>();

    setBulkRentalDraft({
      startPeriodId: activePeriodId,
      endPeriodId: activePeriodId,
      rentalNote: "",
      overwriteExisting: false,
      selectedStudentIds,
    });
  }

  function updateBulkRentalPeriodRange(value: { startPeriodId?: string; endPeriodId?: string }) {
    setBulkRentalDraft((current) => {
      if (!current) return current;

      const next = { ...current, ...value };
      const startIndex = periods.findIndex((period) => period.periodId === next.startPeriodId);
      const endIndex = periods.findIndex((period) => period.periodId === next.endPeriodId);

      if (startIndex === -1 || endIndex === -1) {
        return next;
      }

      if (value.startPeriodId && startIndex > endIndex) {
        next.endPeriodId = next.startPeriodId;
      }

      if (value.endPeriodId && endIndex < startIndex) {
        next.startPeriodId = next.endPeriodId;
      }

      return next;
    });
  }

  function updateBulkRentalDraft(value: Partial<Omit<BulkRentalDraft, "selectedStudentIds">>) {
    setBulkRentalDraft((current) => (current ? { ...current, ...value } : current));
  }

  function toggleBulkRentalStudent(studentId: string) {
    setBulkRentalDraft((current) => {
      if (!current) return current;

      const nextStudentIds = new Set(current.selectedStudentIds);
      if (nextStudentIds.has(studentId)) {
        nextStudentIds.delete(studentId);
      } else {
        const targetPeriods = getPeriodRange(
          periods,
          current.startPeriodId,
          current.endPeriodId,
        );
        if (getCheckablePeriodCountForStudent(studentId, targetPeriods) === 0) {
          return current;
        }
        nextStudentIds.add(studentId);
      }

      return { ...current, selectedStudentIds: nextStudentIds };
    });
  }

  function selectDefaultBulkRentalStudents() {
    setBulkRentalDraft((current) => {
      if (!current) return current;
      const targetPeriods = getPeriodRange(
        periods,
        current.startPeriodId,
        current.endPeriodId,
      );

      return {
        ...current,
        selectedStudentIds: new Set(
          visibleStudents
            .filter(
              (student) =>
                getCheckablePeriodCountForStudent(student.id, targetPeriods) > 0,
            )
            .map((student) => student.id),
        ),
      };
    });
  }

  async function applyBulkRental() {
    if (!bulkRentalDraft) {
      return;
    }

    const studentIds = Array.from(bulkRentalDraft.selectedStudentIds);
    if (studentIds.length === 0) {
      toast.error("일괄 대여할 학생을 선택해주세요.");
      return;
    }

    const targetPeriods = getPeriodRange(
      periods,
      bulkRentalDraft.startPeriodId,
      bulkRentalDraft.endPeriodId,
    );
    if (targetPeriods.length === 0) {
      toast.error("대여할 교시 범위를 확인해주세요.");
      return;
    }

    const isCellSaving = Object.values(cellSaveStatesRef.current).some(
      (state) => state.status === "saving",
    );

    if (isCellSaving) {
      toast.error("개별 저장이 끝난 뒤 일괄 대여를 실행해주세요.");
      return;
    }

    setIsSavingBulkRental(true);
    try {
      const res = await fetch(`/api/${divisionSlug}/phone-submissions/bulk-rental`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          studentIds,
          startPeriodId: bulkRentalDraft.startPeriodId,
          endPeriodId: bulkRentalDraft.endPeriodId,
          rentalNote: bulkRentalDraft.rentalNote || undefined,
          overwriteExisting: bulkRentalDraft.overwriteExisting,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "일괄 대여 저장에 실패했습니다.");
        return;
      }

      const data = (await res.json()) as {
        snapshot: PhoneDaySnapshot;
        result: {
          appliedCount: number;
          updatedExistingCount: number;
          skippedAttendanceCount: number;
          skippedExistingCount: number;
          targetCellCount: number;
        };
      };
      const selectedStudentIdSet = new Set(studentIds);
      const targetPeriodIdSet = new Set(targetPeriods.map((period) => period.periodId));
      const appliedCellKeys = getBulkRentalAppliedCellKeys(
        data.snapshot,
        selectedStudentIdSet,
        targetPeriodIdSet,
      );
      const appliedCellKeySet = new Set(appliedCellKeys);
      const preservedDirtyKeys = new Set(dirtyCellKeysRef.current);

      appliedCellKeySet.forEach((key) => {
        preservedDirtyKeys.delete(key);
      });

      setSnapshot(data.snapshot);
      setPeriodsState((current) =>
        buildStateFromSnapshot(data.snapshot, current, preservedDirtyKeys),
      );
      dirtyCellKeysRef.current = preservedDirtyKeys;
      setDirtyCellKeys(preservedDirtyKeys);
      setCellSaveStates((current) => {
        const next = { ...current };
        appliedCellKeySet.forEach((key) => {
          next[key] = { status: "saved" };
        });
        return next;
      });
      setBulkRentalDraft(null);
      toast.success(
        `일괄 대여 적용: 신규 ${data.result.appliedCount}건, 갱신 ${data.result.updatedExistingCount}건`,
      );
    } finally {
      setIsSavingBulkRental(false);
    }
  }

  const activePeriodStats = useMemo(() => {
    let submittedCount = 0;
    let notSubmittedCount = 0;
    let rentedCount = 0;
    let uncheckedCount = 0;
    let checkableStudentCount = 0;

    students.forEach((student) => {
      if (!isStudentCheckableForPeriod(activePeriodId, student.id)) {
        return;
      }

      checkableStudentCount += 1;
      const entry = activePeriodState[student.id] ?? { status: null, rentalNote: "" };

      if (entry.status === "SUBMITTED") {
        submittedCount += 1;
        return;
      }

      if (entry.status === "NOT_SUBMITTED") {
        notSubmittedCount += 1;
        return;
      }

      if (entry.status === "RENTED") {
        rentedCount += 1;
        return;
      }

      uncheckedCount += 1;
    });

    return {
      submittedCount,
      notSubmittedCount,
      rentedCount,
      uncheckedCount,
      checkableStudentCount,
      attendanceUnprocessedCount: activePeriod?.attendanceUnprocessedCount ?? 0,
      attendanceBlockedCount: activePeriod?.attendanceBlockedCount ?? 0,
    };
  }, [activePeriod, activePeriodId, activePeriodState, isStudentCheckableForPeriod, students]);

  const visibleStudents = useMemo(
    () =>
      filteredStudents
        .filter((student) => {
          if (studentFilterMode !== "unchecked") {
            return true;
          }

          return (
            isStudentCheckableForPeriod(activePeriodId, student.id) &&
            (activePeriodState[student.id]?.status ?? null) === null
          );
        })
        .sort((left, right) => {
          const rankFor = (student: PhoneDaySnapshot["students"][number]) => {
            if (!isStudentCheckableForPeriod(activePeriodId, student.id)) return 5;
            const status = activePeriodState[student.id]?.status ?? null;
            if (status === null) return 0;
            if (status === "NOT_SUBMITTED") return 1;
            if (status === "RENTED") return 2;
            if (status === "SUBMITTED") return 3;
            return 4;
          };

          return rankFor(left) - rankFor(right) || comparePhoneStudents(left, right);
        }),
    [activePeriodId, activePeriodState, filteredStudents, isStudentCheckableForPeriod, studentFilterMode],
  );

  const activeSaveStateByStudentId = useMemo(
    () =>
      Object.fromEntries(
        students.map((student) => [
          student.id,
          cellSaveStates[getPhoneCellKey(activePeriodId, student.id)]?.status,
        ]),
      ) as Record<string, PhoneSaveState | undefined>,
    [activePeriodId, cellSaveStates, students],
  );

  const bulkRentalTargetPeriods = bulkRentalDraft
    ? getPeriodRange(periods, bulkRentalDraft.startPeriodId, bulkRentalDraft.endPeriodId)
    : [];
  const bulkRentalSelectedCount = bulkRentalDraft?.selectedStudentIds.size ?? 0;
  const bulkRentalSelectedTargetCellCount = bulkRentalDraft
    ? Array.from(bulkRentalDraft.selectedStudentIds).reduce(
        (sum, studentId) =>
          sum + getCheckablePeriodCountForStudent(studentId, bulkRentalTargetPeriods),
        0,
      )
    : 0;
  const bulkRentalRangeLabel =
    bulkRentalTargetPeriods.length === 0
      ? "범위 없음"
      : bulkRentalTargetPeriods.length === 1
        ? bulkRentalTargetPeriods[0].periodName
        : `${bulkRentalTargetPeriods[0].periodName}~${
            bulkRentalTargetPeriods[bulkRentalTargetPeriods.length - 1].periodName
          }`;

  return (
    <div className="space-y-5">
      <UnsavedChangesGuard isDirty={isDirty} />
      {/* 날짜 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          max={getKstToday()}
          onChange={(e) => handleDateChange(e.target.value)}
          className="rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
        />
        <button
          type="button"
          onClick={() => loadSnapshot(date)}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          새로고침
        </button>
        {hasSeatLayout && (
          <div className="ml-auto flex gap-1 rounded-[10px] border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition ${
                viewMode === "table"
                  ? "bg-[var(--division-color)] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Table2 className="mr-1 inline h-3.5 w-3.5" />
              테이블
            </button>
            <button
              type="button"
              onClick={() => setViewMode("seat")}
              className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition ${
                viewMode === "seat"
                  ? "bg-[var(--division-color)] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutGrid className="mr-1 inline h-3.5 w-3.5" />
              좌석
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="이름, 수험번호, 연락처, 좌석, 강의실로 검색"
            className="w-full rounded-[10px] border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
          {hasSearchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
              aria-label="검색어 지우기"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-[8px] border border-slate-200 bg-slate-50 p-1">
            {[
              { value: "all" as const, label: "전체" },
              { value: "unchecked" as const, label: "미체크만" },
            ].map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStudentFilterMode(filter.value)}
                className={`rounded-[7px] px-3 py-1.5 text-xs font-semibold transition ${
                  studentFilterMode === filter.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {visibleStudents.length}명 표시 / 검색 {filteredStudents.length}명 / 전체 {students.length}명
          </div>
        </div>
      </div>

      {periods.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-16 text-center text-sm text-slate-500">
          활성화된 교시가 없습니다.
        </div>
      ) : (
        <>
          {/* 교시 탭 */}
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-1 rounded-[10px] border border-slate-200 bg-slate-50 p-1.5">
              {periods.map((period) => {
                const isActive = period.periodId === activePeriodId;
                return (
                  <button
                    key={period.periodId}
                    type="button"
                    onClick={() => setActivePeriodId(period.periodId)}
                    className={`shrink-0 rounded-[10px] px-4 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-[var(--division-color)] text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {period.periodName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 선택된 교시 내용 */}
          {activePeriod && (
            <div className="space-y-4">
              {/* 교시 정보 + 통계 */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {activePeriod.periodName}
                    {activePeriod.periodLabel && (
                      <span className="ml-1.5 text-slate-500">({activePeriod.periodLabel})</span>
                    )}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {activePeriod.startTime}–{activePeriod.endTime}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                    반납 {activePeriodStats.submittedCount}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                    미반납 {activePeriodStats.notSubmittedCount}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-700/20">
                    대여 {activePeriodStats.rentedCount}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                    체크대상 {activePeriodStats.checkableStudentCount}
                  </span>
                  {activePeriodStats.uncheckedCount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                      미체크 {activePeriodStats.uncheckedCount}
                    </span>
                  )}
                  {snapshot.attendanceIntegrationEnabled && activePeriodStats.attendanceUnprocessedCount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                      출결 미확인 {activePeriodStats.attendanceUnprocessedCount}
                    </span>
                  )}
                  {snapshot.attendanceIntegrationEnabled && activePeriodStats.attendanceBlockedCount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                      체크 제외 {activePeriodStats.attendanceBlockedCount}
                    </span>
                  )}
                </div>
              </div>

              {/* 빠른 설정 + 저장 */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAllForPeriod(activePeriodId, "SUBMITTED", visibleStudents)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  표시 학생 반납
                </button>
                <button
                  type="button"
                  onClick={() => setAllForPeriod(activePeriodId, "NOT_SUBMITTED", visibleStudents)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  표시 학생 미반납
                </button>
                <button
                  type="button"
                  onClick={() => openBulkRentalModal()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  <Phone className="h-3.5 w-3.5" />
                  일괄 대여
                </button>
                <button
                  type="button"
                  onClick={() => savePeriod(activePeriodId)}
                  disabled={savingPeriodId === activePeriodId || isLoading}
                  className="ml-auto inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingPeriodId === activePeriodId ? "저장 중..." : "저장"}
                </button>
              </div>

              {/* 학생 목록 */}
              {visibleStudents.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500">
                  {studentFilterMode === "unchecked"
                    ? "미체크 학생이 없습니다."
                    : hasSearchQuery
                      ? "검색 조건에 맞는 학생이 없습니다."
                      : "재원 학생이 없습니다."}
                </div>
              ) : viewMode === "table" ? (
                <PhoneCheckTable
                  students={visibleStudents}
                  periodState={activePeriodState}
                  attendanceByStudentId={activeAttendanceByStudentId}
                  attendanceIntegrationEnabled={snapshot.attendanceIntegrationEnabled}
                  saveStateByStudentId={activeSaveStateByStudentId}
                  onStatusChange={(studentId, status) =>
                    setStudentStatus(activePeriodId, studentId, status)
                  }
                  onRentalNoteChange={(studentId, note) =>
                    setRentalNote(activePeriodId, studentId, note)
                  }
                  onRentalNoteCommit={(studentId) => commitRentalNote(activePeriodId, studentId)}
                  onOpenBulkRental={(studentId) => openBulkRentalModal(studentId)}
                />
              ) : seatRooms && seatRooms.length > 0 && initialSeatLayout ? (
                <div className="space-y-4">
                  {hasSearchQuery ? (
                    <div className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      검색 조건에 맞는 학생만 좌석도에 표시됩니다.
                    </div>
                  ) : null}
                  <PhoneCheckSeatMap
                    divisionSlug={divisionSlug}
                    rooms={seatRooms}
                    initialSeatLayout={initialSeatLayout}
                    students={visibleStudents}
                    periodState={activePeriodState}
                    attendanceByStudentId={activeAttendanceByStudentId}
                    attendanceIntegrationEnabled={snapshot.attendanceIntegrationEnabled}
                    saveStateByStudentId={activeSaveStateByStudentId}
                    onStatusChange={(studentId, status) =>
                      setStudentStatus(activePeriodId, studentId, status)
                    }
                    onRentalNoteChange={(studentId, note) =>
                      setRentalNote(activePeriodId, studentId, note)
                    }
                    onRentalNoteCommit={(studentId) => commitRentalNote(activePeriodId, studentId)}
                    onOpenBulkRental={(studentId) => openBulkRentalModal(studentId)}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleStudents.map((student) => {
                    const entry = activePeriodState[student.id] ?? { status: null, rentalNote: "" };
                    const attendanceCell = activeAttendanceByStudentId.get(student.id);
                    const isCheckable =
                      !snapshot.attendanceIntegrationEnabled || Boolean(attendanceCell?.checkable);
                    const { status, rentalNote } = entry;
                    const saveState = activeSaveStateByStudentId[student.id];

                    const cardBg =
                      !isCheckable
                        ? "border-slate-100 bg-slate-50/80 opacity-75"
                        : status === "SUBMITTED"
                        ? "border-green-100 bg-green-50/30"
                        : status === "NOT_SUBMITTED"
                          ? "border-red-100 bg-red-50/30"
                          : status === "RENTED"
                            ? "border-sky-100 bg-sky-50/30"
                            : "border-slate-100 bg-white";

                    return (
                      <div
                        key={student.id}
                        className={`rounded-[10px] border p-3 transition ${cardBg}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => openBulkRentalModal(student.id)}
                              className="text-left text-sm font-semibold text-slate-900 underline-offset-4 transition hover:text-sky-700 hover:underline"
                            >
                              {student.name}
                            </button>
                            <p className="text-xs text-slate-500">
                              {student.studentNumber}
                              {student.studyTrack && ` · ${student.studyTrack}`}
                            </p>
                            <span
                              className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getAttendanceBadgeClassName(
                                attendanceCell,
                                snapshot.attendanceIntegrationEnabled,
                              )}`}
                            >
                              {snapshot.attendanceIntegrationEnabled
                                ? getAttendanceStatusLabel(attendanceCell?.status)
                                : "출결 연동 없음"}
                            </span>
                            {saveState ? (
                              <span
                                className={`ml-1 mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  saveState === "saving"
                                    ? "bg-amber-50 text-amber-700"
                                    : saveState === "saved"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-red-50 text-red-700"
                                }`}
                              >
                                {saveState === "saving"
                                  ? "저장 중"
                                  : saveState === "saved"
                                    ? "저장됨"
                                    : "저장 실패"}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            {isCheckable ? (
                              PHONE_CHECK_STATUS_OPTIONS.map((s) => (
                                <PhoneStatusCheckButton
                                  key={s}
                                  status={s}
                                  selected={status === s}
                                  disabled={saveState === "saving"}
                                  onClick={() =>
                                    setStudentStatus(activePeriodId, student.id, status === s ? null : s)
                                  }
                                  className="min-w-[74px]"
                                />
                              ))
                            ) : (
                              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-400">
                                체크 없음
                              </span>
                            )}
                          </div>
                        </div>
                        {isCheckable && status === "RENTED" && (
                          <div className="mt-2">
                            <input
                              type="text"
                              value={rentalNote}
                              onChange={(e) =>
                                setRentalNote(activePeriodId, student.id, e.target.value)
                              }
                              onBlur={() => commitRentalNote(activePeriodId, student.id)}
                              placeholder="대여 사유 (예: 인강 수강)"
                              maxLength={200}
                              className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-xs outline-none transition focus:border-slate-400 placeholder:text-slate-400"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <Modal
        open={bulkRentalDraft !== null}
        title="휴대폰 일괄 대여"
        description="선택한 학생에게 지정한 교시 범위의 대여 상태를 적용합니다."
        badge="대여"
        widthClassName="max-w-2xl"
        onClose={() => setBulkRentalDraft(null)}
      >
        {bulkRentalDraft ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                시작 교시
                <select
                  value={bulkRentalDraft.startPeriodId}
                  onChange={(event) =>
                    updateBulkRentalPeriodRange({ startPeriodId: event.target.value })
                  }
                  className="mt-1.5 h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                >
                  {periods.map((period) => (
                    <option key={period.periodId} value={period.periodId}>
                      {period.periodName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                종료 교시
                <select
                  value={bulkRentalDraft.endPeriodId}
                  onChange={(event) =>
                    updateBulkRentalPeriodRange({ endPeriodId: event.target.value })
                  }
                  className="mt-1.5 h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                >
                  {periods.map((period) => (
                    <option key={period.periodId} value={period.periodId}>
                      {period.periodName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-xs font-semibold text-slate-600">
              대여 메모
              <input
                type="text"
                value={bulkRentalDraft.rentalNote}
                onChange={(event) => updateBulkRentalDraft({ rentalNote: event.target.value })}
                placeholder="예: 인강 수강"
                maxLength={200}
                className="mt-1.5 h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400 placeholder:text-slate-400"
              />
            </label>

            <button
              type="button"
              onClick={() =>
                updateBulkRentalDraft({
                  overwriteExisting: !bulkRentalDraft.overwriteExisting,
                })
              }
              className={`w-full rounded-[10px] border px-3 py-2.5 text-left text-xs font-semibold transition ${
                bulkRentalDraft.overwriteExisting
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              기존 반납/미반납 기록도 대여로 덮어쓰기
            </button>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-600">
                    학생 선택 {bulkRentalSelectedCount}명 · 적용 {bulkRentalSelectedTargetCellCount}칸
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                    범위 {bulkRentalRangeLabel}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectDefaultBulkRentalStudents}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    범위 출석자 선택
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBulkRentalDraft((current) =>
                        current ? { ...current, selectedStudentIds: new Set() } : current,
                      )
                    }
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    선택 해제
                  </button>
                </div>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto rounded-[10px] border border-slate-200 p-2">
                {visibleStudents.map((student) => {
                  const checkablePeriodCount = getCheckablePeriodCountForStudent(
                    student.id,
                    bulkRentalTargetPeriods,
                  );
                  const isSelectable = checkablePeriodCount > 0;
                  const selected = bulkRentalDraft.selectedStudentIds.has(student.id);

                  return (
                    <label
                      key={student.id}
                      className={`flex items-center gap-3 rounded-[10px] border px-3 py-2 transition ${
                        selected
                          ? "border-sky-200 bg-sky-50"
                          : isSelectable
                            ? "cursor-pointer border-slate-100 bg-white hover:bg-slate-50"
                            : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!isSelectable}
                        onChange={() => toggleBulkRentalStudent(student.id)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">
                          {student.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {student.studentNumber}
                          {student.seatDisplay ? ` · ${student.seatDisplay}` : ""}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getBulkRentalRangeBadgeClassName(
                          checkablePeriodCount,
                          bulkRentalTargetPeriods.length,
                          snapshot.attendanceIntegrationEnabled,
                        )}`}
                      >
                        {snapshot.attendanceIntegrationEnabled
                          ? `적용 ${checkablePeriodCount}/${bulkRentalTargetPeriods.length}교시`
                          : "출결 연동 없음"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={applyBulkRental}
              disabled={
                isSavingBulkRental ||
                bulkRentalSelectedCount === 0 ||
                bulkRentalSelectedTargetCellCount === 0
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSavingBulkRental ? "저장 중..." : "일괄 대여 저장"}
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
