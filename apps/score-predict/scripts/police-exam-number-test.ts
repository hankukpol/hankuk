import assert from "node:assert/strict";
import { ExamType } from "@prisma/client";
import {
  parsePoliceExamNumberInput,
  validatePoliceAdminExamNumberRange,
  validatePoliceExamNumberWithRange,
} from "../src/lib/police/exam-number";

assert.equal(parsePoliceExamNumberInput("01234"), "01234", "leading zero must be preserved");
assert.equal(parsePoliceExamNumberInput(" 98765 "), "98765", "surrounding whitespace must be trimmed");
assert.equal(parsePoliceExamNumberInput("1234"), null, "four digits must be rejected");
assert.equal(parsePoliceExamNumberInput("123456"), null, "six digits must be rejected");
assert.equal(parsePoliceExamNumberInput("2026003000"), null, "legacy ten-digit police number must be rejected");
assert.equal(parsePoliceExamNumberInput("12A45"), null, "non-numeric police number must be rejected");

assert.deepEqual(
  validatePoliceAdminExamNumberRange("00000", "99999", "공채"),
  { start: "00000", end: "99999", error: null },
  "five-digit admin range must be accepted",
);
assert.match(
  validatePoliceAdminExamNumberRange("0000", "99999", "공채").error ?? "",
  /5자리/,
  "invalid admin range must explain the five-digit rule",
);

const quota = {
  examNumberStart: "03000",
  examNumberEnd: "03999",
  examNumberStartCareer: "13000",
  examNumberEndCareer: "13999",
};
assert.equal(
  validatePoliceExamNumberWithRange({ examNumber: "03555", examType: ExamType.PUBLIC, quota }).ok,
  true,
  "public number inside its five-digit range must be accepted",
);
assert.equal(
  validatePoliceExamNumberWithRange({ examNumber: "13555", examType: ExamType.CAREER, quota }).ok,
  true,
  "career number inside its five-digit range must be accepted",
);
assert.equal(
  validatePoliceExamNumberWithRange({ examNumber: "13555", examType: ExamType.PUBLIC, quota }).ok,
  false,
  "number outside the selected recruitment range must be rejected",
);

console.log(JSON.stringify({ policeExamNumber: "passed", digits: 5 }));
