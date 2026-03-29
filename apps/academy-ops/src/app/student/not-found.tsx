import Link from "next/link";

export default function StudentNotFound() {
  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel">
          <div
            className="px-6 py-8 sm:px-8 sm:py-10"
            style={{ background: "linear-gradient(135deg, #EEF4F1 0%, #F7F4EF 100%)" }}
          >
            <div
              className="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]"
              style={{ background: "#D6E9DF", color: "#1F4D3A", border: "1px solid #9FCDB4" }}
            >
              404
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              해당 페이지를 찾을 수 없습니다
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-8 text-slate sm:text-base">
              요청하신 페이지가 존재하지 않거나 이동되었습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold text-white transition"
                style={{ background: "#1F4D3A" }}
              >
                포털 홈으로
              </Link>
              <Link
                href="/student/login"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ink/20"
              >
                로그인
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
