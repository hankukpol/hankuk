"use client";
import type { PreviewData, Comparison } from "@/lib/exam-preview/types";
import { PreviewTrend } from "./PreviewCharts";
import { value } from "./LearningTable";
import styles from "./preview.module.css";
import { gapText } from "@/lib/exam-preview/morning-personal";
import { useReportAudience } from "./ReportAudience";

type HistoryRow = NonNullable<PreviewData["totalHistory"]>[number];
const tone = (gap: number | null) =>
  gap === null || Math.round(gap * 10) === 0 ? "" : gap > 0 ? " text-admin-success" : " text-admin-danger";
// 만점이 같은 직전 회차와만 총점을 비교한다.
const delta = (row: HistoryRow, prior: HistoryRow | undefined, same: boolean) =>
  same && prior?.my != null && row.my !== null ? row.my - prior.my : null;
const changeText = (change: number) => {
  const size = Math.round(Math.abs(change) * 10) / 10;
  return size === 0 ? "같음" : `${size}점 ${change > 0 ? "올라감" : "내려감"}`;
};
export function RegularLongitudinal({ data }: { data: PreviewData }) {
  // 학생 화면에는 상위 비율 열을 두지 않는다. 석차와 같은 이야기를 두 번 하기 때문이다.
  const student = useReportAudience() === "student";
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
      <PreviewTrend rows={rows} personal externalOnly targetScore={target} externalLabel="전체 평균" />
      <p className="admin-help">
        전체 평균은 해당 회차 총점 분포의 인원 합계가 일치할 때만 연결합니다.
        과목 평균을 더하지 않습니다. 목표선은 현재 등록 목표이며 과거 당시의
        목표가 아닙니다.
      </p>
      {/* 모바일에서 카드형(회차당 9칸)으로 그리면 회차가 쌓일수록 한없이 길어진다.
          일반 표로 두고 휴대폰에서는 핵심 5칸만 보인다. 나머지 칸은 PC와 인쇄에서 보인다. */}
      {history.length ? (
        <div className="admin-table-frame">
          <table aria-label="총점 변화">
            <thead>
              <tr>
                <th scope="col">시험일</th>
                <th scope="col">내 총점</th>
                <th scope="col" className={styles.desktopCell}>전체 평균</th>
                <th scope="col">차이</th>
                <th scope="col" className={styles.desktopCell}>지난 시험보다</th>
                <th scope="col">전체 석차</th>
                {!student && <th scope="col" className={styles.desktopCell}>상위 비율</th>}
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => {
                const prior = history[i - 1],
                  same = prior?.fullScore === h.fullScore;
                return (
                  <tr key={h.sessionId}>
                    <th scope="row">{h.date}</th>
                    <td className="admin-table-amount">{value(h.my, "점")}</td>
                    <td className={`admin-table-amount ${styles.desktopCell}`}>{value(h.external, "점")}</td>
                    <td className={`admin-table-amount${tone(h.gap)}`}>{h.gap === null ? "—" : gapText(h.gap)}</td>
                    <td className={`admin-table-amount ${styles.desktopCell}${tone(delta(h, prior, same))}`}>
                      {delta(h, prior, same) === null ? "—" : changeText(delta(h, prior, same)!)}
                    </td>
                    <td>{h.rank === null ? "—" : `${h.rank}위${h.count ? ` / ${h.count}명` : ""}`}</td>
                    {!student && <td className={styles.desktopCell}>{value(h.topPercent, "%")}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-empty-state">총점 변화: 표시할 기록이 없습니다.</p>
      )}
    </div>
  );
}
