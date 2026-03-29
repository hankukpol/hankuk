import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-16">
      <section className="w-full rounded-xl border border-slate-200 bg-white p-6 text-center sm:p-8">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">페이지를 찾을 수 없습니다.</h1>
        <p className="mt-2 text-sm text-slate-600">
          주소가 변경되었거나 삭제된 페이지입니다. 메인 페이지에서 다시 접근해 주세요.
        </p>

        <div className="mt-6">
          <Link href="/">
            <Button type="button">메인으로 이동</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
