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
    description: "캘린더에서 일정과 시간을 선택해 예약을 진행합니다.",
  },
  {
    href: "/apply?track=police",
    icon: Users,
    title: "경찰 조 편성 지원",
    description: "본인 확인 후 스터디 조 편성이나 대기열 등록을 진행합니다.",
  },
  {
    href: "/my-reservation?track=police",
    icon: ClipboardList,
    title: "내 예약 확인",
    description: "휴대전화 번호로 예약 내역을 조회하고 변경 또는 취소합니다.",
  },
];

const operatorLinks = [
  {
    href: "/study-groups?track=police",
    icon: Users,
    title: "조 편성 도구",
    description: "명단 파일을 올려 경찰·소방 스터디 조를 한 앱 안에서 편성합니다.",
  },
  {
    href: "/admin",
    icon: LayoutDashboard,
    title: "관리자 대시보드",
    description: "세션, 예약, 명단, 방 운영과 조 편성 연동을 관리합니다.",
  },
];

export default function Home() {
  return (
    <main className="student-container space-y-5">
      <section className="surface-card overflow-hidden">
        <div className="h-1.5 bg-[var(--division-color)]" />
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <Badge tone="brand">Interview Mate</Badge>
            <span className="text-xs font-medium text-slate-500">
              예약 · 조 편성 · 운영 관리
            </span>
          </div>
          <div className="space-y-2">
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-slate-950">
              모의면접 운영과
              <br />
              조 편성을 한곳에서 처리합니다.
            </h1>
            <p className="text-sm leading-6 text-slate-600">
              학생 예약, 조 편성 지원, 관리자 운영, 스터디 조 편성 도구를
              `interview-mate` 단일 앱으로 통합했습니다.
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
        title="학생 바로가기"
        description="예약, 지원, 내 예약 조회를 빠르게 시작할 수 있습니다."
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
        title="운영 도구"
        description="관리자와 운영진이 쓰는 기능을 루트 앱에서 직접 실행할 수 있습니다."
      >
        <div className="grid gap-3">
          {operatorLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[10px] border border-slate-200 bg-white px-4 py-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--division-color-light)] text-[var(--division-color)] shadow-card">
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
                  <ArrowRight className="h-5 w-5 text-slate-400" />
                </div>
              </Link>
            );
          })}
        </div>
      </SectionCard>
    </main>
  );
}
