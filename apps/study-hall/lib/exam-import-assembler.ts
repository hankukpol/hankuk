import type { ParsedExamImport } from "@/lib/exam-import-parser";
import { mapErrataBlocksToSubjects } from "@/lib/exam-import-parser";
import type {
  ExamImportPreview,
  ExamImportSelection,
} from "@/lib/exam-import-types";
import { getGroupedFullScore } from "@/lib/exam-full-score";

export type ImportSubject = {
  id: string;
  name: string;
  totalItems: number | null;
  pointsPerItem: number | null;
  alternateGroup?: string | null;
  displayOrder?: number | null;
  isActive: boolean;
};
export type ImportExamType = {
  id: string;
  name: string;
  category: "MORNING" | "REGULAR";
  isActive: boolean;
  subjects: ImportSubject[];
};
export type ImportStudent = { id: string; studentNumber: string; name: string };
export type ImportResponse = {
  subjectId: string;
  itemNo: number;
  answer: string | null;
  isCorrect: boolean;
};
export type ImportParticipant = {
  studentId: string;
  region: string | null;
  subjectScores: Record<string, number>;
  totalScore: number;
  isPartial: boolean;
  externalRank: number | null;
  externalPercentile: number | null;
  regionalRank: number | null;
  responses: ImportResponse[];
};
export type ImportItem = {
  subjectId: string;
  itemNo: number;
  position: number;
  answerKey: string;
  points: number;
  correctRatePct: number;
  choiceRates: Record<string, number>;
  mostCommonWrong: string | null;
};
export type ImportDistribution = { score: number; count: number }[];
export type ImportSubjectAggregate = {
  count: number;
  mean: number;
  distribution: ImportDistribution;
  // Cohorts are ranked by TOTAL, stable in Score source order for ties.
  // Counts exclude untaken subjects. Null means unresolved linkage or no takers;
  // completeness distinguishes those cases (complete + count 0 = no takers).
  top10Avg: number | null;
  top30Avg: number | null;
  top10Count: number | null;
  top30Count: number | null;
  top10Complete: boolean;
  top30Complete: boolean;
};
export type ImportRegionAggregate = {
  count: number;
  mean: number;
  distribution: ImportDistribution;
  subjects: Record<string, ImportSubjectAggregate> | null;
  subjectsComplete: boolean;
  unresolvedSubjectRows: number;
};
export type ImportAssembly = {
  preview: ExamImportPreview;
  participants: ImportParticipant[];
  items: ImportItem[];
  externalStats: {
    count: number;
    mean: number | null;
    distribution: ImportDistribution;
    subjects: Record<string, ImportSubjectAggregate>;
    regions: Record<string, ImportRegionAggregate>;
  };
  primarySubjectId: string | null;
};
const normalized = (value: string) => value.replace(/\s+/g, "");
const equal = (a: number, b: number) => Math.abs(a - b) < 0.000001;

