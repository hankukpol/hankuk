'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { StudentVisibleTask } from '@/lib/services/interview.service';

/**
 * 학생 성적표 '공부할 것' 탭 맨 위에 보이는 "선생님과 정한 이번 주 할 일".
 * 성적표 컴포넌트까지 prop 을 여러 단계 넘기지 않으려고 학생 성적 화면(PreviewPage)이 맨 바깥에서 넣는다.
 * 관리자 화면에는 넣지 않는다(빈 목록).
 */
const StudyTasksContext = createContext<StudentVisibleTask[]>([]);

export function StudyTasksProvider({ tasks, children }: { tasks: StudentVisibleTask[]; children: ReactNode }) {
  return <StudyTasksContext.Provider value={tasks}>{children}</StudyTasksContext.Provider>;
}

export function useStudyTasks(): StudentVisibleTask[] {
  return useContext(StudyTasksContext);
}
