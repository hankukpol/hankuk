"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus, RefreshCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/Modal";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";
import { SeatMap } from "@/components/seats/SeatMap";
import {
  buildSeatLabel,
  createDefaultSeatDraftLayout,
  getSeatPositionKey,
  normalizeAisleColumns,
} from "@/lib/seat-layout";
import type { SeatLayout, SeatMapSeat, StudyRoomItem } from "@/lib/services/seat.service";
import type { StudentListItem } from "@/lib/services/student.service";
import {
  formatStudyTrackLabel,
  getStudyTrackBadgeClasses,
  getStudyTrackShortLabel,
} from "@/lib/study-track-meta";

type SeatEditorProps = {
  divisionSlug: string;
  initialRooms: StudyRoomItem[];
  initialLayout: SeatLayout;
  students: StudentListItem[];
  expirationWarningDays?: number;
};

type DraftSeat = {
  localId: string;
  id?: string;
  label: string;
  positionX: number;
  positionY: number;
  isActive: boolean;
  assignedStudentId: string | null;
};

type RoomFormState = {
  name: string;
  columns: number;
  rows: number;
  aisleColumnsText: string;
  isActive: boolean;
};

type DraftSeatSource = {
  localId?: string;
  id?: string;
  label: string;
  positionX: number;
  positionY: number;
  isActive?: boolean;
  assignedStudentId?: string | null;
};

function buildAutoDraftSeats(
  columns: number,
  rows: number,
  aisleColumns: number[],
  existingSeats: DraftSeatSource[],
  preferredAssignmentsByLabel?: Map<string, string>,
) {
  const seatMap = new Map(
    existingSeats.map((seat) => [getSeatPositionKey(seat.positionX, seat.positionY), seat]),
  );
  const usedLabels = new Set<string>();

  return createDefaultSeatDraftLayout({ columns, rows, aisleColumns }).map((seat) => {
    const positionKey = getSeatPositionKey(seat.positionX, seat.positionY);
    const existingSeat = seatMap.get(positionKey);
    const fallbackLabel = buildSeatLabel(seat.positionX, seat.positionY, usedLabels);
    const existingLabel = existingSeat?.label.trim() ?? "";
    const normalizedLabel = existingLabel || fallbackLabel;
    const label = usedLabels.has(normalizedLabel)
      ? buildSeatLabel(seat.positionX, seat.positionY, usedLabels)
      : normalizedLabel;
    const shouldAutoReactivate = Boolean(
      existingSeat && !existingSeat.isActive && !existingLabel && !existingSeat.assignedStudentId,
    );

    usedLabels.add(label);

    return {
      localId: existingSeat?.localId ?? existingSeat?.id ?? `draft-seat-${positionKey}`,
      id: existingSeat?.id,
      label,
      positionX: seat.positionX,
      positionY: seat.positionY,
      isActive: shouldAutoReactivate ? true : existingSeat?.isActive ?? true,
      assignedStudentId:
        existingSeat?.assignedStudentId ??
        preferredAssignmentsByLabel?.get(existingLabel) ??
        preferredAssignmentsByLabel?.get(label) ??
        null,
    } satisfies DraftSeat;
  });
}

