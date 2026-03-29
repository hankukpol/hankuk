"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ExamDivision } from "@prisma/client";
import type { ExamEventRow } from "./page";

const DIVISION_LABEL: Record<ExamDivision, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

const DIVISION_VALUES = Object.values(ExamDivision);

type RegistrationRow = {
  id: string;
  examEventId: string;
  examNumber: string | null;
  externalName: string | null;
  externalPhone: string | null;
  division: ExamDivision;
  isPaid: boolean;
  paidAmount: number;
  paidAt: string | null;
  seatNumber: string | null;
  registeredAt: string;
  cancelledAt: string | null;
  student: {
    examNumber: string;
    name: string;
    phone: string | null;
    examType: string;
  } | null;
};

type KpiData = Record<ExamDivision, number>;

function computeKpi(registrations: RegistrationRow[]): KpiData {
  const kpi = { GONGCHAE_M: 0, GONGCHAE_F: 0, GYEONGCHAE: 0, ONLINE: 0 } as KpiData;
  for (const r of registrations) {
    if (!r.cancelledAt) {
      kpi[r.division] += 1;
    }
  }
  return kpi;
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function NewEventModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (event: ExamEventRow) => void;
}) {
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [registrationFee, setRegistrationFee] = useState("3000");
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [venue, setVenue] = useState("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/exams/special", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          examDate,
          registrationFee: Number(registrationFee),
          registrationDeadline: registrationDeadline || null,
          venue: venue || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      onCreated({
        ...data.event,
        examDate: data.event.examDate,
        registrationDeadline: data.event.registrationDeadline ?? null,
        _count: { registrations: 0 },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-xl">
        <h2 className="text-xl font-semibold text-ink">새 시험 등록</h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate">시험명 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2026년 3월 특강모의고사"
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate">시험일 *</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate">참가비 (원)</label>
            <input
              type="number"
              value={registrationFee}
              onChange={(e) => setRegistrationFee(e.target.value)}
              min={0}
              step={500}
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate">접수 마감일</label>
            <input
              type="date"
              value={registrationDeadline}
              onChange={(e) => setRegistrationDeadline(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate">장소</label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="예: academy-ops 1강의실"
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
            />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate hover:bg-ink/5"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember/90 disabled:opacity-50"
            >
              {loading ? "등록 중..." : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudentRegistrationModal({
  eventId,
  onClose,
  onRegistered,
}: {
  eventId: string;
  onClose: () => void;
  onRegistered: (reg: RegistrationRow) => void;
}) {
  const [examNumber, setExamNumber] = useState("");
  const [studentName, setStudentName] = useState<string>("");
  const [studentFound, setStudentFound] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [division, setDivision] = useState<ExamDivision>("GONGCHAE_M");
  const [paidAmount, setPaidAmount] = useState("3000");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function searchStudent() {
    if (!examNumber.trim()) return;
    setSearchLoading(true);
    setStudentFound(false);
    setStudentName("");
    try {
      const res = await fetch(`/api/students/${examNumber.trim()}`);
      if (res.ok) {
        const data = await res.json();
        setStudentName(data.student?.name ?? "");
        setStudentFound(!!data.student);
      } else {
        setStudentFound(false);
        setStudentName("");
      }
    } catch {
      setStudentFound(false);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/exams/special/${eventId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examNumber: examNumber.trim() || undefined,
          division,
          paidAmount: Number(paidAmount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "접수 실패");
      onRegistered(data.registration);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-xl">
        <h2 className="text-xl font-semibold text-ink">접수 등록 (재원생)</h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate">학번 *</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={examNumber}
                onChange={(e) => setExamNumber(e.target.value)}
                onBlur={searchStudent}
                placeholder="학번 입력"
                className="flex-1 rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
              />
              <button
                type="button"
                onClick={searchStudent}
                disabled={searchLoading}
                className="rounded-xl border border-ink/10 px-4 py-2 text-sm text-slate hover:bg-ink/5 disabled:opacity-50"
              >
                {searchLoading ? "..." : "조회"}
              </button>
            </div>
            {studentFound && (
              <p className="mt-1 text-xs text-forest">
                ✓ {studentName} ({examNumber})
              </p>
            )}
            {!studentFound && examNumber && !searchLoading && (
              <p className="mt-1 text-xs text-red-500">학생을 찾을 수 없습니다.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate">구분 *</label>
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value as ExamDivision)}
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
            >
              {DIVISION_VALUES.map((d) => (
                <option key={d} value={d}>
                  {DIVISION_LABEL[d]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate">납부 금액 (원)</label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              min={0}
              step={500}
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
            />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate hover:bg-ink/5"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember/90 disabled:opacity-50"
            >
              {loading ? "접수 중..." : "접수"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExternalRegistrationModal({
  eventId,
  onClose,
  onRegistered,
}: {
  eventId: string;
  onClose: () => void;
  onRegistered: (reg: RegistrationRow) => void;
}) {
  const [externalName, setExternalName] = useState("");
  const [externalPhone, setExternalPhone] = useState("");
  const [division, setDivision] = useState<ExamDivision>("GONGCHAE_M");
  const [paidAmount, setPaidAmount] = useState("3000");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/exams/special/${eventId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalName,
          externalPhone: externalPhone || undefined,
          division,
          paidAmount: Number(paidAmount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "접수 실패");
      onRegistered(data.registration);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-xl">
        <h2 className="text-xl font-semibold text-ink">외부 수험생 접수</h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate">이름 *</label>
            <input
              type="text"
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
              placeholder="이름 입력"
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate">연락처</label>
            <input
              type="tel"
              value={externalPhone}
              onChange={(e) => setExternalPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate">구분 *</label>
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value as ExamDivision)}
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
            >
              {DIVISION_VALUES.map((d) => (
                <option key={d} value={d}>
                  {DIVISION_LABEL[d]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate">납부 금액 (원)</label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              min={0}
              step={500}
              className="mt-1 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
            />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate hover:bg-ink/5"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember/90 disabled:opacity-50"
            >
              {loading ? "접수 중..." : "접수"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SpecialExamManager({ initialEvents }: { initialEvents: ExamEventRow[] }) {
  const [events, setEvents] = useState<ExamEventRow[]>(initialEvents);
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEvents[0]?.id ?? "");
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [regsLoading, setRegsLoading] = useState<boolean>(false);

  const [showNewEventModal, setShowNewEventModal] = useState<boolean>(false);
  const [showStudentModal, setShowStudentModal] = useState<boolean>(false);
  const [showExternalModal, setShowExternalModal] = useState<boolean>(false);
  const [cancellingId, setCancellingId] = useState<string>("");

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;
  const activeRegistrations = registrations.filter((r) => !r.cancelledAt);
  const kpi = computeKpi(registrations);

  const fetchRegistrations = useCallback(async (eventId: string) => {
    if (!eventId) return;
    setRegsLoading(true);
    try {
      const res = await fetch(
        `/api/exams/special/${eventId}/registrations?includeCancelled=true`,
      );
      const data = await res.json();
      setRegistrations(data.registrations ?? []);
    } catch {
      setRegistrations([]);
    } finally {
      setRegsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      void fetchRegistrations(selectedEventId);
    }
  }, [selectedEventId, fetchRegistrations]);

  async function togglePaid(reg: RegistrationRow) {
    const newIsPaid = !reg.isPaid;
    const res = await fetch(
      `/api/exams/special/${selectedEventId}/registrations/${reg.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaid: newIsPaid }),
      },
    );
    if (res.ok) {
      const data = await res.json();
      setRegistrations((prev) =>
        prev.map((r) => (r.id === reg.id ? data.registration : r)),
      );
    }
  }

  async function cancelRegistration(regId: string) {
    if (!confirm("접수를 취소하시겠습니까?")) return;
    setCancellingId(regId);
    try {
      const res = await fetch(
        `/api/exams/special/${selectedEventId}/registrations/${regId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setRegistrations((prev) =>
          prev.map((r) =>
            r.id === regId ? { ...r, cancelledAt: new Date().toISOString() } : r,
          ),
        );
      }
    } finally {
      setCancellingId("");
    }
  }

  function handleEventCreated(event: ExamEventRow) {
    setEvents((prev) => [event, ...prev]);
    setSelectedEventId(event.id);
    setShowNewEventModal(false);
  }

  function handleRegistered(reg: RegistrationRow) {
    setRegistrations((prev) => [...prev, reg]);
    setShowStudentModal(false);
    setShowExternalModal(false);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatFee(amount: number) {
    return amount > 0 ? amount.toLocaleString("ko-KR") + "원" : "무료";
  }

  return (
    <>
      {/* Event selector + new event button */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
        >
          {events.length === 0 && (
            <option value="">시험이 없습니다</option>
          )}
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowNewEventModal(true)}
          className="rounded-full border border-ember/30 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
        >
          + 새 시험 등록
        </button>
      </div>

      {/* Event summary card */}
      {selectedEvent && (
        <div className="mt-4 rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span>
              <span className="font-medium text-slate">시험일:</span>{" "}
              <span className="text-ink">{formatDate(selectedEvent.examDate)}</span>
            </span>
            <span>
              <span className="font-medium text-slate">참가비:</span>{" "}
              <span className="text-ink">{formatFee(selectedEvent.registrationFee)}</span>
            </span>
            {selectedEvent.venue && (
              <span>
                <span className="font-medium text-slate">장소:</span>{" "}
                <span className="text-ink">{selectedEvent.venue}</span>
              </span>
            )}
            {selectedEvent.registrationDeadline && (
              <span>
                <span className="font-medium text-slate">접수마감:</span>{" "}
                <span className="text-ink">
                  {formatDate(selectedEvent.registrationDeadline)}
                </span>
              </span>
            )}
            <span>
              <span className="font-medium text-slate">상태:</span>{" "}
              <span
                className={
                  selectedEvent.isActive
                    ? "text-forest font-semibold"
                    : "text-slate"
                }
              >
                {selectedEvent.isActive ? "활성" : "비활성"}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* KPI */}
      {selectedEvent && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DIVISION_VALUES.map((div) => (
            <div
              key={div}
              className="rounded-[28px] border border-ink/10 bg-white p-5 text-center"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                {DIVISION_LABEL[div]}
              </p>
              <p className="mt-2 text-3xl font-bold text-ink">{kpi[div]}</p>
              <p className="mt-1 text-xs text-slate">명</p>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {selectedEvent && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => setShowStudentModal(true)}
            className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember/90"
          >
            + 접수 등록
          </button>
          <button
            onClick={() => setShowExternalModal(true)}
            className="rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate hover:bg-ink/5"
          >
            + 외부 접수
          </button>
        </div>
      )}

      {/* Registration table */}
      {selectedEvent && (
        <div className="mt-4 rounded-[28px] border border-ink/10 bg-white">
          {regsLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate">
              불러오는 중...
            </div>
          ) : activeRegistrations.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate">
              접수 내역이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist">
                    <th className="px-4 py-3 text-left font-semibold text-slate">이름</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate">학번</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate">구분</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate">납부</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate">좌석</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate">접수일</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate">접수증</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate">취소</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {activeRegistrations.map((reg) => {
                    const displayName =
                      reg.student?.name ?? reg.externalName ?? "—";
                    const displayExamNumber = reg.examNumber ?? "(외부)";
                    return (
                      <tr key={reg.id} className="hover:bg-mist/50">
                        <td className="px-4 py-3 font-medium text-ink">
                          {reg.examNumber ? (
                            <Link
                              href={`/admin/students/${reg.examNumber}`}
                              className="hover:text-ember hover:underline"
                            >
                              {displayName}
                            </Link>
                          ) : (
                            displayName
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate">{displayExamNumber}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-xs font-medium text-slate">
                            {DIVISION_LABEL[reg.division]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => void togglePaid(reg)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              reg.isPaid
                                ? "border-forest/30 bg-forest/10 text-forest"
                                : "border-amber-200 bg-amber-50 text-amber-800 hover:border-forest/30 hover:bg-forest/10 hover:text-forest"
                            }`}
                            title={
                              reg.isPaid
                                ? `납부완료 (${reg.paidAmount.toLocaleString()}원)`
                                : "미납부 — 클릭으로 납부 처리"
                            }
                          >
                            {reg.isPaid ? "납부완료" : "미납부"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate">
                          {reg.seatNumber ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate">
                          {new Date(reg.registeredAt).toLocaleDateString("ko-KR")}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/exams/special/${selectedEventId}/receipt/${reg.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-ember hover:underline"
                          >
                            출력
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => void cancelRegistration(reg.id)}
                            disabled={cancellingId === reg.id}
                            className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
                          >
                            {cancellingId === reg.id ? "..." : "취소"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showNewEventModal && (
        <NewEventModal
          onClose={() => setShowNewEventModal(false)}
          onCreated={handleEventCreated}
        />
      )}
      {showStudentModal && selectedEventId && (
        <StudentRegistrationModal
          eventId={selectedEventId}
          onClose={() => setShowStudentModal(false)}
          onRegistered={handleRegistered}
        />
      )}
      {showExternalModal && selectedEventId && (
        <ExternalRegistrationModal
          eventId={selectedEventId}
          onClose={() => setShowExternalModal(false)}
          onRegistered={handleRegistered}
        />
      )}
    </>
  );
}
