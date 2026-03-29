"use client";

import { useEffect, useState } from "react";

export function SidebarCollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("admin-sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("admin-sidebar-collapsed", String(next));
    window.dispatchEvent(
      new CustomEvent("sidebar-collapse-change", { detail: { collapsed: next } }),
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      className="hidden lg:flex h-full w-5 shrink-0 items-center justify-center bg-[#0B1120] text-gray-500 hover:text-gray-200 border-r border-white/5 transition-colors"
    >
      <svg
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        {collapsed ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        )}
      </svg>
    </button>
  );
}
