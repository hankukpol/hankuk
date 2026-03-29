"use client";

import { useEffect, useMemo, useState } from "react";
import { useTenantConfig } from "@/components/providers/TenantProvider";

interface SiteSettingsResponse {
  settings?: {
    "site.footerDisclaimer"?: string;
  };
}

export default function Footer() {
  const tenant = useTenantConfig();
  const defaultDisclaimer = useMemo(
    () =>
      `면책조항: 본 서비스는 수험생의 합격 예측을 위한 참고용 분석 도구이며, 실제 합격 여부를 보장하지 않습니다. ${tenant.footerDisclaimer}`,
    [tenant.footerDisclaimer]
  );
  const [disclaimer, setDisclaimer] = useState(defaultDisclaimer);

  useEffect(() => {
    setDisclaimer(defaultDisclaimer);
  }, [defaultDisclaimer]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/site-settings", { method: "GET", cache: "no-store" });
        const data = (await response.json()) as SiteSettingsResponse;
        const text = data.settings?.["site.footerDisclaimer"];
        if (!cancelled && typeof text === "string" && text.trim()) {
          setDisclaimer(text);
        }
      } catch {
        // Keep the tenant default disclaimer when the public settings endpoint is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant.type]);

  return (
    <footer className="border-t border-slate-800 bg-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-5">
        <p className="text-xs leading-relaxed text-white/70 sm:text-sm">{disclaimer}</p>
      </div>
    </footer>
  );
}
