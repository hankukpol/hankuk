"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { SessionSummary } from "@/lib/sessions";

type UseSessionSelectionArgs = {
  sessions: SessionSummary[];
  initialSessionId?: string;
  sessionId?: string;
  onSessionIdChange?: (sessionId: string) => void;
};

export function getDefaultSessionId(
  sessions: SessionSummary[],
  preferredSessionId?: string,
) {
  if (preferredSessionId && sessions.some((session) => session.id === preferredSessionId)) {
    return preferredSessionId;
  }

  return (
    sessions.find((session) => session.status === "active")?.id ??
    sessions[0]?.id ??
    ""
  );
}

export function useSessionSelection({
  sessions,
  initialSessionId,
  sessionId: controlledSessionId,
  onSessionIdChange,
}: UseSessionSelectionArgs) {
  const [uncontrolledSessionId, setUncontrolledSessionId] = useState(
    initialSessionId ?? "",
  );
  const sessionId = controlledSessionId ?? uncontrolledSessionId;

  useEffect(() => {
    if (controlledSessionId !== undefined || sessionId) {
      return;
    }

    const defaultSessionId = getDefaultSessionId(sessions, initialSessionId);

    if (defaultSessionId) {
      setUncontrolledSessionId(defaultSessionId);
    }
  }, [controlledSessionId, initialSessionId, sessionId, sessions]);

  const setSessionId = useCallback(
    (nextSessionId: string) => {
      if (controlledSessionId === undefined) {
        setUncontrolledSessionId(nextSessionId);
      }

      onSessionIdChange?.(nextSessionId);
    },
    [controlledSessionId, onSessionIdChange],
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessionId, sessions],
  );

  return {
    selectedSession,
    sessionId,
    setSessionId,
  };
}
