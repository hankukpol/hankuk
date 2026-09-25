"use client";
import type { PreviewData, Comparison } from "@/lib/exam-preview/types";
import { PreviewTrend } from "./PreviewCharts";
import { value } from "./LearningTable";
import styles from "./preview.module.css";
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
      {/* 모바일에서 카드형(회차당 9칸)으로 그리면 회차가 쌓일수록 한없이 길어진다.
          일반 표로 두고 휴대폰에서는 핵심 5칸만 보인다. 나머지 칸은 PC와 인쇄에서 보인다. */}
      {history.length ? (
        <div className="admin-table-frame">
          <table aria-label="총점과 상대 경쟁력 변화">
            <thead>
              <tr>
                <th scope="col">시험일</th>
                <th scope="col">내 총점</th>
                <th scope="col" className={styles.desktopCell}>전체 평균</th>
                <th scope="col">평균 차이</th>
                <th scope="col" className={styles.desktopCell}>직전 총점 변화</th>
                <th scope="col" className={styles.desktopCell}>직전 평균 차이 변화</th>
                <th scope="col">전체 석차</th>
                <th scope="col" className={styles.desktopCell}>비교 인원</th>
                <th scope="col">상위 비율</th>
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
                    <td className="admin-table-amount">{value(h.gap, "점")}</td>
                    <td className={`admin-table-amount ${styles.desktopCell}`}>
                      {value(same && prior.my !== null && h.my !== null ? h.my - prior.my : null, "점")}
                    </td>
                    <td className={`admin-table-amount ${styles.desktopCell}`}>
                      {value(same && prior.gap !== null && h.gap !== null ? h.gap - prior.gap : null, "점")}
                    </td>
                    <td>{value(h.rank, "위")}</td>
                    <td className={styles.desktopCell}>{value(h.count, "명")}</td>
                    <td>{value(h.topPercent, "%")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-empty-state">총점과 상대 경쟁력 변화: 표시할 기록이 없습니다.</p>
      )}
      {/* 위 표에 상위 비율 열이 이미 있으므로 두 번째 차트는 접어 둔다(추이 탭은 차트 하나 + 표 하나). */}
      <details className="admin-disclosure">
        <summary>상위 비율의 변화 그래프</summary>
        <div className="admin-disclosure-body space-y-4">
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
      </details>
    </div>
  );
}
