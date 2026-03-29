"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";

type StudentLogoutButtonProps = {
  divisionSlug: string;
  isPill?: boolean;
};

export function StudentLogoutButton({
  divisionSlug,
  isPill,
}: StudentLogoutButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.push(`/${divisionSlug}/student/login`);
      router.refresh();
      setIsSubmitting(false);
    }
  }

  const baseClass =
    "inline-flex items-center justify-center gap-1.5 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70";

  if (isPill) {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={isSubmitting}
        className={`${baseClass} rounded-full bg-black px-5 py-2.5 text-[12px] font-bold text-white shadow-lg`}
      >
        {isSubmitting ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogOut className="h-3.5 w-3.5" />
        )}
        로그아웃
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isSubmitting}
      className={`${baseClass} rounded-[10px] border px-2 py-1.5 text-[11px] font-semibold md:px-3 md:py-2 md:text-sm`}
      style={{
        borderColor: "var(--division-accent-border)",
        backgroundColor: "var(--division-accent-surface)",
        color: "var(--division-on-accent)",
      }}
    >
      {isSubmitting ? (
        <LoaderCircle className="h-3 w-3 animate-spin md:h-4 md:w-4" />
      ) : (
        <LogOut className="h-3 w-3 md:h-4 md:w-4" />
      )}
      로그아웃
    </button>
  );
}
