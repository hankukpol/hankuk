"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";
import { makeCheckDraft, parseCheckDraft, restoreCheckDraft, type CheckCells, type CheckDraft } from "@/lib/check-draft";

const DraftOwner = createContext<string | null>(null);
export function CheckDraftOwner({ owner, children }: { owner: string; children: ReactNode }) {
  return <DraftOwner.Provider value={owner}>{children}</DraftOwner.Provider>;
}

export function CheckDraftSafety({ scope, values, baseline, busy = false, onRestore, onDiscard }: {
  scope: string;
  values: CheckCells;
  baseline: CheckCells;
  busy?: boolean;
  onRestore: (patch: CheckCells) => void;
  onDiscard: () => void;
}) {
  const owner = useContext(DraftOwner);
  const [tabId, setTabId] = useState<string | null>(null);
  const storagePrefix = owner ? `study-hall:check-draft:${JSON.stringify([owner, scope])}:` : null;
  const storageKey = storagePrefix && tabId ? `${storagePrefix}${tabId}` : null;
  const [recovery, setRecovery] = useState<CheckDraft | null>(null);
  const [notice, setNotice] = useState("");
  const readyKey = useRef<string | null>(null);
  const recoverySource = useRef<{ key: string; raw: string } | null>(null);
  const latest = useRef({ storageKey, values, baseline, recovery });
  latest.current = { storageKey, values, baseline, recovery };
  const dirty = Object.keys(makeCheckDraft(values, baseline).changes).length > 0;

  useEffect(() => {
    try {
      const id = sessionStorage.getItem("study-hall:check-tab") ?? crypto.randomUUID();
      sessionStorage.setItem("study-hall:check-tab", id);
      setTabId(id);
    } catch { setNotice("이 브라우저에서 임시 보관을 사용할 수 없습니다. 페이지를 닫기 전에 저장해 주세요."); }
  }, []);

  useEffect(() => {
    readyKey.current = null;
    setRecovery(null);
    recoverySource.current = null;
    if (!storageKey) return;
    setNotice("");
    try {
      const ownRaw = localStorage.getItem(storageKey);
      let saved = parseCheckDraft(ownRaw);
      if (saved && ownRaw) recoverySource.current = { key: storageKey, raw: ownRaw };
      // A reopened browser may have a new tab id. Offer the latest draft from
      // this account and context, without changing another tab's draft.
      if (!saved && storagePrefix) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key?.startsWith(storagePrefix)) continue;
          const raw = localStorage.getItem(key);
          const candidate = parseCheckDraft(raw);
          if (candidate && raw && Object.keys(restoreCheckDraft(candidate, latest.current.baseline).patch).length && (!saved || saved.savedAt < candidate.savedAt)) {
            saved = candidate;
            recoverySource.current = { key, raw };
          }
        }
      }
      if (saved && Object.keys(saved.changes).length) {
        latest.current.recovery = saved;
        setRecovery(saved);
      }
      else localStorage.removeItem(storageKey);
    } catch { setNotice("이 브라우저에서 임시 보관을 사용할 수 없습니다. 페이지를 닫기 전에 저장해 주세요."); }
    readyKey.current = storageKey;
  }, [storageKey, storagePrefix]);

  const persist = useCallback(() => {
    const current = latest.current;
    if (!current.storageKey || readyKey.current !== current.storageKey || current.recovery) return;
    try {
      const draft = makeCheckDraft(current.values, current.baseline);
      if (Object.keys(draft.changes).length) localStorage.setItem(current.storageKey, JSON.stringify(draft));
      else localStorage.removeItem(current.storageKey);
    } catch { setNotice("이 브라우저에서 임시 보관을 사용할 수 없습니다. 페이지를 닫기 전에 저장해 주세요."); }
  }, []);

  useEffect(() => { persist(); });
  useEffect(() => {
    const flush = () => persist();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [persist]);

  function consumeRecovery() {
    const source = recoverySource.current;
    // Consume the offered copy once, while preserving any newer edits in its tab.
    if (source) { try { if (localStorage.getItem(source.key) === source.raw) localStorage.removeItem(source.key); } catch { /* best effort */ } }
    recoverySource.current = null;
  }

  function discard() {
    consumeRecovery();
    if (storageKey) { try { localStorage.removeItem(storageKey); } catch { /* navigation guard still works */ } }
    latest.current = { ...latest.current, values: baseline, recovery: null };
    setRecovery(null);
    onDiscard();
  }

  return <>
    <UnsavedChangesGuard isDirty={dirty || Boolean(recovery)} isSaving={busy} onDiscard={discard} />
    {(dirty || busy) && <div className="admin-notice admin-notice-warning" role="status">{busy ? "저장·조회 처리 중입니다. 결과를 확인할 때까지 이 화면에서 기다려 주세요." : "저장하지 않은 변경사항이 있습니다. 저장 버튼을 눌러 반영해 주세요."}</div>}
    {notice && <div className="admin-notice admin-notice-warning" role="status">{notice}</div>}
    <ConfirmDialog open={Boolean(recovery)} title="미저장 입력 복구" description="이 계정으로 같은 날짜에 입력하다 저장하지 않은 내용이 있습니다. 서버 기록과 비교해 복구합니다. 복구 후 저장 버튼을 눌러야 반영됩니다."
      confirmLabel="입력 복구" cancelLabel="임시 입력 버리기" dismissible={false} onCancel={discard}
      onConfirm={() => {
        if (!recovery) return;
        const { patch, conflicts } = restoreCheckDraft(recovery, baseline);
        consumeRecovery();
        latest.current.recovery = null;
        if (conflicts) setNotice(`서버에서 변경되었거나 삭제된 ${conflicts}개 항목은 복구하지 않았습니다. 최신 출결을 확인해 주세요.`);
        setRecovery(null);
        onRestore(patch);
      }} />
  </>;
}
