"use client";

import { useEffect } from "react";

const DEV_SW_RESET_KEY = "__interview_mate_dev_sw_reset__";

export function PwaBootstrap() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) => {
          if (registrations.length === 0) {
            window.sessionStorage.removeItem(DEV_SW_RESET_KEY);
            return;
          }

          await Promise.all(
            registrations.map((registration) => registration.unregister()),
          );

          if (
            navigator.serviceWorker.controller &&
            !window.sessionStorage.getItem(DEV_SW_RESET_KEY)
          ) {
            window.sessionStorage.setItem(DEV_SW_RESET_KEY, "1");
            window.location.reload();
            return;
          }

          window.sessionStorage.removeItem(DEV_SW_RESET_KEY);
        })
        .catch(() => undefined);
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
}
