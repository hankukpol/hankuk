'use client';
import { useState } from 'react';
import { CartesianGrid, Line, ComposedChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, ReferenceLine } from 'recharts';
import type { Comparison } from '@/lib/exam-preview/types';

export function PreviewTrend({rows, personal, externalOnly = false,targetScore,percentile=false}: {rows:Comparison[]; personal:boolean; externalOnly?:boolean;targetScore?:number|null;percentile?:boolean}) {
  const [extra,setExtra] = useState(false);
  const different = new Set(rows.map(r=>r.fullScore)).size > 1;
  const chart = rows.map(row => ({...row, ...Object.fromEntries(['my','internal','external','top10','top30'].map(key => {
    const value = row[key as 'my'];
    return [key, different ? value !== null && row.fullScore && row.fullScore > 0 ? value / row.fullScore * 100 : null : value];
  }))}));
  return <div className="space-y-4">
    {(!externalOnly||rows.some(r=>r.top10!==null||r.top30!==null))&&<label className="admin-label flex items-center gap-2" data-report-navigation><input type="checkbox" checked={extra} onChange={e=>setExtra(e.target.checked)}/>{externalOnly?'상위 평균 함께 보기':'학원·상위 평균 함께 보기'}</label>}
    <p className="admin-help">{percentile ? '상위 비율(%) 추이 · 정확한 값은 위 표에서 확인하세요.' : different ? '회차별 만점이 달라 차트는 만점 대비 득점률(%)로 표시합니다. 원점수는 아래 표에서 확인하세요.' : '같은 시험 종류·과목의 회차별 점수입니다. 회차별 난이도 차이는 보정하지 않습니다.'}</p>
    <div className="h-64 w-full min-w-0" role="img" aria-label={`회차별 ${different?'득점률':'점수'} 비교. 정확한 값은 아래 표에서 확인할 수 있습니다.`}>
      <ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{top:16,right:16,bottom:8,left:0}} accessibilityLayer>
        <CartesianGrid stroke="var(--admin-line-soft)" strokeDasharray="3 5" vertical={false}/><XAxis axisLine={false} tickLine={false} minTickGap={32} tickMargin={12} dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fontSize:13,fill:'var(--admin-text-secondary)'}}/><YAxis axisLine={false} tickLine={false} tickMargin={8} width={40} domain={[0,different||percentile?100:'auto']} reversed={percentile} tick={{fontSize:13,fill:'var(--admin-text-secondary)'}}/><Tooltip position={{x:48,y:0}} wrapperStyle={{maxWidth:'calc(100% - 64px)'}} contentStyle={{background:'var(--admin-surface)',border:'1px solid var(--admin-line)',borderRadius:'var(--admin-radius)',fontSize:13,whiteSpace:'normal'}} labelStyle={{fontWeight:600}}/><Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:13,paddingTop:16}}/>
        {targetScore!=null&&!different&&!percentile&&<ReferenceLine y={targetScore} stroke="var(--admin-chart-4)" strokeDasharray="4 4" ifOverflow="extendDomain" label={{value:`목표 ${targetScore}점`,position:"insideTopRight",fill:"var(--admin-text-secondary)",fontSize:13}}/>}
        <Area isAnimationActive={false} type="linear" dataKey={personal?'my':'internal'} stroke="none" fill="var(--admin-accent)" fillOpacity={0.06} legendType="none" tooltipType="none" connectNulls={false}/>
        {personal && <Line isAnimationActive={false} type="linear" dataKey="my" name={percentile?'상위 비율 (%)':'내 점수'} stroke="var(--admin-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={{r:4,fill:'var(--admin-surface)',strokeWidth:2}} activeDot={{r:6}} connectNulls={false}/>}
        {rows.some(r=>r.external!==null)&&<Line isAnimationActive={false} type="linear" dataKey="external" name="시험 응시자 평균" stroke="var(--admin-chart-2)" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{r:4}} connectNulls={false}/> }
        {(!externalOnly && (!personal || extra)) && <Line isAnimationActive={false} type="linear" dataKey="internal" name="우리 학원 평균" stroke="var(--admin-chart-3)" connectNulls={false}/>}
        {extra && <Line isAnimationActive={false} type="linear" dataKey="top30" name="상위 30% 평균" stroke="var(--admin-chart-4)" connectNulls={false}/>}
        {extra && <Line isAnimationActive={false} type="linear" dataKey="top10" name="상위 10% 평균" stroke="var(--admin-chart-5)" connectNulls={false}/>}
      </ComposedChart></ResponsiveContainer>
    </div>
  </div>;
}
