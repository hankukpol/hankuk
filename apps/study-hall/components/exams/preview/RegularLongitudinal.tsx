"use client";
import type { PreviewData, Comparison } from "@/lib/exam-preview/types";
import { PreviewTrend } from "./PreviewCharts";
import { LearningTable, value } from "./LearningTable";
export function RegularLongitudinal({ data }: { data: PreviewData }) {
  const history = data.totalHistory ?? [],
    target = data.regular?.target?.targetScore;
  const rows: Comparison[] = history.map((h) => ({
    sessionId: h.sessionId,
    date: h.date,
    subjectId: "total",
    subjectName: "총점",
    fullScore: h.fullScore,
    my: h.my,
    external: h.external,
    internal: null,
    top10: null,
    top30: null,
    internalCount: 0,
    externalCount: h.count,
    externalFileCount: 0,
    internalRank: null,
    externalRank: h.rank,
    topic: null,
  }));
  return (
    <div className="admin-flat-page">
      <h3 className="admin-section-title">내 총점·전체 평균·등록 목표</h3>
      <PreviewTrend rows={rows} personal externalOnly targetScore={target} />
      <p className="admin-help">
        전체 평균은 해당 회차 총점 분포의 인원 합계가 일치할 때만 연결합니다.
        과목 평균을 더하지 않습니다. 목표선은 현재 등록 목표이며 과거 당시의
        목표가 아닙니다.
      </p>
      <LearningTable
        label="총점과 상대 경쟁력 변화"
        heads={[
          "시험일",
          "내 총점",
          "전체 평균",
          "평균 차이",
          "직전 총점 변화",
          "직전 평균 차이 변화",
          "전체 석차",
          "비교 인원",
          "상위 비율",
        ]}
        rows={history.map((h, i) => {
          const prior = history[i - 1],
            same = prior?.fullScore === h.fullScore;
          return [
            h.date,
            value(h.my, "점"),
            value(h.external, "점"),
            value(h.gap, "점"),
            value(
              same && prior.my !== null && h.my !== null
                ? h.my - prior.my
                : null,
              "점",
            ),
            value(
              same && prior.gap !== null && h.gap !== null
                ? h.gap - prior.gap
                : null,
              "점",
            ),
            value(h.rank, "위"),
            value(h.count, "명"),
            value(h.topPercent, "%"),
          ];
        })}
      />
      <h3 className="admin-section-title">상위 비율의 변화</h3>
      <p className="admin-help">
        작을수록 높은 위치입니다. 동점자는 같은 석차이며 그 다음 석차는 동점
        인원만큼 건너뜁니다. 응시 집단과 난이도가 달라지므로 실력이나 합격
        확률로 해석하지 않습니다.
      </p>
      <PreviewTrend
        rows={rows.map((row, i) => ({
          ...row,
          fullScore: 100,
          my: history[i].topPercent,
          external: null,
        }))}
        personal
        externalOnly
        percentile
      />
    </div>
  );
}
