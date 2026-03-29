"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Props {
  examNumber: string;
  isActive: boolean;
}

export function ToggleActiveButton({ examNumber, isActive }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(isActive);

  async function handleToggle() {
    if (
      !confirm(
        current ? "이 학생을 비활성화하시겠습니까?" : "이 학생을 활성화하시겠습니까?",
      )
    )
      return;
    setLoading(true);
    try {
      const res = await fetch(`/api/students/${examNumber}/toggle-active`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("실패");
      const json = (await res.json()) as { data: { isActive: boolean } };
      setCurrent(json.data.isActive);
      router.refresh();
    } catch {
      toast.error("상태 변경에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
        current
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${current ? "bg-green-500" : "bg-gray-400"}`}
      />
      {loading ? "처리 중..." : current ? "활성" : "비활성"}
    </button>
  );
}
