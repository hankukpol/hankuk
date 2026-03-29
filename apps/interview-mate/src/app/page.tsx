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
import { TRACKS } from "@/lib/constants";

const studentLinks = [
  {
    href: "/reservation?track=police",
    icon: CalendarClock,
    title: "경찰 모의면접 예약",
    description: "캘린더에서 일정과 시간을 선택해 예약",
  },
  {
    href: "/apply?track=police",
    icon: Users,
    title: "경찰 조 편성 지원",
    description: "본인 확인 후 스터디 조 편성 등록",
  },
  {
    href: "/my-reservation?track=police",
    icon: ClipboardList,
    title: "내 예약 확인",
    description: "전화번호로 예약 내역 조회 · 변경 · 취소",
  },
];

const operatorLinks = [
  {
    href: "/study-groups?track=police",
    icon: Users,
    title: "조 편성 도구",
    description: "명단 파일을 올려 스터디 조를 편성",
  },
  {
    href: "/admin",
    icon: LayoutDashboard,
    title: "관리자 대시보드",
    description: "세션, 예약, 명단, 방 운영을 관리",
  },
];

export default function Home() {
  return (
    <main className="landing-container space-y-4">
      {/* Hero */}
      <section className="surface-card">
        <div className="space-y-4 p-6 md:p-8">
          <div className="flex items-center justify-between gap-3">
            <Badge tone="brand">Interview Mate</Badge>
            <span className="text-[11px] font-medium text-slate-400">
              예약 · 조 편성 · 운영 관리
            </span>
          </div>
          <div className="space-y-2">
            <h1 className="text-[24px] font-bold tracking-[-0.03em] text-slate-900 md:text-[32px]">
              모의면접 운영과
              <br className="md:hidden" />
              {" "}조 편성을 한곳에서
            </h1>
            <p className="text-[13px] leading-[1.6] text-slate-500 md:text-sm">
              학생 예약, 조 편성 지원, 관리자 운영, 스터디 조 편성 도구를
              하나의 앱으로 통합했습니다.
            </p>
          </div>

          {/* Track quick links */}
          <div className="grid gap-2.5 md:grid-cols-2">
            {Object.values(TRACKS).map((track) => {
              const Icon = track.key === "police" ? Shield : Flame;

              return (
                <Link
                  key={track.key}
                  href={`/student`}
                  className="group flex items-center gap-3 rounded-[14px] border border-black/[0.04] bg-slate-50/80 px-4 py-3.5 transition-all active:scale-[0.98]"
                  style={
                    {
                      "--division-color": track.color,
                      "--division-color-light": track.lightColor,
                      "--division-color-dark": track.darkColor,
                    } as CSSProperties
                  }
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--division-color)] text-white">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900">
                      {track.label}
                    </p>
                    <p className="truncate text-[12px] text-slate-500">
                      {track.description}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Student + Operator — PC 2-column */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Student shortcuts */}
        <section className="surface-card p-5">
          <p className="mb-3 text-[13px] font-semibold text-slate-500">
            학생 바로가기
          </p>
          <div className="space-y-2">
            {studentLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-[14px] border border-black/[0.04] bg-slate-50/60 px-4 py-3.5 transition-all active:scale-[0.98]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-[var(--division-color)]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="truncate text-[12px] text-slate-500">
                      {item.description}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </section>

        {/* Operator shortcuts */}
        <section className="surface-card p-5">
          <p className="mb-3 text-[13px] font-semibold text-slate-500">
            운영 도구
          </p>
          <div className="space-y-2">
            {operatorLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-[14px] border border-black/[0.04] bg-white px-4 py-3.5 transition-all active:scale-[0.98]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--division-color-light)] text-[var(--division-color)]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="truncate text-[12px] text-slate-500">
                      {item.description}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
