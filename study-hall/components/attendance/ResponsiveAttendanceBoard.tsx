"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { AdminAttendanceBoardProps } from "@/components/attendance/AdminAttendanceBoard";
import type { MobileCheckFormProps } from "@/components/attendance/MobileCheckForm";

const boardFallback = () => (
  <div className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 text-sm text-slate-500 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
    출석 보드를 불러오는 중입니다.
  </div>
);

const AdminAttendanceBoard = dynamic(
  () => import("@/components/attendance/AdminAttendanceBoard").then((mod) => mod.AdminAttendanceBoard),
  { ssr: false, loading: boardFallback },
);

const MobileCheckForm = dynamic(
  () => import("@/components/attendance/MobileCheckForm").then((mod) => mod.MobileCheckForm),
  { ssr: false, loading: boardFallback },
);

type ResponsiveAttendanceBoardProps = {
  initialMode: "mobile" | "desktop";
  desktopProps: AdminAttendanceBoardProps;
  mobileProps: MobileCheckFormProps;
};

export function ResponsiveAttendanceBoard({
  initialMode,
  desktopProps,
  mobileProps,
}: ResponsiveAttendanceBoardProps) {
  const [mode, setMode] = useState<"mobile" | "desktop">(initialMode);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncMode = () => setMode(mediaQuery.matches ? "mobile" : "desktop");

    syncMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncMode);
      return () => mediaQuery.removeEventListener("change", syncMode);
    }

    mediaQuery.addListener(syncMode);
    return () => mediaQuery.removeListener(syncMode);
  }, []);

  return mode === "mobile" ? <MobileCheckForm {...mobileProps} /> : <AdminAttendanceBoard {...desktopProps} />;
}
