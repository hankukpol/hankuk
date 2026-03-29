"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LockerRow } from "./page";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  BROKEN: "고장",
  BLOCKED: "폐쇄",
  AVAILABLE: "정상",
  IN_USE: "사용 중",
  RESERVED: "예약됨",
};

const STATUS_COLOR: Record<string, string> = {
  BROKEN: "bg-red-50 text-red-700 border-red-200",
  BLOCKED: "bg-ink/10 text-ink border-ink/20",
  AVAILABLE: "bg-forest/10 text-forest border-forest/20",
  IN_USE: "bg-sky-50 text-sky-700 border-sky-200",
  RESERVED: "bg-amber-50 text-amber-700 border-amber-200",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type AvailableLocker = {
  id: string;
  zone: string;
  lockerNumber: string;
  zoneLabel: string;
};

type TabKey = "broken" | "blocked" | "register";

interface Props {
  brokenLockers: LockerRow[];
  blockedLockers: LockerRow[];
  availableLockers: AvailableLocker[];
  zoneLabel: Record<string, string>;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LockerMaintenanceClient({
  brokenLockers: initialBroken,
  blockedLockers: initialBlocked,
  availableLockers,
  zoneLabel,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [brokenLockers, setBrokenLockers] = useState<LockerRow[]>(initialBroken);
  const [blockedLockers, setBlockedLockers] = useState<LockerRow[]>(initialBlocked);
  const [activeTab, setActiveTab] = useState<TabKey>("broken");

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Note modals
  const [noteTarget, setNoteTarget] = useState<{
    lockerId: string;
    lockerNumber: string;
    action: "fix" | "block";
  } | null>(null);
  const [noteInput, setNoteInput] = useState("");

  // Register form
  const [registerLockerId, setRegisterLockerId] = useState("");
  const [registerNote, setRegisterNote] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);

  // ─── API call ──────────────────────────────────────────────────────────────

  async function patchLocker(lockerId: string, status: string, note?: string): Promise<boolean> {
    setActionError(null);
    setActionLoading(lockerId);
    try {
      const body: Record<string, unknown> = { status };
      if (note !== undefined) body.note = note;
      const res = await fetch(`/api/lockers/${lockerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "수정 실패");
      }
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
      return false;
    } finally {
      setActionLoading(null);
    }
  }

  // ─── Fix (BROKEN → AVAILABLE) ─────────────────────────────────────────────

  function openFixModal(locker: LockerRow) {
    setNoteTarget({ lockerId: locker.id, lockerNumber: locker.lockerNumber, action: "fix" });
    setNoteInput(locker.note ?? "");
  }

  function openBlockModal(locker: LockerRow) {
    setNoteTarget({ lockerId: locker.id, lockerNumber: locker.lockerNumber, action: "block" });
    setNoteInput(locker.note ?? "");
  }

  function handleModalConfirm() {
    if (!noteTarget) return;
    startTransition(async () => {
      const { lockerId, lockerNumber, action } = noteTarget;
      if (action === "fix") {
        const ok = await patchLocker(lockerId, "AVAILABLE", noteInput.trim() || undefined);
        if (ok) {
          setBrokenLockers((prev) => prev.filter((l) => l.id !== lockerId));
          setActionSuccess(`사물함 ${lockerNumber} 수리 완료 처리됨`);
          setTimeout(() => setActionSuccess(null), 4000);
          router.refresh();
        }
      } else {
        const ok = await patchLocker(lockerId, "BLOCKED", noteInput.trim() || undefined);
        if (ok) {
          // Move from broken to blocked
          const target = brokenLockers.find((l) => l.id === lockerId);
          if (target) {
            setBrokenLockers((prev) => prev.filter((l) => l.id !== lockerId));
            setBlockedLockers((prev) => [
              ...prev,
              { ...target, status: "BLOCKED", note: noteInput.trim() || null },
            ]);
          }
          setActionSuccess(`사물함 ${lockerNumber} 폐쇄 처리됨`);
          setTimeout(() => setActionSuccess(null), 4000);
          router.refresh();
        }
      }
      setNoteTarget(null);
      setNoteInput("");
    });
  }

  // ─── Keep blocked ─────────────────────────────────────────────────────────

  function handleKeepBlocked(locker: LockerRow) {
    setNoteTarget({ lockerId: locker.id, lockerNumber: locker.lockerNumber, action: "block" });
    setNoteInput(locker.note ?? "");
  }

  // ─── Unblock (BLOCKED → AVAILABLE) ───────────────────────────────────────

  function handleUnblock(locker: LockerRow) {
    startTransition(async () => {
      const ok = await patchLocker(locker.id, "AVAILABLE", undefined);
      if (ok) {
        setBlockedLockers((prev) => prev.filter((l) => l.id !== locker.id));
        setActionSuccess(`사물함 ${locker.lockerNumber} 폐쇄 해제됨`);
        setTimeout(() => setActionSuccess(null), 4000);
        router.refresh();
      }
    });
  }

  // ─── Register new broken ─────────────────────────────────────────────────

  function handleRegister() {
    setRegisterError(null);
    if (!registerLockerId) {
      setRegisterError("사물함을 선택하세요.");
      return;
    }
    startTransition(async () => {
      const ok = await patchLocker(registerLockerId, "BROKEN", registerNote.trim() || undefined);
      if (ok) {
        const found = availableLockers.find((l) => l.id === registerLockerId);
        if (found) {
          const newRow: LockerRow = {
            id: found.id,
            zone: found.zone,
            lockerNumber: found.lockerNumber,
            status: "BROKEN",
            note: registerNote.trim() || null,
            updatedAt: new Date().toISOString(),
          };
          setBrokenLockers((prev) => [...prev, newRow]);
        }
        setRegisterLockerId("");
        setRegisterNote("");
        setActionSuccess("신규 고장 등록 완료");
        setTimeout(() => setActionSuccess(null), 4000);
        setActiveTab("broken");
        router.refresh();
      } else {
        setRegisterError(actionError ?? "등록 실패");
      }
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const TABS: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "broken", label: "고장 목록", count: brokenLockers.length },
    { key: "blocked", label: "폐쇄 목록", count: blockedLockers.length },
    { key: "register", label: "신규 고장 등록" },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "border-ember/30 bg-ember text-white"
                  : "border-ink/10 bg-white text-slate hover:border-ember/30 hover:text-ember"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-ink/10 text-slate"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Success / Error banners */}
      {actionSuccess && (
        <div className="mb-4 rounded-[14px] border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {/* ── Broken tab ─────────────────────────────────────────────────────── */}
      {activeTab === "broken" && (
        <>
          {brokenLockers.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 py-20 text-center text-sm text-slate">
              고장 사물함이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">번호</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">구역</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">상태</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">메모</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">최종 변경</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5 bg-white">
                  {brokenLockers.map((l) => {
                    const isProcessing = actionLoading === l.id && isPending;
                    return (
                      <tr key={l.id} className={`transition-colors hover:bg-mist/50 ${isProcessing ? "opacity-60" : ""}`}>
                        <td className="whitespace-nowrap px-5 py-3 font-mono font-semibold text-ink">
                          <Link href={`/admin/lockers/${l.id}`} className="hover:text-ember hover:underline">
                            {l.lockerNumber}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate">
                          {zoneLabel[l.zone] ?? l.zone}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[l.status] ?? ""}`}>
                            {STATUS_LABEL[l.status] ?? l.status}
                          </span>
                        </td>
                        <td className="max-w-xs px-5 py-3 text-xs text-slate">
                          {l.note ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">
                          {formatDateTime(l.updatedAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          {isProcessing ? (
                            <span className="text-xs text-slate">처리 중…</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openFixModal(l)}
                                className="rounded-full border border-forest/30 bg-forest/5 px-3 py-1 text-xs font-medium text-forest hover:bg-forest/10 transition-colors"
                              >
                                수리 완료
                              </button>
                              <button
                                onClick={() => openBlockModal(l)}
                                className="rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-slate hover:border-ink/40 hover:text-ink transition-colors"
                              >
                                폐쇄 전환
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Blocked tab ────────────────────────────────────────────────────── */}
      {activeTab === "blocked" && (
        <>
          {blockedLockers.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 py-20 text-center text-sm text-slate">
              폐쇄 사물함이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">번호</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">구역</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">상태</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">메모</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">최종 변경</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5 bg-white">
                  {blockedLockers.map((l) => {
                    const isProcessing = actionLoading === l.id && isPending;
                    return (
                      <tr key={l.id} className={`transition-colors hover:bg-mist/50 ${isProcessing ? "opacity-60" : ""}`}>
                        <td className="whitespace-nowrap px-5 py-3 font-mono font-semibold text-ink">
                          <Link href={`/admin/lockers/${l.id}`} className="hover:text-ember hover:underline">
                            {l.lockerNumber}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate">
                          {zoneLabel[l.zone] ?? l.zone}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[l.status] ?? ""}`}>
                            {STATUS_LABEL[l.status] ?? l.status}
                          </span>
                        </td>
                        <td className="max-w-xs px-5 py-3 text-xs text-slate">
                          {l.note ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">
                          {formatDateTime(l.updatedAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          {isProcessing ? (
                            <span className="text-xs text-slate">처리 중…</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleUnblock(l)}
                                className="rounded-full border border-forest/30 bg-forest/5 px-3 py-1 text-xs font-medium text-forest hover:bg-forest/10 transition-colors"
                              >
                                폐쇄 해제
                              </button>
                              <button
                                onClick={() => handleKeepBlocked(l)}
                                className="rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-slate hover:border-ink/40 hover:text-ink transition-colors"
                              >
                                메모 수정
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Register tab ───────────────────────────────────────────────────── */}
      {activeTab === "register" && (
        <div className="max-w-lg rounded-[24px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-ink">신규 고장 등록</h2>
          <p className="mb-4 text-sm text-slate">
            현재 정상 상태인 사물함을 고장으로 등록합니다.
          </p>

          {registerError && (
            <div className="mb-4 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {registerError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                사물함 선택 *
              </label>
              <select
                value={registerLockerId}
                onChange={(e) => setRegisterLockerId(e.target.value)}
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              >
                <option value="">사물함을 선택하세요</option>
                {availableLockers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.zoneLabel} — {l.lockerNumber}호
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate">
                고장 내용 (선택)
              </label>
              <textarea
                value={registerNote}
                onChange={(e) => setRegisterNote(e.target.value)}
                rows={3}
                placeholder="예: 자물쇠 파손, 문짝 힌지 고장 등"
                className="w-full resize-none rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>

            <button
              onClick={handleRegister}
              disabled={isPending || !registerLockerId}
              className="w-full rounded-[14px] bg-ink py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-60"
            >
              {isPending ? "등록 중…" : "고장 등록"}
            </button>
          </div>
        </div>
      )}

      {/* ── Note / Confirmation Modal ─────────────────────────────────────── */}
      {noteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-ink/10 bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-ink">
              {noteTarget.action === "fix"
                ? `사물함 ${noteTarget.lockerNumber} 수리 완료`
                : `사물함 ${noteTarget.lockerNumber} 폐쇄 유지`}
            </h3>
            <p className="mb-4 text-sm text-slate">
              {noteTarget.action === "fix"
                ? "수리 완료 후 상태를 '사용 가능'으로 변경합니다. 해결 메모를 남길 수 있습니다."
                : "폐쇄 상태를 유지합니다. 메모를 수정할 수 있습니다."}
            </p>

            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-slate">
                메모 (선택)
              </label>
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                rows={3}
                placeholder={
                  noteTarget.action === "fix"
                    ? "예: 자물쇠 교체 완료"
                    : "예: 구조적 문제로 장기 폐쇄"
                }
                className="w-full resize-none rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => { setNoteTarget(null); setNoteInput(""); }}
                className="rounded-full border border-ink/20 px-4 py-2 text-sm text-slate hover:border-ink/40 hover:text-ink"
              >
                닫기
              </button>
              <button
                onClick={handleModalConfirm}
                disabled={isPending}
                className={`rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
                  noteTarget.action === "fix"
                    ? "bg-forest hover:bg-forest/80"
                    : "bg-ink hover:bg-ink/80"
                }`}
              >
                {isPending
                  ? "처리 중…"
                  : noteTarget.action === "fix"
                    ? "수리 완료 처리"
                    : "폐쇄 유지"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
