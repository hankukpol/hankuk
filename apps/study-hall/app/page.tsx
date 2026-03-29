import Link from "next/link";
import { ArrowRight, BookOpenCheck, Building2, Flame, LogIn, Shield } from "lucide-react";

import { getDivisions } from "@/lib/services/division.service";

const divisionIcons = {
  police: Shield,
  fire: Flame,
  allpass: Building2,
  "hankyung-sparta": BookOpenCheck,
} as const;

export const revalidate = 300;

export default async function HomePage() {
  const divisions = await getDivisions();

  return (
    <main className="min-h-screen bg-white px-4 py-10 md:px-8 lg:px-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="overflow-hidden rounded-[10px] border border-black/5 bg-white/90 shadow-[0_30px_80px_rgba(25,57,99,0.12)] backdrop-blur">
          <div className="grid gap-8 px-6 py-8 md:grid-cols-[1.3fr_0.7fr] md:px-10 md:py-10">
            <div className="space-y-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                시간통제 자습반
              </p>
              <div className="space-y-3">
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 md:text-5xl">
                  시간통제 자습반 관리 시스템
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                  직렬별 출결, 상벌점, 성적, 상담 흐름을 분리 관리하는 운영 플랫폼입니다. 아래
                  카드에서 지점별 관리자 화면으로 바로 이동할 수 있습니다.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  prefetch={false}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  <LogIn className="h-4 w-4" />
                  관리자 로그인
                </Link>
              </div>
            </div>

            <div className="rounded-[10px] border border-white/10 bg-slate-950 p-6 text-white">
              <p className="text-sm uppercase tracking-[0.24em] text-white/55">서비스 개요</p>
              <div className="mt-5 space-y-4">
                <div className="rounded-[10px] border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-white/70">운영 원칙</p>
                  <p className="mt-2 text-lg font-bold">
                    지점별 운영 분리와 기능 설정을 한 화면에서 관리합니다.
                  </p>
                </div>
                <div className="rounded-[10px] border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-white/70">운영 환경</p>
                  <p className="mt-2 text-lg font-bold">Vercel + Supabase 기반 운영</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          {divisions.map((division) => {
            const Icon = divisionIcons[division.slug as keyof typeof divisionIcons] ?? Shield;

            return (
              <Link
                key={division.id}
                href={`/${division.slug}/admin`}
                prefetch={false}
                className="group overflow-hidden rounded-[10px] border border-black/5 bg-white shadow-[0_18px_40px_rgba(18,32,56,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(18,32,56,0.12)]"
              >
                <div
                  className="p-6 text-white"
                  style={{
                    backgroundColor: `${division.color}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-[10px] bg-white/15">
                      <Icon className="h-6 w-6" />
                    </div>
                    <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
                  </div>
                  <h2 className="mt-10 text-2xl font-bold">{division.name}</h2>
                  <p className="mt-2 text-sm text-white/75">{division.fullName}</p>
                </div>

                <div className="space-y-3 px-6 py-5">
                  <p className="text-sm leading-6 text-slate-600">
                    출결 관리, 학생 명단, 상벌점, 보고서까지 지점별 운영 흐름으로 바로 들어갑니다.
                  </p>
                  <div className="flex items-center justify-between text-sm font-medium text-slate-900">
                    <span>관리자 화면으로 이동</span>
                    <span className="text-slate-400">/{division.slug}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
