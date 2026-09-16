/** Append-only realistic local fixtures. Existing preview/operating exam records are untouched. */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, copyFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  readMockState,
  writeMockState,
  type MockExamTypeRecord,
} from "../../lib/mock-store";
import {
  learningSource,
  readLearningDocument,
  updateLearningDocument,
} from "../../lib/exam-preview/learning-store";
import {
  applyLearningCommand,
  itemIdentity,
} from "../../lib/exam-preview/learning-mutations";
import type { LearningCommand } from "../../lib/exam-preview/learning-types";

async function main() {
  assert.equal(process.env.MOCK_MODE, "true");
  assert.equal(process.env.EXAM_ANALYSIS_PREVIEW, "true");
  assert.ok(
    path
      .resolve(process.env.MOCK_DB_DIR ?? "")
      .includes(`${path.sep}exam-preview${path.sep}`),
  );
  const state = await readMockState(),
    stamp = new Date().toISOString(),
    backup = path.join(
      process.env.MOCK_DB_DIR!,
      "learning-backup-" + Date.now(),
    );
  await mkdir(backup, { recursive: true });
  await copyFile(
    path.join(process.env.MOCK_DB_DIR!, "mock-db.json"),
    path.join(backup, "mock-db.json"),
  );
  for (const [index, slug] of Array.from(["police", "fire"].entries())) {
    const base = state.examTypesByDivision[slug].find(
      (t) => t.id === `preview-${slug}-regular`,
    )!;
    const id = `preview-${slug}-monthly`;
    if (state.examTypesByDivision[slug].some((t) => t.id === id)) continue;
    const counts = index ? [30, 35, 35] : [20, 40, 40],
      points = index ? 1 : 2.5;
    const type = {
      ...structuredClone(base),
      id,
      name: "월 1회 실전형 검증 (100문항·100분)",
      subjects: base.subjects.map((s, i) => ({
        ...s,
        id: `${id}-subject${i}`,
        examTypeId: id,
        totalItems: counts[i],
        pointsPerItem: points,
      })),
    };
    (state.examTypesByDivision[slug] as MockExamTypeRecord[]).push(type);
    const students = state.studentsByDivision[slug].filter((s) =>
        s.id.startsWith(`preview-${slug}-s`),
      ),
      actor = state.admins.find(
        (a) => a.divisionSlug === slug && a.role === "ADMIN",
      )!;
    for (let round = 0; round < 6; round++) {
      const date = `2026-${String(round + 4).padStart(2, "0")}-16`,
        sessionId = `${id}-${round}`,
        full = 100 * points;
      const correctCounts = students.map((_, i) =>
          counts.map(
            (count, j) =>
              count - Math.min(count, ((i + round + j * 3) % 12) + 2),
          ),
        ),
        scores = correctCounts.map((ns) => ns.map((n) => n * points)),
        totals = scores.map((ns) => ns.reduce((a, b) => a + b, 0));
      const dist = (ns: number[]) =>
        Array.from(new Set(ns))
          .sort((a, b) => a - b)
          .map((score) => ({
            score,
            count: ns.filter((n) => n === score).length,
          }));
      const ranked = totals
          .map((_, i) => i)
          .sort((a, b) => totals[b] - totals[a] || a - b),
        top = (j: number, ratio: number) => {
          const indexes = ranked.slice(0, Math.ceil(ranked.length * ratio));
          return (
            indexes.reduce((sum, i) => sum + scores[i][j], 0) / indexes.length
          );
        };
      state.examSessionsByDivision[slug].push({
        id: sessionId,
        divisionId: base.divisionId,
        examTypeId: id,
        identityKey: sessionId,
        primarySubjectId: null,
        examDate: date,
        topic: null,
        itemCount: 100,
        fullScore: full,
        externalCohortSize: students.length,
        externalStats: {
          count: students.length,
          mean: totals.reduce((a, b) => a + b, 0) / students.length,
          distribution: dist(totals),
          subjects: Object.fromEntries(
            type.subjects.map((s, j) => [
              s.id,
              {
                count: students.length,
                mean:
                  scores.reduce((sum, n) => sum + n[j], 0) / students.length,
                distribution: dist(scores.map((n) => n[j])),
                top10Avg: top(j, 0.1),
                top30Avg: top(j, 0.3),
                top10Count: Math.ceil(students.length * 0.1),
                top30Count: Math.ceil(students.length * 0.3),
                top10Complete: true,
                top30Complete: true,
              },
            ]),
          ),
          regions: {},
        },
        sourceFileName: "synthetic-monthly-100-items.xlsx",
        importedById: actor.id,
        importedAt: stamp,
      });
      type.subjects.forEach((s, j) => {
        for (let n = 1; n <= counts[j]; n++) {
          const key = String((n % 4) + 1),
            rate = [84, 68, 43, 76][n % 4],
            itemId = `${sessionId}-${s.id}-${n}`;
          state.examSessionItemsByDivision[slug].push({
            id: itemId,
            divisionId: base.divisionId,
            sessionId,
            subjectId: s.id,
            itemNo: n,
            position: counts.slice(0, j).reduce((a, b) => a + b, 0) + n,
            answerKey: key,
            points,
            correctRatePct: rate,
            choiceRates: Object.fromEntries(
              ["1", "2", "3", "4"].map((k) => [
                k,
                k === key ? rate : (100 - rate) / 3,
              ]),
            ),
            mostCommonWrong: key === "1" ? "2" : "1",
          });
          students.forEach((student, i) => {
            const correct = n <= correctCounts[i][j];
            state.examItemResponsesByDivision[slug].push({
              id: `${itemId}-${student.id}`,
              divisionId: base.divisionId,
              sessionId,
              studentId: student.id,
              subjectId: s.id,
              itemNo: n,
              answer: correct
                ? key
                : n === counts[j]
                  ? null
                  : key === "1"
                    ? "2"
                    : "1",
              isCorrect: correct,
            });
          });
        }
      });
      students.forEach((student, i) => {
        const subjectScores = Object.fromEntries(
            type.subjects.map((s, j) => [s.id, scores[i][j]]),
          ),
          scoreId = `${sessionId}-${student.id}-score`,
          rank = 1 + totals.filter((n) => n > totals[i]).length;
        state.examSessionParticipantsByDivision[slug].push({
          id: `${sessionId}-${student.id}`,
          divisionId: base.divisionId,
          sessionId,
          studentId: student.id,
          region: null,
          subjectScores,
          totalScore: totals[i],
          isPartial: false,
          externalRank: rank,
          externalPercentile: null,
          regionalRank: null,
          derivedScoreId: scoreId,
        });
        state.examScoresByDivision[slug].push({
          id: scoreId,
          studentId: student.id,
          examTypeId: id,
          examRound: round + 1,
          examDate: date,
          scores: subjectScores,
          totalScore: totals[i],
          rankInClass: rank,
          notes: "월 1회 실전형 합성 검증 자료",
          recordedById: actor.id,
          createdAt: stamp,
          updatedAt: stamp,
        });
      });
    }
    state.scoreTargetsByDivision[slug].push({
      id: `${id}-target`,
      studentId: students[0].id,
      examTypeId: id,
      targetScore: index ? 85 : 220,
      note: "합성 검증 목표",
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
  await writeMockState(state);
  for (const [index, slug] of Array.from(["police", "fire"].entries())) {
    const source = await learningSource(slug);
    let doc = await readLearningDocument(source.divisionId);
    // Never overwrite a user's existing learning configuration or review history.
    if (doc.revision > 0) continue;
    const actor = { id: "local-fixture-admin", role: "ADMIN" as const };
    const apply = (command: LearningCommand, at = stamp) => {
      doc = applyLearningCommand(
        doc,
        source,
        command,
        actor,
        doc.revision,
        randomUUID(),
        at,
      );
    };
    for (let j = 0; j < 3; j++) {
      const subjectIds = source.examTypes.flatMap((t) =>
          t.subjects[j] ? [t.subjects[j].id] : [],
        ),
        name = source.examTypes[0].subjects[j].name;
      apply({ action: "subject", name, subjectIds });
      const group = doc.subjects.at(-1)!;
      apply({
        action: "topic",
        subjectGroupId: group.id,
        parentId: null,
        code: `S${j + 1}`,
        name: `${name} 핵심 개념`,
        active: true,
      });
      const parent = doc.topics.at(-1)!;
      for (let k = 0; k < 3; k++) {
        apply({
          action: "topic",
          subjectGroupId: group.id,
          parentId: parent.id,
          code: `S${j + 1}-${k + 1}`,
          name: ["기본 원리", "사례 적용", "심화 정리"][k],
          active: true,
        });
        const topic = doc.topics.at(-1)!;
        const itemIds = source.items
          .filter((i) => subjectIds.includes(i.subjectId) && i.itemNo % 2 === k)
          .map(itemIdentity);
        for (let offset = 0; offset < itemIds.length; offset += 1000)
          apply({
            action: "assign",
            topicId: topic.id,
            itemIds: itemIds.slice(offset, offset + 1000),
          });
        if (k === 2)
          apply({
            action: "schedule",
            date: "2026-09-30",
            examTypeId: `preview-${slug}-morning`,
            topicId: topic.id,
          });
      }
    }
    apply({
      action: "policy",
      effectiveFrom: "2026-04-01",
      value: {
        minItems: index ? 20 : 10,
        minSessions: index ? 3 : 2,
        weakGap: index ? 20 : 10,
        lowCorrectRate: index ? 60 : 70,
        repeatWrongSessions: index ? 3 : 2,
        timeTracking: !index,
        timeLimits: { [`preview-${slug}-monthly`]: 100 },
      },
    });
    const studentId = `preview-${slug}-s0`;
    const morningItems = source.items.filter(
      (i) =>
        source.sessions.some(
          (s) =>
            s.id === i.sessionId &&
            s.examTypeId === `preview-${slug}-morning` &&
            String(s.examDate).slice(0, 10) < "2026-09-14",
        ) &&
        source.responses.some(
          (r) =>
            r.studentId === studentId &&
            r.sessionId === i.sessionId &&
            r.subjectId === i.subjectId &&
            r.itemNo === i.itemNo &&
            r.isCorrect === false,
        ),
    );
    for (const item of morningItems.slice(-4)) {
      apply(
        {
          action: "plan",
          studentId,
          itemIds: [itemIdentity(item)],
          dueDate: "2026-09-14",
        },
        "2026-09-13T09:00:00.000Z",
      );
      apply(
        {
          action: "attempt",
          studentId,
          itemId: itemIdentity(item),
          answer: item.answerKey,
        },
        "2026-09-14T09:00:00.000Z",
      );
    }
    await updateLearningDocument(source.divisionId, (old) => {
      assert.equal(old.revision, 0);
      return doc;
    });
  }
  console.log(
    "Added six monthly 100-question exams and canonical learning fixtures; previous records preserved. Backup: " +
      backup,
  );
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
