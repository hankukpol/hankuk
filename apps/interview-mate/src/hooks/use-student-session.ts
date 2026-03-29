"use client";

import { useCallback } from "react";

const STORAGE_KEY = "im_student_session";

type StoredSession = {
  token: string;
  roomId?: string;
  track?: string;
  name?: string;
};

export function saveStudentSession(session: StoredSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
}

export function loadStudentSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export function clearStudentSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function useStudentSession() {
  const save = useCallback((session: StoredSession) => {
    saveStudentSession(session);
  }, []);

  const load = useCallback(() => {
    return loadStudentSession();
  }, []);

  const clear = useCallback(() => {
    clearStudentSession();
  }, []);

  return { save, load, clear };
}
