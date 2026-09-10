"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";

import { forgetStudentLogin } from "@/lib/login-storage";

type StudentLogoutButtonProps = {
  divisionSlug: string;
  /** @deprecated 색면 위 배치가 사라져 더 이상 구분하지 않는다. */
  isPill?: boolean;
};

export function StudentLogoutButton({ divisionSlug }: StudentLogoutButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      // 자동 로그인 저장도 함께 지운다. 남겨 두면 로그아웃하자마자 다시 들어가진다.
      forgetStudentLogin(divisionSlug);
      router.push(`/${divisionSlug}/student/login`);
      router.refresh();
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isSubmitting}
      className="admin-button"
    >
      {isSubmitting ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      로그아웃
    </button>
  );
}
