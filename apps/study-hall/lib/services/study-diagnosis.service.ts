import { summarizeMorningForInterview, summarizeRegularForInterview, type InterviewScoreSummary } from "@/lib/interview-score-summary";
import { buildStudyDiagnosis, taskScoreChange, type StudyDiagnosis } from "@/lib/study-diagnosis";
import type { ReportRange } from "@/lib/student-report";
import { getInterviewContext } from "@/lib/services/interview-context.service";
import { listInterviews, type InterviewTaskItem, type StudyInterviewContext } from "@/lib/services/interview.service";
import { loadInterviewExamData } from "@/lib/services/interview-study-context.service";
import { getExamAnalysisSettings } from "@/lib/services/settings.service";

async function optional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/** 지난 학습 면담의 할 일과, 그 뒤 같은 과목 점수가 얼마나 바뀌었는지. */
export type PreviousStudyTask = InterviewTaskItem & {
  interviewDate: string;
  scoreChange: { after: number | null; change: number | null; count: number };
};

export type StudyDiagnosisContext = {
  range: ReportRange;
  examEnabled: boolean;
  /** 면담 화면의 성적 요약(학생 성적표와 같은 문장·숫자). */
  scores: InterviewScoreSummary;
  diagnosis: StudyDiagnosis;
  previousTasks: PreviousStudyTask[];
  /** 할 일로 고를 수 있는 이 학원 시험 과목(아침·정기). 직접 추가할 때 쓴다. */
  subjects: Array<{ examCategory: "MORNING" | "REGULAR"; examTypeId: string; subjectId: string; name: string }>;
  study: StudyInterviewContext;
};

/** 면담 화면으로 보내는 모양. 저장 검사용 study 는 빼고 보낸다. */
export type StudyInterviewView = Omit<StudyDiagnosisContext, "study">;

/**
 * 학습 면담 진단을 서버에서 계산한다. 면담 화면(초안)과 저장(스냅샷)이 같은 함수를 쓴다.
 * reviews 를 넘기면 이번 면담에서 확인한 지난 할 일 상태를 반영해 진단 문장(잘한 점·질문)을 만든다.
 */
export async function getStudyDiagnosisContext(
  slug: string,
  studentId: string,
  range: ReportRange,
  reviews: Array<{ taskId: string; status: string }> = [],
): Promise<StudyDiagnosisContext> {
  const [exam, settings, context, interviews] = await Promise.all([
    loadInterviewExamData(slug, studentId, range),
    getExamAnalysisSettings(slug),
    optional(() => getInterviewContext(slug, studentId)),
    optional(() => listInterviews(slug, { studentId })),
  ]);

  const latestStudy = (interviews ?? [])
    .filter((interview) => interview.category === "STUDY" && interview.tasks.length)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  const reviewed = new Map(reviews.map((review) => [review.taskId, review.status]));
  const previousTasks: PreviousStudyTask[] = (latestStudy?.tasks ?? [])
    .filter((task) => task.status !== "CANCELLED")
    .map((task) => ({
      ...task,
      status: (reviewed.get(task.id) ?? task.status) as InterviewTaskItem["status"],
      interviewDate: latestStudy!.date,
      scoreChange: taskScoreChange(
        { subjectId: task.subjectId, examCategory: task.examCategory, interviewDate: latestStudy!.date, baselineMy: task.baselineMy },
        exam,
      ),
    }));

  const diagnosis = buildStudyDiagnosis({
    morning: exam.morning,
    regular: exam.regular,
    settings,
    attendance: context ? { absentCount: context.attendance.absentCount, tardyCount: context.attendance.tardyCount } : null,
    previousTasks: previousTasks.map((task) => ({ subjectName: task.subjectName, status: task.status })),
  });

  const subjects: StudyDiagnosisContext["subjects"] = [
    ...(exam.morning ? exam.morning.subjects.map((s) => ({ examCategory: "MORNING" as const, examTypeId: exam.morning!.examType.id, subjectId: s.id, name: s.name })) : []),
    ...(exam.regular ? exam.regular.subjects.map((s) => ({ examCategory: "REGULAR" as const, examTypeId: exam.regular!.examType.id, subjectId: s.id, name: s.name })) : []),
  ];

  return {
    range,
    examEnabled: exam.enabled,
    scores: {
      morning: exam.morning ? summarizeMorningForInterview(exam.morning) : null,
      regular: exam.regular ? summarizeRegularForInterview(exam.regular) : null,
    },
    diagnosis,
    previousTasks,
    subjects,
    study: {
      diagnosis,
      allowedSubjectIds: new Set(subjects.map((s) => s.subjectId)),
      allowedSessionIds: new Set([...(exam.morning?.comparisons ?? []), ...(exam.regular?.comparisons ?? [])].map((row) => row.sessionId)),
    },
  };
}
