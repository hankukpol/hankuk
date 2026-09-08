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
    <main className="admin-shell admin-main flex-col">
      <div className="admin-content-frame admin-flat-page">
        {/* DESIGN.md 5.2 — 평면 페이지. 직렬 색은 카드 전체를 채우지 않고 표식으로만 쓴다. */}
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="admin-page-title">시간통제 자습반 관리 시스템</h1>
            <p className="admin-page-description max-w-2xl">
              직렬별 출결, 상벌점, 성적, 상담 흐름을 분리 관리하는 운영 플랫폼입니다. 아래에서
              지점별 관리자 화면으로 바로 이동할 수 있습니다.
            </p>
          </div>

          <Link href="/login" prefetch={false} className="admin-button admin-button-primary">
            <LogIn className="h-4 w-4" />
            관리자 로그인
          </Link>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {divisions.map((division) => {
            const Icon = divisionIcons[division.slug as keyof typeof divisionIcons] ?? Shield;

            return (
              <Link
                key={division.id}
                href={`/${division.slug}/admin`}
                prefetch={false}
                className="group flex flex-col gap-3 rounded-lg border border-admin-line p-5 transition hover:bg-admin-surface-soft"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: division.color }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="admin-section-title">{division.name}</h2>
                    <p className="admin-help">{division.fullName}</p>
                  </div>
                  <ArrowRight className="ml-auto h-5 w-5 shrink-0 text-admin-text-muted transition group-hover:translate-x-1" />
                </div>

                <p className="admin-help">
                  출결 관리, 학생 명단, 상벌점, 보고서까지 지점별 운영 흐름으로 바로 들어갑니다.
                </p>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
