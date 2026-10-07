import { ListChecks } from "lucide-react";

import type { StudentVisibleTask } from "@/lib/services/interview.service";

function shortDate(value: string) {
  return `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
}

/**
 * 학생 화면의 "선생님과 정한 이번 주 할 일"(운영자 요청 2026-10-07).
 * 학습 면담에서 공개로 정한 할 일만 받는다. 면담 내용·원인·진단은 이 모양에 없다(StudentVisibleTask).
 * 학생 홈과 성적 화면 '공부할 것' 탭 맨 위에 같은 모양으로 보인다.
 */
export function StudentStudyTasks({ tasks }: { tasks: StudentVisibleTask[] }) {
  if (!tasks.length) return null;
  return (
    <section className="admin-panel" aria-label="선생님과 정한 이번 주 할 일">
      <div className="admin-panel-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 shrink-0 text-admin-accent" aria-hidden="true" />
            <h2 className="admin-section-title">선생님과 정한 이번 주 할 일</h2>
          </div>
          <p className="admin-help mt-1">{shortDate(tasks[0].interviewDate)} 면담에서 정했어요. 다음 면담 때 함께 확인해요.</p>
        </div>
      </div>
      {tasks.map((task, index) => (
        <div key={task.id} className="admin-panel-row items-start">
          <span className="admin-label w-6 shrink-0 tabular-nums">{index + 1}</span>
          <div className="min-w-0 flex-1 break-keep">
            <p className="font-semibold text-admin-text">{task.title}</p>
            <p className="admin-help mt-1">
              {[
                task.subjectName,
                task.examDate ? `${shortDate(task.examDate)} 시험` : null,
                task.scope,
                task.itemNos.length ? `${task.itemNos.join(", ")}번` : null,
              ].filter(Boolean).join(" · ")}
            </p>
            {task.method ? <p className="mt-1 text-admin-text-secondary">방법: {task.method}</p> : null}
          </div>
          {task.dueDate ? <span className="shrink-0 tabular-nums font-semibold text-admin-accent">{shortDate(task.dueDate)}까지</span> : null}
        </div>
      ))}
    </section>
  );
}
