import type { RegularRawSource } from "@/lib/exam-analysis-types";
import { ymd, finite } from "./metrics";
export function totalHistory(
  source: RegularRawSource,
  examTypeId: string,
  studentId: string,
  from: string,
  to: string,
) {
  return source.sessions
    .filter(
      (s) =>
        s.divisionId === source.divisionId &&
        s.examTypeId === examTypeId &&
        !s.primarySubjectId &&
        ymd(s.examDate) >= from &&
        ymd(s.examDate) <= to,
    )
    .sort((a, b) => ymd(a.examDate).localeCompare(ymd(b.examDate)))
    .map((session) => {
      const participant = source.participants.find(
        (p) =>
          p.divisionId === source.divisionId &&
          p.sessionId === session.id &&
          p.studentId === studentId,
      );
      const stats = session.externalStats as {
        count?: number;
        mean?: number;
        distribution?: { score: number; count: number }[];
      } | null;
      const distribution = stats?.distribution;
      const valid =
        !!stats &&
        Number.isInteger(stats.count) &&
        stats.count! > 0 &&
        Array.isArray(distribution) &&
        distribution.length > 0 &&
        distribution.every(
          (d) =>
            Number.isFinite(d.score) &&
            d.score >= 0 &&
            d.score <= session.fullScore &&
            Number.isInteger(d.count) &&
            d.count > 0,
        ) &&
        distribution.reduce((sum, d) => sum + d.count, 0) === stats.count;
      const external = valid
        ? distribution!.reduce((sum, d) => sum + d.score * d.count, 0) /
          stats!.count!
        : null;
      const my =
        participant && !participant.isPartial
          ? finite(participant.totalScore)
          : null;
      const rank =
        valid && my !== null && distribution!.some((d) => d.score === my)
          ? 1 +
            distribution!
              .filter((d) => d.score > my)
              .reduce((sum, d) => sum + d.count, 0)
          : null;
      return {
        sessionId: session.id,
        date: ymd(session.examDate),
        fullScore: session.fullScore,
        my,
        external,
        count: valid ? stats!.count! : null,
        gap: my === null || external === null ? null : my - external,
        rank,
        topPercent: rank === null ? null : (rank / stats!.count!) * 100,
      };
    });
}