/** Raw rows from either loader pass through this single reconstruction/privacy boundary. */
export function assembleExamImport(
  parsed: ParsedExamImport,
  examTypes: ImportExamType[],
  students: ImportStudent[],
  selection: ExamImportSelection,
): ImportAssembly {
  const names = Array.from(
    new Set(parsed.moon.map((item) => item.subjectName)),
  );
  const candidates = examTypes.filter(
    (type) =>
      type.isActive &&
      type.category === selection.category &&
      names.every((name) =>
        type.subjects.some(
          (subject) =>
            subject.isActive &&
            normalized(subject.name) === normalized(name) &&
            subject.totalItems ===
              parsed.moon.filter((item) => item.subjectName === name).length,
        ),
      ) &&
      (selection.category === "MORNING"
        ? names.length === 1
        : type.subjects.filter((subject) => subject.isActive).length ===
          names.length),
  );
  const examType = selection.examTypeId
    ? examTypes.find(
        (type) =>
          type.id === selection.examTypeId &&
          type.isActive &&
          type.category === selection.category,
      )
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  const preview: ExamImportPreview = {
    examDate: parsed.meta.examDate,
    category: selection.category,
    examTypeId: examType?.id ?? null,
    examTypeName: examType?.name ?? null,
    subjectNames: names,
    cohortSize: parsed.meta.cohortSize,
    itemCount: 0,
    fullScore: 0,
    mappings: [],
    reproduction: { matchedCount: 0, mismatches: [] },
    matching: { matched: 0, unmatched: 0, invalid: 0 },
    invalidRows: [],
    partialRows: [],
    errors: [],
    existing: false,
    canConfirm: false,
  };
  const result: ImportAssembly = {
    preview,
    participants: [],
    items: [],
    externalStats: {
      count: 0,
      mean: null,
      distribution: [],
      subjects: {},
      regions: {},
    },
    primarySubjectId: null,
  };
  if (!examType) {
    preview.errors.push(
      "파일의 과목과 문항 수에 맞는 시험 종류를 선택해주세요.",
    );
    return result;
  }
  const subjects = names.map((name) =>
    examType.subjects.find(
      (subject) =>
        subject.isActive && normalized(subject.name) === normalized(name),
    ),
  );
  // 관리자는 이 문장을 들고 설정 화면을 고쳐야 한다. 어느 과목이 왜 걸렸는지까지 말한다.
  const missing = names.filter((_name, index) => !subjects[index]);
  const incomplete = names.filter((_name, index) => {
    const subject = subjects[index];
    return (
      subject &&
      (!subject.totalItems ||
        !subject.pointsPerItem ||
        !Number.isFinite(subject.pointsPerItem))
    );
  });
  if (missing.length) {
    preview.errors.push(
      `파일에 있는 과목이 시험 설정에 없습니다: ${missing.join(", ")}. ` +
        `시험 종류에 이 과목을 활성 상태로 추가해주세요.`,
    );
  }
  if (incomplete.length) {
    preview.errors.push(
      `시험 설정에 문항 수 또는 문항당 배점이 비어 있는 과목이 있습니다: ${incomplete.join(", ")}.`,
    );
  }
  if (missing.length || incomplete.length) return result;
  const active = subjects as ImportSubject[];
  const activeCount = examType.subjects.filter(
    (subject) => subject.isActive,
  ).length;
  if (selection.category === "MORNING" && active.length !== 1) {
    preview.errors.push(
      `아침 시험은 과목 하나짜리 파일이어야 하는데 파일에 ${active.length}과목이 있습니다: ${names.join(", ")}.`,
    );
    return result;
  }
  if (selection.category === "REGULAR" && active.length !== activeCount) {
    preview.errors.push(
      `시험 종류의 활성 과목 ${activeCount}개와 파일의 ${active.length}과목이 다릅니다. ` +
        `파일 과목: ${names.join(", ")}. 선택과목이 있으면 모두 활성으로 두고 같은 택1 그룹으로 묶어주세요.`,
    );
    return result;
  }
  if (
    new Set(active.map((subject) => normalized(subject.name))).size !==
    active.length
  ) {
    preview.errors.push("시험 설정에 중복 과목명이 있습니다.");
    return result;
  }
  for (const subject of active) {
    const fileItems = parsed.moon.filter(
      (item) => normalized(item.subjectName) === normalized(subject.name),
    ).length;
    if (fileItems !== subject.totalItems)
      preview.errors.push(
        `${subject.name}: 설정은 ${subject.totalItems}문항인데 파일은 ${fileItems}문항입니다.`,
      );
  }
  if (preview.errors.length) return result;
  result.primarySubjectId =
    selection.category === "MORNING" ? active[0].id : null;
  preview.fullScore = getGroupedFullScore(active);
  preview.itemCount = getGroupedFullScore(
    active.map((subject) => ({ ...subject, pointsPerItem: 1 })),
  );
  const first = parsed.errata[0];
  if (!first) {
    preview.errors.push("문항별 응답이 없습니다.");
    return result;
  }
  let mappings: { blockIndex: number; subjectName: string }[];
  try {
    mappings = mapErrataBlocksToSubjects(first.blocks, parsed.moon);
  } catch {
    preview.errors.push(
      "정답 키로 과목을 구분할 수 없습니다. 두 파일이 같은 시험인지 확인해주세요.",
    );
    return result;
  }
  preview.mappings = mappings.map((mapping) => ({
    ...mapping,
    itemCount: parsed.moon.filter(
      (item) => item.subjectName === mapping.subjectName,
    ).length,
  }));
  for (const mapping of mappings) {
    const subject = active.find(
      (item) => normalized(item.name) === normalized(mapping.subjectName),
    )!;
    const block = first.blocks.find(
      (item) => item.blockIndex === mapping.blockIndex,
    )!;
    for (const item of parsed.moon.filter(
      (item) => item.subjectName === mapping.subjectName,
    )) {
      if (item.correctRatePct === null)
        preview.errors.push("문항분석표의 정답률을 확인해주세요.");
      result.items.push({
        subjectId: subject.id,
        itemNo: item.itemNo,
        position:
          first.blocks
            .filter((entry) => entry.blockIndex < block.blockIndex)
            .reduce((sum, entry) => sum + entry.itemNumbers.length, 0) +
          block.itemNumbers.indexOf(item.itemNo) +
          1,
        answerKey: item.answerKey,
        points: subject.pointsPerItem!,
        correctRatePct: item.correctRatePct ?? 0,
        choiceRates: item.choiceRates,
        mostCommonWrong: item.mostCommonWrong,
      });
    }
  }
  const studentMap = new Map(
    students.map((student) => [student.studentNumber, student]),
  );
  const errataMap = new Map(
    parsed.errata
      .filter((row) => /^\d{5}$/.test(row.studentNumber))
      .map((row) => [row.studentNumber, row]),
  );
  const seen = new Set<string>();
  if (
    errataMap.size !==
    parsed.errata.filter((row) => /^\d{5}$/.test(row.studentNumber)).length
  )
    preview.errors.push("문항별 응답에 중복 수험번호가 있습니다.");
  if (studentMap.size !== students.length)
    preview.errors.push("학생 명단에 중복 수험번호가 있습니다.");
  // File-wide comparison includes malformed identifiers and absentees; identity validity only controls persistence.
  const external: {
    total: number;
    region: string | null;
    scores: Record<string, number> | null;
  }[] = parsed.score.map((row) => {
    const headerScores = Object.fromEntries(
      Object.entries(row.scores).filter(
        (entry): entry is [string, number] => entry[1] !== null,
      ),
    );
    const totalKey = Object.keys(headerScores).find(
      (key) =>
        normalized(key) ===
        (selection.category === "MORNING" ? "객관식" : "총점"),
    );
    const keys = new Set(
      active.flatMap((subject) =>
        Object.keys(headerScores).filter(
          (key) =>
            normalized(key) === normalized(subject.name) ||
            normalized(key) === normalized(subject.alternateGroup ?? "") ||
            key
              .split("/")
              .some((part) => normalized(part) === normalized(subject.name)),
        ),
      ),
    );
    const total = totalKey
      ? headerScores[totalKey]
      : Array.from(keys).reduce((sum, key) => sum + headerScores[key], 0);
    return { total, region: row.region, scores: null };
  });
  const externalSubjectValues = new Map(
    active.map((subject) => [subject.id, [] as number[]]),
  );
  // The parser checks equal cohort sizes, NOT cross-sheet order. Only unique,
  // nonblank identifiers (including malformed ones) establish an association.
  const scoreIdCounts = new Map<string, number>();
  const errataIdCounts = new Map<string, number>();
  for (const row of parsed.score)
    scoreIdCounts.set(row.studentNumber, (scoreIdCounts.get(row.studentNumber) ?? 0) + 1);
  for (const row of parsed.errata)
    errataIdCounts.set(row.studentNumber, (errataIdCounts.get(row.studentNumber) ?? 0) + 1);
  const linkedScores = new Map<string, Record<string, number>>();
  // Subject participation comes from answer blocks, independently of student-number validity.
  for (const row of parsed.errata) {
    const scores: Record<string, number> = {};
    for (const mapping of mappings) {
      const subject = active.find(
        (item) => normalized(item.name) === normalized(mapping.subjectName),
      )!;
      const block = row.blocks.find(
        (item) => item.blockIndex === mapping.blockIndex,
      )!;
      if (
        block.answers.some((answer) => answer !== null && answer.trim() !== "")
      ) {
        const score = block.marks.filter((mark) => mark === "O").length * subject.pointsPerItem!;
        scores[subject.id] = score;
        externalSubjectValues.get(subject.id)!.push(score);
      }
    }
    if (row.studentNumber && scoreIdCounts.get(row.studentNumber) === 1 && errataIdCounts.get(row.studentNumber) === 1)
      linkedScores.set(row.studentNumber, scores);
  }
  parsed.score.forEach((row, index) => {
    external[index].scores = linkedScores.get(row.studentNumber) ?? null;
  });
  const groupKeys = new Set(
    active.map((subject) =>
      subject.alternateGroup?.trim()
        ? `group:${subject.alternateGroup.trim()}`
        : `subject:${subject.id}`,
    ),
  );
  for (const row of parsed.score) {
    if (!/^\d{5}$/.test(row.studentNumber)) {
      preview.invalidRows.push({
        sourceRow: row.sourceRow,
        reason: "수험번호가 5자리 문자열이 아닙니다.",
      });
      continue;
    }
    if (seen.has(row.studentNumber)) {
      preview.errors.push(`채점표 ${row.sourceRow}행: 수험번호가 중복됩니다.`);
      continue;
    }
    seen.add(row.studentNumber);
    const student = studentMap.get(row.studentNumber);
    if (student) preview.matching.matched++;
    else preview.matching.unmatched++;
    const answers = errataMap.get(row.studentNumber);
    if (!answers) {
      preview.errors.push(`채점표 ${row.sourceRow}행: 문항별 응답이 없습니다.`);
      continue;
    }
    let rowMappings: typeof mappings;
    try {
      rowMappings = mapErrataBlocksToSubjects(answers.blocks, parsed.moon);
    } catch {
      preview.errors.push(
        `채점표 ${row.sourceRow}행: 정답 키가 일치하지 않습니다.`,
      );
      continue;
    }
    const responses: ImportResponse[] = [];
    const scores: Record<string, number> = {};
    const answeredGroups = new Set<string>();
    const before = preview.reproduction.mismatches.length;
    for (const mapping of rowMappings) {
      const subject = active.find(
        (item) => normalized(item.name) === normalized(mapping.subjectName),
      )!;
      const block = answers.blocks.find(
        (item) => item.blockIndex === mapping.blockIndex,
      )!;
      if (
        !block.answers.some((answer) => answer !== null && answer.trim() !== "")
      )
        continue;
      const groupKey = subject.alternateGroup?.trim()
        ? `group:${subject.alternateGroup.trim()}`
        : `subject:${subject.id}`;
      if (answeredGroups.has(groupKey))
        preview.errors.push(
          `채점표 ${row.sourceRow}행: 택1 그룹의 여러 과목에 응답했습니다.`,
        );
      answeredGroups.add(groupKey);
      const score =
        block.marks.filter((mark) => mark === "O").length *
        subject.pointsPerItem!;
      scores[subject.id] = score;
      const columnNames = Object.keys(row.scores).filter((key) =>
        selection.category === "MORNING"
          ? normalized(key) === "객관식"
          : normalized(key) === normalized(subject.name) ||
            normalized(key) === normalized(subject.alternateGroup ?? "") ||
            key
              .split("/")
              .some((part) => normalized(part) === normalized(subject.name)),
      );
      const expected =
        columnNames.length === 1 ? row.scores[columnNames[0]] : null;
      if (
        expected === null ||
        expected === undefined ||
        !equal(expected, score)
      )
        preview.reproduction.mismatches.push({
          sourceRow: row.sourceRow,
          subjectName: subject.name,
          expected: expected ?? null,
          actual: score,
          reason:
            "채점표 점수와 문항별 재계산 점수가 다릅니다. 배점과 과목 매핑을 확인해주세요.",
        });
      block.itemNumbers.forEach((itemNo, index) =>
        responses.push({
          subjectId: subject.id,
          itemNo,
          answer: block.answers[index],
          isCorrect: block.marks[index] === "O",
        }),
      );
    }
    // An unanswered mandatory/group block may not silently discard a published positive score.
    for (const subject of active) {
      const groupKey = subject.alternateGroup?.trim()
        ? `group:${subject.alternateGroup.trim()}`
        : `subject:${subject.id}`;
      if (answeredGroups.has(groupKey)) continue;
      const columns = Object.keys(row.scores).filter((key) =>
        selection.category === "MORNING"
          ? normalized(key) === "객관식"
          : normalized(key) === normalized(subject.name) ||
            normalized(key) === normalized(subject.alternateGroup ?? "") ||
            key
              .split("/")
              .some((part) => normalized(part) === normalized(subject.name)),
      );
      if (
        columns.length !== 1 ||
        (row.scores[columns[0]] !== null && row.scores[columns[0]] !== 0)
      ) {
        preview.reproduction.mismatches.push({
          sourceRow: row.sourceRow,
          subjectName: subject.name,
          expected: columns.length === 1 ? row.scores[columns[0]] : null,
          actual: 0,
          reason:
            "무응답 과목에 게시된 점수가 있습니다. 채점표를 확인해주세요.",
        });
      }
    }
    const absent = answeredGroups.size === 0;
    const isPartial = answeredGroups.size < groupKeys.size;
    if (isPartial)
      preview.partialRows.push({
        sourceRow: row.sourceRow,
        studentName: student?.name ?? null,
        absent,
        subjectNames: active
          .filter((subject) => subject.id in scores)
          .map((subject) => subject.name),
      });
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const totalKey = Object.keys(row.scores).find(
      (key) =>
        normalized(key) ===
        (selection.category === "MORNING" ? "객관식" : "총점"),
    );
    if (
      totalKey &&
      row.scores[totalKey] !== null &&
      !equal(row.scores[totalKey]!, total)
    ) {
      preview.reproduction.mismatches.push({
        sourceRow: row.sourceRow,
        subjectName: "총점",
        expected: row.scores[totalKey],
        actual: total,
        reason: "채점표 총점과 문항별 재계산 총점이 다릅니다.",
      });
    }
    if (!isPartial && before === preview.reproduction.mismatches.length)
      preview.reproduction.matchedCount++;
    if (!absent) {
      if (student)
        result.participants.push({
          studentId: student.id,
          region: row.region,
          subjectScores: scores,
          totalScore: total,
          isPartial,
          externalRank: null,
          externalPercentile: null,
          regionalRank: null,
          responses,
        });
    }
  }
  preview.matching.invalid = preview.invalidRows.length;
  const aggregate = (values: number[]) => ({
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  });
  const distribution = (values: number[]): ImportDistribution => {
    const counts = new Map<number, number>();
    for (const score of values) counts.set(score, (counts.get(score) ?? 0) + 1);
    return Array.from(counts).sort(([a], [b]) => a - b).map(([score, count]) => ({ score, count }));
  };
  const subjectAggregates = (valuesBySubject: Map<string, number[]>, cohort: typeof external) => {
    const ranked = [...cohort].sort((a, b) => b.total - a.total);
    const top = (id: string, ratio: number) => {
      const rows = ranked.slice(0, Math.ceil(ranked.length * ratio));
      const complete = rows.every((row) => row.scores !== null);
      const values = rows.flatMap((row) => row.scores && id in row.scores ? [row.scores[id]] : []);
      return {
        complete,
        count: complete ? values.length : null,
        mean: complete && values.length ? Number(aggregate(values).mean.toFixed(1)) : null,
      };
    };
    return Object.fromEntries(Array.from(valuesBySubject)
      .filter(([, values]) => values.length > 0)
      .map(([id, values]) => {
        const top10 = top(id, 0.1), top30 = top(id, 0.3);
        return [id, {
          ...aggregate(values), distribution: distribution(values),
          top10Avg: top10.mean, top30Avg: top30.mean,
          top10Count: top10.count, top30Count: top30.count,
          top10Complete: top10.complete, top30Complete: top30.complete,
        }];
      }));
  };
  result.externalStats = {
    count: external.length,
    mean: external.length ? aggregate(external.map((entry) => entry.total)).mean : null,
    distribution: distribution(external.map((entry) => entry.total)),
    subjects: subjectAggregates(externalSubjectValues, external),
    regions: Object.fromEntries(
      Array.from(new Set(external.map((entry) => entry.region)
        .filter((region): region is string => region !== null)))
        .map((region) => {
          const rows = external.filter((entry) => entry.region === region);
          const unresolvedSubjectRows = rows.filter((row) => row.scores === null).length;
          return [region, {
            ...aggregate(rows.map((row) => row.total)),
            distribution: distribution(rows.map((row) => row.total)),
            subjectsComplete: unresolvedSubjectRows === 0,
            unresolvedSubjectRows,
            subjects: unresolvedSubjectRows ? null : subjectAggregates(new Map(active.map((subject) => [
              subject.id, rows.flatMap((row) => row.scores && subject.id in row.scores ? [row.scores[subject.id]] : []),
            ])), rows),
          }];
        }),
    ),
  };
  for (const participant of result.participants) {
    participant.externalRank =
      1 +
      external.filter((entry) => entry.total > participant.totalScore).length;
    participant.externalPercentile = external.length
      ? (100 *
          (external.filter((entry) => entry.total < participant.totalScore)
            .length +
            0.5 *
              external.filter((entry) =>
                equal(entry.total, participant.totalScore),
              ).length)) /
        external.length
      : null;
    participant.regionalRank =
      participant.region === null
        ? null
        : 1 +
          external.filter(
            (entry) =>
              entry.region === participant.region &&
              entry.total > participant.totalScore,
          ).length;
  }
  if (
    selection.category === "MORNING" &&
    result.participants.some(
      (participant) => !Number.isInteger(participant.totalScore),
    )
  )
    preview.errors.push(
      "아침 성적은 정수 점수로 저장됩니다. 문항당 배점을 확인해주세요.",
    );
  if (!result.participants.length)
    preview.errors.push("저장할 자습반 학생 응답이 없습니다.");
  // 재현 불일치는 목록으로만 보여주면 원인을 알 수 없다. 거의 항상 설정 문제이므로
  // 어느 과목이 몇 건인지와, 배점이 일정하게 어긋난 경우 맞춰야 할 배점까지 말한다.
  for (const { subjectName, rows } of groupMismatchesBySubject(
    preview.reproduction.mismatches,
  )) {
    const subject = active.find((item) => item.name === subjectName);
    const ratios = rows
      .filter((row) => row.expected != null && row.actual)
      .map((row) => Number(((row.expected as number) / row.actual).toFixed(6)));
    const sameRatio =
      ratios.length > 0 && ratios.every((ratio) => ratio === ratios[0]);
    const implied =
      sameRatio && subject?.pointsPerItem
        ? ratios[0] * subject.pointsPerItem
        : null;
    preview.errors.push(
      `${subjectName}: 채점표 점수와 문항별 재계산 점수가 ${rows.length}건 다릅니다.` +
        (implied
          ? ` 문항당 배점을 ${subject!.pointsPerItem}점에서 ${Number(implied.toFixed(4))}점으로 바꾸면 맞습니다.`
          : rows.every((row) => !row.actual)
            ? " 이 과목에 응답한 학생이 없는데 채점표에는 점수가 있습니다. 선택과목이면 같은 택1 그룹으로 묶어주세요."
            : " 문항당 배점과 과목 매핑을 확인해주세요."),
    );
  }
  preview.canConfirm =
    !preview.errors.length && !preview.reproduction.mismatches.length;
  return result;
}

type ReproductionMismatch = ExamImportPreview["reproduction"]["mismatches"][number];

function groupMismatchesBySubject(mismatches: ReproductionMismatch[]) {
  const grouped: Array<{ subjectName: string; rows: ReproductionMismatch[] }> = [];
  for (const mismatch of mismatches) {
    const bucket = grouped.find((row) => row.subjectName === mismatch.subjectName);
    if (bucket) bucket.rows.push(mismatch);
    else grouped.push({ subjectName: mismatch.subjectName, rows: [mismatch] });
  }
  return grouped;
}
