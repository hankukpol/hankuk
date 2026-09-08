import test from "node:test";
import type { ZodType } from "zod";
import { studentUpsertSchema, studentWithdrawSchema, studentMemoSchema } from "../../lib/student-schemas";
import { staffCreateSchema, staffUpdateSchema, staffPasswordResetSchema } from "../../lib/division-staff-schemas";
import { adminAccountCreateSchema, adminAccountUpdateSchema, adminPasswordResetSchema, divisionCreateSchema, divisionUpdateSchema } from "../../lib/super-admin-schemas";
import { generalSettingsSchema, rulesSettingsSchema, featureSettingsSchema, divisionFeatureFlagsSchema, operatingDaysSchema } from "../../lib/settings-schemas";
import { paymentSchema, paymentBatchSchema, enrollPaymentSchema, renewPaymentSchema, refundPaymentSchema } from "../../lib/payment-schemas";
import { tuitionPlanSchema } from "../../lib/tuition-schemas";
import { announcementSchema } from "../../lib/announcement-schemas";
import { interviewSchema } from "../../lib/interview-schemas";
import { leavePermissionSchema, leaveSettlementSchema } from "../../lib/leave-schemas";
import { pointRuleSchema, pointCategoryCreateSchema, pointCategoryRenameSchema, pointCategoryDeleteSchema, pointRecordSchema, pointBatchSchema } from "../../lib/point-schemas";
import { studyRoomSchema, seatLayoutItemSchema, seatLayoutSaveItemSchema, seatLayoutSchema, seatAssignSchema } from "../../lib/seat-schemas";
import { examTypeSchema, examTypeReorderSchema, examScoresBatchSchema } from "../../lib/exam-schemas";
import { examScheduleSchema, examScheduleUpdateSchema } from "../../lib/exam-schedule-schemas";
import { morningExamScoresBatchSchema } from "../../lib/morning-exam-schemas";
import { scoreTargetUpsertSchema } from "../../lib/score-target-schemas";
import { phoneSubmissionBatchSchema, phoneBulkRentalSchema } from "../../lib/phone-submission-schemas";
import { rejectsAt } from "./schema-assertions";

const groups: Array<[string, ZodType[]]> = [
  ["student and staff", [studentUpsertSchema, studentWithdrawSchema, studentMemoSchema, staffCreateSchema, staffUpdateSchema, staffPasswordResetSchema, adminAccountCreateSchema, adminAccountUpdateSchema, adminPasswordResetSchema]],
  ["division and settings", [divisionCreateSchema, divisionUpdateSchema, generalSettingsSchema, rulesSettingsSchema, featureSettingsSchema, divisionFeatureFlagsSchema, operatingDaysSchema]],
  ["payment and tuition", [paymentSchema, paymentBatchSchema, enrollPaymentSchema, renewPaymentSchema, refundPaymentSchema, tuitionPlanSchema]],
  ["announcements and leave", [announcementSchema, interviewSchema, leavePermissionSchema, leaveSettlementSchema]],
  ["points", [pointRuleSchema, pointCategoryCreateSchema, pointCategoryRenameSchema, pointCategoryDeleteSchema, pointRecordSchema, pointBatchSchema]],
  ["seats", [studyRoomSchema, seatLayoutItemSchema, seatLayoutSaveItemSchema, seatLayoutSchema, seatAssignSchema]],
  ["exams and phone submissions", [examTypeSchema, examTypeReorderSchema, examScoresBatchSchema, examScheduleSchema, examScheduleUpdateSchema, morningExamScoresBatchSchema, scoreTargetUpsertSchema, phoneSubmissionBatchSchema, phoneBulkRentalSchema]],
];

for (const [domain, schemas] of groups) {
  test(`${domain} object schemas reject null, missing, scalar and array request bodies`, () => {
    for (const schema of schemas) {
      for (const input of [undefined, null, "", "{}", 0, false, [], [null]]) rejectsAt(schema, input, "");
    }
  });
}
