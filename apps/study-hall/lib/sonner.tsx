"use client";

import { type ReactNode, useSyncExternalStore } from "react";

type ToastVariant = "default" | "success" | "error" | "warning";

type ToastItem = {
  id: number;
  message: ReactNode;
  variant: ToastVariant;
};

type ToastListener = () => void;

type ToastFunction = ((message: ReactNode) => number) & {
  dismiss: (id?: number) => void;
  error: (message: ReactNode) => number;
  message: (message: ReactNode) => number;
  success: (message: ReactNode) => number;
  warning: (message: ReactNode) => number;
};

type ToasterProps = {
  position?:
    | "bottom-center"
    | "bottom-left"
    | "bottom-right"
    | "top-center"
    | "top-left"
    | "top-right";
  richColors?: boolean;
};

const listeners = new Set<ToastListener>();
const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>();

let nextToastId = 1;
let toastItems: ToastItem[] = [];

const AUTO_DISMISS_MS = 3200;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: ToastListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toastItems;
}

function clearDismissTimer(id: number) {
  const timer = dismissTimers.get(id);

  if (timer) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
}

function dismiss(id?: number) {
  if (typeof id === "number") {
    clearDismissTimer(id);
    toastItems = toastItems.filter((item) => item.id !== id);
    emitChange();
    return;
  }

  dismissTimers.forEach((timer) => clearTimeout(timer));
  dismissTimers.clear();
  toastItems = [];
  emitChange();
}

function scheduleDismiss(id: number) {
  clearDismissTimer(id);

  const timer = setTimeout(() => {
    dismiss(id);
  }, AUTO_DISMISS_MS);

  dismissTimers.set(id, timer);
}

function addToast(message: ReactNode, variant: ToastVariant) {
  const id = nextToastId++;

  toastItems = [...toastItems, { id, message, variant }];
  emitChange();
  scheduleDismiss(id);

  return id;
}

function getToastToneClasses(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "error":
      return "border-red-200 bg-red-50 text-red-950";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-950";
    default:
      return "border-slate-200 bg-white text-slate-950";
  }
}

function getToastAccentClasses(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return "bg-emerald-500";
    case "error":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    default:
      return "bg-slate-400";
  }
}

function getPositionClasses(position: NonNullable<ToasterProps["position"]>) {
  switch (position) {
    case "top-left":
      return "top-4 left-4 items-start";
    case "top-center":
      return "top-4 left-1/2 -translate-x-1/2 items-center";
    case "bottom-left":
      return "bottom-4 left-4 items-start";
    case "bottom-center":
      return "bottom-4 left-1/2 -translate-x-1/2 items-center";
    case "bottom-right":
      return "right-4 bottom-4 items-end";
    case "top-right":
    default:
      return "top-4 right-4 items-end";
  }
}

const baseToast = ((message: ReactNode) => addToast(message, "default")) as ToastFunction;

baseToast.dismiss = dismiss;
baseToast.error = (message: ReactNode) => addToast(message, "error");
baseToast.message = (message: ReactNode) => addToast(message, "default");
baseToast.success = (message: ReactNode) => addToast(message, "success");
baseToast.warning = (message: ReactNode) => addToast(message, "warning");

export const toast = baseToast;

export function Toaster({ position = "top-right" }: ToasterProps) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-atomic="false"
      aria-live="polite"
      className={`pointer-events-none fixed z-[1000] flex w-[min(100vw-2rem,24rem)] flex-col gap-2 ${getPositionClasses(position)}`}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto overflow-hidden rounded-2xl border shadow-[0_18px_45px_rgba(15,23,42,0.14)] ${getToastToneClasses(item.variant)}`}
          role="status"
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getToastAccentClasses(item.variant)}`} />
            <div className="min-w-0 flex-1 text-sm font-medium leading-6">{item.message}</div>
            <button
              aria-label="알림 닫기"
              className="shrink-0 rounded-full p-1 text-current/60 transition hover:bg-black/5 hover:text-current"
              onClick={() => dismiss(item.id)}
              type="button"
            >
              <span aria-hidden="true" className="block text-sm leading-none">
                x
              </span>
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
