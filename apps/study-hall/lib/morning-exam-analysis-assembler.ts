import { AnalysisAssemblyError, authorizeRegularViewer } from './exam-analysis-assembler';
import { movingAverage, trendSlope, consistency, detectMorningDecline, findCumulativeSubject, itemDiagnostics, topPercent } from './exam-analysis-meta';
import type { Viewer, AnalysisSessionRow, AnalysisParticipantRow } from './exam-analysis-types';
import type { MorningRawSource, MorningRawBundle, MorningRange, MorningCohortAnalysis, MorningStudentReport, MorningSubjectSummary } from './morning-exam-analysis-types';
function gradedCount(session: AnalysisSessionRow): number {
 const stats = session.externalStats as { count?: unknown; distribution?: unknown; subjects?: Record<string, { count?: unknown; distribution?: unknown }> } | null;
 const aggregate = stats?.subjects?.[session.primarySubjectId!];
 for (const value of [aggregate, stats]) {
  if (!value) continue;
  if (Array.isArray(value.distribution) && value.distribution.length) {
   const rows = value.distribution as Array<{ score?: unknown; count?: unknown }>;
   if (rows.every(r => r && typeof r.score === 'number' && Number.isFinite(r.score) && typeof r.count === 'number' && Number.isSafeInteger(r.count) && r.count > 0)) return rows.reduce((n, r) => n + (r.count as number), 0);
  }
  if (typeof value.count === 'number' && Number.isSafeInteger(value.count) && value.count > 0) return value.count;
 }
 return 0;
}
const dateKey = (date: string | Date) => date instanceof Date ? date.toISOString().slice(0, 10) : date.slice(0, 10);
const mean = (values: Array<number | null>): number | null => { const valid = values.filter((v): v is number => v !== null && Number.isFinite(v)); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; };
const gap = (a: number | null, b: number | null) => a === null || b === null ? null : a - b;
const key = (...parts: string[]) => JSON.stringify(parts);
export function morningWeek(date: string): { weekYear: number; weekNumber: number } {
 const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
 const year = d.getUTCFullYear(); return { weekYear: year, weekNumber: Math.ceil((((d.getTime() - Date.UTC(year, 0, 1)) / 86400000) + 1) / 7) };
}
export function selectMorningSessions(source: Pick<MorningRawSource, 'divisionId' | 'examTypes' | 'sessions'>, examTypeId: string, range: MorningRange): AnalysisSessionRow[] {
 const type = source.examTypes.find(t => t.id === examTypeId && t.category === 'MORNING');
 if (!type) throw new AnalysisAssemblyError('아침 시험 종류를 찾을 수 없습니다.', 404);
 return source.sessions.filter(s => s.divisionId === source.divisionId && s.examTypeId === examTypeId && s.primarySubjectId && dateKey(s.examDate) >= range.from && dateKey(s.examDate) <= range.to).sort((a, b) => dateKey(a.examDate).localeCompare(dateKey(b.examDate)) || a.id.localeCompare(b.id));
}
/** Historical evidence is tenant/type bounded and never contributes scores outside the requested range. */
export function selectMorningChoiceEvidence(source: Pick<MorningRawSource, 'divisionId' | 'sessions' | 'participants'>, typeId: string, to: string): NonNullable<MorningRawSource['choiceEvidence']> {
 const sessions = new Map(source.sessions.filter(s => s.divisionId === source.divisionId && s.examTypeId === typeId && dateKey(s.examDate) <= to && s.primarySubjectId).map(s => [s.id, s]));
 return source.participants.flatMap(p => {
  const session = sessions.get(p.sessionId), subjectId = session?.primarySubjectId;
  const value = subjectId ? p.subjectScores?.[subjectId] : undefined;
  return p.divisionId === source.divisionId && session && subjectId && typeof value === 'number' && Number.isFinite(value) ? [{ divisionId: source.divisionId, examTypeId: typeId, studentId: p.studentId, subjectId, examDate: dateKey(session.examDate) }] : [];
 });
}
function prepare(bundle: MorningRawBundle) {
 const sessions = selectMorningSessions(bundle, bundle.examTypeId, bundle.range), ids = new Set(sessions.map(s => s.id));
 const type = bundle.examTypes.find(t => t.id === bundle.examTypeId)!;
 const students = bundle.students.filter(s => s.divisionId === bundle.divisionId), studentIds = new Set(students.map(s => s.id));
 const participants = bundle.participants.filter(p => p.divisionId === bundle.divisionId && ids.has(p.sessionId) && studentIds.has(p.studentId));
 const bySession = new Map<string, AnalysisParticipantRow[]>(), byStudent = new Map<string, AnalysisParticipantRow[]>();
 for (const p of participants) { bySession.set(p.sessionId, [...(bySession.get(p.sessionId) ?? []), p]); byStudent.set(p.studentId, [...(byStudent.get(p.studentId) ?? []), p]); }
 const items = bundle.items.filter(i => i.divisionId === bundle.divisionId && ids.has(i.sessionId));
 const membership = new Set(participants.map(p => key(p.sessionId, p.studentId)));
 const responses = bundle.responses.filter(r => r.divisionId === bundle.divisionId && ids.has(r.sessionId) && membership.has(key(r.sessionId, r.studentId)));
 // 과목 순서는 설정에서 정한 것을 그대로 쓴다. 조회가 순서를 보장하지 않는 경로가 있어 여기서 한 번 더 맞춘다.
 // 내린 과목은 목록에서 뺀다 — 다만 조회 기간에 실제로 치른 회차가 있으면 이름이 사라지므로 남긴다.
 const examinedSubjectIds = new Set(sessions.map(s => s.primarySubjectId).filter((id): id is string => Boolean(id)));
 const subjectDefinitions = [...type.subjects]
  .filter(s => s.isActive !== false || examinedSubjectIds.has(s.id))
  .sort((l, r) => (l.displayOrder ?? 0) - (r.displayOrder ?? 0))
  .map(s => ({ id: s.id, name: s.name, fullScore: (s.totalItems ?? 0) * (s.pointsPerItem ?? 0), itemCount: s.totalItems ?? 0, alternateGroup: s.alternateGroup ?? null }));
 const external = (s: AnalysisSessionRow): number | null => {
  const value = s.externalStats as { mean?: unknown; subjects?: Record<string, { mean?: unknown }> } | null;
  const v = value?.subjects?.[s.primarySubjectId!]?.mean ?? value?.mean;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
 };
 const score = (p: AnalysisParticipantRow | undefined, subjectId: string): number | null => { const v = p?.subjectScores?.[subjectId]; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
 const heatmap = sessions.map(s => ({ date: dateKey(s.examDate), subjectId: s.primarySubjectId!, internalAvg: mean((bySession.get(s.id) ?? []).map(p => score(p, s.primarySubjectId!))), externalAvg: external(s), count: (bySession.get(s.id) ?? []).filter(p => score(p, s.primarySubjectId!) !== null).length, topic: s.topic }));
 const heatById = new Map(sessions.map((s, i) => [s.id, heatmap[i]]));
 return { sessions, type, students, participants, bySession, byStudent, items, responses, subjectDefinitions, external, score, heatmap, heatById };
}
type Prepared = ReturnType<typeof prepare>;
function subjectSummaries(bundle: MorningRawBundle, data: Prepared, studentId: string): MorningSubjectSummary[] {
 const mine = new Map((data.byStudent.get(studentId) ?? []).map(p => [p.sessionId, p]));
 // Only observed participation determines a chosen alternate. Unknown groups stay out of the denominator.
 const taken = new Set(data.sessions.filter(s => data.score(mine.get(s.id), s.primarySubjectId!) !== null).map(s => s.primarySubjectId!));
 for (const evidence of [...(bundle.choiceEvidence ?? []), ...selectMorningChoiceEvidence(bundle, bundle.examTypeId, bundle.range.to)]) {
  if (evidence.divisionId === bundle.divisionId && evidence.examTypeId === bundle.examTypeId && evidence.studentId === studentId && evidence.examDate <= bundle.range.to) taken.add(evidence.subjectId);
 }
 // 택1 과목은 고른 쪽만 남긴다. 아직 아무 쪽도 치르지 않았다면 어느 쪽을 고를지 모르는
 // 것이지 고르지 않은 것이 아니므로 그 묶음은 통째로 남긴다 — 안 그러면 기록이 없는
 // 학생에게는 그 묶음의 과목이 하나도 보이지 않는다.
 const decidedGroups = new Set(data.subjectDefinitions.filter(s => s.alternateGroup && taken.has(s.id)).map(s => s.alternateGroup));
 return data.subjectDefinitions.filter(s => !s.alternateGroup || taken.has(s.id) || !decidedGroups.has(s.alternateGroup)).map(subject => {
  const sessions = data.sessions.filter(s => s.primarySubjectId === subject.id);
  const attended = sessions.flatMap(s => { const score = data.score(mine.get(s.id), subject.id); return score === null ? [] : [{ date: dateKey(s.examDate), score, topic: s.topic, sessionId: s.id }]; });
  const classSeries = attended.flatMap(s => { const value = data.heatById.get(s.sessionId)?.internalAvg; return value == null ? [] : [{ date: s.date, score: value }]; });
  const ma = movingAverage(attended, bundle.settings.morning.movingAverageSessions), classMa = new Map(movingAverage(classSeries, bundle.settings.morning.movingAverageSessions).map(p => [p.date, p.value]));
  const average = mean(attended.map(p => p.score)), internalAvg = mean(attended.map(p => data.heatById.get(p.sessionId)!.internalAvg)), externalAvg = mean(attended.map(p => data.heatById.get(p.sessionId)!.externalAvg));
  const requiredSessions = bundle.settings.morning.movingAverageSessions, insufficientSample = attended.length < requiredSessions;
  const low = sessions.length > 0 && attended.length / sessions.length * 100 < bundle.settings.morning.attendanceRatePercent;
  const flags = sessions.length ? detectMorningDecline({ series: attended, classSeries, expectedSessions: sessions.length, fullScore: sessions.at(-1)?.fullScore ?? subject.fullScore, settings: bundle.settings }).filter(f => f.kind === 'lowAttendance' || !insufficientSample) : [];
  let consecutiveDrops = 0; for (let i = attended.length - 1; i > 0 && attended[i].score < attended[i - 1].score; i--) consecutiveDrops++;
  return { subjectId: subject.id, name: subject.name, average, internalAvg, externalAvg, gap: gap(average, internalAvg), stdDev: consistency(attended), slope: insufficientSample || low ? null : trendSlope(attended, bundle.settings.morning.trendWindowSessions), consecutiveDrops, flags, attended: attended.length, expected: sessions.length, attendanceRatePercent: sessions.length ? attended.length / sessions.length * 100 : null, insufficientSample, requiredSessions, series: attended.map((p, i) => ({ date: p.date, score: p.score, ma: ma[i].value, classMa: classMa.get(p.date) ?? null, topic: p.topic })) };
 });
}
function classItems(data: Prepared, sessionId: string) {
 const buckets = new Map<string, { correct: number; count: number }>();
 for (const r of data.responses) if (r.sessionId === sessionId) { const k = key(r.subjectId, String(r.itemNo)); const b = buckets.get(k) ?? { correct: 0, count: 0 }; b.count++; b.correct += Number(r.isCorrect); buckets.set(k, b); }
 return data.items.filter(i => i.sessionId === sessionId).map(i => { const b = buckets.get(key(i.subjectId, String(i.itemNo))); return { subjectId: i.subjectId, itemNo: i.itemNo, position: i.position, answerKey: i.answerKey, externalCorrectRatePct: i.correctRatePct, internalCorrectRatePct: b?.count ? b.correct / b.count * 100 : null }; });
}
export function assembleMorningCohort(bundle: MorningRawBundle): MorningCohortAnalysis {
 const d = prepare(bundle);
 // Same eligibility as existing morning score input; actual historical participants remain reviewable.
 const roster = d.students.filter(s => d.byStudent.has(s.id) || ((s.status === 'ACTIVE' || s.status === 'ON_LEAVE') && (!d.type.studyTrack || s.studyTrack === d.type.studyTrack)));
 const studentSubjects = roster.flatMap(student => subjectSummaries(bundle, d, student.id).map(s => ({ ...s, studentId: student.id, name: student.name, subjectName: s.name, studentNumber: student.studentNumber })));
 const topicGroups = new Map<string, typeof d.heatmap>();
 for (const h of d.heatmap) if (h.topic?.trim()) { const k = key(h.subjectId, h.topic.trim()); topicGroups.set(k, [...(topicGroups.get(k) ?? []), h]); }
 return { examType: { id: d.type.id, name: d.type.name }, subjects: d.subjectDefinitions, subjectDefinitions: d.subjectDefinitions, range: bundle.range, settings: bundle.settings, sessionCount: d.sessions.length, heatmap: d.heatmap,
  subjectTrends: d.subjectDefinitions.map(s => ({ subjectId: s.id, name: s.name, series: d.heatmap.filter(h => h.subjectId === s.id).map(h => ({ date: h.date, internalAvg: h.internalAvg, externalAvg: h.externalAvg })) })),
  dailyWrongTop: [...d.sessions].reverse().map(s => ({ date: dateKey(s.examDate), subjectId: s.primarySubjectId!, subjectName: d.subjectDefinitions.find(x => x.id === s.primarySubjectId)?.name ?? '', items: classItems(d, s.id).filter((i): i is typeof i & { internalCorrectRatePct: number } => i.internalCorrectRatePct !== null).sort((a, b) => a.internalCorrectRatePct - b.internalCorrectRatePct || a.itemNo - b.itemNo).slice(0, 5) })),
  declines: studentSubjects.filter(s => s.flags.some(f => f.kind !== 'lowAttendance')).map(s => ({ studentId: s.studentId, name: s.name, subjectId: s.subjectId, subjectName: s.subjectName, flags: s.flags })),
  lowAttendance: roster.flatMap(student => { const rows = studentSubjects.filter(s => s.studentId === student.id); const attended = rows.reduce((n, s) => n + s.attended, 0), expected = rows.reduce((n, s) => n + s.expected, 0); return expected && attended / expected * 100 < bundle.settings.morning.attendanceRatePercent ? [{ studentId: student.id, name: student.name, attended, expected, ratePercent: attended / expected * 100 }] : []; }),
  studentSubjects, topics: Array.from(topicGroups.values()).map(rows => ({ topic: rows[0].topic!.trim(), subjectId: rows[0].subjectId, subjectName: d.subjectDefinitions.find(s => s.id === rows[0].subjectId)?.name ?? '', count: rows.length, internalAvg: mean(rows.map(r => r.internalAvg)), externalAvg: mean(rows.map(r => r.externalAvg)) })), insufficientSample: !studentSubjects.some(s => !s.insufficientSample),
 };
}
export function assembleMorningStudentReport(bundle: MorningRawBundle, studentId: string, viewer: Viewer): MorningStudentReport {
 authorizeRegularViewer(studentId, viewer);
 const d = prepare(bundle), student = d.students.find(s => s.id === studentId);
 if (!student) throw new AnalysisAssemblyError('학생을 찾을 수 없습니다.', 404);
 const subjects = subjectSummaries(bundle, d, studentId), mine = new Map((d.byStudent.get(studentId) ?? []).map(p => [p.sessionId, p]));
 const attended = d.sessions.filter(s => d.score(mine.get(s.id), s.primarySubjectId!) !== null);
 const average = mean(attended.map(s => d.score(mine.get(s.id), s.primarySubjectId!))), expected = subjects.reduce((n, s) => n + s.expected, 0);
 const weeklyRanks = bundle.weeklyRankings.filter(r => r.studentId === studentId).map(({ weekYear, weekNumber, rank, count }) => ({ weekYear, weekNumber, rank, count })).sort((a, b) => a.weekYear - b.weekYear || a.weekNumber - b.weekNumber);
 const endWeek = morningWeek(bundle.range.to), current = weeklyRanks.find(w => w.weekYear === endWeek.weekYear && w.weekNumber === endWeek.weekNumber);
 const previousDate = new Date(`${bundle.range.to}T00:00:00Z`); previousDate.setUTCDate(previousDate.getUTCDate() - 7); const priorWeek = morningWeek(dateKey(previousDate));
 const previous = weeklyRanks.find(w => w.weekYear === priorWeek.weekYear && w.weekNumber === priorWeek.weekNumber);
 const topics = new Map<string, typeof attended>();
 for (const s of attended) if (s.topic?.trim()) { const k = key(s.primarySubjectId!, s.topic.trim()); topics.set(k, [...(topics.get(k) ?? []), s]); }
 const cumulative = findCumulativeSubject(d.type.subjects);
 const pairs: Array<{ cumulative: number; progress: number }> = [];
 if (cumulative) {
  const weeks = new Map<string, typeof attended>();
  for (const s of attended) { const w = morningWeek(dateKey(s.examDate)), k = `${w.weekYear}-${w.weekNumber}`; weeks.set(k, [...(weeks.get(k) ?? []), s]); }
  for (const rows of Array.from(weeks.values())) { const c = mean(rows.filter(s => s.primarySubjectId === cumulative.id).map(s => d.score(mine.get(s.id), s.primarySubjectId!))), p = mean(rows.filter(s => s.primarySubjectId !== cumulative.id).map(s => d.score(mine.get(s.id), s.primarySubjectId!))); if (c !== null && p !== null) pairs.push({ cumulative: c, progress: p }); }
 }
 const cumulativeAvg = mean(pairs.map(p => p.cumulative)), progressAvg = mean(pairs.map(p => p.progress));
 return { student: { id: student.id, name: viewer.role === 'STUDENT' ? null : student.name, studentNumber: viewer.role === 'STUDENT' ? `${student.studentNumber.slice(0, 2)}***` : student.studentNumber }, examType: { id: d.type.id, name: d.type.name }, subjectDefinitions: d.subjectDefinitions, range: bundle.range, settings: bundle.settings,
 summary: { average, externalGap: gap(average, mean(attended.map(s => d.external(s)))), internalGap: gap(average, mean(attended.map(s => d.heatById.get(s.id)!.internalAvg))), attendanceRatePercent: expected ? attended.length / expected * 100 : null, thisWeekRank: current?.rank ?? null, rankDelta: current && previous ? previous.rank - current.rank : null, attended: attended.length, expected }, subjects,
 topics: Array.from(topics.values()).map(rows => { const myAvg = mean(rows.map(s => d.score(mine.get(s.id), s.primarySubjectId!))), internalAvg = mean(rows.map(s => d.heatById.get(s.id)!.internalAvg)); return { topic: rows[0].topic!.trim(), subjectId: rows[0].primarySubjectId!, count: rows.length, myAvg, internalAvg, gap: gap(myAvg, internalAvg) }; }).sort((a, b) => (a.gap ?? Infinity) - (b.gap ?? Infinity)),
 dailyItems: [...attended].reverse().map(s => { const p = mine.get(s.id)!; const diagnostics = itemDiagnostics(classItems(d, s.id).filter(i => i.subjectId === s.primarySubjectId), d.responses.filter(r => r.sessionId === s.id && r.studentId === studentId && r.subjectId === s.primarySubjectId), bundle.settings.common); return { date: dateKey(s.examDate), subjectId: s.primarySubjectId!, subjectName: d.subjectDefinitions.find(x => x.id === s.primarySubjectId)?.name ?? '', topic: s.topic, easyMissed: diagnostics.easyMissed, wrongTop5: diagnostics.killerTop5, diagnostics, external: { rank: p.externalRank, count: gradedCount(s), topPercent: p.externalRank === null || !gradedCount(s) ? null : topPercent(p.externalRank, gradedCount(s)), percentile: p.externalPercentile } }; }),
 cumulativeGap: cumulativeAvg !== null && progressAvg !== null ? { cumulativeAvg, progressAvg, gap: cumulativeAvg - progressAvg, pairedWeeks: pairs.length } : null, weeklyRanks };
}

