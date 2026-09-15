"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { useDialogFocus } from "@/lib/useDialogFocus";

export const MobileWorkspaceHost = createContext<HTMLElement | null>(null);
const MobileWorkspaceActive = createContext(true);

export function MobileWorkspaceScope({ active, children }: { active: boolean; children: ReactNode }) {
  const parentActive = useContext(MobileWorkspaceActive);
  return <MobileWorkspaceActive.Provider value={parentActive && active}>{children}</MobileWorkspaceActive.Provider>;
}

/** Keeps the same controlled fields mounted across viewport changes. */
export function MobileWorkspaceTools({ title, children, active = true, icon: Icon = SlidersHorizontal }: { title: string; children: ReactNode; active?: boolean; icon?: LucideIcon }) {
  const parentActive = useContext(MobileWorkspaceActive);
  active = active && parentActive;
  const contextHost = useContext(MobileWorkspaceHost);
  const anchor = useRef<HTMLSpanElement>(null);
  const [localHost, setLocalHost] = useState<HTMLElement | null>(null);
  const host = contextHost ?? localHost;
  const id = useId();
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDialogFocus<HTMLDivElement>(mobile && open && active, close);

  useEffect(() => { if (!active) setOpen(false); }, [active]);
  useEffect(() => {
    setLocalHost(anchor.current?.closest(".admin-shell")?.querySelector<HTMLElement>("[data-mobile-workspace-host]") ?? null);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => { setMobile(query.matches); setOpen(false); };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const trigger = <button type="button" data-mobile-tools-trigger className="admin-mobile-topbar-menu md:hidden" title={title} aria-label={title} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}><Icon className="h-5 w-5" /></button>;

  return <>
    <span ref={anchor} hidden />
    {active ? (host ? createPortal(trigger, host) : trigger) : null}
    <div className="admin-mobile-tools" data-open={open}>
      <button type="button" className="admin-overlay admin-mobile-tools-overlay" aria-label="작업 닫기" tabIndex={-1} onClick={close} />
      <div id={id} ref={ref} className="admin-mobile-tools-panel" role={mobile && open ? "dialog" : undefined} aria-modal={mobile && open ? true : undefined} aria-label={mobile && open ? title : undefined} tabIndex={mobile && open ? -1 : undefined}>
        <div className="admin-dialog-header admin-mobile-tools-heading">
          <h2 className="admin-dialog-title">{title}</h2>
          <button type="button" className="admin-dialog-close" aria-label="닫기" onClick={close}><X /></button>
        </div>
        <div className="admin-mobile-tools-body">{children}</div>
      </div>
    </div>
  </>;
}
