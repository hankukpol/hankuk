import { balanceAssessment, buildAdvice, buildDistributionBins, detectRegularDecline, gradeSubject, itemDiagnostics, rankWithTies, topPercent } from "./exam-analysis-meta";
import type { ImportDistribution, ImportRegionAggregate, ImportSubjectAggregate } from "./exam-import-assembler";
import type { AnalysisRank, AnalysisSummary, RegularRawSource, RegularRawBundle, RegularCohortAnalysis, RegularStudentReport, Viewer } from "./exam-analysis-types";

export class AnalysisAssemblyError extends Error {
  constructor(message: string, public readonly status: 403 | 404) { super(message); }
}
export function authorizeRegularViewer(studentId: string, viewer: Viewer) {
  if (viewer.role === "ASSISTANT" || (viewer.role === "STUDENT" && viewer.studentId !== studentId)) {
    throw new AnalysisAssemblyError("본인의 성적만 조회할 수 있습니다.", 403);
  }
}
const one = (n: number) => Number(n.toFixed(1));
const date = (value: string | Date) => value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
const mask = (value: string) => `${value.slice(0, 2)}***`;
const mean = (values: number[]) => values.length ? one(values.reduce((a, b) => a + b, 0) / values.length) : null;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const scores = (value: unknown) => Object.fromEntries(Object.entries(object(value)).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])));
function histogram(value: unknown): ImportDistribution {
  return Array.isArray(value) ? value.filter((row) => row && Number.isFinite(row.score) && Number.isInteger(row.count) && row.count > 0).map(row => ({ score: row.score as number, count: row.count as number })).sort((a, b) => a.score - b.score) : [];
}
const countOf = (hist: ImportDistribution) => hist.reduce((sum, row) => sum + row.count, 0);
function histogramTop(hist: ImportDistribution, ratio: number) {
  const take = Math.ceil(countOf(hist) * ratio);
  if (!take) return null;
  let remaining = take, sum = 0;
  for (const row of [...hist].reverse()) { const n = Math.min(remaining, row.count); sum += row.score * n; remaining -= n; if (!remaining) break; }
  return one(sum / take);
}
function summary(hist: ImportDistribution): AnalysisSummary {
  const count = countOf(hist);
  return { average: count ? one(hist.reduce((sum, row) => sum + row.score * row.count, 0) / count) : null, top10Avg: histogramTop(hist, 0.1), top30Avg: histogramTop(hist, 0.3), max: hist.at(-1)?.score ?? null, min: hist[0]?.score ?? null };
}
function rank(hist: ImportDistribution, score: number): AnalysisRank {
  const count = countOf(hist);
  const place = count ? 1 + hist.reduce((sum, row) => sum + (row.score > score ? row.count : 0), 0) : null;
  return { rank: place, count, topPercent: place === null ? null : topPercent(place, count), percentile: count ? one(hist.reduce((sum, row) => sum + (row.score < score ? row.count : row.score === score ? row.count / 2 : 0), 0) / count * 100) : null };
}
function distribution(hist: ImportDistribution, fullScore: number, myTotal?: number) {
  const result = buildDistributionBins([], fullScore, myTotal);
  const count = countOf(hist);
  for (const row of hist) {
    const index = Math.min(result.bins.length - 1, Math.floor(Math.max(0, row.score) / result.binSize));
    if (index >= 0) result.bins[index].count += row.count;
  }
  for (const bin of result.bins) bin.ratio = count ? one(bin.count / count * 100) : 0;
  return result;
}
function sessionsFor(source: Pick<RegularRawSource, "divisionId" | "examTypes" | "sessions">, examTypeId: string) {
  const type = source.examTypes.find(row => row.id === examTypeId && row.category === "REGULAR");
  if (!type) throw new AnalysisAssemblyError("정기 시험을 찾을 수 없습니다.", 404);
  return { type, sessions: source.sessions.filter(row => row.divisionId === source.divisionId && row.examTypeId === examTypeId && row.primarySubjectId === null)
    .sort((a, b) => date(b.examDate).localeCompare(date(a.examDate)) || a.id.localeCompare(b.id)) };
}
export function selectRegularSessionIds(source: Pick<RegularRawSource, "divisionId" | "examTypes" | "sessions">, examTypeId: string, examDate: string) {
  const { sessions } = sessionsFor(source, examTypeId);
  const current = sessions.find(row => date(row.examDate) === examDate);
  if (!current) throw new AnalysisAssemblyError("해당 날짜에 가져온 시험을 찾을 수 없습니다.", 404);
  const previous = sessions.find(row => date(row.examDate) < examDate);
  const { from } = regularHistoryRange(examDate);
  return { currentId: current.id, participantSessionIds: Array.from(new Set([current.id, ...(previous ? [previous.id] : []), ...sessions.filter(row => date(row.examDate) >= from && date(row.examDate) <= examDate).map(row => row.id)])) };
}
export function regularHistoryRange(to: string) {
  const [year, month] = to.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(year, month - 6 + index, 1)).toISOString().slice(0, 7));
  return { from: `${months[0]}-01`, to, months };
}
export function assembleRegularHistory(bundle: RegularRawBundle, studentId: string): NonNullable<RegularStudentReport["history"]> {
  const range = regularHistoryRange(bundle.examDate);
  const students = new Set(bundle.students.filter(s => s.divisionId === bundle.divisionId).map(s => s.id));
  const rows = bundle.sessions.filter(s => s.divisionId === bundle.divisionId && s.examTypeId === bundle.examTypeId && s.primarySubjectId === null && date(s.examDate) >= range.from && date(s.examDate) <= range.to).flatMap(session => {
    const participants = bundle.participants.filter(p => p.divisionId === bundle.divisionId && p.sessionId === session.id && students.has(p.studentId));
    const me = participants.find(p => p.studentId === studentId);
    if (!me) return [];
    const external = rank(histogram(object(session.externalStats).distribution), me.totalScore);
    return [{ date: date(session.examDate), total: me.totalScore, fullScore: session.fullScore, subjectScores: { ...me.subjectScores }, internalRank: 1 + participants.filter(p => p.totalScore > me.totalScore).length, externalRank: external.rank, externalCount: external.count, externalTopPercent: external.topPercent, isPartial: me.isPartial }];
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { ...range, coveredMonths: new Set(rows.map(r => r.date.slice(0, 7))).size, rows };
}
export function assembleRegularSessions(source: RegularRawSource, examTypeId: string, studentId?: string) {
  const { sessions } = sessionsFor(source, examTypeId);
  const students = new Set(source.students.filter(row => row.divisionId === source.divisionId).map(row => row.id));
  const counts = new Map<string, Set<string>>();
  for (const row of source.participants) if (row.divisionId === source.divisionId && students.has(row.studentId)) {
    const set = counts.get(row.sessionId) ?? new Set<string>(); set.add(row.studentId); counts.set(row.sessionId, set);
  }
  return sessions.filter(row => studentId === undefined || counts.get(row.id)?.has(studentId))
    .map(row => ({ examDate: date(row.examDate), sessionId: row.id, participantCount: counts.get(row.id)?.size ?? 0 }));
}
function prepare(bundle: RegularRawBundle) {
  const { type, sessions } = sessionsFor(bundle, bundle.examTypeId);
  const selection = selectRegularSessionIds(bundle, bundle.examTypeId, bundle.examDate);
  const session = sessions.find(row => row.id === selection.currentId)!;
  const previous = sessions.find(row => row.id === selection.participantSessionIds[1]);
  const students = new Map(bundle.students.filter(row => row.divisionId === bundle.divisionId).map(row => [row.id, row]));
  const participantsFor = (id?: string) => bundle.participants.filter(row => row.divisionId === bundle.divisionId && row.sessionId === id && students.has(row.studentId)).map(row => ({ ...row, subjectScores: scores(row.subjectScores) }));
  const participants = participantsFor(session.id), previousParticipants = participantsFor(previous?.id);
  const ranking = (rows: typeof participants) => rankWithTies(rows.map(row => ({ id: row.studentId, total: row.totalScore, subjectScores: row.subjectScores })), row => row.total);
  const ranks = ranking(participants), previousRanks = ranking(previousParticipants);
  const items = bundle.items.filter(row => row.divisionId === bundle.divisionId && row.sessionId === session.id);
  // Stored item points preserve historical full scores even if current settings changed.
  const subjects = type.subjects.flatMap(subject => {
    const rows = items.filter(row => row.subjectId === subject.id);
    return rows.length ? [{ id: subject.id, name: subject.name, fullScore: rows.reduce((sum, row) => sum + row.points, 0), itemCount: rows.length, alternateGroup: subject.alternateGroup?.trim() || null }] : [];
  });
  const people = new Map(participants.map(row => [row.studentId, row]));
  const responses = bundle.responses.filter(row => row.divisionId === bundle.divisionId && row.sessionId === session.id && Object.hasOwn(people.get(row.studentId)?.subjectScores ?? {}, row.subjectId));
  const rates = new Map<string, { count: number; correct: number }>();
  for (const row of responses) {
    const key = JSON.stringify([row.subjectId, row.itemNo]), value = rates.get(key) ?? { count: 0, correct: 0 };
    value.count++; value.correct += Number(row.isCorrect); rates.set(key, value);
  }
  const diagnosticItems = items.map(row => { const value = rates.get(JSON.stringify([row.subjectId, row.itemNo])); return { subjectId: row.subjectId, itemNo: row.itemNo, position: row.position, answerKey: row.answerKey, externalCorrectRatePct: row.correctRatePct, internalCorrectRatePct: value ? one(value.correct / value.count * 100) : null }; });
  const external = object(session.externalStats);
  const hist = histogram(external.distribution);
  const externalSubjects = object(external.subjects) as Record<string, ImportSubjectAggregate | undefined>;
  const regions = object(external.regions) as Record<string, ImportRegionAggregate | undefined>;
  const subjectValues = (id: string) => participants.flatMap(row => Object.hasOwn(row.subjectScores, id) ? [row.subjectScores[id]] : []);
  const targetFor = (studentId: string) => bundle.targets.find(row => row.studentId === studentId && row.examTypeId === bundle.examTypeId)?.targetScore ?? null;
  const flagsFor = (row: typeof participants[number]) => {
    const old = previousParticipants.find(p => p.studentId === row.studentId);
    return detectRegularDecline({ current: { total: row.totalScore, internalRank: ranks.get(row.studentId)!, internalCount: participants.length,
      subjectScoreRates: Object.fromEntries(subjects.filter(s => Object.hasOwn(row.subjectScores, s.id) && s.fullScore > 0).map(s => [s.name, row.subjectScores[s.id] / s.fullScore * 100])) },
    previous: old ? { total: old.totalScore, internalRank: previousRanks.get(old.studentId)! } : null, target: targetFor(row.studentId), fullScore: session.fullScore, settings: bundle.settings });
  };
  const publicSession = { id: session.id, examTypeId: type.id, examTypeName: type.name, examDate: date(session.examDate), fullScore: session.fullScore, itemCount: session.itemCount, externalCohortSize: session.externalCohortSize, topic: session.topic };
  return { session, publicSession, hasPreviousExam: Boolean(previous), subjects, participants, previousParticipants, previousRanks, students, ranks, responses, diagnosticItems, hist, externalSubjects, regions, subjectValues, targetFor, flagsFor };
}

export function assembleRegularCohort(bundle: RegularRawBundle, wrongTopLimit: 10 | 20 = 10): RegularCohortAnalysis {
  const p = prepare(bundle), totals = p.participants.map(row => row.totalScore), average = mean(totals);
  const exactMean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const internalSubjects = Object.fromEntries(p.subjects.map(s => [s.id, mean(p.subjectValues(s.id))]));
  const externalSubjects = Object.fromEntries(p.subjects.map(s => [s.id, p.externalSubjects[s.id]?.count ? one(p.externalSubjects[s.id]!.mean) : null]));
  const ranking = [...p.participants].sort((a, b) => b.totalScore - a.totalScore || a.studentId.localeCompare(b.studentId)).map(row => {
    const student = p.students.get(row.studentId)!, old = p.previousParticipants.find(old => old.studentId === row.studentId), external = rank(p.hist, row.totalScore);
    return { studentId: row.studentId, name: student.name, studentNumber: student.studentNumber, totalScore: row.totalScore, subjectScores: { ...row.subjectScores }, isPartial: row.isPartial,
      externalRank: external.rank, externalTopPercent: external.topPercent, internalRank: p.ranks.get(row.studentId)!,
      delta: old ? { total: one(row.totalScore - old.totalScore), rank: p.previousRanks.get(old.studentId)! - p.ranks.get(row.studentId)! } : null, flags: p.flagsFor(row) };
  });
  return { session: p.publicSession, subjects: p.subjects, hasPreviousExam: p.hasPreviousExam,
    external: { ...summary(p.hist), distribution: distribution(p.hist, p.session.fullScore), subjectAverages: externalSubjects,
      regions: Object.entries(p.regions).sort(([a], [b]) => a.localeCompare(b)).map(([code, region]) => { const hist = histogram(region?.distribution); return { code, count: region?.count ?? countOf(hist), average: summary(hist).average, top10Avg: histogramTop(hist, 0.1) }; }) },
    internal: { count: totals.length, average, max: totals.length ? Math.max(...totals) : null, min: totals.length ? Math.min(...totals) : null,
      stdDev: totals.length ? one(Math.sqrt(totals.reduce((sum, n) => sum + (n - exactMean) ** 2, 0) / totals.length)) : null,
      subjectAverages: internalSubjects, isReliable: totals.length >= 10,
      weakSubjects: p.subjects.map(s => ({ subjectId: s.id, name: s.name, gapVsExternal: internalSubjects[s.id] !== null && externalSubjects[s.id] !== null ? one(internalSubjects[s.id]! - externalSubjects[s.id]!) : null,
        weakCount: p.subjectValues(s.id).filter(n => s.fullScore > 0 && n / s.fullScore * 100 < bundle.settings.common.weakSubjectRatePercent).length })) },
    classWrongTop: p.diagnosticItems.filter((row): row is typeof row & { internalCorrectRatePct: number } => row.internalCorrectRatePct !== null)
      .sort((a, b) => a.internalCorrectRatePct - b.internalCorrectRatePct || a.position - b.position).slice(0, wrongTopLimit === 20 ? 20 : 10)
      .map(row => ({ ...row, subjectName: p.subjects.find(s => s.id === row.subjectId)?.name ?? "", gap: one(row.internalCorrectRatePct - row.externalCorrectRatePct) })),
    ranking, declines: p.hasPreviousExam ? ranking.filter(row => row.flags.length).map(row => ({ studentId: row.studentId, name: row.name, flags: row.flags })) : [],
    partials: ranking.filter(row => row.isPartial).map(row => ({ studentId: row.studentId, name: row.name,
      missingSubjects: p.subjects.filter(s => !Object.hasOwn(row.subjectScores, s.id) && (!s.alternateGroup || !p.subjects.some(other => other.alternateGroup === s.alternateGroup && Object.hasOwn(row.subjectScores, other.id)))).map(s => s.name) })) };
}

export function assembleRegularStudentReport(bundle: RegularRawBundle, studentId: string, viewer: Viewer): RegularStudentReport {
  authorizeRegularViewer(studentId, viewer);
  const p = prepare(bundle), me = p.participants.find(row => row.studentId === studentId), student = p.students.get(studentId);
  if (!me || !student) throw new AnalysisAssemblyError("학생의 해당 시험일 성적을 찾을 수 없습니다.", 404);
  const active = p.subjects.filter(s => Object.hasOwn(me.subjectScores, s.id));
  const regional = me.region === null ? undefined : p.regions[me.region];
  const subjectStats: RegularStudentReport["stats"]["subjects"] = active.map(s => {
    const ext = p.externalSubjects[s.id], h = histogram(ext?.distribution), r = rank(h, me.subjectScores[s.id]);
    const grade = gradeSubject({ my: me.subjectScores[s.id], fullScore: s.fullScore, topPercent: r.topPercent ?? 100, n: r.count });
    const regionalSubject = regional?.subjectsComplete === false ? undefined : regional?.subjects?.[s.id];
    return { subjectId: s.id, name: s.name, my: me.subjectScores[s.id], fullScore: s.fullScore, scoreRate: grade.scoreRate,
      externalAvg: ext?.count ? one(ext.mean) : null, regionAvg: regionalSubject?.count ? one(regionalSubject.mean) : null, internalAvg: mean(p.subjectValues(s.id)),
      top10Avg: ext?.top10Complete === false ? null : ext?.top10Avg ?? null, top30Avg: ext?.top30Complete === false ? null : ext?.top30Avg ?? null,
      externalRank: r.rank, externalTopPercent: r.topPercent, externalPercentile: r.percentile, externalCount: r.count, grade: grade.grade, gradeBasis: grade.basis,
      top10Complete: ext?.top10Complete ?? false, top30Complete: ext?.top30Complete ?? false, regionComplete: regional?.subjectsComplete ?? false };
  });
  const balance = balanceAssessment(subjectStats.map(s => { const h = histogram(p.externalSubjects[s.subjectId]?.distribution), max = h.at(-1)?.score; return max && max > 0 ? s.my / max * 100 : s.scoreRate; }), bundle.settings.common.balanceStdDev);
  const totals = p.participants.map(row => row.totalScore), internalHist = histogram(totals.map(score => ({ score, count: 1 })));
  const ordered = [...p.participants].sort((a, b) => b.totalScore - a.totalScore || a.studentId.localeCompare(b.studentId));
  const index = ordered.findIndex(row => row.studentId === studentId), targetScore = p.targetFor(studentId);
  return { session: p.publicSession, subjects: p.subjects, hasPreviousExam: p.hasPreviousExam,
    history: assembleRegularHistory(bundle, studentId),
    student: { id: student.id, name: viewer.role === "STUDENT" ? null : student.name, studentNumber: viewer.role === "STUDENT" ? mask(student.studentNumber) : student.studentNumber, region: me.region },
    myScore: { total: me.totalScore, subjectScores: { ...me.subjectScores }, isPartial: me.isPartial },
    ranks: { external: rank(p.hist, me.totalScore), region: regional && me.region !== null ? { code: me.region, ...rank(histogram(regional.distribution), me.totalScore) } : null,
      internal: { ...rank(internalHist, me.totalScore), isReliable: totals.length >= 10 } },
    stats: { external: summary(p.hist), internal: { average: mean(totals), max: Math.max(...totals), min: Math.min(...totals) }, subjects: subjectStats, balance,
      advice: buildAdvice(subjectStats.map(s => ({ name: s.name, my: s.my, fullScore: s.fullScore, avg: s.externalAvg ?? s.my, grade: s.grade })), balance) },
    distribution: distribution(p.hist, p.session.fullScore, me.totalScore),
    items: itemDiagnostics(p.diagnosticItems.filter(row => Object.hasOwn(me.subjectScores, row.subjectId)), p.responses.filter(row => row.studentId === studentId), bundle.settings.common),
    competitors: ordered.slice(Math.max(0, index - 5), index).concat(ordered.slice(index + 1, index + 5)).map(row => ({ studentNumber: mask(p.students.get(row.studentId)!.studentNumber), rank: p.ranks.get(row.studentId)!, total: row.totalScore, subjectScores: { ...row.subjectScores } })),
    // Explicit projection prevents accidental extra student fields leaking from trend dependencies.
    trend: (bundle.trend ?? []).filter(row => row.examTypeId === bundle.examTypeId).map(row => ({ id: row.id, examTypeId: row.examTypeId, examTypeName: row.examTypeName, examDate: row.examDate, totalScore: row.totalScore, rankInClass: row.rankInClass,
      notes: viewer.role === "STUDENT" ? null : row.notes, subjects: row.subjects.map(s => ({ subjectId: s.subjectId, name: s.name, totalItems: s.totalItems, alternateGroup: s.alternateGroup, pointsPerItem: s.pointsPerItem, maxScore: s.maxScore, score: s.score })) })),
    target: targetScore === null ? null : { targetScore, gap: one(targetScore - me.totalScore), gapPercent: p.session.fullScore > 0 ? one((targetScore - me.totalScore) / p.session.fullScore * 100) : 0 }, flags: p.flagsFor(me) };
}
