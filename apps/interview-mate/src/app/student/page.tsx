import Link from "next/link";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  MessageCircle,
  Users,
} from "lucide-react";

import { StudentBottomNav } from "@/components/student-bottom-nav";
import { TRACKS } from "@/lib/constants";

function QuickAction({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: typeof CalendarDays;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-[14px] bg-slate-50/80 px-4 py-3.5 transition-all active:scale-[0.98]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-[var(--division-color)]">
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-slate-900">{title}</p>
        <p className="truncate text-[12px] text-slate-500">{subtitle}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function TrackSection({ trackKey }: { trackKey: "police" | "fire" }) {
  const accent = TRACKS[trackKey];

  const style = {
    "--division-color": accent.color,
    "--division-color-light": accent.lightColor,
    "--division-color-dark": accent.darkColor,
  } as CSSProperties;

  return (
    <div style={style}>
      <section className="surface-card p-5">
        <p className="mb-3 text-[18px] font-bold text-slate-900">
          {accent.label}
        </p>
        <div className="space-y-2">
          <QuickAction
            href={`/reservation?track=${trackKey}`}
            icon={CalendarDays}
            title="모의면접 예약"
            subtitle="캘린더에서 일정과 시간 선택"
          />
          <QuickAction
            href={`/apply?track=${trackKey}`}
            icon={Users}
            title="조 편성 지원"
            subtitle="본인 확인 후 스터디 조 등록"
          />
        </div>
      </section>
    </div>
  );
}

export default function StudentPage() {
  return (
    <>
      <main className="student-container space-y-4">
        {/* Header */}
        <div className="px-1 pt-2">
          <p className="text-[13px] font-medium text-[var(--division-color)]">
            Interview Mate
          </p>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-slate-900">
            한국학원 면접 조편성
          </h1>
          <p className="mt-1 text-[13px] leading-[1.6] text-slate-500">
            직렬을 선택하고 예약 또는 조 편성 지원을 시작하세요.
          </p>
        </div>

        {/* Track sections */}
        <TrackSection trackKey="police" />
        <TrackSection trackKey="fire" />

        {/* Quick links */}
        <section className="surface-card p-5">
          <p className="mb-3 text-[13px] font-semibold text-slate-400">
            바로가기
          </p>
          <div className="space-y-2">
            <Link
              href="/my-reservation"
              className="group flex items-center gap-3 rounded-[14px] bg-slate-50/60 px-4 py-3.5 transition-all active:scale-[0.98]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-slate-500">
                <ClipboardList className="h-[17px] w-[17px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-slate-900">
                  내 예약 조회
                </p>
                <p className="truncate text-[12px] text-slate-500">
                  전화번호로 예약 내역 확인 · 변경 · 취소
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/room"
              className="group flex items-center gap-3 rounded-[14px] bg-slate-50/60 px-4 py-3.5 transition-all active:scale-[0.98]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-slate-500">
                <MessageCircle className="h-[17px] w-[17px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-slate-900">
                  내 조 방
                </p>
                <p className="truncate text-[12px] text-slate-500">
                  배정된 스터디 조 방으로 바로 이동
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>

      <Suspense>
        <StudentBottomNav />
      </Suspense>
    </>
  );
}
