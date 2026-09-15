"use client";
import { MobileWorkspaceTools } from "@/components/ui/MobileWorkspaceTools";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { LoaderCircle, Plus, RefreshCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "@/lib/sonner";

import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";
import { DialogActions } from "@/components/ui/DialogActions";
import { SlideOver } from "@/components/ui/SlideOver";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";
import { AdminTabPanel, AdminTabs } from "@/components/ui/AdminTabs";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
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
  const [activeTab, setActiveTab] = useState<"list" | "layout">("list");
  const [roomEditor, setRoomEditor] = useState<"edit" | "new" | null>(null);
  const [roomSnapshot, setRoomSnapshot] = useState<{ form: RoomFormState; seats: DraftSeat[]; dirty: boolean } | null>(null);
  const roomFormId = useId();
  const [saveSuccessModal, setSaveSuccessModal] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

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

  useEffect(() => {
    if (roomEditor === "edit" && !roomSnapshot && !isLoadingLayout && layout.room?.id === selectedRoomId) {
      setRoomSnapshot({ form: roomForm, seats: draftSeats, dirty: isDirty });
    }
  }, [roomEditor, roomSnapshot, isLoadingLayout, layout.room?.id, selectedRoomId, roomForm, draftSeats, isDirty]);

  async function selectRoom(roomId: string, edit: boolean) {
    if (edit && isDirty) {
      toast.error("좌석 변경사항을 먼저 저장한 후 자습실 설정을 수정해 주세요.");
      return;
    }
    if (roomId !== selectedRoomId && isDirty && !await confirm({
      title: "자습실 변경", description: "저장하지 않은 좌석 변경사항을 폐기하고 다른 자습실을 여시겠습니까?",
      confirmLabel: "변경 폐기", cancelLabel: "계속 편집", variant: "warning",
    })) return;
    setSelectedRoomId(roomId);
    if (edit) { setRoomSnapshot(null); setRoomEditor("edit"); }
    else setActiveTab("layout");
  }

  async function closeRoomEditor() {
    if (isSavingRoom || isCreatingRoom || isDeletingRoom) return;
    const current = roomEditor === "new" ? newRoomForm : roomForm;
    if (roomSnapshot && JSON.stringify(current) !== JSON.stringify(roomSnapshot.form)) {
      if (!await confirm({ title: "변경사항 폐기", description: "저장하지 않은 자습실 정보가 있습니다.", confirmLabel: "변경 폐기", cancelLabel: "계속 편집", variant: "warning" })) return;
    }
    if (roomSnapshot) {
      if (roomEditor === "new") setNewRoomForm(roomSnapshot.form);
      else { setRoomForm(roomSnapshot.form); setDraftSeats(roomSnapshot.seats); setIsDirty(roomSnapshot.dirty); }
    }
    setRoomEditor(null); setRoomSnapshot(null);
  }

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
    if (isCreatingRoom || isDirty) {
      if (isDirty) toast.error("좌석 변경사항을 먼저 저장한 후 자습실을 추가해 주세요.");
      return;
    }
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
      setRoomEditor(null); setRoomSnapshot(null);
      setNewRoomForm({ name: "", columns: 9, rows: 6, aisleColumnsText: "5", isActive: true });
      await refreshRooms(room.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "자습실 생성에 실패했습니다.");
    } finally {
      setIsCreatingRoom(false);
    }
  }

  async function handleSaveRoom() {
    if (isSavingRoom || isLoadingLayout || isDeletingRoom) return;
    if (!selectedRoomId) {
      toast.error("먼저 자습실을 선택해 주세요.");
      return;
    }

    setIsSavingRoom(true);

    try {
      await persistRoomConfiguration(selectedRoomId, { showSuccessToast: true });
      setRoomEditor(null); setRoomSnapshot(null);
      await refreshRooms(selectedRoomId);
      await loadLayout(selectedRoomId);
      setSaveSuccessModal({
        title: "자습실 정보 저장 완료",
        description: "자습실 정보 변경이 저장되어 현재 좌석 편집 화면에 반영되었습니다.",
      });
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

    const confirmed = await confirm({
      title: "자습실 삭제",
      description: `"${currentRoom.name}" 자습실을 삭제하시겠습니까? 좌석 배치와 배정 정보도 함께 정리됩니다.`,
      confirmLabel: "삭제",
      cancelLabel: "취소",
      variant: "danger",
    });
    if (!confirmed) {
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
      setRoomEditor(null); setRoomSnapshot(null);
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
      setSaveSuccessModal({
        title: hasRoomConfigurationChanges ? "좌석 설정 저장 완료" : "좌석 배치 저장 완료",
        description: hasRoomConfigurationChanges
          ? "자습실 정보와 좌석 배치 변경이 저장되어 현재 편집 화면에 반영되었습니다."
          : "좌석 배치 변경이 저장되어 현재 편집 화면에 반영되었습니다.",
      });
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
    <>
      <UnsavedChangesGuard
        isDirty={isDirty}
        message="저장하지 않은 좌석 변경사항이 있습니다. 페이지를 이동하면 현재 좌석 배치 수정 내용이 사라집니다."
      />

      <section className="admin-metric-strip" aria-label="자습실 현황 요약">
        <article className="admin-metric-box">
          <p className="admin-metric-box-label">자습실 수</p>
          <p className="admin-metric-box-value">{rooms.length}개</p>
        </article>
        <article className="admin-metric-box">
          <p className="admin-metric-box-label">운영 좌석</p>
          <p className="admin-metric-box-value">{activeSeatCount}석</p>
        </article>
        <article className="admin-metric-box">
          <p className="admin-metric-box-label">배정 학생</p>
          <p className="admin-metric-box-value">{assignedSeatCount}명</p>
        </article>
        <article className="admin-metric-box">
          <p className="admin-metric-box-label">즉시 배정 가능</p>
          <p className="admin-metric-box-value">{availableSeatCount}석</p>
        </article>
      </section>

      <AdminTabs
        items={[
          { id: "list", label: "자습실 목록" },
          { id: "layout", label: "좌석 배치", disabled: !selectedRoomId },
        ]}
        activeId={activeTab}
        onChange={setActiveTab}
        label="자습실과 좌석 설정 구분"
        idPrefix="seat-settings"
        variant="secondary"
      />

      <AdminTabPanel id="list" activeId={activeTab} idPrefix="seat-settings" className="mt-6">
        <section className="admin-section">
          <MobileWorkspaceTools title="자습실 목록 작업" active={activeTab === "list"}>
          <div className="admin-workspace-toolbar">
            <h2 className="admin-section-title">자습실 목록</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="admin-text-action inline-flex items-center gap-2" disabled={isRefreshingRooms} onClick={() => void refreshRooms(selectedRoomId)}><RefreshCcw className="h-4 w-4" />새로고침</button>
              <button type="button" className="admin-button admin-button-primary" onClick={() => { setRoomSnapshot({ form: newRoomForm, seats: [], dirty: false }); setRoomEditor("new"); }}><Plus className="h-4 w-4" />자습실 추가</button>
            </div>
          </div>
          </MobileWorkspaceTools>
          {rooms.length ? <div className="admin-table-frame"><table aria-label="자습실 목록">
            <thead><tr><th scope="col">자습실</th><th scope="col" className="hidden md:table-cell">구조</th><th scope="col">좌석 / 배정</th><th scope="col" className="hidden md:table-cell">상태</th><th scope="col">좌석 배치</th></tr></thead>
            <tbody>{rooms.map((room) => <tr key={room.id}>
              <td className="admin-table-name"><button type="button" className="admin-table-link" onClick={() => void selectRoom(room.id, true)}>{room.name}</button><span className="admin-help block md:hidden">{room.isActive ? "운영 중" : "비활성"} · {room.columns}열 {room.rows}행</span></td>
              <td className="hidden md:table-cell">{room.columns}열 · {room.rows}행</td>
              <td>{room.seatsCount}석 / {room.assignedStudentsCount}명</td>
              <td className="hidden md:table-cell">{room.isActive ? "운영 중" : "비활성"}</td>
              <td><button type="button" className="admin-table-link" aria-label={room.name + " 좌석 배치"} onClick={() => void selectRoom(room.id, false)}>배치 보기</button></td>
            </tr>)}</tbody>
          </table></div> : <p className="admin-empty-state">등록된 자습실이 없습니다.</p>}
        </section>
      </AdminTabPanel>
      <SlideOver open={Boolean(roomEditor)} title={roomEditor === "new" ? "자습실 추가" : "자습실 설정"} onClose={() => void closeRoomEditor()}>
        <form id={roomFormId} onSubmit={(event) => { event.preventDefault(); if (roomEditor === "new") void handleCreateRoom(); else void handleSaveRoom(); }} className="space-y-6">
          {roomEditor === "edit" && !roomSnapshot ? <p className="admin-empty-state">자습실 정보를 불러오는 중입니다.</p> : (() => {
            const value = roomEditor === "new" ? newRoomForm : roomForm;
            const update = (patch: Partial<RoomFormState>) => roomEditor === "new" ? setNewRoomForm((current) => ({ ...current, ...patch })) : updateRoomForm(patch);
            return <fieldset className="admin-panel" disabled={isSavingRoom || isCreatingRoom || isDeletingRoom}>
              <label className="admin-form-row"><span className="admin-form-row-label">자습실 이름</span><span className="admin-form-row-control w-full md:w-auto"><input required value={value.name} onChange={(event) => update({ name: event.target.value })} className="w-full" /></span></label>
              <label className="admin-form-row"><span className="admin-form-row-label">복도 열 번호</span><span className="admin-form-row-control w-full md:w-auto"><input value={value.aisleColumnsText} onChange={(event) => update({ aisleColumnsText: event.target.value })} placeholder="예: 5, 10" className="w-full" /></span></label>
              <label className="admin-form-row"><span className="admin-form-row-label">열 수</span><span className="admin-form-row-control w-full md:w-auto"><input type="number" min={3} max={20} required value={value.columns} onChange={(event) => update({ columns: Number(event.target.value) })} className="w-full" /></span></label>
              <label className="admin-form-row"><span className="admin-form-row-label">행 수</span><span className="admin-form-row-control w-full md:w-auto"><input type="number" min={2} max={20} required value={value.rows} onChange={(event) => update({ rows: Number(event.target.value) })} className="w-full" /></span></label>
              <label className="admin-form-row"><span className="admin-form-row-label">운영 상태</span><span className="admin-form-row-control flex w-full items-center gap-3 md:w-auto"><input type="checkbox" checked={value.isActive} onChange={(event) => update({ isActive: event.target.checked })} /><span>운영 중</span></span></label>
            </fieldset>;
          })()}
          <DialogActions>
            {roomEditor === "edit" ? <button type="button" onClick={() => void handleDeleteRoom()} disabled={!roomSnapshot || isSavingRoom || isDeletingRoom} className="admin-button admin-button-danger-outline mr-auto"><Trash2 className="h-4 w-4" />삭제</button> : null}
            <button type="button" className="admin-button" disabled={isSavingRoom || isCreatingRoom || isDeletingRoom} onClick={() => void closeRoomEditor()}>취소</button>
            <button type="submit" form={roomFormId} disabled={!roomSnapshot || isSavingRoom || isCreatingRoom || isDeletingRoom} className="admin-button admin-button-primary">{isSavingRoom || isCreatingRoom ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}저장</button>
          </DialogActions>
        </form>
      </SlideOver>
      <AdminTabPanel id="layout" activeId={activeTab} idPrefix="seat-settings" className="mt-6">
      <article className="admin-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="admin-section-title">
              {currentRoom?.name ?? "자습실"} 좌석 배치
            </h2>
            <p className="admin-help mt-2 leading-6">
              통로를 제외한 모든 칸이 좌석으로 기본 생성되며, 좌석 번호와 학생 배정, 활성 상태를 바로 수정할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyDefaultLayout}
              disabled={!selectedRoomId || isSavingLayout}
              className="admin-button"
            >
              <Sparkles className="h-4 w-4" />
              기본 배치 생성
            </button>
            <button
              type="button"
              onClick={handleSaveLayout}
              disabled={!selectedRoomId || isSavingLayout || isLoadingLayout}
              className="admin-button admin-button-primary"
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
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${getStudyTrackBadgeClasses(item.track)}`}
              >
                {getStudyTrackShortLabel(item.track)}
                <span className="opacity-80">{item.count}명</span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="admin-notice mt-4">
          학생이 배정된 좌석은 드래그해서 다른 빈 좌석으로 바로 이동할 수 있습니다. 이미 학생이 있는 좌석에는 덮어쓸 수 없습니다.
        </div>

        {isLoadingLayout ? (
          <div className="admin-help mt-6 px-4 py-8 text-center">
            좌석 배치를 불러오는 중입니다.
          </div>
        ) : selectedRoomId ? (
          <>
            {isMultiSelect ? (
              <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-950">{allSelectedSeats.length}개 좌석 선택</span>
                  <span className="admin-help">(Shift+클릭으로 추가/해제)</span>
                </div>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
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
                  className="admin-button admin-button-danger-outline"
                >
                  <Trash2 className="h-4 w-4" />
                  선택 좌석 해제
                </button>
                <button
                  type="button"
                  onClick={() => setExtraSelectedLocalIds(new Set())}
                  className="admin-button"
                >
                  선택 해제
                </button>
              </div>
            ) : (
              <div className="admin-help mt-6 px-4 py-4 text-center">
                좌석을 클릭하면 편집 모달이 열립니다. <span className="text-slate-400">(Shift+클릭으로 다중 선택)</span>
              </div>
            )}

            {movingSeatId ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-sky-700">
                좌석 이동을 반영하는 중입니다.
              </div>
            ) : null}

            <div className="mt-6">
              <div className="admin-help mb-3">
                선택 자습실 <span className="font-semibold text-slate-900">{currentRoom?.name}</span>
              </div>
              <div className="admin-seat-grid overflow-x-auto">
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
          <div className="admin-help mt-6 px-4 py-8 text-center">
            자습실을 선택하면 좌석 배치를 바로 편집할 수 있습니다.
          </div>
        )}

        <SlideOver
          open={editingSeat !== null && isSeatEditModalOpen && !isMultiSelect}
          onClose={() => {
            setIsSeatEditModalOpen(false);
            setEditingLocalId(null);
          }}
          title="좌석 편집"
          badge={editingSeat ? `${editingSeat.positionX}열 ${editingSeat.positionY}행` : ""}

        >
          {editingSeat ? (
            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">좌석 번호</span>
                <input
                  value={editingSeat.label}
                  onChange={(event) => updateSelectedSeat({ label: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  placeholder="예: A-01"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">학생 배정</span>
                <select
                  value={editingSeat.assignedStudentId ?? ""}
                  onChange={(event) =>
                    updateSelectedSeat({ assignedStudentId: event.target.value || null })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
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

              <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
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
                  <span className="admin-label block">운영 좌석</span>
                  <span className="admin-help block">비활성 시 배정 제외</span>
                </span>
              </label>

              {selectedAssignedStudent ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-bold text-slate-950">{selectedAssignedStudent.name}</p>
                  <span
                    className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${getStudyTrackBadgeClasses( selectedAssignedStudent.studyTrack, )}`}
                  >
                    {formatStudyTrackLabel(selectedAssignedStudent.studyTrack)}
                  </span>
                  <span className="admin-help">{selectedAssignedStudent.studentNumber}</span>
                </div>
              ) : null}

            </div>
          ) : null}
        </SlideOver>

        <ActionCompleteModal
          open={saveSuccessModal !== null}
          onClose={() => setSaveSuccessModal(null)}
          badge="저장 완료"
          title={saveSuccessModal?.title ?? "저장 완료"}
          description={saveSuccessModal?.description}
          notice="저장된 좌석 정보는 현재 화면에 바로 반영되며, 새로고침 이후에도 유지됩니다."
        />
      </article>
      </AdminTabPanel>
      {confirmDialog}
    </>
  );
}
