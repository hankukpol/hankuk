"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("전역 오류가 발생했습니다.", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-16">
      <section className="w-full rounded-xl border border-rose-200 bg-white p-6 text-center sm:p-8">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">문제가 발생했습니다.</h1>
        <p className="mt-2 text-sm text-slate-600">
          잠시 후 다시 시도해 주세요. 같은 문제가 반복되면 관리자에게 문의해 주세요.
        </p>

        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button type="button" onClick={reset}>
            다시 시도
          </Button>
          <Link href="/">
            <Button type="button" variant="outline">
              메인으로 이동
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
