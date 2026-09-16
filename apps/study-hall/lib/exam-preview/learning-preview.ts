import type { LearningPayload } from "./learning-report";
import {
  policyAt,
  type LearningCommand,
  type LearningPolicy,
} from "./learning-types";

export const learningPolicyLabels = {
  minItems: "최소 비교 문항 수",
  minSessions: "최소 응시 회차 수",
  weakGap: "전체 정답률보다 낮은 차이 (%p)",
  lowCorrectRate: "낮은 정답률 기준 (%)",
  repeatWrongSessions: "반복 오답 최소 회차 수",
};

/** Show actual before/after values, including removed settings and scheduled policies. */
export function learningChangeRows(
  payload: LearningPayload,
  command: LearningCommand,
): string[][] {
  const { document: doc, examTypes } = payload;
  const typeName = (id: string) =>
    examTypes.find((t) => t.id === id)?.name ?? id;
  const topicName = (id: string | null | undefined) =>
    doc.topics.find((t) => t.id === id)?.name ?? "미연결";
  if (command.action === "policy") {
    const before = policyAt(doc, command.effectiveFrom);
    const limitIds = Array.from(
      new Set([
        ...Object.keys(before?.timeLimits ?? {}),
        ...Object.keys(command.value.timeLimits),
      ]),
    );
    return [
      ["비교 기준일", command.effectiveFrom, command.effectiveFrom],
      ...Object.entries(learningPolicyLabels).map(([key, label]) => [
        label,
        String(before?.[key as keyof LearningPolicy] ?? "미설정"),
        String(command.value[key as keyof LearningPolicy]),
      ]),
      [
        "풀이시간 기록",
        before?.timeTracking ? "사용" : "사용 안 함",
        command.value.timeTracking ? "사용" : "사용 안 함",
      ],
      ...limitIds.map((id) => [
        `${typeName(id)} 제한 시간`,
        before?.timeLimits[id] == null
          ? "미설정"
          : `${before.timeLimits[id]}분`,
        command.value.timeLimits[id] == null
          ? "미설정"
          : `${command.value.timeLimits[id]}분`,
      ]),
    ];
  }
  if (command.action === "assign")
    return command.itemIds.map((id) => {
      const item = payload.mappingItems.find((i) => i.id === id);
      const session = payload.sessions.find((s) => s.id === item?.sessionId);
      const subject = examTypes
        .flatMap((t) => t.subjects)
        .find((s) => s.id === item?.subjectId);
      return [
        `${session?.date ?? ""} ${subject?.name ?? ""} ${item?.itemNo ?? ""}번`,
        topicName(doc.assignments[id]),
        topicName(command.topicId),
      ];
    });
  if (command.action === "subject") {
    const old = doc.subjects.find((s) => s.id === command.id);
    const linked = (ids: string[]) =>
      examTypes
        .flatMap((t) =>
          t.subjects
            .filter((s) => ids.includes(s.id))
            .map((s) => `${t.name} / ${s.name}`),
        )
        .join(", ") || "없음";
    return [
      ["표준 과목", old?.name ?? "미등록", command.name],
      [
        "연결한 시험 과목",
        linked(old?.subjectIds ?? []),
        linked(command.subjectIds),
      ],
    ];
  }
  if (command.action === "topic") {
    const old = doc.topics.find((t) => t.id === command.id);
    const group = (id?: string) =>
      doc.subjects.find((s) => s.id === id)?.name ?? "미등록";
    return [
      ["과목", group(old?.subjectGroupId), group(command.subjectGroupId)],
      ["코드", old?.code ?? "미등록", command.code],
      ["진도명", old?.name ?? "미등록", command.name],
      [
        "상위 단원",
        old ? (old.parentId ? topicName(old.parentId) : "대단원") : "미등록",
        command.parentId ? topicName(command.parentId) : "대단원",
      ],
      [
        "사용",
        old ? (old.active ? "사용" : "비활성") : "미등록",
        command.active ? "사용" : "비활성",
      ],
    ];
  }
  if (command.action === "schedule") {
    const exists = doc.plans.some(
      (p) =>
        p.date === command.date &&
        p.examTypeId === command.examTypeId &&
        p.topicId === command.topicId,
    );
    return [
      ["시험 예정일", exists ? command.date : "미등록", command.date],
      [
        "시험 종류",
        exists ? typeName(command.examTypeId) : "미등록",
        typeName(command.examTypeId),
      ],
      [
        "세부 진도",
        exists ? topicName(command.topicId) : "미등록",
        topicName(command.topicId),
      ],
    ];
  }
  return [];
}
