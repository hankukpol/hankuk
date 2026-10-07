'use client';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * 개인 성적표를 보는 사람. 학생과 관리자는 같은 성적표를 쓰지만(DESIGN.md 개인 성적표 절),
 * 학생 화면에서는 관리자용 세부 열(배점·우리 학원 정답률·선택지별 비율 등)을 빼서 읽기 쉽게 한다.
 * 접어 두지 않고 아예 빼므로 '중요한 정보를 접어 두지 않는다' 규칙과 부딪히지 않는다.
 * 기본값은 admin 이다. 반 분석·관리자 화면은 지금과 같다.
 */
export type ReportAudienceValue = 'admin' | 'student';

const ReportAudienceContext = createContext<ReportAudienceValue>('admin');

export function ReportAudience({ value, children }: { value: ReportAudienceValue; children: ReactNode }) {
  return <ReportAudienceContext.Provider value={value}>{children}</ReportAudienceContext.Provider>;
}

export function useReportAudience(): ReportAudienceValue {
  return useContext(ReportAudienceContext);
}
