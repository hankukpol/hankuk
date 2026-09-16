'use client';

import { average, pairedComparison } from '@/lib/exam-preview/metrics';
import type { Comparison } from '@/lib/exam-preview/types';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import styles from './preview.module.css';

const score = (value: number | null) => value === null ? '자료 없음' : `${Number(value.toFixed(1))}`;

export function ReferenceScoreStrip({ rows, personal }: { rows: Comparison[]; personal: boolean }) {
  const taken = personal ? rows.filter(row => row.my !== null) : rows;
  const uniform = new Set(taken.map(row => row.fullScore)).size === 1;
  const values = [
    { label: personal ? taken.length > 1 ? '내 평균 점수' : '내 점수' : '우리 학원 평균', value: average(taken.map(row => personal ? row.my : row.internal)) },
    ...(['external', 'top30', 'top10'] as const).map((key, index) => ({
      label: ['시험 응시자 평균', '상위 30% 평균', '상위 10% 평균'][index],
      value: personal ? pairedComparison(rows, key).benchmark : average(rows.map(row => row[key])),
    })),
  ];
  return <div className={styles.scoreStrip} data-score-strip aria-label="점수 비교 요약">
    {values.map(({ label, value }) => <div key={label}>
      <p className="admin-label">{label}</p>
      <p className={uniform&&value!==null?"admin-metric-box-value tabular-nums":styles.missingScore}>{score(uniform ? value : null)}{uniform && value !== null && <span className="admin-help"> 점</span>}</p>
    </div>)}
  </div>;
}

export function ReferenceSubjectRadar({ rows, personal }: { rows: Comparison[]; personal: boolean }) {
  const ids = Array.from(new Set(rows.map(row => row.subjectId)));
  const points = ids.map(id => {
    const subject = rows.filter(row => row.subjectId === id);
    // Same sessions for both series, known historic maximum only. Do not zero-fill missing axes.
    const paired = subject.filter(row => row.fullScore !== null && row.fullScore > 0 && row.external !== null && (personal ? row.my : row.internal) !== null);
    return {
      subject: subject[0].subjectName,
      own: average(paired.map(row => (personal ? row.my! : row.internal!) / row.fullScore! * 100)),
      external: average(paired.map(row => row.external! / row.fullScore! * 100)),
    };
  });
  if (points.length < 3 || points.some(point => point.own === null || point.external === null)) {
    return <p className="admin-empty-state">비교 가능한 과목이 3개 이상일 때 영역 그래프를 표시합니다. 확인된 점수는 옆 표에서 볼 수 있습니다.</p>;
  }
  return <div className="min-w-0 space-y-2">
    <div className={styles.radar} role="img" aria-label="과목별 득점률 비교. 문항 단원별 정답률이 아닙니다.">
      <ResponsiveContainer width="100%" height="100%"><RadarChart data={points} outerRadius="80%" accessibilityLayer>
        <PolarGrid gridType="circle" radialLines={false} stroke="var(--admin-line-soft)"/>
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 13, fill: 'var(--admin-text-secondary)', fontWeight: 600 }}/>
        <PolarRadiusAxis axisLine={false} angle={90} domain={[0, 100]} tick={false} ticks={[50,100]}/>
        <Radar dataKey="own" name={personal ? '내 득점률' : '학원 득점률'} stroke="var(--admin-accent)" strokeWidth={2} strokeLinejoin="round" dot={false} fill="var(--admin-accent)" fillOpacity={0.08} isAnimationActive={false}/>
        <Radar dataKey="external" name="시험 응시자 평균 득점률" stroke="var(--admin-chart-2)" strokeWidth={2} strokeLinejoin="round" strokeDasharray="5 5" dot={false} fill="var(--admin-chart-2)" fillOpacity={0} isAnimationActive={false}/>
      </RadarChart></ResponsiveContainer>
    </div>
    <p className="admin-help text-center"><span className="text-admin-accent">━ {personal ? '내 득점률' : '학원 득점률'}</span> / <span style={{color:'var(--admin-chart-2)'}}>┄ 전체 평균</span><span className="ml-4">만점 대비 · 0~100%</span></p>
  </div>;
}
