import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, Download, Flame, Shield } from "lucide-react";

import StudyGroupManager from "@/components/study-group/StudyGroupManager";
import { Badge } from "@/components/ui/badge";
import { getTrack, TRACKS, type Track } from "@/lib/constants";
import { getConfig } from "@/lib/study-group/config";

type StudyGroupsPageProps = {
  searchParams?: {
    track?: string;
  };
};

function resolveTrack(value?: string): Track {
  return value === "fire" ? "fire" : "police";
}

export default function StudyGroupsPage({
  searchParams,
}: StudyGroupsPageProps) {
  const trackKey = resolveTrack(searchParams?.track);
  const track = getTrack(trackKey);
  const config = getConfig(trackKey);

  return (
    <main
      className="admin-container space-y-5"
      style={
        {
          "--division-color": track.color,
          "--division-color-light": track.lightColor,
          "--division-color-dark": track.darkColor,
        } as CSSProperties
      }
    >
      <section className="surface-card">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="brand">Study Groups</Badge>
              <span className="text-sm text-slate-500">
                명단 업로드 기반 자동 편성
              </span>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              홈으로
            </Link>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              {track.label} 조 편성
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              기존 `면접 조 편성` 도구를 `interview-mate` 단일 앱 안으로 옮겼다.
              관리자에서 내보낸 CSV를 바로 열어 조를 편성하고, 결과 파일을 다시
              관리자 연동 화면으로 가져오면 된다.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {Object.values(TRACKS).map((candidate) => {
              const selected = candidate.key === trackKey;
              const Icon = candidate.key === "police" ? Shield : Flame;

              return (
                <Link
                  key={candidate.key}
                  href={`/study-groups?track=${candidate.key}`}
                  className={`inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold ${
                    selected
                      ? "bg-[var(--division-color)] text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {candidate.label}
                </Link>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <a
              href={trackKey === "police" ? "/mock-police-300.csv" : "/mock-fire-180.csv"}
              download
              className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center bg-white text-[var(--division-color)]">
                  <Download className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    샘플 명단 다운로드
                  </p>
                  <p className="text-xs leading-5 text-slate-500">
                    현재 선택한 트랙에 맞는 CSV 예시 파일을 내려받습니다.
                  </p>
                </div>
              </div>
            </a>

            <Link
              href="/admin"
              className="rounded-[10px] border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center bg-[var(--division-color-light)] text-[var(--division-color)]">
                  <ArrowLeft className="h-5 w-5 rotate-180" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    관리자 연동으로 이동
                  </p>
                  <p className="text-xs leading-5 text-slate-500">
                    세션 명단 내보내기와 조 편성 결과 가져오기는 관리자 화면에서
                    이어서 처리합니다.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <StudyGroupManager config={config} />
    </main>
  );
}
