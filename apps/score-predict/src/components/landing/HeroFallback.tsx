import Link from "next/link";
import { ArrowRight, Sparkles, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroFallbackProps {
  badge: string;
  title: string;
  subtitle: string;
  isLoggedIn: boolean;
  primaryHref?: string;
  secondaryHref?: string;
  secondaryText?: string;
}

export default function HeroFallback({
  badge,
  title,
  subtitle,
  isLoggedIn,
  primaryHref,
  secondaryHref,
  secondaryText,
}: HeroFallbackProps) {
  const resolvedPrimaryHref = primaryHref ?? (isLoggedIn ? "/exam/main" : "/login");
  const resolvedSecondaryHref = secondaryHref ?? (isLoggedIn ? "/exam/input" : "/register");
  const primaryText = isLoggedIn ? "풀서비스 시작하기" : "로그인 후 시작";
  const resolvedSecondaryText = secondaryText ?? (isLoggedIn ? "빠른 채점 바로가기" : "회원가입");

  return (
    <section className="relative overflow-hidden border border-slate-200 bg-slate-100 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-slate-100" />

      <div className="relative grid gap-6 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-8">
        <div>
          <p className="inline-flex items-center gap-2 border border-slate-300 bg-white/60 px-3 py-1 text-xs font-semibold tracking-wide text-slate-700">
            <Sparkles className="h-3.5 w-3.5" />
            {badge}
          </p>
          <h1 className="mt-4 whitespace-pre-line text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">
            {subtitle}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={resolvedPrimaryHref}>
              <Button className="h-11 rounded-none bg-slate-900 px-6 text-sm font-bold text-white hover:bg-slate-800">
                {primaryText}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Link href={resolvedSecondaryHref}>
              <Button
                variant="outline"
                className="h-11 rounded-none border-slate-400 bg-white/60 px-6 text-sm font-semibold text-slate-700 hover:bg-white/80"
              >
                {resolvedSecondaryText}
              </Button>
            </Link>
          </div>
        </div>

        <div className="border border-slate-300 bg-white/70 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">서비스 운영 안내</p>
            <Timer className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <article className="border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-slate-500">모드</p>
              <p className="mt-1 text-base font-bold text-slate-900">실시간</p>
            </article>
            <article className="border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-slate-500">분석</p>
              <p className="mt-1 text-base font-bold text-slate-900">합격 예측</p>
            </article>
            <article className="border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-slate-500">지원</p>
              <p className="mt-1 text-base font-bold text-slate-900">모바일 · PC</p>
            </article>
            <article className="border border-slate-200 bg-white/80 p-3">
              <p className="text-xs text-slate-500">업데이트</p>
              <p className="mt-1 text-base font-bold text-slate-900">자동 반영</p>
            </article>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            답안을 입력하면 채점 결과, 체감, 지역 경쟁 분석까지 한 번에 확인할 수 있습니다.
          </p>
        </div>
      </div>
    </section>
  );
}
