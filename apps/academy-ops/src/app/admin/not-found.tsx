import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-[28px] border border-ink/10 bg-white p-8 text-center">
        <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
          Not Found
        </div>
        <p className="mt-6 text-6xl font-black tracking-[-0.04em] text-ink/10">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-ink">요청한 관리자 페이지를 찾을 수 없습니다.</h1>
        <p className="mt-3 text-sm leading-7 text-slate">
          주소가 변경되었거나 접근 가능한 메뉴가 아닐 수 있습니다. 관리자 대시보드에서 다시 이동해 주세요.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/admin"
            className="btn-ripple inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            대시보드로 이동
          </Link>
          <Link
            href="/"
            className="btn-ripple inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            홈으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
