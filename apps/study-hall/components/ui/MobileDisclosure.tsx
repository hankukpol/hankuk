"use client";

import { useEffect, useState, type ReactNode } from "react";

export function MobileDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return <details className="admin-disclosure admin-responsive-disclosure" open={!mobile || open}>
    <summary className="md:hidden" onClick={(event) => { event.preventDefault(); setOpen((current) => !current); }}>{title}</summary>
    <div className="admin-responsive-disclosure-body">{children}</div>
  </details>;
}
