"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { LearningPayload } from "@/lib/exam-preview/learning-report";
import type { LearningCommand } from "@/lib/exam-preview/learning-types";

type State = {
  data: LearningPayload | null;
  busy: boolean;
  error: string;
  save: (command: LearningCommand) => Promise<boolean>;
  refresh: () => Promise<void>;
};
const LearningContext = createContext<State | null>(null);
export function useLearning() {
  return useContext(LearningContext);
}
export function LearningProvider({
  division,
  studentId,
  children,
  preview = true,
}: {
  division: string;
  studentId?: string;
  children: ReactNode;
  preview?: boolean;
}) {
  const [data, setData] = useState<LearningPayload | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const url =
    "/api/" +
    encodeURIComponent(division) +
    (preview ? "/exam-analysis-preview/learning" : "/exam-analysis/learning") +
    (studentId ? "?studentId=" + encodeURIComponent(studentId) : "");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: "no-store" }),
        body = await response.json();
      if (!response.ok) throw Error(body.error);
      setData(body);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "학습 기록을 불러오지 못했습니다.",
      );
    }
  }, [url]);
  useEffect(() => {
    setData(null);
    void refresh();
  }, [refresh]);
  const saving = useRef(false);
  const save = useCallback(
    async (command: LearningCommand) => {
      if (!data || saving.current) return false;
      saving.current = true;
      setBusy(true);
      setError("");
      try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              revision: data.document.revision,
              requestId: crypto.randomUUID(),
              command,
            }),
          }),
          body = await response.json();
        if (!response.ok) throw Error(body.error);
        setData(body);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
        return false;
      } finally {
        saving.current = false;
        setBusy(false);
      }
    },
    [data, url],
  );
  const contextValue = useMemo(
    () => ({ data, busy, error, save, refresh }),
    [data, busy, error, save, refresh],
  );
  return (
    <LearningContext.Provider value={contextValue}>
      {error && (
        <div
          role="alert"
          className="admin-notice admin-notice-danger"
          data-report-navigation
        >
          {error}
          <button
            className="admin-text-action"
            type="button"
            onClick={() => void refresh()}
          >
            최신 자료 다시 불러오기
          </button>
        </div>
      )}
      {children}
    </LearningContext.Provider>
  );
}
