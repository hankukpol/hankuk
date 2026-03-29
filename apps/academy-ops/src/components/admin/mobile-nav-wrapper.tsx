"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

type Props = { children: React.ReactNode };

export function MobileNavWrapper({ children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  // Close nav on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Listen for toggle events from TopModuleNav
  useEffect(() => {
    function handleToggle() {
      setOpen((prev) => !prev);
    }
    window.addEventListener("toggle-sidebar", handleToggle);
    return () => window.removeEventListener("toggle-sidebar", handleToggle);
  }, []);

  // Init desktop collapse state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("admin-sidebar-collapsed");
    if (stored === "true") setDesktopCollapsed(true);
  }, []);

  // Listen for desktop collapse change event
  useEffect(() => {
    function handleCollapse(e: Event) {
      const ce = e as CustomEvent<{ collapsed: boolean }>;
      setDesktopCollapsed(ce.detail.collapsed);
    }
    window.addEventListener("sidebar-collapse-change", handleCollapse);
    return () => window.removeEventListener("sidebar-collapse-change", handleCollapse);
  }, []);

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar wrapper */}
      <div
        className={`fixed top-14 bottom-0 left-0 z-50 flex w-56 flex-col transition-transform duration-200 ease-in-out lg:static lg:top-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${desktopCollapsed ? "lg:hidden" : ""}`}
      >
        {children}
      </div>
    </>
  );
}
