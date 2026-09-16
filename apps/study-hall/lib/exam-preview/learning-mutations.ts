import { randomUUID } from "node:crypto";
import type { RegularRawSource } from "@/lib/exam-analysis-types";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import {
  policyAt,
  policyVersionAt,
  type LearningCommand,
  type LearningDocument,
} from "./learning-types";
import { ymd } from "./metrics";
import { regradeIssue } from "./learning-grading";

export type LearningActor = {
  id: string;
  role: "ADMIN" | "SUPER_ADMIN" | "STUDENT";
  studentId?: string;
};
export const itemIdentity = (item: {
  sessionId: string;
  subjectId: string;
  itemNo: number;
}) => item.sessionId + "-" + item.subjectId + "-" + item.itemNo;
export function applyLearningCommand(
  doc: LearningDocument,
  source: RegularRawSource,
  command: LearningCommand,
  actor: LearningActor,
  revision: number,
  requestId: string,
  at = new Date().toISOString(),
) {
  if (doc.divisionId !== source.divisionId)
    throw forbidden("다른 학원 자료를 연결할 수 없습니다.");
  const body = JSON.stringify(command),
    prior = doc.requests.find((r) => r.id === requestId);
  if (prior) {
    if (prior.actor !== actor.id || prior.body !== body)
      throw conflict("같은 요청 번호를 다른 내용에 사용할 수 없습니다.");
    return doc;
  }
  if (doc.revision !== revision)
    throw conflict(
      "다른 변경이 저장되었습니다. 새로고침 후 변경 내용을 다시 확인해주세요.",
    );
  const result = structuredClone(doc),
    before = structuredClone(doc);
  const ownedItems = source.items.filter(
    (i) =>
      i.divisionId === source.divisionId &&
      source.sessions.some(
        (s) => s.id === i.sessionId && s.divisionId === source.divisionId,
      ),
  );
  const findItem = (id: string) => {
    const item = ownedItems.find((i) => itemIdentity(i) === id);
    if (!item) throw notFound("현재 학원의 문항을 찾을 수 없습니다.");
    return item;
  };
  const findTopic = (id: string) => {
    const topic = result.topics.find((t) => t.id === id);
    if (!topic) throw notFound("현재 학원의 진도를 찾을 수 없습니다.");
    return topic;
  };
  const personal = ["plan", "attempt", "time"].includes(command.action);
  if (!personal && actor.role === "STUDENT")
    throw forbidden("진도와 분석 기준은 관리자만 설정할 수 있습니다.");
  if ("studentId" in command) {
    if (actor.role === "STUDENT" && command.studentId !== actor.studentId)
      throw forbidden("본인의 학습 기록만 변경할 수 있습니다.");
    if (
      !source.students.some(
        (s) => s.id === command.studentId && s.divisionId === source.divisionId,
      )
    )
      throw notFound("현재 학원의 학생을 찾을 수 없습니다.");
  }
  const ownWrong = (id: string, studentId: string) => {
    const item = findItem(id);
    const exam = source.sessions.find((s) => s.id === item.sessionId)!;
    if (
      ymd(exam.examDate) >
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
        new Date(at),
      )
    )
      throw badRequest("아직 시행하지 않은 시험은 복습할 수 없습니다.");
    const taken = source.participants.find(
      (p) =>
        p.divisionId === source.divisionId &&
        p.sessionId === item.sessionId &&
        p.studentId === studentId &&
        typeof p.subjectScores?.[item.subjectId] === "number",
    );
    const response = source.responses.find(
      (r) =>
        r.divisionId === source.divisionId &&
        r.studentId === studentId &&
        r.sessionId === item.sessionId &&
        r.subjectId === item.subjectId &&
        r.itemNo === item.itemNo,
    );
    if (!taken || response?.isCorrect !== false)
      throw badRequest(
        "채점 기록에서 확인된 본인 오답만 복습 기록에 연결할 수 있습니다.",
      );
    return item;
  };
  switch (command.action) {
    case "subject": {
      const allowed = new Set(
        source.examTypes.flatMap((t) => t.subjects.map((s) => s.id)),
      );
      if (command.subjectIds.some((id) => !allowed.has(id)))
        throw forbidden("다른 학원의 과목을 연결할 수 없습니다.");
      if (
        result.subjects.some(
          (s) =>
            s.id !== command.id &&
            s.subjectIds.some((id) => command.subjectIds.includes(id)),
        )
      )
        throw conflict("이미 다른 표준 과목에 연결된 시험 과목입니다.");
      const old = command.id
        ? result.subjects.find((s) => s.id === command.id)
        : null;
      if (command.id && !old) throw notFound("표준 과목을 찾을 수 없습니다.");
      if (
        old &&
        old.subjectIds.some((id) => !command.subjectIds.includes(id)) &&
        result.topics.some((t) => t.subjectGroupId === old.id)
      )
        throw badRequest(
          "진도가 등록된 표준 과목의 연결은 제거할 수 없습니다. 새 과목은 추가할 수 있습니다.",
        );
      const value = {
        id: old?.id ?? randomUUID(),
        name: command.name,
        subjectIds: Array.from(new Set(command.subjectIds)),
      };
      result.subjects = result.subjects
        .filter((s) => s.id !== value.id)
        .concat(value);
      break;
    }
    case "topic": {
      if (!result.subjects.some((s) => s.id === command.subjectGroupId))
        throw notFound("표준 과목을 선택해주세요.");
      if (
        result.topics.some(
          (t) =>
            t.id !== command.id &&
            t.subjectGroupId === command.subjectGroupId &&
            t.code === command.code,
        )
      )
        throw conflict("해당 과목에서 이미 사용 중인 진도 코드입니다.");
      const old = command.id ? findTopic(command.id) : null;
      if (
        old &&
        (old.subjectGroupId !== command.subjectGroupId ||
          old.parentId !== command.parentId)
      )
        throw badRequest(
          "기존 진도의 과목·상위 단원은 변경할 수 없습니다. 이름을 수정하거나 새 진도를 등록해주세요.",
        );
      if (command.parentId) {
        const parent = findTopic(command.parentId);
        if (
          parent.parentId ||
          !parent.active ||
          parent.subjectGroupId !== command.subjectGroupId ||
          parent.id === command.id
        )
          throw badRequest("같은 과목의 활성 대단원을 선택해주세요.");
      }
      if (
        old &&
        !command.active &&
        result.topics.some((t) => t.parentId === old.id && t.active)
      )
        throw badRequest("하위 진도를 먼저 비활성화해주세요.");
      const value = {
        id: old?.id ?? randomUUID(),
        subjectGroupId: command.subjectGroupId,
        parentId: command.parentId,
        code: command.code,
        name: command.name,
        active: command.active,
      };
      result.topics = result.topics
        .filter((t) => t.id !== value.id)
        .concat(value);
      break;
    }
    case "assign": {
      const topic = command.topicId ? findTopic(command.topicId) : null;
      if (topic && (!topic.active || !topic.parentId))
        throw badRequest("활성 세부 진도를 선택해주세요.");
      const group = result.subjects.find((s) => s.id === topic?.subjectGroupId);
      for (const id of command.itemIds) {
        const item = findItem(id);
        if (topic && !group?.subjectIds.includes(item.subjectId))
          throw badRequest("문항 과목과 진도 과목이 다릅니다.");
        if (topic) result.assignments[id] = topic.id;
        else delete result.assignments[id];
      }
      break;
    }
    case "schedule": {
      const topic = findTopic(command.topicId),
        group = result.subjects.find((s) => s.id === topic.subjectGroupId),
        type = source.examTypes.find((t) => t.id === command.examTypeId);
      if (
        !topic.active ||
        !topic.parentId ||
        !type ||
        !type.subjects.some((s) => group?.subjectIds.includes(s.id))
      )
        throw badRequest("시험 종류와 같은 과목의 세부 진도를 선택해주세요.");
      if (
        !result.plans.some(
          (p) =>
            p.date === command.date &&
            p.examTypeId === command.examTypeId &&
            p.topicId === topic.id,
        )
      )
        result.plans.push({
          id: randomUUID(),
          date: command.date,
          examTypeId: command.examTypeId,
          topicId: topic.id,
        });
      break;
    }
    case "policy": {
      if (
        Object.keys(command.value.timeLimits).some(
          (id) => !source.examTypes.some((t) => t.id === id),
        )
      )
        throw badRequest("현재 학원의 시험 시간만 설정할 수 있습니다.");
      result.policies.push({
        id: randomUUID(),
        effectiveFrom: command.effectiveFrom,
        value: command.value,
        at,
        actor: actor.id,
      });
      break;
    }
    case "plan": {
      for (const id of Array.from(new Set(command.itemIds))) {
        ownWrong(id, command.studentId);
        result.reviews.push({
          id: randomUUID(),
          studentId: command.studentId,
          itemId: id,
          action: "plan",
          dueDate: command.dueDate,
          answer: null,
          correct: null,
          at,
          actor: actor.id,
        });
      }
      break;
    }
    case "attempt": {
      const item = ownWrong(command.itemId, command.studentId),
        choices = Object.keys(item.choiceRates ?? {});
      const issue = regradeIssue(item.answerKey, choices);
      if (issue) throw badRequest(issue);
      if (choices.length && !choices.includes(command.answer))
        throw badRequest("문항의 유효한 선택지를 입력해주세요.");
      result.reviews.push({
        id: randomUUID(),
        studentId: command.studentId,
        itemId: command.itemId,
        action: "attempt",
        dueDate: null,
        answer: command.answer,
        correct: command.answer === item.answerKey,
        at,
        actor: actor.id,
      });
      break;
    }
    case "time": {
      const date = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
      }).format(new Date(at));
      if (!policyAt(doc, date)?.timeTracking)
        throw badRequest("학원 설정에서 시간 기록을 활성화해주세요.");
      const session = source.sessions.find(
        (s) => s.id === command.sessionId && s.divisionId === source.divisionId,
      );
      if (
        !session ||
        !source.participants.some(
          (p) =>
            p.divisionId === source.divisionId &&
            p.sessionId === session.id &&
            p.studentId === command.studentId,
        )
      )
        throw notFound("응시한 시험만 시간 기록을 남길 수 있습니다.");
      const subjectIds = new Set(
        ownedItems
          .filter((i) => i.sessionId === session.id)
          .map((i) => i.subjectId),
      );
      if (Object.keys(command.subjectMinutes).some((id) => !subjectIds.has(id)))
        throw badRequest("해당 시험의 과목만 입력해주세요.");
      if (
        Object.values(command.subjectMinutes).reduce((a, b) => a + b, 0) >
        command.totalMinutes
      )
        throw badRequest("과목별 시간 합계는 총 소요시간을 넘을 수 없습니다.");
      if (ymd(session.examDate) > date)
        throw badRequest(
          "아직 시행하지 않은 시험의 시간은 기록할 수 없습니다.",
        );
      result.times.push({
        id: randomUUID(),
        studentId: command.studentId,
        sessionId: session.id,
        totalMinutes: command.totalMinutes,
        subjectMinutes: command.subjectMinutes,
        ranOut: command.ranOut,
        at,
        actor: actor.id,
      });
      break;
    }
  }
  result.revision++;
  // Keep revisions/history append-only. Original exam marks and responses are never rewritten.
  const changed =
    command.action === "policy"
      ? {
          before: policyVersionAt(before, command.effectiveFrom),
          after: result.policies.at(-1),
        }
      : command.action === "assign"
        ? {
            before: Object.fromEntries(
              command.itemIds.map((id) => [id, before.assignments[id] ?? null]),
            ),
            after: Object.fromEntries(
              command.itemIds.map((id) => [id, result.assignments[id] ?? null]),
            ),
          }
        : { before: null, after: command };
  result.audit.push({
    id: randomUUID(),
    at,
    actor: actor.id,
    action: command.action,
    ...changed,
  });
  if (command.action === "subject" || command.action === "topic") {
    const list = command.action === "subject" ? "subjects" : "topics";
    result.audit[result.audit.length - 1].before =
      before[list].find((row) => row.id === command.id) ?? null;
    result.audit[result.audit.length - 1].after = result[list].at(-1);
  }
  result.requests.push({ id: requestId, actor: actor.id, body });
  return result;
}
