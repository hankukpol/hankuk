import type { Prisma } from "@prisma/client";

const PLACEHOLDER_EXAM_NUMBER = "수험번호";
const PLACEHOLDER_NAME = "이름";
const PLACEHOLDER_PHONE = "연락처";

function normalize(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function isPlaceholderStudentRecord(input: {
  examNumber?: string | null;
  name?: string | null;
  phone?: string | null;
}) {
  return (
    normalize(input.examNumber) === PLACEHOLDER_EXAM_NUMBER &&
    normalize(input.name) === PLACEHOLDER_NAME &&
    normalize(input.phone) === PLACEHOLDER_PHONE
  );
}

export const NON_PLACEHOLDER_STUDENT_FILTER: Prisma.StudentWhereInput = {
  NOT: {
    AND: [
      { examNumber: PLACEHOLDER_EXAM_NUMBER },
      { name: PLACEHOLDER_NAME },
      { phone: PLACEHOLDER_PHONE },
    ],
  },
};
