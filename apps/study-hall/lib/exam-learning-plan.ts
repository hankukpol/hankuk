import type { RegularStudentReport } from './exam-analysis-types';
import type { MorningStudentReport } from './morning-exam-analysis-types';
import type { ItemDiagnosticRow, ItemResponseCorrectness } from './exam-analysis-meta';

const responseKey = (row: { subjectId: string; itemNo: number }) => JSON.stringify([row.subjectId, row.itemNo]);

export function reviewBuckets(items: ItemDiagnosticRow[], responseCorrectness?: ItemResponseCorrectness[]) {
  // Correctness is the imported O/X, not a new comparison of answer strings.
  const correctness = responseCorrectness
    ? new Map(responseCorrectness.map(row => [responseKey(row), row.correctness]))
    : null;
  const wrong = items.filter(item => correctness
    ? correctness.get(responseKey(item)) === false
    : !item.isCorrect);
  return {
    easyWrong: wrong.filter(item => Boolean(item.answer?.trim()) && item.difficulty === '쉬움'),
    unanswered: wrong.filter(item => !item.answer?.trim()),
    otherWrong: wrong.filter(item => Boolean(item.answer?.trim()) && item.difficulty !== '쉬움'),
  };
}

export function regularLearningPlan(report: RegularStudentReport) {
  const priorities = report.stats.subjects.map(subject => {
    const items = report.items.list.filter(item => item.subjectId === subject.subjectId);
    const buckets = reviewBuckets(items, report.items.responseCorrectness);
    return { ...subject, ...buckets, lostPoints: Math.max(0, subject.fullScore - subject.my),
      examWeight: report.session.fullScore > 0 ? subject.fullScore / report.session.fullScore * 100 : null,
      gap: subject.externalAvg == null ? null : subject.my - subject.externalAvg };
  }).sort((a, b) => b.easyWrong.length - a.easyWrong.length || b.lostPoints - a.lostPoints || a.name.localeCompare(b.name));
  const currentKeys = Object.keys(report.myScore.subjectScores).sort().join('|');
  const compatible = (report.history?.rows ?? []).filter(row => !row.isPartial && row.fullScore === report.session.fullScore
    && Object.keys(row.subjectScores).sort().join('|') === currentKeys && Number.isFinite(row.total))
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = compatible[0];
  const last = compatible[compatible.length - 1];
  const average = compatible.length ? compatible.reduce((sum, row) => sum + row.total, 0) / compatible.length : null;
  return { priorities, compatibleCount: compatible.length,
    average, firstDate: first?.date ?? null, lastDate: last?.date ?? null,
    change: compatible.length > 1 ? last.total - first.total : null,
    excludedCount: (report.history?.rows.length ?? 0) - compatible.length };
}

export function morningLearningPlan(report: MorningStudentReport) {
  return report.subjects.map(subject => {
    const exams = report.dailyItems.filter(day => day.subjectId === subject.subjectId);
    const tasks = exams.flatMap(day => {
      const evidence = day.diagnostics.responseCorrectness;
      const hasRecordedResponse = evidence === undefined || evidence.some(row => row.correctness !== null);
      return hasRecordedResponse
        ? [{ date: day.date, topic: day.topic, ...reviewBuckets(day.diagnostics.list, evidence) }]
        : [];
    });
    const topics = report.topics.filter(topic => topic.subjectId === subject.subjectId && topic.gap != null && topic.gap < 0)
      .sort((a, b) => a.gap! - b.gap! || a.topic.localeCompare(b.topic));
    const withheld = subject.insufficientSample || subject.attendanceRatePercent == null
      || subject.attendanceRatePercent < report.settings.morning.attendanceRatePercent
      || report.summary.attendanceRatePercent == null
      || report.summary.attendanceRatePercent < report.settings.morning.attendanceRatePercent;
    return { ...subject, tasks, topics, withheld,
      easyWrongCount: tasks.reduce((sum, task) => sum + task.easyWrong.length, 0),
      unansweredCount: tasks.reduce((sum, task) => sum + task.unanswered.length, 0) };
  }).sort((a, b) => b.easyWrongCount - a.easyWrongCount || a.name.localeCompare(b.name));
}
