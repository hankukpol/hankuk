import { z } from "zod";

export const learningDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00Z");
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "날짜를 확인해주세요.");
const id = z.string().min(1).max(200);
const title = z.string().trim().min(1).max(100);
export const learningPolicySchema = z.object({
  minItems: z.number().int().min(1).max(500),
  minSessions: z.number().int().min(1).max(30),
  weakGap: z.number().min(0).max(100),
  lowCorrectRate: z.number().min(0).max(100),
  repeatWrongSessions: z.number().int().min(2).max(30),
  timeTracking: z.boolean(),
  timeLimits: z.record(id, z.number().int().min(1).max(600)),
});
export type LearningPolicy = z.infer<typeof learningPolicySchema>;
export type LearningSubject = {
  id: string;
  name: string;
  subjectIds: string[];
};
export type LearningTopic = {
  id: string;
  subjectGroupId: string;
  parentId: string | null;
  code: string;
  name: string;
  active: boolean;
};
export type LearningReview = {
  id: string;
  studentId: string;
  itemId: string;
  action: "plan" | "attempt";
  dueDate: string | null;
  answer: string | null;
  correct: boolean | null;
  at: string;
  actor: string;
};
export type LearningTime = {
  id: string;
  studentId: string;
  sessionId: string;
  totalMinutes: number;
  subjectMinutes: Record<string, number>;
  ranOut: boolean;
  at: string;
  actor: string;
};
export type LearningDocument = {
  divisionId: string;
  revision: number;
  subjects: LearningSubject[];
  topics: LearningTopic[];
  assignments: Record<string, string>;
  plans: { id: string; date: string; examTypeId: string; topicId: string }[];
  policies: {
    id: string;
    effectiveFrom: string;
    value: LearningPolicy;
    at: string;
    actor: string;
  }[];
  reviews: LearningReview[];
  times: LearningTime[];
  audit: {
    id: string;
    at: string;
    actor: string;
    action: string;
    before: unknown;
    after: unknown;
  }[];
  requests: { id: string; actor: string; body: string }[];
};
export const emptyLearningDocument = (
  divisionId: string,
): LearningDocument => ({
  divisionId,
  revision: 0,
  subjects: [],
  topics: [],
  assignments: {},
  plans: [],
  policies: [],
  reviews: [],
  times: [],
  audit: [],
  requests: [],
});
export const learningCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("subject"),
    id: id.optional(),
    name: title,
    subjectIds: z.array(id).min(1).max(30),
  }),
  z.object({
    action: z.literal("topic"),
    id: id.optional(),
    subjectGroupId: id,
    parentId: id.nullable(),
    code: title,
    name: title,
    active: z.boolean(),
  }),
  z.object({
    action: z.literal("assign"),
    topicId: id.nullable(),
    itemIds: z.array(id).min(1).max(1000),
  }),
  z.object({
    action: z.literal("schedule"),
    date: learningDate,
    examTypeId: id,
    topicId: id,
  }),
  z.object({
    action: z.literal("policy"),
    effectiveFrom: learningDate,
    value: learningPolicySchema,
  }),
  z.object({
    action: z.literal("plan"),
    studentId: id,
    itemIds: z.array(id).min(1).max(1000),
    dueDate: learningDate,
  }),
  z.object({
    action: z.literal("attempt"),
    studentId: id,
    itemId: id,
    answer: z.string().trim().min(1).max(30),
  }),
  z.object({
    action: z.literal("time"),
    studentId: id,
    sessionId: id,
    totalMinutes: z.number().finite().min(0).max(1440),
    subjectMinutes: z.record(id, z.number().finite().min(0).max(1440)),
    ranOut: z.boolean(),
  }),
]);
export type LearningCommand = z.infer<typeof learningCommandSchema>;
export const learningMutationSchema = z.object({
  revision: z.number().int().min(0),
  requestId: z.string().uuid(),
  command: learningCommandSchema,
});
export function policyVersionAt(doc: LearningDocument, date: string) {
  return (
    doc.policies
      .filter((p) => p.effectiveFrom <= date)
      .reverse()
      .sort(
        (a, b) =>
          b.effectiveFrom.localeCompare(a.effectiveFrom) ||
          b.at.localeCompare(a.at),
      )[0] ?? null
  );
}
export function policyAt(doc: LearningDocument, date: string) {
  return policyVersionAt(doc, date)?.value ?? null;
}
