"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";

type ToastType = "error" | "success" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showErrorToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastProviderProps {
  children: ReactNode;
}

function toastContainerClass(type: ToastType): string {
  if (type === "error") {
    return "border-rose-300 bg-rose-50 text-rose-800";
  }
  if (type === "success") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  return "border-slate-300 bg-white text-slate-800";
}

export default function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const timeoutRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const removeToast = useCallback((id: number) => {
    const timeoutId = timeoutRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const trimmed = message.trim();
      if (!trimmed) return;

      const id = nextIdRef.current;
      nextIdRef.current += 1;

      setToasts((prev) => [...prev, { id, type, message: trimmed }]);

      const timeoutId = setTimeout(() => {
        removeToast(id);
      }, 4500);
      timeoutRef.current.set(id, timeoutId);
    },
    [removeToast]
  );

  const showErrorToast = useCallback(
    (message: string) => {
      showToast(message, "error");
    },
    [showToast]
  );

  useEffect(() => {
    const timeoutMap = timeoutRef.current;

    return () => {
      for (const timeoutId of timeoutMap.values()) {
        clearTimeout(timeoutId);
      }
      timeoutMap.clear();
    };
  }, []);

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      showToast,
      showErrorToast,
    }),
    [showErrorToast, showToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      <div
        aria-live="assertive"
        className="pointer-events-none fixed right-4 top-20 z-[70] flex w-[min(92vw,380px)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-lg border px-3 py-2 shadow-sm ${toastContainerClass(toast.type)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium leading-5">{toast.message}</p>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="rounded p-0.5 text-current/70 transition hover:bg-black/5 hover:text-current"
                aria-label="토스트 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast는 ToastProvider 내부에서만 사용할 수 있습니다.");
  }
  return context;
}
