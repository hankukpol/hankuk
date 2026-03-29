"use client";

import Link from "next/link";
import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";

function Spinner() {
  return (
    <svg
      className="mr-1.5 inline-block h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

type Appointment = {
  id: number;
  examNumber: string;
  scheduledAt: string; // ISO
  counselorName: string;
  agenda: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  cancelReason: string | null;
  student: { name: string; examNumber: string; examType: string };
};

type StudentResult = { examNumber: string; name: string };

type AppointmentManagerProps = {
  appointments: Appointment[];
  defaultCounselorName: string;
  defaultExamNumber?: string;
  defaultStudentName?: string;
  defaultOpenCreateForm?: boolean;
};

type Tab = "SCHEDULED" | "COMPLETED" | "CANCELLED";

function formatScheduledAt(iso: string) {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${month}/${day}(${weekdays[d.getDay()]}) ${hour}:${min}`;
}

function toDatetimeInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultScheduledAt() {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

const TAB_LABEL: Record<Tab, string> = {
  SCHEDULED: "예정",
  COMPLETED: "완료",
  CANCELLED: "취소됨",
};

const STATUS_CHIP: Record<Tab, string> = {
  SCHEDULED: "border-sky-200 bg-sky-50 text-sky-700",
  COMPLETED: "border-forest/20 bg-forest/10 text-forest",
  CANCELLED: "border-slate/20 bg-slate/10 text-slate",
};

export function AppointmentManager({
  appointments: initialAppointments,
  defaultCounselorName,
  defaultExamNumber = "",
  defaultStudentName = "",
  defaultOpenCreateForm = false,
}: AppointmentManagerProps) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [tab, setTab] = useState<Tab>("SCHEDULED");
  const [showCreateForm, setShowCreateForm] = useState(defaultOpenCreateForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [completedExamNumber, setCompletedExamNumber] = useState<string | null>(null);
  const confirmModal = useActionModalState();

  // 새 예약 폼 — 학생 검색
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(
    defaultExamNumber && defaultStudentName
      ? { examNumber: defaultExamNumber, name: defaultStudentName }
      : null,
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 새 예약 폼 — 나머지
  const [newScheduledAt, setNewScheduledAt] = useState(defaultScheduledAt());
  const [newCounselorName, setNewCounselorName] = useState(defaultCounselorName);
  const [newAgenda, setNewAgenda] = useState("");

  // 수정 폼 상태
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editCounselorName, setEditCounselorName] = useState("");
  const [editAgenda, setEditAgenda] = useState("");

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 디바운스 학생 검색
  useEffect(() => {
    if (!studentSearch.trim() || studentSearch.length < 1) {
      setStudentResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/counseling?search=${encodeURIComponent(studentSearch)}&pageSize=10`,
        );
        const data = await res.json();
        const rows: StudentResult[] = (data.students?.rows ?? []).map(
          (r: { examNumber: string; name: string }) => ({
            examNumber: r.examNumber,
            name: r.name,
          }),
        );
        setStudentResults(rows);
        setShowDropdown(rows.length > 0);
      } catch {
        setStudentResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [studentSearch]);

  const filtered = useMemo(() => appointments.filter((a) => a.status === tab), [appointments, tab]);

  const counts: Record<Tab, number> = useMemo(
    () => ({
      SCHEDULED: appointments.filter((a) => a.status === "SCHEDULED").length,
      COMPLETED: appointments.filter((a) => a.status === "COMPLETED").length,
      CANCELLED: appointments.filter((a) => a.status === "CANCELLED").length,
    }),
    [appointments],
  );

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
    return payload;
  }

  function setMessage(ok: string | null, err: string | null) {
    setNotice(ok);
    setErrorMessage(err);
    if (ok) setTimeout(() => setNotice(null), 3000);
  }

  function openCreateForm() {
    setShowCreateForm(true);
    // defaultExamNumber가 있으면 pre-select 유지, 없으면 초기화
    if (!defaultExamNumber) {
      setSelectedStudent(null);
      setStudentSearch("");
    }
    setNewScheduledAt(defaultScheduledAt());
    setNewAgenda("");
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setStudentSearch("");
    setShowDropdown(false);
    setStudentResults([]);
  }

  function selectStudent(student: StudentResult) {
    setSelectedStudent(student);
    setStudentSearch("");
    setStudentResults([]);
    setShowDropdown(false);
  }

  function createAppointment() {
    if (!selectedStudent) {
      setMessage(null, "학생을 선택하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const { record } = await requestJson("/api/counseling/appointments", {
          method: "POST",
          body: JSON.stringify({
            examNumber: selectedStudent.examNumber,
            scheduledAt: newScheduledAt,
            counselorName: newCounselorName,
            agenda: newAgenda || null,
          }),
        });
        setAppointments((prev) => [...prev, record]);
        closeCreateForm();
        setTab("SCHEDULED");
        setMessage("예약이 등록되었습니다.", null);
        toast.success("면담 예약이 등록되었습니다.");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "예약 저장에 실패했습니다.";
        setMessage(null, msg);
        toast.error(msg);
      }
    });
  }

  function completeAppointment(id: number, examNumber: string) {
    startTransition(async () => {
      try {
        await requestJson(`/api/counseling/appointments/${id}`, {
          method: "PUT",
          body: JSON.stringify({ action: "complete" }),
        });
        setAppointments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: "COMPLETED" } : a)),
        );
        setCompletedExamNumber(examNumber);
        setNotice(null);
        setErrorMessage(null);
        toast.success("면담이 완료 처리되었습니다.");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "완료 처리에 실패했습니다.";
        setMessage(null, msg);
        toast.error(msg);
      }
    });
  }

  function cancelAppointment(id: number) {
    startTransition(async () => {
      try {
        await requestJson(`/api/counseling/appointments/${id}`, {
          method: "PUT",
          body: JSON.stringify({ action: "cancel", cancelReason: cancelReason || null }),
        });
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: "CANCELLED", cancelReason: cancelReason || null } : a,
          ),
        );
        setCancelingId(null);
        setCancelReason("");
        setMessage("예약이 취소되었습니다.", null);
        toast.success("면담 예약이 취소되었습니다.");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "취소에 실패했습니다.";
        setMessage(null, msg);
        toast.error(msg);
      }
    });
  }

  function saveEdit(id: number) {
    startTransition(async () => {
      try {
        const { record } = await requestJson(`/api/counseling/appointments/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            action: "reschedule",
            scheduledAt: editScheduledAt,
            counselorName: editCounselorName,
            agenda: editAgenda || null,
          }),
        });
        setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...record } : a)));
        setEditingId(null);
        setMessage("예약이 수정되었습니다.", null);
        toast.success("면담 예약이 수정되었습니다.");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "수정에 실패했습니다.";
        setMessage(null, msg);
        toast.error(msg);
      }
    });
  }

  function deleteAppointment(id: number) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: "예약 삭제",
      description: "이 예약을 삭제하시겠습니까?",
      details: ["삭제 후에는 같은 일정 정보를 다시 복구할 수 없습니다."],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        startTransition(async () => {
          try {
            await requestJson(`/api/counseling/appointments/${id}`, { method: "DELETE" });
            setAppointments((prev) => prev.filter((a) => a.id !== id));
            setMessage("예약이 삭제되었습니다.", null);
            toast.success("면담 예약이 삭제되었습니다.");
          } catch (error) {
            const msg = error instanceof Error ? error.message : "삭제에 실패했습니다.";
            setMessage(null, msg);
            toast.error(msg);
          }
        });
      },
    });
  }

  function startEdit(appointment: Appointment) {
    setEditingId(appointment.id);
    setEditScheduledAt(toDatetimeInputValue(appointment.scheduledAt));
    setEditCounselorName(appointment.counselorName);
    setEditAgenda(appointment.agenda ?? "");
  }

  return (
    <div className="space-y-4">
      {/* 알림 */}
      {completedExamNumber && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          <span>면담이 완료 처리되었습니다. 면담 기록을 입력해 주세요.</span>
          <Link href={`/admin/counseling?examNumber=${completedExamNumber}&search=${completedExamNumber}`}
            className="inline-flex items-center rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-forest/80"
          >
            면담 기록 입력하기 →
          </Link>
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* 헤더 + 새 예약 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full border border-ink/10 bg-mist p-1">
          {(["SCHEDULED", "COMPLETED", "CANCELLED"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                tab === t ? "bg-ink text-white" : "text-slate hover:text-ink"
              }`}
            >
              {TAB_LABEL[t]}
              {counts[t] > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                    tab === t
                      ? "bg-white/20 text-white"
                      : t === "SCHEDULED"
                        ? "bg-sky-100 text-sky-700"
                        : "bg-ink/10 text-slate"
                  }`}
                >
                  {counts[t]}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={showCreateForm ? closeCreateForm : openCreateForm}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
        >
          <span className="text-base leading-none">{showCreateForm ? "×" : "+"}</span>
          {showCreateForm ? "닫기" : selectedStudent ? "선택 학생 예약" : "새 예약 잡기"}
        </button>
      </div>

      {selectedStudent && !showCreateForm ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-sky-200 bg-sky-50/60 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
              선택 학생
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {selectedStudent.examNumber} · {selectedStudent.name}
            </p>
            <p className="mt-1 text-xs text-slate">
              예약을 잡으려면 우측 버튼으로 폼을 열고, 예약 없이 진행하려면 아래 면담 패널을 사용하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-800 transition hover:border-sky-500 hover:bg-sky-100"
          >
            예약 폼 열기
          </button>
        </div>
      ) : null}

      {/* 새 예약 폼 */}
      {showCreateForm && (
        <div className="rounded-[24px] border border-sky-200 bg-sky-50/50 p-5">
          <h3 className="mb-4 text-sm font-semibold text-sky-800">새 면담 예약</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* 학생 검색 */}
            <div className="relative" ref={dropdownRef}>
              <label className="mb-1.5 block text-xs font-medium text-slate">학생 검색</label>
              {selectedStudent ? (
                <div className="flex items-center gap-2 rounded-2xl border border-sky-300 bg-sky-100/60 px-3 py-2.5">
                  <span className="flex-1 text-sm font-semibold text-sky-900">
                    {selectedStudent.examNumber} · {selectedStudent.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudent(null);
                      setStudentSearch("");
                    }}
                    className="shrink-0 text-sky-600 hover:text-sky-900"
                    aria-label="학생 선택 해제"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      onFocus={() => studentResults.length > 0 && setShowDropdown(true)}
                      placeholder="수험번호 또는 이름"
                      autoComplete="off"
                      className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2.5 text-sm pr-8"
                    />
                    {isSearching && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate">
                        …
                      </span>
                    )}
                  </div>
                  {showDropdown && studentResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-2xl border border-ink/10 bg-white shadow-lg">
                      {studentResults.map((student) => (
                        <button
                          key={student.examNumber}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()} // blur 방지
                          onClick={() => selectStudent(student)}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-mist"
                        >
                          <span className="font-semibold">{student.examNumber}</span>
                          <span className="text-slate">·</span>
                          <span>{student.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!isSearching && studentSearch.length > 0 && studentResults.length === 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-slate shadow-lg">
                      검색 결과 없음
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 면담 예정일시 */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">면담 예정일시</label>
              <input
                type="datetime-local"
                value={newScheduledAt}
                step={600}
                onChange={(e) => setNewScheduledAt(e.target.value)}
                className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2.5 text-sm"
              />
            </div>

            {/* 담당 강사 */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">담당 강사</label>
              <input
                type="text"
                value={newCounselorName}
                onChange={(e) => setNewCounselorName(e.target.value)}
                className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2.5 text-sm"
              />
            </div>

            {/* 안건 */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                안건 <span className="font-normal text-slate/60">(선택)</span>
              </label>
              <input
                type="text"
                value={newAgenda}
                onChange={(e) => setNewAgenda(e.target.value)}
                placeholder="성적 하락 원인 파악 등"
                className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={createAppointment}
              disabled={isPending || !selectedStudent}
              className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              {isPending && <Spinner />}
              예약 저장
            </button>
            <button
              type="button"
              onClick={closeCreateForm}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-slate/30 hover:text-slate"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 예약 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
          {tab === "SCHEDULED"
            ? "예정된 면담 예약이 없습니다."
            : `${TAB_LABEL[tab]} 항목이 없습니다.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((appt) => (
            <div
              key={appt.id}
              className={`rounded-[20px] border p-4 transition ${
                appt.status === "CANCELLED"
                  ? "border-slate/15 bg-slate/5 opacity-70"
                  : "border-ink/10 bg-white"
              }`}
            >
              {editingId === appt.id ? (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate">
                        면담 예정일시
                      </label>
                      <input
                        type="datetime-local"
                        value={editScheduledAt}
                        step={600}
                        onChange={(e) => setEditScheduledAt(e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate">담당 강사</label>
                      <input
                        type="text"
                        value={editCounselorName}
                        onChange={(e) => setEditCounselorName(e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate">안건</label>
                      <input
                        type="text"
                        value={editAgenda}
                        onChange={(e) => setEditAgenda(e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(appt.id)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-forest disabled:opacity-50"
                    >
                      {isPending && <Spinner />}
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:text-slate"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              ) : cancelingId === appt.id ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    {appt.student.examNumber} · {appt.student.name} 예약을 취소하시겠습니까?
                  </p>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="취소 사유 (선택)"
                    className="w-full rounded-2xl border border-ink/10 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => cancelAppointment(appt.id)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {isPending && <Spinner />}
                      예약 취소 확정
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCancelingId(null);
                        setCancelReason("");
                      }}
                      className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:text-slate"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[appt.status as Tab]}`}
                    >
                      {TAB_LABEL[appt.status as Tab]}
                    </span>
                    <span className="text-sm font-semibold">
                      {formatScheduledAt(appt.scheduledAt)}
                    </span>
                    <Link href={`/admin/counseling?examNumber=${appt.student.examNumber}&search=${appt.student.examNumber}`}
                      className="font-semibold text-ink hover:text-ember hover:underline"
                    >
                      {appt.student.examNumber} · {appt.student.name}
                    </Link>
                    <span className="text-sm text-slate">{appt.counselorName}</span>
                    {appt.agenda && (
                      <span className="rounded-full border border-ink/10 bg-mist px-3 py-0.5 text-xs text-slate">
                        {appt.agenda}
                      </span>
                    )}
                    {appt.cancelReason && (
                      <span className="text-xs text-slate">취소 사유: {appt.cancelReason}</span>
                    )}
                  </div>
                  {appt.status === "SCHEDULED" && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => completeAppointment(appt.id, appt.student.examNumber)}
                        disabled={isPending}
                        className="inline-flex items-center rounded-full border border-forest/20 px-3 py-1.5 text-xs font-semibold text-forest transition hover:bg-forest/10 disabled:opacity-50"
                      >
                        {isPending && <Spinner />}
                        면담 완료
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(appt)}
                        disabled={isPending}
                        className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:opacity-50"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelingId(appt.id)}
                        disabled={isPending}
                        className="inline-flex items-center rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        취소
                      </button>
                    </div>
                  )}
                  {appt.status !== "SCHEDULED" && (
                    <button
                      type="button"
                      onClick={() => deleteAppointment(appt.id)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-slate/20 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}