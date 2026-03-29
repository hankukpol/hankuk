"use client";

import { useEffect } from "react";
import { useTenantType } from "@/components/providers/TenantProvider";

const SESSION_KEY_PREFIX = "visitor_tracked_";

function getOrCreateAnonId(storageKey: string): string {
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) {
      return existing;
    }

    const uuid = crypto.randomUUID();
    localStorage.setItem(storageKey, uuid);
    return uuid;
  } catch {
    return crypto.randomUUID();
  }
}

export default function VisitorTracker() {
  const tenantType = useTenantType();

  useEffect(() => {
    const anonIdKey = tenantType === "police" ? "police_visitor_id" : "fire_visitor_id";
    const today = new Date().toISOString().slice(0, 10);
    const sessionKey = `${SESSION_KEY_PREFIX}${tenantType}_${today}`;
    if (sessionStorage.getItem(sessionKey)) {
      return;
    }

    const anonymousId = getOrCreateAnonId(anonIdKey);

    fetch("/api/track-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousId }),
    })
      .then((response) => {
        if (response.ok) {
          sessionStorage.setItem(sessionKey, "1");
        }
      })
      .catch(() => {
        // Ignore tracking failures so they do not affect the public page flow.
      });
  }, [tenantType]);

  return null;
}
