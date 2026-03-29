"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  CreditCard,
  LoaderCircle,
  MapPinned,
  Phone,
  Save,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { SeatMap } from "@/components/seats/SeatMap";
import type { SeatLayout, SeatOptionItem, StudyRoomItem } from "@/lib/services/seat.service";
import type { StudentDetail } from "@/lib/services/student.service";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";
import { calculateCourseEndDate } from "@/lib/tuition-meta";

type StudentFormProps = {
  divisionSlug: string;
  mode: "create" | "edit";
  initialStudent?: StudentDetail;
  canEdit?: boolean;
  showAdvancedFields?: boolean;
  hideSeatSection?: boolean;
  showSeatSectionOnly?: boolean;
  studyTrackOptions?: string[];
  seatOptions?: SeatOptionItem[];
  tuitionPlans?: TuitionPlanItem[];
  redirectOnCreate?: boolean;
  onCancel?: () => void;
  onSuccess?: (studentId: string) => void;
};

const editableStatusOptions = [
  { value: "ACTIVE", label: "재원" },
  { value: "ON_LEAVE", label: "일시중단" },
  { value: "GRADUATED", label: "수료" },
] as const;

function getInitialStatus(student?: StudentDetail) {
  if (!student || student.status === "WITHDRAWN") {
    return "ACTIVE";
  }

  return student.status;
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function getPlanDurationLabel(durationDays: number | null) {
  return durationDays ? `${durationDays}일` : "기간 자유";
}

export function StudentForm({
  divisionSlug,
  mode,
  initialStudent,
  canEdit = true,
  showAdvancedFields = false,
  hideSeatSection = false,
  showSeatSectionOnly = false,
  studyTrackOptions = [],
  seatOptions = [],
  tuitionPlans = [],
  redirectOnCreate = true,
  onCancel,
  onSuccess,
}: StudentFormProps) {
  const router = useRouter();
  const studyTrackListId = useId();
  const isWithdrawn = initialStudent?.status === "WITHDRAWN";
  const [name, setName] = useState(initialStudent?.name ?? "");
  const [studentNumber, setStudentNumber] = useState(initialStudent?.studentNumber ?? "");
  const [studyTrack, setStudyTrack] = useState(initialStudent?.studyTrack ?? "");
  const [phone, setPhone] = useState(initialStudent?.phone ?? "");
  const [seatId, setSeatId] = useState(initialStudent?.seatId ?? "");
  const [courseStartDate, setCourseStartDate] = useState(initialStudent?.courseStartDate ?? "");
  const [courseEndDate, setCourseEndDate] = useState(initialStudent?.courseEndDate ?? "");
  const [tuitionPlanId, setTuitionPlanId] = useState(initialStudent?.tuitionPlanId ?? "");
  const [tuitionAmount, setTuitionAmount] = useState(
    initialStudent?.tuitionAmount ? String(initialStudent.tuitionAmount) : "",
  );
  const [status, setStatus] = useState<(typeof editableStatusOptions)[number]["value"]>(
    getInitialStatus(initialStudent),
  );
  const [memo, setMemo] = useState(initialStudent?.memo ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [rooms, setRooms] = useState<StudyRoomItem[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [seatLayout, setSeatLayout] = useState<SeatLayout | null>(null);
  const [isSeatLayoutLoading, setIsSeatLayoutLoading] = useState(false);
  const [isSeatBrowserOpen, setIsSeatBrowserOpen] = useState(showSeatSectionOnly);
  const [hasLoadedSeatBrowser, setHasLoadedSeatBrowser] = useState(false);

  const activeTuitionPlans = useMemo(
    () => tuitionPlans.filter((plan) => plan.isActive || plan.id === initialStudent?.tuitionPlanId),
    [initialStudent?.tuitionPlanId, tuitionPlans],
  );

  const seatChoices = useMemo(
    () =>
      seatOptions
        .filter((seat) => seat.isActive || seat.id === initialStudent?.seatId)
        .map((seat) => ({
          ...seat,
          isDisabled: Boolean(seat.assignedStudentId && seat.assignedStudentId !== initialStudent?.id),
        })),
    [initialStudent?.id, initialStudent?.seatId, seatOptions],
  );

  const selectedPlan = activeTuitionPlans.find((plan) => plan.id === tuitionPlanId) ?? null;
  const selectedSeatChoice = seatChoices.find((seat) => seat.id === seatId) ?? null;
  const activeRoomSeatCount =
    seatLayout?.seats.filter((seat) => seat.isActive).length ?? 0;
  const occupiedSeatCount =
    seatLayout?.seats.filter(
      (seat) =>
        seat.isActive &&
        Boolean(seat.assignedStudent && seat.assignedStudent.id !== initialStudent?.id),
    ).length ?? 0;
  const availableSeatCount = Math.max(activeRoomSeatCount - occupiedSeatCount, 0);

  useEffect(() => {
    if (!isSeatBrowserOpen || hasLoadedSeatBrowser) {
      return;
    }

    let active = true;

    async function loadRooms() {
      try {
        const response = await fetch(`/api/${divisionSlug}/study-rooms`, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "자습실 목록을 불러오지 못했습니다.");
        }

        if (!active) {
          return;
        }

        const nextRooms = data.rooms as StudyRoomItem[];
        setRooms(nextRooms);
        setHasLoadedSeatBrowser(true);

        const preferredRoomId =
          selectedSeatChoice?.studyRoomId ??
          seatChoices.find((seat) => seat.id === seatId)?.studyRoomId ??
          nextRooms[0]?.id ??
          "";

        if (preferredRoomId) {
          setSelectedRoomId((current) => current || preferredRoomId);
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "자습실 목록을 불러오지 못했습니다.");
        }
      }
    }

    void loadRooms();

    return () => {
      active = false;
    };
  }, [divisionSlug, hasLoadedSeatBrowser, isSeatBrowserOpen, seatChoices, seatId, selectedSeatChoice?.studyRoomId]);

  useEffect(() => {
    if (!selectedSeatChoice?.studyRoomId) {
      return;
    }

    setSelectedRoomId(selectedSeatChoice.studyRoomId);
  }, [selectedSeatChoice?.studyRoomId]);

  useEffect(() => {
    if (!isSeatBrowserOpen) {
      return;
    }

    if (!selectedRoomId) {
      setSeatLayout(null);
      return;
    }

    if (seatLayout?.room?.id === selectedRoomId) {
      return;
    }

    let active = true;
    setIsSeatLayoutLoading(true);

    async function loadSeatLayout() {
      try {
        const response = await fetch(`/api/${divisionSlug}/seats?roomId=${selectedRoomId}`, {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "좌석 현황을 불러오지 못했습니다.");
        }

        if (active) {
          setSeatLayout(data.layout as SeatLayout);
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "좌석 현황을 불러오지 못했습니다.");
          setSeatLayout(null);
        }
      } finally {
        if (active) {
          setIsSeatLayoutLoading(false);
        }
      }
    }

    void loadSeatLayout();

    return () => {
      active = false;
    };
  }, [divisionSlug, isSeatBrowserOpen, seatLayout?.room?.id, selectedRoomId]);

  function handleSeatMapSelect(clickedSeatId: string | null) {
    if (!clickedSeatId || !seatLayout) {
      return;
    }

    const clickedSeat = seatLayout.seats.find((seat) => seat.id === clickedSeatId) ?? null;

    if (!clickedSeat || !clickedSeat.isActive) {
      toast.error("선택할 수 없는 좌석입니다.");
      return;
    }

    if (clickedSeat.assignedStudent && clickedSeat.assignedStudent.id !== initialStudent?.id) {
      toast.error("이미 다른 학생이 사용 중인 좌석입니다. 빈 좌석을 선택해 주세요.");
      return;
    }

    setSeatId(clickedSeat.id);
  }

  function applyTuitionPlan(nextPlanId: string, nextStartDate = courseStartDate) {
    setTuitionPlanId(nextPlanId);
    const plan = activeTuitionPlans.find((item) => item.id === nextPlanId);

    if (!plan) {
      return;
    }

    setTuitionAmount(String(plan.amount));

    if (nextStartDate && plan.durationDays) {
      setCourseEndDate(calculateCourseEndDate(nextStartDate, plan.durationDays) ?? "");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    setIsSaving(true);

    try {
      const endpoint =
        mode === "create"
          ? `/api/${divisionSlug}/students`
          : `/api/${divisionSlug}/students/${initialStudent?.id}`;
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          studentNumber,
          studyTrack: studyTrack || null,
          phone: phone || null,
          seatId: seatId || null,
          courseStartDate: courseStartDate || null,
          courseEndDate: courseEndDate || null,
          tuitionPlanId: tuitionPlanId || null,
          tuitionAmount: tuitionAmount ? Number(tuitionAmount) : null,
          status,
          memo: memo || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "학생 저장에 실패했습니다.");
      }

      toast.success(mode === "create" ? "학생을 등록했습니다." : "학생 정보를 수정했습니다.");

      if (mode === "create") {
        if (redirectOnCreate) {
          router.push(`/${divisionSlug}/admin/students/${data.student.id}`);
        } else {
          router.refresh();
        }
      } else {
        router.refresh();
      }

      onSuccess?.(data.student.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "학생 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!showSeatSectionOnly && (<><section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-950">기본 정보</p>
            <p className="text-sm text-slate-500">학생 식별과 연락에 필요한 핵심 정보를 먼저 입력합니다.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 김지훈"
              autoComplete="name"
              disabled={!canEdit || isSaving}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">수험번호</span>
            <input
              value={studentNumber}
              onChange={(event) => setStudentNumber(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: P-2026-001"
              autoComplete="off"
              disabled={!canEdit || isSaving}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">직렬</span>
            <input
              list={studyTrackListId}
              value={studyTrack}
              onChange={(event) => setStudyTrack(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 경찰"
              disabled={!canEdit || isSaving}
            />
            <datalist id={studyTrackListId}>
              {studyTrackOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Phone className="h-4 w-4 text-slate-400" />
              연락처
            </span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 010-1234-5678"
              autoComplete="tel"
              disabled={!canEdit || isSaving}
            />
          </label>
        </div>
      </section>

      <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-amber-600">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-950">등록 기간 및 금액</p>
            <p className="text-sm text-slate-500">등록 플랜을 선택하면 금액과 종료일을 빠르게 맞출 수 있습니다.</p>
          </div>
        </div>

        {activeTuitionPlans.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {activeTuitionPlans.map((plan) => {
              const selected = tuitionPlanId === plan.id;

              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => applyTuitionPlan(plan.id)}
                  disabled={!canEdit || isSaving}
                  className={`rounded-[10px] border px-4 py-4 text-left transition ${
                    selected
                      ? "border-[var(--division-color)] bg-[var(--division-color)] text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-white"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{plan.name}</p>
                      <p className={`mt-1 text-xs ${selected ? "text-slate-200" : "text-slate-500"}`}>
                        {getPlanDurationLabel(plan.durationDays)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        selected ? "bg-white/15 text-white" : "bg-white text-slate-600"
                      }`}
                    >
                      {formatCurrency(plan.amount)}
                    </span>
                  </div>
                  {plan.description ? (
                    <p className={`mt-3 text-sm leading-6 ${selected ? "text-slate-100" : "text-slate-600"}`}>
                      {plan.description}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">등록 플랜</span>
            <select
              value={tuitionPlanId}
              onChange={(event) => applyTuitionPlan(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              disabled={!canEdit || isSaving}
            >
              <option value="">직접 입력</option>
              {activeTuitionPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {getPlanDurationLabel(plan.durationDays)} · {formatCurrency(plan.amount)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">적용 금액</span>
            <input
              type="number"
              min={0}
              value={tuitionAmount}
              onChange={(event) => setTuitionAmount(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 320000"
              disabled={!canEdit || isSaving}
            />
            {selectedPlan ? (
              <p className="mt-2 text-xs text-slate-500">
                선택한 플랜 기본 금액은 {formatCurrency(selectedPlan.amount)}입니다.
              </p>
            ) : null}
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              시작일
            </span>
            <input
              type="date"
              value={courseStartDate}
              onChange={(event) => {
                const nextStartDate = event.target.value;
                setCourseStartDate(nextStartDate);
                const plan = activeTuitionPlans.find((item) => item.id === tuitionPlanId);

                if (nextStartDate && plan?.durationDays) {
                  setCourseEndDate(calculateCourseEndDate(nextStartDate, plan.durationDays) ?? "");
                }
              }}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              disabled={!canEdit || isSaving}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">종료일</span>
            <input
              type="date"
              value={courseEndDate}
              onChange={(event) => setCourseEndDate(event.target.value)}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              disabled={!canEdit || isSaving}
            />
          </label>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          시작일과 기간이 있는 등록 플랜을 함께 선택하면 종료일이 자동 계산됩니다.
        </p>
      </section></>)}

      {!hideSeatSection && <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-sky-600">
            <MapPinned className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-950">좌석 및 운영 정보</p>
            <p className="text-sm text-slate-500">
              자습실별 좌석 현황을 보면서 바로 배정할 수 있고, 이미 사용 중인 좌석은 선택할 수 없습니다.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">자습실 / 좌석</span>
            <select
              value={seatId}
              onChange={(event) => {
                const nextSeatId = event.target.value;
                setSeatId(nextSeatId);
                const nextSeat = seatChoices.find((seat) => seat.id === nextSeatId);

                if (nextSeat?.studyRoomId) {
                  setSelectedRoomId(nextSeat.studyRoomId);
                }
              }}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              disabled={!canEdit || isSaving}
            >
              <option value="">미배정</option>
              {seatChoices.map((seat) => (
                <option key={seat.id} value={seat.id} disabled={seat.isDisabled}>
                  {seat.studyRoomName} · {seat.label}
                  {seat.isDisabled ? " · 사용 중" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-4">
            <p className="text-sm text-slate-500">
              아래 좌석 맵을 열면 자습실별 배치도를 한눈에 확인하고 빈 자리를 바로 선택할 수 있습니다. 원하는 좌석을 선택하면 즉시 배정 내용을 확인할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setIsSeatBrowserOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <MapPinned className="h-4 w-4" />
              {isSeatBrowserOpen ? "좌석 맵 닫기" : "좌석 맵 열기"}
            </button>
          </div>

          {isSeatBrowserOpen && rooms.length > 0 ? (
            <div className="space-y-4 rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">좌석 현황에서 바로 배정</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    빈 좌석을 클릭하면 바로 선택됩니다. 사용 중인 좌석은 선택되지 않습니다.
                  </p>
                </div>
                <div className="rounded-full border border-slate-200-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                  빈 좌석 {availableSeatCount}석 / 운영 좌석 {activeRoomSeatCount}석
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      selectedRoomId === room.id
                        ? "border-[var(--division-color)] bg-[var(--division-color)] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {room.name}
                  </button>
                ))}
              </div>

              {seatLayout ? (
                <SeatMap
                  seats={seatLayout.seats}
                  columns={seatLayout.columns}
                  rows={seatLayout.rows}
                  aisleColumns={seatLayout.aisleColumns}
                  selectedSeatId={seatId || null}
                  highlightStudentId={initialStudent?.id ?? null}
                  onCellClick={(_, __, clickedSeatId) => handleSeatMapSelect(clickedSeatId)}
                />
              ) : (
                <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  {isSeatLayoutLoading ? "좌석 현황을 불러오는 중입니다." : "선택한 자습실의 좌석 현황이 없습니다."}
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200-slate-200 bg-white px-3 py-1 text-emerald-700">
                  사용 중 {occupiedSeatCount}석
                </span>
                <span className="rounded-full border border-slate-200-slate-200 bg-white px-3 py-1 text-slate-600">
                  선택 좌석 {selectedSeatChoice ? `${selectedSeatChoice.studyRoomName} · ${selectedSeatChoice.label}` : "없음"}
                </span>
                {selectedSeatChoice ? (
                  <button
                    type="button"
                    onClick={() => setSeatId("")}
                    className="rounded-full border border-slate-200-slate-200 bg-white px-3 py-1 font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    좌석 해제
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {isSeatBrowserOpen && !hasLoadedSeatBrowser ? (
            <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                좌석 현황을 불러오는 중입니다.
              </span>
            </div>
          ) : null}

          {isSeatBrowserOpen && hasLoadedSeatBrowser && rooms.length === 0 ? (
            <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              등록된 자습실이 없습니다.
            </div>
          ) : null}

          {showAdvancedFields ? (
            <>
              {isWithdrawn ? (
                <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm leading-6 text-rose-700">
                  퇴실 처리된 학생은 상태를 다시 변경할 수 없습니다. 퇴실 사유와 이력은 상단 상세 정보에서 확인할 수 있습니다.
                </div>
              ) : (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">상태</span>
                  <select
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value as (typeof editableStatusOptions)[number]["value"])
                    }
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                    disabled={!canEdit || isSaving}
                  >
                    {editableStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">메모</span>
                <textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  className="min-h-[120px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="상담 메모나 특이사항을 기록합니다."
                  disabled={!canEdit || isSaving}
                />
              </label>
            </>
          ) : (
            <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
              등록 후 상세 페이지에서 상태 변경, 메모 추가, 좌석 이동까지 이어서 관리할 수 있습니다.
            </div>
          )}
        </div>
      </section>}

      <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {mode === "create" ? "등록 즉시 학생 목록에 반영됩니다." : "변경 내용은 저장 후 바로 반영됩니다."}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "create"
              ? "필수 항목만 먼저 입력하고, 나머지는 상세 페이지에서 이어서 관리할 수 있습니다."
              : "수정 후 학생 목록과 상세 정보가 함께 새로고침됩니다."}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="inline-flex items-center rounded-full border border-slate-200-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
            >
              취소
            </button>
          ) : null}

          {canEdit ? (
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {mode === "create" ? "학생 등록" : "정보 저장"}
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
