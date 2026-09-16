import type { RegularRawSource } from "@/lib/exam-analysis-types";
import { itemIdentity } from "./learning-mutations";
import { enrichSessions, finite, ymd } from "./metrics";
import type { LearningDocument } from "./learning-types";

export function buildLearningPayload(
  source: RegularRawSource,
  doc: LearningDocument,
  studentId?: string,
  admin = false,
) {
  const configuration = admin && !studentId;
  const sessionById = new Map(source.sessions.map((s) => [s.id, s]));
  const topicSessions = new Map<
    string,
    {
      topicId: string;
      sessionId: string;
      subjectId: string;
      examTypeId: string;
      date: string;
      itemCount: number;
    }
  >();
  // Keep exam coverage even when this student has no score/answers. Do not
  // disclose the answers to unattempted questions to establish coverage.
  if (studentId)
    for (const item of source.items) {
      const session = sessionById.get(item.sessionId);
      const topicId = doc.assignments[itemIdentity(item)];
      if (
        !session ||
        session.divisionId !== source.divisionId ||
        item.divisionId !== source.divisionId ||
        !topicId
      )
        continue;
      const key = `${session.id}:${item.subjectId}:${topicId}`;
      const row = topicSessions.get(key);
      if (row) row.itemCount += 1;
      else
        topicSessions.set(key, {
          topicId,
          sessionId: session.id,
          subjectId: item.subjectId,
          examTypeId: session.examTypeId,
          date: ymd(session.examDate),
          itemCount: 1,
        });
    }
  const all = studentId
    ? source.examTypes.flatMap(
        (type) =>
          enrichSessions(
            source,
            type.id,
            source.sessions
              .filter((s) => s.examTypeId === type.id)
              .map((s) => s.id),
            studentId,
          ).items,
      )
    : [];
  return {
    document: {
      ...doc,
      reviews: doc.reviews.filter((r) => r.studentId === studentId),
      times: doc.times.filter((r) => r.studentId === studentId),
      audit: configuration ? doc.audit : [],
      requests: [],
      policies: doc.policies.map((p) => ({
        ...p,
        actor: admin ? p.actor : "",
      })),
    },
    examTypes: source.examTypes.map((type) => ({
      id: type.id,
      name: type.name,
      category: type.category,
      subjects: type.subjects.map((s) => ({ id: s.id, name: s.name })),
    })),
    topicSessions: Array.from(topicSessions.values()),
    sessions: source.sessions.map((s) => ({
      id: s.id,
      date: ymd(s.examDate),
      examTypeId: s.examTypeId,
      subjectIds: Array.from(
        new Set(
          source.items
            .filter((i) => i.sessionId === s.id)
            .map((i) => i.subjectId),
        ),
      ),
      fullScore: s.fullScore,
      taken: source.participants.some(
        (p) => p.sessionId === s.id && p.studentId === studentId,
      ),
    })),
    items: all.map((item) => ({
      ...item,
      kind:
        source.examTypes.find(
          (t) =>
            t.id ===
            source.sessions.find((s) => s.id === item.sessionId)?.examTypeId,
        )?.category ?? "REGULAR",
      examTypeId: source.sessions.find((s) => s.id === item.sessionId)!
        .examTypeId,
      externalCohortCount: finite(
        (
          source.sessions.find((s) => s.id === item.sessionId)
            ?.externalStats as { subjects?: Record<string, { count?: number }> }
        )?.subjects?.[item.subjectId]?.count,
      ),
    })),
    // Administrators can map unattempted items as well. No student roster or other responses exposed.
    mappingItems: configuration
      ? source.items.map((item) => ({
          id: itemIdentity(item),
          sessionId: item.sessionId,
          subjectId: item.subjectId,
          itemNo: item.itemNo,
          points: item.points,
        }))
      : [],
  };
}
export type LearningPayload = ReturnType<typeof buildLearningPayload>;
