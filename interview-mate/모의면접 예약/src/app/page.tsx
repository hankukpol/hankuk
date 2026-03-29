import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Flame,
  LayoutDashboard,
  Shield,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { TRACKS } from "@/lib/constants";

const studentLinks = [
  {
    href: "/reservation?track=police",
    icon: CalendarClock,
    title: "경찰 모의면접 예약",
    description: "캘린더에서 날짜와 시간을 선택해 예약합니다.",
  },
  {
    href: "/apply?track=police",
    icon: Users,
    title: "경찰 조 편성 지원",
    description: "개인지원 또는 이미 구성된 조로 지원할 수 있습니다.",
  },
  {
    href: "/my-reservation?track=police",
    icon: ClipboardList,
    title: "내 예약 확인",
    description: "연락처로 예약 내역을 조회하고 변경 또는 취소합니다.",
  },
];

export default function Home() {
  return (
    <main className="student-container space-y-5">
      <section className="surface-card overflow-hidden">
        <div className="h-1.5 bg-[var(--division-color)]" />
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <Badge tone="brand">2026 상반기 준비</Badge>
            <span className="text-xs font-medium text-slate-500">
              한국경찰학원 운영 시스템
            </span>
          </div>
          <div className="space-y-2">
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-slate-950">
              모의면접 예약과 조 편성을
              <br />
              한 곳에서 관리합니다.
            </h1>
            <p className="text-sm leading-6 text-slate-600">
              학생용 예약과 조 편성 지원, 관리자용 회차 운영과 명단 관리까지
              문서 기준에 맞춰 한 화면 구조로 시작합니다.
            </p>
          </div>
          <div className="grid gap-3">
            {Object.values(TRACKS).map((track) => {
              const Icon = track.key === "police" ? Shield : Flame;

              return (
                <Link
                  key={track.key}
                  href={`/reservation?track=${track.key}`}
                  className="group flex items-center justify-between rounded-[10px] border border-slate-200 bg-[var(--card)] px-4 py-4"
                  style={
                    {
                      "--division-color": track.color,
                      "--division-color-light": track.lightColor,
                      "--division-color-dark": track.darkColor,
                    } as CSSProperties
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--division-color-light)] text-[var(--division-color)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {track.label}
                      </p>
                      <p className="text-xs text-slate-500">
                        {track.description}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <SectionCard
        title="학생용 바로가기"
        description="예약, 지원, 조회의 첫 진입점부터 구성했습니다."
      >
        <div className="grid gap-3">
          {studentLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-[var(--division-color)] shadow-card">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="text-xs leading-5 text-slate-500">
                      {item.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="관리자 준비 현황"
        description="회차 관리와 명단 업로드, 슬롯 설정을 위한 첫 대시보드 골격입니다."
        action={
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            <LayoutDashboard className="h-4 w-4" />
            관리자 화면
          </Link>
        }
      >
        <div className="grid gap-3 text-sm text-slate-600">
          <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
            1단계 완료: Next.js 14 기반 프로젝트, 로컬 폰트, 공통 페이지 골격
          </div>
          <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
            다음 개발 순서: 세션/학원 설정 API, Supabase 연동, 예약 슬롯 CRUD
          </div>
        </div>
      </SectionCard>
    </main>
  );
}
