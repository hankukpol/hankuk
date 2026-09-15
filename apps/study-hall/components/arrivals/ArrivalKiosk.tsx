"use client";

import { Delete } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";
import { formatKstDateTime } from "@/lib/date-utils";
import { ArrivalFeedback } from "./ArrivalFeedback";
import { ArrivalRequestError, arrivalRequest, useArrivalQuery } from "./arrival-client";

type KioskState = { status: "ready"; numberLength: number; popupMs: number } | {
  status: "unpaired" | "pending" | "expired" | "disabled"; code?: string; expiresAt?: string;
};

export function ArrivalKiosk({ divisionSlug, divisionName }: { divisionSlug: string; divisionName: string }) {
  const endpoint = `/api/${divisionSlug}/arrival-kiosk`;
  const storageKey = `arrival-pair-code:${divisionSlug}`;
  const [pending, setPending] = useState(false);
  const query = useArrivalQuery<KioskState>(endpoint, pending ? 3000 : 30000);
  const [code, setCode] = useState("");
  const [pairExpires, setPairExpires] = useState<string>();
  const [number, setNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [completion, setCompletion] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const numberRef = useRef("");
  const locked = useRef(false);
  const pairLock = useRef(false);
  const alive = useRef(true);
  const ready = query.data?.status === "ready" && !blocked && !query.error;
  const config = query.data?.status === "ready" ? query.data : null;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { try { setCode(sessionStorage.getItem(storageKey) ?? ""); } catch { /* Storage is optional; the cookie remains the proof. */ } }, [storageKey]);
  useEffect(() => {
    if (!query.data) return;
    setBlocked(false);
    setPending(query.data.status === "pending" || (query.data.status === "disabled" && !!code));
    if (query.data.status !== "ready" && query.data.expiresAt) setPairExpires(query.data.expiresAt);
    if (query.data.status === "ready") {
      setCode("");
      try { sessionStorage.removeItem(storageKey); } catch { /* No persistent client secret. */ }
    }
  }, [query.data, storageKey, code]);


  const closeCompletion = useCallback(() => {
    numberRef.current = "";
    setNumber("");
    locked.current = false;
    setCompletion(null);
  }, []);

  async function submit(value: string) {
    if (!ready || !config || locked.current || value.length !== config.numberLength || !/^\d+$/.test(value)) return;
    locked.current = true; // Lock before React commits a new render, including Enter + final digit.
    setSaving(true);
    setError(null);
    try {
      const result = await arrivalRequest<{ ok: true; popupMs: number }>(endpoint, { method: "POST", body: JSON.stringify({ studentNumber: value }) });
      if (alive.current) setCompletion(result.popupMs);
    } catch (cause) {
      if (!alive.current) return;
      setError(cause);
      locked.current = false;
      if (cause instanceof ArrivalRequestError && cause.status === 400) {
        numberRef.current = "";
        setNumber("");
        await query.reload();
      }
      if (cause instanceof ArrivalRequestError && [401, 403, 409].includes(cause.status)) {
        setBlocked(true);
        await query.reload();
      }
    } finally { if (alive.current) setSaving(false); }
  }

  function updateNumber(value: string) {
    if (!ready || !config || locked.current) return;
    const digits = value.replace(/\D/g, "");
    if (digits.length > config.numberLength) return;
    const changed = digits !== numberRef.current;
    numberRef.current = digits;
    setNumber(digits);
    setError(null);
    if (changed && digits.length === config.numberLength) void submit(digits);
  }

  async function pair() {
    if (pairLock.current) return;
    pairLock.current = true; setPairing(true); setError(null);
    try {
      const result = await arrivalRequest<{ code: string; expiresAt: string }>(`${endpoint}/pair`, { method: "POST" });
      if (!alive.current) return;
      setCode(result.code); setPairExpires(result.expiresAt); setPending(true);
      try { sessionStorage.setItem(storageKey, result.code); } catch { /* Display from memory if storage is unavailable. */ }
      await query.reload();
    } catch (cause) { if (alive.current) setError(cause); }
    finally { pairLock.current = false; if (alive.current) setPairing(false); }
  }

  const status = query.data?.status;
  return <main className="admin-shell">
    <div className="admin-arrival-kiosk admin-flat-page">
      <header><p className="admin-label mb-2 break-keep">{divisionName}</p><h1 className="admin-page-title">등원 체크</h1><p className="admin-help mt-2">화면의 숫자 버튼으로 수험번호를 입력해 주세요.</p></header>
      <ArrivalFeedback error={error || query.error} loading={!query.data && query.loading} onRetry={() => { setError(null); void query.reload(); }} />
      {ready && config ? <form onSubmit={event => { event.preventDefault(); void submit(numberRef.current); }} className="space-y-4" aria-busy={saving}>
        <label className="block"><span className="admin-label mb-2 block">수험번호 {config.numberLength}자리</span>
          <input className="admin-arrival-number w-full" type="text" inputMode="none" tabIndex={-1} autoComplete="off" autoCorrect="off" spellCheck={false} value={number} maxLength={config.numberLength} readOnly aria-describedby="arrival-kiosk-help" onPointerDown={event => event.preventDefault()} />
        </label>
        <p id="arrival-kiosk-help" className="admin-help" role="status">{saving ? "등원을 기록하고 있습니다." : `${config.numberLength}자리를 모두 입력하면 자동으로 제출됩니다.`}</p>
        <div className="admin-arrival-keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "delete"].map(key => <button key={key} type="button" className={`admin-button admin-arrival-key ${/^\d$/.test(key) ? "admin-arrival-numeric-key" : ""}`} disabled={saving || completion !== null} onPointerDown={event => event.preventDefault()} aria-label={key === "clear" ? "전체 지움" : key === "delete" ? "한 자리 지움" : key} onClick={() => { updateNumber(key === "clear" ? "" : key === "delete" ? numberRef.current.slice(0, -1) : numberRef.current + key); }}>{key === "clear" ? "전체 지움" : key === "delete" ? <Delete className="h-5 w-5" /> : key}</button>)}
        </div>
        {!!error && <button className="admin-button admin-button-primary w-full" type="submit" disabled={saving || number.length !== config.numberLength}>같은 번호 다시 제출</button>}
      </form> : query.data && <section className="space-y-4">
        <h2 className="admin-section-title">{status === "pending" ? "관리자 승인 대기" : status === "disabled" ? "등원 체크 사용 중지" : status === "expired" ? "기기 등록 만료" : "공용 기기 등록"}</h2>
        <p className="admin-help">{status === "disabled" ? "관리자에게 등원 설정과 기기 승인 상태를 확인해 주세요." : "이 기기에서 등록코드를 만든 뒤, 관리자가 별도 기기의 등원 설정에서 승인해 주세요."}</p>
        {(status === "pending" || pending) && code && <div><p className="admin-label">등록코드</p><p className="admin-arrival-pair-code">{code}</p>{pairExpires && <p className="admin-help">{formatKstDateTime(pairExpires)}까지 유효</p>}</div>}
        {(status === "pending" || pending) && <p className="admin-help" role="status">3초마다 승인 상태를 확인합니다.</p>}
        <div className="flex flex-wrap gap-3">
          <button className="admin-button admin-button-primary" disabled={pairing} type="button" onClick={() => void pair()}>{pairing ? "등록 요청 중" : code ? "등록코드 다시 받기" : "기기 등록코드 받기"}</button>
          <button type="button" className="admin-text-action" disabled={query.loading} onClick={() => void query.reload()}>상태 새로고침</button>
        </div>
      </section>}
      <ActionCompleteModal open={completion !== null} onClose={closeCompletion} title="출석 확인되었습니다." description="다음 학생은 수험번호를 입력해 주세요." notice="" badge="완료" autoCloseMs={completion ?? undefined} />
    </div>
  </main>;
}
