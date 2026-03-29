"use client";

import { useState, useTransition } from "react";

type StudentLogoutButtonProps = {
  className?: string;
};

const LOGOUT_FAILED_MESSAGE = "\uB85C\uADF8\uC544\uC6C3\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
const LOGGING_OUT_LABEL = "\uB85C\uADF8\uC544\uC6C3 \uC911...";
const LOGOUT_LABEL = "\uB85C\uADF8\uC544\uC6C3";

export function StudentLogoutButton({ className }: StudentLogoutButtonProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/student/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? LOGOUT_FAILED_MESSAGE);
        }

        window.location.href = "/student/login";
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : LOGOUT_FAILED_MESSAGE,
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className={className}
        aria-describedby={errorMessage ? "student-logout-error" : undefined}
      >
        {isPending ? LOGGING_OUT_LABEL : LOGOUT_LABEL}
      </button>
      {errorMessage ? (
        <p id="student-logout-error" className="max-w-40 text-right text-xs text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}