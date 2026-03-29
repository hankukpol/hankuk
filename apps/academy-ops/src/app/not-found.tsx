import Link from "next/link";
import {
  getAcademyContactLine,
  getAcademyRuntimeBranding,
} from "@/lib/academy-branding";

export default async function NotFound() {
  const branding = await getAcademyRuntimeBranding();
  const academyContactLine = getAcademyContactLine(branding);

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel">
          <div className="px-6 py-10 sm:px-8 sm:py-14">
            <div
              className="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]"
              style={{
                background: "#FEF2E8",
                color: "#C55A11",
                border: "1px solid #F3C89E",
              }}
            >
              404
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              페이지를 찾을 수 없습니다
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-8 text-slate sm:text-base">
              요청하신 페이지가 존재하지 않거나 이동되었습니다. 아래 링크를 통해
              원하는 곳으로 이동해 주세요.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold text-white transition"
                style={{ background: branding.themeColor }}
              >
                로그인
              </Link>
              <Link
                href="/admin"
                className="inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold text-white transition"
                style={{ background: "#1F4D3A" }}
              >
                관리자 페이지
              </Link>
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ink/20"
              >
                학생 포털
              </Link>
            </div>
          </div>

          <div className="px-6 py-4 sm:px-8" style={{ background: "#1F4D3A" }}>
            <p className="text-sm font-medium" style={{ color: "#A8C9B8" }}>
              {branding.academyName} &mdash; {academyContactLine}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
