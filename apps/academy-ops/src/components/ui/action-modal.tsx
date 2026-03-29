"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export type ActionModalProps = {
  open: boolean;
  badgeLabel: string;
  badgeTone?: "default" | "success" | "warning";
  title: string;
  description: string;
  details?: string[];
  panelClassName?: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmTone?: "default" | "danger";
  isPending?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  children?: ReactNode;
};

const badgeToneClass = {
  default: "border-ink/10 bg-mist text-ink",
  success: "border-forest/20 bg-forest/10 text-forest",
  warning: "border-ember/20 bg-ember/10 text-ember",
} as const;

const confirmToneClass = {
  default: "bg-ink text-white hover:bg-forest",
  danger: "bg-red-600 text-white hover:bg-red-700",
} as const;

export function ActionModal({
  open,
  badgeLabel,
  badgeTone = "default",
  title,
  description,
  details = [],
  panelClassName,
  cancelLabel,
  confirmLabel,
  confirmTone = "default",
  isPending = false,
  onClose,
  onConfirm,
  children,
}: ActionModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialog = dialogRef.current;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusableElements = () => {
      if (!dialog) {
        return [] as HTMLElement[];
      }

      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
    };

    const focusableElements = getFocusableElements();
    const initialFocusTarget = focusableElements[0] ?? dialog;
    initialFocusTarget?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const elements = getFocusableElements();

      if (elements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === firstElement || !dialog?.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }

        return;
      }

      if (!activeElement || activeElement === lastElement || !dialog?.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [isPending, onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`max-h-[calc(100vh-4rem)] w-full overflow-y-auto rounded-[28px] border border-ink/10 bg-white p-6 shadow-2xl ${panelClassName ?? "max-w-md"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${badgeToneClass[badgeTone]}`}
        >
          {badgeLabel}
        </div>
        <h3 id={titleId} className="mt-4 text-2xl font-semibold text-ink">
          {title}
        </h3>
        <p id={descriptionId} className="mt-3 text-sm leading-7 text-slate">
          {description}
        </p>
        {details.length > 0 ? (
          <div className="mt-5 rounded-3xl bg-mist p-4">
            <div className="space-y-2 text-sm text-ink">
              {details.map((detail) => (
                <p key={detail}>{detail}</p>
              ))}
            </div>
          </div>
        ) : null}
        {children ? <div className="mt-5">{children}</div> : null}
        <div className="mt-6 flex justify-end gap-3">
          {cancelLabel ? (
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm ?? onClose}
            disabled={isPending}
            className={`inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${confirmToneClass[confirmTone]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