function areDraftSeatsEqual(left: DraftSeat[], right: DraftSeat[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((seat, index) => {
    const target = right[index];

    return (
      seat.localId === target.localId &&
      seat.id === target.id &&
      seat.label === target.label &&
      seat.positionX === target.positionX &&
      seat.positionY === target.positionY &&
      seat.isActive === target.isActive &&
      seat.assignedStudentId === target.assignedStudentId
    );
  });
}

function areNumberArraysEqual(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildDraftSeats(layout: SeatLayout) {
  return buildAutoDraftSeats(
    layout.columns,
    layout.rows,
    layout.aisleColumns,
    layout.seats.map((seat) => ({
      localId: seat.id,
      id: seat.id,
      label: seat.label,
      positionX: seat.positionX,
      positionY: seat.positionY,
      isActive: seat.isActive,
      assignedStudentId: seat.assignedStudent?.id ?? null,
    })),
  );
}

function buildRoomFormState(room: StudyRoomItem | null): RoomFormState {
  return {
    name: room?.name ?? "",
    columns: room?.columns ?? 9,
    rows: room?.rows ?? 6,
    aisleColumnsText: (room?.aisleColumns ?? [5]).join(", "),
    isActive: room?.isActive ?? true,
  };
}

function parseAisleColumnsText(value: string, columns: number) {
  return normalizeAisleColumns(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => Number(entry)),
    columns,
  );
}

function buildSeatMapSeats(
  draftSeats: DraftSeat[],
  students: StudentListItem[],
  roomName: string | null,
): SeatMapSeat[] {
  const studentMap = new Map(students.map((student) => [student.id, student]));

  return draftSeats.map((seat) => {
    const assignedStudent = seat.assignedStudentId ? studentMap.get(seat.assignedStudentId) ?? null : null;

    return {
      id: seat.id ?? seat.localId,
      studyRoomId: assignedStudent?.studyRoomId ?? "",
      label: seat.label,
      positionX: seat.positionX,
      positionY: seat.positionY,
      isActive: seat.isActive,
      assignedStudent: assignedStudent
        ? {
            id: assignedStudent.id,
            name: assignedStudent.name,
            studentNumber: assignedStudent.studentNumber,
            status: assignedStudent.status,
            studyTrack: assignedStudent.studyTrack,
            studyRoomName: roomName,
            courseEndDate: assignedStudent.courseEndDate,
          }
        : null,
    } satisfies SeatMapSeat;
  });
}

function summarizeTracks(seats: SeatMapSeat[]) {
  const summary = new Map<string, number>();

  seats.forEach((seat) => {
    if (!seat.assignedStudent) {
      return;
    }

    const label = formatStudyTrackLabel(seat.assignedStudent.studyTrack);
    summary.set(label, (summary.get(label) ?? 0) + 1);
  });

  return Array.from(summary.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"))
    .map(([track, count]) => ({ track, count }));
}

export function SeatEditor({
  divisionSlug,
  initialRooms,
  initialLayout,
  students: initialStudents,
  expirationWarningDays = 14,
}: SeatEditorProps) {
  const initialRoomId = initialLayout.room?.id ?? initialRooms[0]?.id ?? null;
  const [rooms, setRooms] = useState(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId);
  const [layout, setLayout] = useState(initialLayout);
  const [roomForm, setRoomForm] = useState<RoomFormState>(() => buildRoomFormState(initialLayout.room));
  const [draftSeats, setDraftSeats] = useState<DraftSeat[]>(() => buildDraftSeats(initialLayout));
  const [students, setStudents] = useState(initialStudents);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [isSeatEditModalOpen, setIsSeatEditModalOpen] = useState(false);
  const [hasSkippedInitialLayoutLoad, setHasSkippedInitialLayoutLoad] = useState(false);
  const [newRoomForm, setNewRoomForm] = useState<RoomFormState>({
    name: "",
    columns: 9,
    rows: 6,
    aisleColumnsText: "5",
    isActive: true,
  });
  const [isLoadingLayout, setIsLoadingLayout] = useState(false);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [movingSeatId, setMovingSeatId] = useState<string | null>(null);
  const [extraSelectedLocalIds, setExtraSelectedLocalIds] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);

  const assignableStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );
  const roomAssignmentMap = useMemo(
    () =>
      new Map(
        assignableStudents
          .filter((student) => student.studyRoomId === selectedRoomId && student.seatLabel)
          .map((student) => [student.seatLabel as string, student.id]),
      ),
    [assignableStudents, selectedRoomId],
  );
  const currentRoom = rooms.find((room) => room.id === selectedRoomId) ?? layout.room ?? null;
  const previewAisleColumns = useMemo(
    () => parseAisleColumnsText(roomForm.aisleColumnsText, roomForm.columns),
    [roomForm.aisleColumnsText, roomForm.columns],
  );
  const seatMapSeats = useMemo(
    () => buildSeatMapSeats(draftSeats, students, currentRoom?.name ?? null),
    [currentRoom?.name, draftSeats, students],
  );
  const selectedSeat = draftSeats.find((seat) => seat.localId === selectedLocalId) ?? null;
  const editingSeat = draftSeats.find((seat) => seat.localId === editingLocalId) ?? null;
  const allSelectedLocalIds = useMemo(() => {
    const ids = new Set(extraSelectedLocalIds);
    if (selectedLocalId) ids.add(selectedLocalId);
    return ids;
  }, [selectedLocalId, extraSelectedLocalIds]);
  const allSelectedSeats = useMemo(
    () => draftSeats.filter((seat) => allSelectedLocalIds.has(seat.localId)),
    [draftSeats, allSelectedLocalIds],
  );
  const isMultiSelect = allSelectedSeats.length > 1;
  const selectedSeatIds = useMemo(() => {
    const ids = new Set<string>();
    for (const seat of allSelectedSeats) {
      ids.add(seat.id ?? seat.localId);
    }
    return ids;
  }, [allSelectedSeats]);
  const selectedAssignedStudent = useMemo(
    () =>
      editingSeat?.assignedStudentId
        ? students.find((student) => student.id === editingSeat.assignedStudentId) ?? null
        : null,
    [editingSeat?.assignedStudentId, students],
  );
  const activeSeatCount = useMemo(() => draftSeats.filter((seat) => seat.isActive).length, [draftSeats]);
  const assignedSeatCount = useMemo(
    () => seatMapSeats.filter((seat) => Boolean(seat.assignedStudent)).length,
    [seatMapSeats],
  );
  const availableSeatCount = Math.max(activeSeatCount - assignedSeatCount, 0);
  const trackSummary = useMemo(() => summarizeTracks(seatMapSeats), [seatMapSeats]);

  async function refreshStudents() {
    const response = await fetch(`/api/${divisionSlug}/students`, { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "학생 목록을 불러오지 못했습니다.");
    }

    setStudents(data.students);
  }

  async function refreshRooms(nextRoomId?: string | null) {
    setIsRefreshingRooms(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/study-rooms`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "자습실 목록을 불러오지 못했습니다.");
      }

      const nextRooms = data.rooms as StudyRoomItem[];
      setRooms(nextRooms);
      setSelectedRoomId((current) => {
        const preferred = nextRoomId ?? current;
        return nextRooms.some((room) => room.id === preferred) ? preferred ?? null : nextRooms[0]?.id ?? null;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "자습실 목록을 불러오지 못했습니다.");
    } finally {
      setIsRefreshingRooms(false);
    }
  }

  const loadLayout = useCallback(
    async (roomId: string) => {
      setIsLoadingLayout(true);

      try {
        const response = await fetch(`/api/${divisionSlug}/seats?roomId=${roomId}`, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "좌석 배치를 불러오지 못했습니다.");
        }

        const nextLayout = data.layout as SeatLayout;
        const nextDraftSeats = buildDraftSeats(nextLayout);
        setLayout(nextLayout);
        setRoomForm(buildRoomFormState(nextLayout.room));
        setDraftSeats(nextDraftSeats);
        setSelectedLocalId(null);
        setEditingLocalId(null);
        setIsSeatEditModalOpen(false);
        setExtraSelectedLocalIds(new Set());
        setIsDirty(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "좌석 배치를 불러오지 못했습니다.");
      } finally {
        setIsLoadingLayout(false);
      }
    },
    [divisionSlug],
  );

  useEffect(() => {
    if (!selectedRoomId) {
      return;
    }

    if (!hasSkippedInitialLayoutLoad && selectedRoomId === initialRoomId) {
      setHasSkippedInitialLayoutLoad(true);
      return;
    }

    setHasSkippedInitialLayoutLoad(true);
    void loadLayout(selectedRoomId);
  }, [hasSkippedInitialLayoutLoad, initialRoomId, loadLayout, selectedRoomId]);

  useEffect(() => {
    if (selectedRoomId) {
      return;
    }

    setLayout({
      room: null,
      columns: roomForm.columns,
      rows: roomForm.rows,
      aisleColumns: previewAisleColumns,
      seats: [],
    });
    setDraftSeats([]);
    setSelectedLocalId(null);
    setEditingLocalId(null);
    setIsSeatEditModalOpen(false);
    setExtraSelectedLocalIds(new Set());
    setIsDirty(false);
  }, [previewAisleColumns, roomForm.columns, roomForm.rows, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoomId || isLoadingLayout || layout.room?.id !== selectedRoomId) {
      return;
    }

    setDraftSeats((current) => {
      const next = buildAutoDraftSeats(
        roomForm.columns,
        roomForm.rows,
        previewAisleColumns,
        current,
        roomAssignmentMap,
      );

      return areDraftSeatsEqual(current, next) ? current : next;
    });
  }, [
    isLoadingLayout,
    layout.room?.id,
    previewAisleColumns,
    roomAssignmentMap,
    roomForm.columns,
    roomForm.rows,
    selectedRoomId,
  ]);

  useEffect(() => {
    const availableIds = new Set(draftSeats.map((seat) => seat.localId));

    setSelectedLocalId((current) => (current && availableIds.has(current) ? current : null));
    setEditingLocalId((current) => (current && availableIds.has(current) ? current : null));
    setExtraSelectedLocalIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const next = new Set(Array.from(current).filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [draftSeats]);

  useEffect(() => {
    if (editingLocalId !== null) {
      return;
    }

    setIsSeatEditModalOpen(false);
  }, [editingLocalId]);

  function selectSeatByCell(positionX: number, positionY: number, seatId: string | null, shiftKey: boolean) {
    void positionX;
    void positionY;

    if (!seatId) {
      return;
    }

    const target = draftSeats.find((seat) => (seat.id ?? seat.localId) === seatId);
    if (!target) return;

    if (shiftKey) {
      setEditingLocalId(null);
      setIsSeatEditModalOpen(false);
      setExtraSelectedLocalIds((prev) => {
        const next = new Set(prev);
        if (selectedLocalId) next.add(selectedLocalId);
        if (next.has(target.localId)) {
          next.delete(target.localId);
        } else {
          next.add(target.localId);
        }
        return next;
      });
      if (!selectedLocalId) setSelectedLocalId(target.localId);
      return;
    }

    setSelectedLocalId(target.localId);
    setEditingLocalId(target.localId);
    setIsSeatEditModalOpen(true);
    setExtraSelectedLocalIds(new Set());
  }

  function updateSelectedSeat(
    value: Partial<Omit<DraftSeat, "localId" | "id" | "positionX" | "positionY">>,
  ) {
    if (!selectedSeat) {
      return;
    }

    setIsDirty(true);

    if (isMultiSelect) {
      setDraftSeats((current) =>
        current.map((seat) =>
          allSelectedLocalIds.has(seat.localId) ? { ...seat, ...value } : seat,
        ),
      );
      return;
    }

    setDraftSeats((current) =>
      current.map((seat) =>
        seat.localId === selectedSeat.localId
          ? { ...seat, ...value }
          : value.assignedStudentId && seat.assignedStudentId === value.assignedStudentId
            ? { ...seat, assignedStudentId: null }
            : seat,
      ),
    );
  }

  function updateRoomForm(value: Partial<RoomFormState>) {
    setRoomForm((current) => ({ ...current, ...value }));
    setIsDirty(true);
  }

  function applyDefaultLayout() {
    const defaults = buildAutoDraftSeats(
      roomForm.columns,
      roomForm.rows,
      previewAisleColumns,
      [],
      roomAssignmentMap,
    );

    setDraftSeats(defaults);
    setSelectedLocalId(null);
    setEditingLocalId(null);
    setIsSeatEditModalOpen(false);
    setExtraSelectedLocalIds(new Set());
    setIsDirty(true);
  }

  async function persistRoomConfiguration(
    roomId: string,
    options?: { showSuccessToast?: boolean },
  ) {
    const response = await fetch(`/api/${divisionSlug}/study-rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: roomForm.name,
        columns: roomForm.columns,
        rows: roomForm.rows,
        aisleColumns: previewAisleColumns,
        isActive: roomForm.isActive,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "자습실 수정에 실패했습니다.");
    }

    if (options?.showSuccessToast) {
      toast.success("자습실 정보를 저장했습니다.");
    }

    return data.room as StudyRoomItem;
  }

  async function handleCreateRoom() {
    setIsCreatingRoom(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/study-rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoomForm.name,
          columns: newRoomForm.columns,
          rows: newRoomForm.rows,
          aisleColumns: parseAisleColumnsText(newRoomForm.aisleColumnsText, newRoomForm.columns),
          isActive: newRoomForm.isActive,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "자습실 생성에 실패했습니다.");
      }

      const room = data.room as StudyRoomItem;
      toast.success("자습실을 생성했습니다.");
      setNewRoomForm({ name: "", columns: 9, rows: 6, aisleColumnsText: "5", isActive: true });
      await refreshRooms(room.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "자습실 생성에 실패했습니다.");
    } finally {
      setIsCreatingRoom(false);
    }
  }

  async function handleSaveRoom() {
    if (!selectedRoomId) {
      toast.error("먼저 자습실을 선택해 주세요.");
      return;
    }

    setIsSavingRoom(true);

    try {
      await persistRoomConfiguration(selectedRoomId, { showSuccessToast: true });
      await refreshRooms(selectedRoomId);
      await loadLayout(selectedRoomId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "자습실 수정에 실패했습니다.");
    } finally {
      setIsSavingRoom(false);
    }
  }

  async function handleDeleteRoom() {
    if (!selectedRoomId || !currentRoom) {
      toast.error("삭제할 자습실을 선택해 주세요.");
      return;
    }

    if (!window.confirm(`"${currentRoom.name}" 자습실을 삭제하시겠습니까?`)) {
      return;
    }

    setIsDeletingRoom(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/study-rooms/${selectedRoomId}`, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "자습실 삭제에 실패했습니다.");
      }

      toast.success("자습실을 삭제했습니다.");
      const fallbackRoomId = rooms.find((room) => room.id !== selectedRoomId)?.id ?? null;
      await refreshRooms(fallbackRoomId);
      await refreshStudents();

      if (fallbackRoomId) {
      } else {
        setSelectedRoomId(null);
        setRoomForm(buildRoomFormState(null));
        setDraftSeats([]);
        setSelectedLocalId(null);
        setEditingLocalId(null);
        setIsSeatEditModalOpen(false);
        setExtraSelectedLocalIds(new Set());
        setIsDirty(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "자습실 삭제에 실패했습니다.");
    } finally {
      setIsDeletingRoom(false);
    }
  }

  async function handleSaveLayout() {
    if (!selectedRoomId) {
      toast.error("먼저 자습실을 선택해 주세요.");
      return;
    }

    setIsSavingLayout(true);

    try {
      const hasRoomConfigurationChanges =
        currentRoom != null &&
        (currentRoom.name !== roomForm.name ||
          currentRoom.columns !== roomForm.columns ||
          currentRoom.rows !== roomForm.rows ||
          currentRoom.isActive !== roomForm.isActive ||
          !areNumberArraysEqual(currentRoom.aisleColumns, previewAisleColumns));

      const response = await fetch(`/api/${divisionSlug}/seats/layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: selectedRoomId,
          room: hasRoomConfigurationChanges
            ? {
                name: roomForm.name,
                columns: roomForm.columns,
                rows: roomForm.rows,
                aisleColumns: previewAisleColumns,
                isActive: roomForm.isActive,
              }
            : undefined,
          seats: draftSeats.map((seat) => ({
            id: seat.id,
            label: seat.label,
            positionX: seat.positionX,
            positionY: seat.positionY,
            isActive: seat.isActive,
            assignedStudentId: seat.assignedStudentId,
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "좌석 배치 저장에 실패했습니다.");
      }

      await Promise.all([refreshStudents(), refreshRooms(selectedRoomId)]);
      await loadLayout(selectedRoomId);
      toast.success(hasRoomConfigurationChanges ? "좌석 설정을 저장했습니다." : "좌석 배치를 저장했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "좌석 배치 저장에 실패했습니다.");
    } finally {
      setIsSavingLayout(false);
    }
  }

  async function handleSeatDrop(fromSeatId: string, toSeatId: string) {
    if (fromSeatId === toSeatId) {
      return;
    }

    const fromSeat = seatMapSeats.find((seat) => seat.id === fromSeatId) ?? null;
    const toSeat = seatMapSeats.find((seat) => seat.id === toSeatId) ?? null;

    if (!fromSeat?.assignedStudent) {
      return;
    }

    if (!toSeat || !toSeat.isActive) {
      toast.error("이동할 수 없는 좌석입니다.");
      return;
    }

    if (toSeat.assignedStudent && toSeat.assignedStudent.id !== fromSeat.assignedStudent.id) {
      toast.error("이미 다른 학생이 배정된 좌석입니다. 다른 빈 좌석으로 이동해 주세요.");
      return;
    }

    setMovingSeatId(fromSeatId);

    try {
      const response = await fetch(`/api/${divisionSlug}/seats/${toSeatId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: fromSeat.assignedStudent.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "좌석 이동에 실패했습니다.");
      }

      const nextLayout = data.layout as SeatLayout;
      const nextDraftSeats = buildDraftSeats(nextLayout);
      setLayout(nextLayout);
      setDraftSeats(nextDraftSeats);
      setSelectedLocalId(nextDraftSeats.find((seat) => seat.id === toSeatId)?.localId ?? null);
      setEditingLocalId(null);
      setIsSeatEditModalOpen(false);
      setExtraSelectedLocalIds(new Set());
      await Promise.all([refreshStudents(), refreshRooms(selectedRoomId)]);
      toast.success("좌석 이동이 반영되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "좌석 이동에 실패했습니다.");
    } finally {
      setMovingSeatId(null);
    }
  }

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard
        isDirty={isDirty}
        message="저장하지 않은 좌석 변경사항이 있습니다. 페이지를 이동하면 현재 좌석 배치 수정 내용이 사라집니다."
      />

      <section className="grid gap-3 md:grid-cols-4">
        <article className="rounded-[10px] border border-slate-200-slate-200 bg-white px-5 py-4 shadow-[0_12px_28px_rgba(18,32,56,0.05)]">
          <p className="text-sm font-medium text-slate-500">자습실 수</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{rooms.length}개</p>
        </article>
        <article className="rounded-[10px] border border-slate-200-slate-200 bg-white px-5 py-4 shadow-[0_12px_28px_rgba(18,32,56,0.05)]">
          <p className="text-sm font-medium text-slate-500">운영 좌석</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{activeSeatCount}석</p>
        </article>
        <article className="rounded-[10px] border border-slate-200-slate-200 bg-white px-5 py-4 shadow-[0_12px_28px_rgba(18,32,56,0.05)]">
          <p className="text-sm font-medium text-slate-500">배정 학생</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{assignedSeatCount}명</p>
        </article>
        <article className="rounded-[10px] border border-slate-200-slate-200 bg-white px-5 py-4 shadow-[0_12px_28px_rgba(18,32,56,0.05)]">
          <p className="text-sm font-medium text-slate-500">즉시 배정 가능</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{availableSeatCount}석</p>
        </article>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">자습실 목록</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">자습실 목록</h2>
            </div>
            <button
              type="button"
              onClick={() => refreshRooms(selectedRoomId)}
              disabled={isRefreshingRooms}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {isRefreshingRooms ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              새로고침
            </button>
          </div>

          <div className="mt-5 grid gap-3">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={`rounded-[10px] border px-4 py-4 text-left transition ${
                  selectedRoomId === room.id
                    ? "border-[var(--division-color)] bg-[var(--division-color)] text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-bold">{room.name}</p>
                    <p className={`mt-1 text-sm ${selectedRoomId === room.id ? "text-white/70" : "text-slate-500"}`}>
                      {room.columns}열 · {room.rows}행 · 좌석 {room.seatsCount}개
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      room.isActive
                        ? selectedRoomId === room.id
                          ? "bg-white/15 text-white"
                          : "bg-white border border-slate-200-slate-200 text-emerald-700"
                        : selectedRoomId === room.id
                          ? "bg-white/10 text-white/80"
                          : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {room.isActive ? "운영 중" : "비활성"}
                  </span>
                </div>
                <div className={`mt-3 text-xs ${selectedRoomId === room.id ? "text-white/70" : "text-slate-500"}`}>
                  배정 학생 {room.assignedStudentsCount}명
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">실별 설정</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                {currentRoom?.name ?? "자습실"} 설정
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveRoom}
                disabled={!selectedRoomId || isSavingRoom}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isSavingRoom ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                자습실 저장
              </button>
              <button
                type="button"
                onClick={handleDeleteRoom}
                disabled={!selectedRoomId || isDeletingRoom}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-white disabled:opacity-60"
              >
                {isDeletingRoom ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                자습실 삭제
              </button>
            </div>
          </div>

          {currentRoom ? (
            <>
              <div className="mt-5 grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">자습실 이름</span>
                  <input
                    value={roomForm.name}
                    onChange={(event) => updateRoomForm({ name: event.target.value })}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">복도 열 번호</span>
                  <input
                    value={roomForm.aisleColumnsText}
                    onChange={(event) => updateRoomForm({ aisleColumnsText: event.target.value })}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                    placeholder="예: 5, 10"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">열 수</span>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={roomForm.columns}
                    onChange={(event) => updateRoomForm({ columns: Number(event.target.value) || 9 })}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">행 수</span>
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={roomForm.rows}
                    onChange={(event) => updateRoomForm({ rows: Number(event.target.value) || 6 })}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </label>
              </div>

              <label className="mt-4 flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-slate-800">운영 상태</span>
                  <span className="block text-xs text-slate-500">
                    비활성 자습실은 좌석도에만 보이고 신규 배정은 막습니다.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={roomForm.isActive}
                  onChange={(event) => updateRoomForm({ isActive: event.target.checked })}
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>
            </>
          ) : (
            <div className="mt-5 rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
              먼저 자습실을 생성해 주세요.
            </div>
          )}
        </article>

        <article className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">자습실 추가</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">새 자습실 추가</h2>

          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">자습실 이름</span>
              <input
                value={newRoomForm.name}
                onChange={(event) =>
                  setNewRoomForm((current) => ({ ...current, name: event.target.value }))
                }
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: 1열람실"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">복도 열 번호</span>
              <input
                value={newRoomForm.aisleColumnsText}
                onChange={(event) =>
                  setNewRoomForm((current) => ({ ...current, aisleColumnsText: event.target.value }))
                }
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: 5, 10"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">열 수</span>
              <input
                type="number"
                min={3}
                max={20}
                value={newRoomForm.columns}
                onChange={(event) =>
                  setNewRoomForm((current) => ({
                    ...current,
                    columns: Number(event.target.value) || 9,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">행 수</span>
              <input
                type="number"
                min={2}
                max={20}
                value={newRoomForm.rows}
                onChange={(event) =>
                  setNewRoomForm((current) => ({
                    ...current,
                    rows: Number(event.target.value) || 6,
                  }))
                }
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </label>
          </div>

          <label className="mt-4 flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">운영 상태</span>
              <span className="block text-xs text-slate-500">
                비활성 자습실은 목록에는 남지만 신규 배정은 막습니다.
              </span>
            </span>
            <input
              type="checkbox"
              checked={newRoomForm.isActive}
              onChange={(event) =>
                setNewRoomForm((current) => ({ ...current, isActive: event.target.checked }))
              }
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <button
            type="button"
            onClick={handleCreateRoom}
            disabled={isCreatingRoom}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isCreatingRoom ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            자습실 추가
          </button>
        </article>
      </div>

      <article className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">좌석 배치</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {currentRoom?.name ?? "자습실"} 좌석 배치
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              통로를 제외한 모든 칸이 좌석으로 기본 생성되며, 좌석 번호와 학생 배정, 활성 상태를 바로 수정할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyDefaultLayout}
              disabled={!selectedRoomId || isSavingLayout}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              기본 배치 생성
            </button>
            <button
              type="button"
              onClick={handleSaveLayout}
              disabled={!selectedRoomId || isSavingLayout || isLoadingLayout}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isSavingLayout ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              좌석 저장
            </button>
          </div>
        </div>

        {trackSummary.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {trackSummary.map((item) => (
              <span
                key={item.track}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${getStudyTrackBadgeClasses(item.track)}`}
              >
                {getStudyTrackShortLabel(item.track)}
                <span className="opacity-80">{item.count}명</span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          학생이 배정된 좌석은 드래그해서 다른 빈 좌석으로 바로 이동할 수 있습니다. 이미 학생이 있는 좌석에는 덮어쓸 수 없습니다.
        </div>

        {isLoadingLayout ? (
          <div className="mt-6 rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
            좌석 배치를 불러오는 중입니다.
          </div>
        ) : selectedRoomId ? (
          <>
            {isMultiSelect ? (
              <div className="mt-6 flex flex-wrap items-center gap-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-950">{allSelectedSeats.length}개 좌석 선택</span>
                  <span className="text-xs text-slate-500">(Shift+클릭으로 추가/해제)</span>
                </div>
                <label className="flex items-center gap-2 rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelectedSeats.every((s) => s.isActive)}
                    onChange={(event) => {
                      const active = event.target.checked;
                      updateSelectedSeat(active ? { isActive: true } : { isActive: false });
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-800">운영 좌석</span>
                </label>
                <button
                  type="button"
                  onClick={() => setExtraSelectedLocalIds(new Set())}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-white"
                >
                  <Trash2 className="h-4 w-4" />
                  선택 좌석 해제
                </button>
                <button
                  type="button"
                  onClick={() => setExtraSelectedLocalIds(new Set())}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  선택 해제
                </button>
              </div>
            ) : (
              <div className="mt-6 rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-4 text-center text-sm text-slate-600">
                좌석을 클릭하면 편집 모달이 열립니다. <span className="text-slate-400">(Shift+클릭으로 다중 선택)</span>
              </div>
            )}

            {movingSeatId ? (
              <div className="mt-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm text-sky-700">
                좌석 이동을 반영하는 중입니다.
              </div>
            ) : null}

            <div className="mt-6">
              <div className="mb-3 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
                선택 자습실 <span className="font-semibold text-slate-900">{currentRoom?.name}</span>
              </div>
              <div className="overflow-x-auto">
                <SeatMap
                  seats={seatMapSeats}
                  columns={roomForm.columns}
                  rows={roomForm.rows}
                  aisleColumns={previewAisleColumns}
                  expirationWarningDays={expirationWarningDays}
                  selectedSeatId={selectedSeat?.id ?? selectedSeat?.localId ?? null}
                  selectedSeatIds={selectedSeatIds}
                  onCellClick={selectSeatByCell}
                  onSeatDrop={handleSeatDrop}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
            자습실을 선택하면 좌석 배치를 바로 편집할 수 있습니다.
          </div>
        )}

        <Modal
          open={editingSeat !== null && isSeatEditModalOpen && !isMultiSelect}
          onClose={() => {
            setIsSeatEditModalOpen(false);
            setEditingLocalId(null);
          }}
          title="좌석 편집"
          badge={editingSeat ? `${editingSeat.positionX}열 ${editingSeat.positionY}행` : ""}
          widthClassName="max-w-md"
        >
          {editingSeat ? (
            <div className="space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">좌석 번호</span>
                <input
                  value={editingSeat.label}
                  onChange={(event) => updateSelectedSeat({ label: event.target.value })}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                  placeholder="예: A-01"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">학생 배정</span>
                <select
                  value={editingSeat.assignedStudentId ?? ""}
                  onChange={(event) =>
                    updateSelectedSeat({ assignedStudentId: event.target.value || null })
                  }
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                  disabled={!editingSeat.isActive}
                >
                  <option value="">배정 안 함</option>
                  {assignableStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} · {student.studentNumber} · {formatStudyTrackLabel(student.studyTrack)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={editingSeat.isActive}
                  onChange={(event) => {
                    const active = event.target.checked;
                    updateSelectedSeat(active ? { isActive: true } : { isActive: false });
                  }}
                  className="h-5 w-5 rounded border-slate-300"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">운영 좌석</span>
                  <span className="block text-xs text-slate-500">비활성 시 배정 제외</span>
                </span>
              </label>

              {selectedAssignedStudent ? (
                <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-bold text-slate-950">{selectedAssignedStudent.name}</p>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStudyTrackBadgeClasses(
                      selectedAssignedStudent.studyTrack,
                    )}`}
                  >
                    {formatStudyTrackLabel(selectedAssignedStudent.studyTrack)}
                  </span>
                  <span className="text-xs text-slate-600">{selectedAssignedStudent.studentNumber}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsSeatEditModalOpen(false);
                    setEditingLocalId(null);
                  }}
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  닫기
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      </article>
    </div>
  );
}
