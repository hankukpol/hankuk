"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { AdminAttendanceBoardProps } from "@/components/attendance/AdminAttendanceBoard";
import type { MobileCheckFormProps } from "@/components/attendance/MobileCheckForm";
import { CHECK_SAFETY_CHANGED, hasPendingCheckChanges } from "@/lib/check-navigation";

const boardFallback = () => (
  <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
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
  const editingStarted = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncMode = () => {
      if (hasPendingCheckChanges()) editingStarted.current = true;
      // Keep this form for the rest of the visit after editing starts. Remounting
      // after a save would reuse the other form's stale server-rendered props.
      if (!editingStarted.current) setMode(mediaQuery.matches ? "mobile" : "desktop");
    };

    syncMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncMode);
      window.addEventListener(CHECK_SAFETY_CHANGED, syncMode);
      return () => { mediaQuery.removeEventListener("change", syncMode); window.removeEventListener(CHECK_SAFETY_CHANGED, syncMode); };
    }

    mediaQuery.addListener(syncMode);
    window.addEventListener(CHECK_SAFETY_CHANGED, syncMode);
    return () => { mediaQuery.removeListener(syncMode); window.removeEventListener(CHECK_SAFETY_CHANGED, syncMode); };
  }, []);

  return mode === "mobile" ? <MobileCheckForm {...mobileProps} /> : <AdminAttendanceBoard {...desktopProps} />;
}
