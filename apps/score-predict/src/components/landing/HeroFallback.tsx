import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroFallbackProps {
  badge: string;
  title: string;
  subtitle: string;
  isLoggedIn: boolean;
  primaryHref?: string;
  secondaryHref?: string;
  primaryText?: string;
  secondaryText?: string;
  operationLabel?: string;
  operationDescription?: string;
}

export default function HeroFallback({
  badge,
  title,
  subtitle,
  isLoggedIn,
  primaryHref,
  secondaryHref,
  primaryText,
  secondaryText,
  operationLabel = "서비스 운영 준비 중",
  operationDescription = "공지사항에서 시험 운영 일정을 확인해 주세요.",
}: HeroFallbackProps) {
  const resolvedPrimaryHref = primaryHref ?? (isLoggedIn ? "/exam/main" : "/login");
  const resolvedSecondaryHref = secondaryHref ?? (isLoggedIn ? "/exam/input" : "/register");
  const resolvedPrimaryText = primaryText ?? (isLoggedIn ? "풀서비스 시작하기" : "로그인 후 시작");
  const resolvedSecondaryText = secondaryText ?? (isLoggedIn ? "빠른 채점 바로가기" : "회원가입");

  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-slate-100" />

      <div className="relative grid gap-6 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-8">
        <div>
          <p className="inline-flex items-center border-l-2 border-service-600 pl-3 text-xs font-semibold text-slate-700">
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
              <Button className="h-11 rounded-none bg-service-700 px-6 text-sm font-bold text-white hover:bg-service-800">
                {resolvedPrimaryText}
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

        <div className="border-l-2 border-service-600 bg-white/70 p-5">
          <p className="text-sm font-semibold text-slate-800">서비스 운영 안내</p>
          <div className="mt-4 bg-service-50 px-4 py-3">
            <p className="text-base font-bold text-service-900">{operationLabel}</p>
            <p className="mt-2 text-sm leading-6 text-service-800">{operationDescription}</p>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>정확한 채점과 과락 여부를 확인합니다.</li>
            <li>동일 시험 참여자의 문항별 정답률을 분석합니다.</li>
            <li>지역별 표본 수치는 참여인원과 함께 제공합니다.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
