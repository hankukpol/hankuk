import { NotificationChannel, NotificationType, StudentStatus } from "@prisma/client";

export type NotificationMessageInput = {
  type: NotificationType;
  studentName: string;
  recoveryDate?: Date | null;
  weekAbsenceCount?: number | null;
  monthAbsenceCount?: number | null;
  pointAmount?: number | null;
  customMessage?: string;
  absenceNoteOutcome?: string | null;
  absenceNoteFollowUp?: string | null;
  recipientName?: string | null;
  sessionLabel?: string | null;
  examDateLabel?: string | null;
  missingScoreCount?: number | null;
  periodName?: string | null;
  // P1-9 event notifications
  courseName?: string | null;
  enrollmentPeriod?: string | null;
  paymentAmount?: string | null;
  paymentMethod?: string | null;
  refundAmount?: string | null;
  unpaidAmount?: string | null;
  dueDate?: string | null;
};

export type NotificationTemplateSummary = {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  label: string;
  description: string;
  content: string;
  variables: string[];
  solapiTemplateId: string | null;
  envFallbackTemplateId: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  sampleValues: Record<string, string>;
  preview: string;
  usesDefault: boolean;
};

type NotificationTemplateDefinition = {
  label: string;
  description: string;
  content: string;
  variables: string[];
  sampleValues: Record<string, string>;
  envKey: string | null;
};

export const NOTIFICATION_TEMPLATE_TYPES = Object.values(NotificationType);

const DEFAULT_TEMPLATE_DEFINITIONS: Record<NotificationType, NotificationTemplateDefinition> = {
  WARNING_1: {
    label: "Warning 1",
    description: "First warning after an unexcused absence.",
    content:
      "[\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC] {studentName}\uB2D8, \uC774\uBC88 \uC8FC \uBB34\uB2E8 \uACB0\uC2DC {weekAbsenceCount}\uD68C\uB85C 1\uCC28 \uACBD\uACE0 \uC0C1\uD0DC\uC785\uB2C8\uB2E4. \uB2E4\uC74C \uC2DC\uD5D8 \uCC38\uC5EC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
    variables: ["studentName", "weekAbsenceCount"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
      weekAbsenceCount: "1",
    },
    envKey: "SOLAPI_TEMPLATE_WARNING_1",
  },
  WARNING_2: {
    label: "Warning 2",
    description: "Second warning before dropout treatment.",
    content:
      "[\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC] {studentName}\uB2D8, \uC774\uBC88 \uC8FC \uBB34\uB2E8 \uACB0\uC2DC {weekAbsenceCount}\uD68C\uB85C 2\uCC28 \uACBD\uACE0 \uC0C1\uD0DC\uC785\uB2C8\uB2E4. \uCD94\uAC00 \uACB0\uC2DC \uC2DC \uD0C8\uB77D \uCC98\uB9AC\uB429\uB2C8\uB2E4.",
    variables: ["studentName", "weekAbsenceCount"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
      weekAbsenceCount: "2",
    },
    envKey: "SOLAPI_TEMPLATE_WARNING_2",
  },
  DROPOUT: {
    label: "Dropout",
    description: "Dropout notice after exceeding absence rules.",
    content:
      "[\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC] {studentName}\uB2D8\uC740 \uACB0\uC2DC \uAE30\uC900 \uCD08\uACFC\uB85C \uD0C8\uB77D \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC8FC\uAC04 {weekAbsenceCount}\uD68C / \uC6D4\uAC04 {monthAbsenceCount}\uD68C \uAE30\uC900\uC774\uBA70 \uBCF5\uAD6C \uAC00\uB2A5\uC77C\uC740 {recoveryDate}\uC785\uB2C8\uB2E4.",
    variables: ["studentName", "weekAbsenceCount", "monthAbsenceCount", "recoveryDate"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
      weekAbsenceCount: "3",
      monthAbsenceCount: "8",
      recoveryDate: "2026. 3. 31.",
    },
    envKey: "SOLAPI_TEMPLATE_DROPOUT",
  },
  ABSENCE_NOTE: {
    label: "Absence Note",
    description: "Absence note approval or rejection result.",
    content:
      "[\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC] {studentName}\uB2D8 \uC0AC\uC720\uC11C\uAC00 {absenceNoteOutcome}\uB418\uC5C8\uC2B5\uB2C8\uB2E4. {absenceNoteFollowUp}",
    variables: ["studentName", "absenceNoteOutcome", "absenceNoteFollowUp"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
      absenceNoteOutcome: "\uC2B9\uC778",
      absenceNoteFollowUp:
        "\uAD00\uB9AC\uC790 \uD654\uBA74\uC5D0\uC11C \uCC98\uB9AC \uACB0\uACFC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
    },
    envKey: "SOLAPI_TEMPLATE_ABSENCE_NOTE",
  },
  POINT: {
    label: "Point",
    description: "Point grant notification.",
    content:
      "[\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC] {studentName}\uB2D8\uAED8 \uD3EC\uC778\uD2B8 {pointAmount}P\uAC00 \uC9C0\uAE09\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    variables: ["studentName", "pointAmount"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
      pointAmount: "500",
    },
    envKey: "SOLAPI_TEMPLATE_POINT",
  },
  NOTICE: {
    label: "Notice",
    description: "Default body for manual notice sends.",
    content:
      "[\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC] {studentName}\uB2D8\uAED8 \uC6B4\uC601 \uACF5\uC9C0\uB97C \uC804\uB2EC\uB4DC\uB9BD\uB2C8\uB2E4.",
    variables: ["studentName"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
    },
    envKey: "SOLAPI_TEMPLATE_NOTICE",
  },
  SCORE_DEADLINE: {
    label: "Score Deadline",
    description: "Admin alert when today's score entry is still incomplete after the deadline.",
    content:
      "[\uC544\uCE68\uBAA8\uC758\uACE0\uC0AC] {recipientName}\uB2D8, {examDateLabel} {sessionLabel} \uC131\uC801 \uC785\uB825\uC774 \uC544\uC9C1 {missingScoreCount}\uAC74 \uB0A8\uC544 \uC788\uC2B5\uB2C8\uB2E4. {periodName} \uD654\uBA74\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
    variables: ["recipientName", "examDateLabel", "sessionLabel", "missingScoreCount", "periodName"],
    sampleValues: {
      name: "Lead Teacher",
      studentName: "Lead Teacher",
      recipientName: "Lead Teacher",
      examDateLabel: "2026-03-14",
      sessionLabel: "\uACF5\uCC44 2\uC8FC\uCC28 \uD615\uBC95",
      missingScoreCount: "3",
      periodName: "2026 \uBD04\uC2DC\uC98C",
    },
    envKey: "SOLAPI_TEMPLATE_SCORE_DEADLINE",
  },
  ENROLLMENT_COMPLETE: {
    label: "\uC218\uAC15 \uB4F1\uB85D \uC644\uB8CC",
    description: "\uC218\uAC15 \uB4F1\uB85D\uC774 \uC644\uB8CC\uB418\uC5C8\uC744 \uB54C \uBC1C\uC1A1\uD558\uB294 \uC548\uB0B4 \uBA54\uC2DC\uC9C0\uC785\uB2C8\uB2E4.",
    content:
      "[\uD559\uC6D0 \uC548\uB0B4] {studentName}\uB2D8 \uC218\uAC15 \uB4F1\uB85D\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.\n\n\uACFC\uC815: {courseName}\n\uC218\uAC15 \uAE30\uAC04: {enrollmentPeriod}\n\n\uBB38\uC758: \uD559\uC6D0 \uC5F0\uB77D\uCC98\uB294 \uAD00\uB9AC\uC790\uC5D0\uAC8C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.",
    variables: ["studentName", "courseName", "enrollmentPeriod"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
      courseName: "2026 \uC885\uD569\uBC18",
      enrollmentPeriod: "2026-01-03 ~ 2026-12-31",
    },
    envKey: "SOLAPI_TEMPLATE_ENROLLMENT_COMPLETE",
  },
  PAYMENT_COMPLETE: {
    label: "\uACB0\uC81C \uC644\uB8CC",
    description: "\uACB0\uC81C\uAC00 \uC644\uB8CC\uB418\uC5C8\uC744 \uB54C \uBC1C\uC1A1\uD558\uB294 \uC548\uB0B4 \uBA54\uC2DC\uC9C0\uC785\uB2C8\uB2E4.",
    content:
      "[\uD559\uC6D0 \uC548\uB0B4] {studentName}\uB2D8 \uACB0\uC81C\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.\n\n\uACB0\uC81C \uAE08\uC561: {paymentAmount}\n\uACB0\uC81C \uBC29\uBC95: {paymentMethod}\n\n\uBB38\uC758: \uD559\uC6D0 \uC5F0\uB77D\uCC98\uB294 \uAD00\uB9AC\uC790\uC5D0\uAC8C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.",
    variables: ["studentName", "paymentAmount", "paymentMethod"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
      paymentAmount: "400,000\uC6D0",
      paymentMethod: "\uD604\uAE08",
    },
    envKey: "SOLAPI_TEMPLATE_PAYMENT_COMPLETE",
  },
  REFUND_COMPLETE: {
    label: "\uD658\uBD88 \uC644\uB8CC",
    description: "\uD658\uBD88 \uCC98\uB9AC\uAC00 \uC644\uB8CC\uB418\uC5C8\uC744 \uB54C \uBC1C\uC1A1\uD558\uB294 \uC548\uB0B4 \uBA54\uC2DC\uC9C0\uC785\uB2C8\uB2E4.",
    content:
      "[\uD559\uC6D0 \uC548\uB0B4] {studentName}\uB2D8 \uD658\uBD88 \uCC98\uB9AC\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.\n\n\uD658\uBD88 \uAE08\uC561: {refundAmount}\n\n\uBB38\uC758: \uD559\uC6D0 \uC5F0\uB77D\uCC98\uB294 \uAD00\uB9AC\uC790\uC5D0\uAC8C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.",
    variables: ["studentName", "refundAmount"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
      refundAmount: "200,000\uC6D0",
    },
    envKey: "SOLAPI_TEMPLATE_REFUND_COMPLETE",
  },
  PAYMENT_OVERDUE: {
    label: "\uBBF8\uB0A9 \uC548\uB0B4",
    description: "\uBD84\uB0A9 \uB3C4\uB798 \uB610\uB294 \uBBF8\uB0A9 \uC0C1\uD0DC\uC77C \uB54C \uBC1C\uC1A1\uD558\uB294 \uC548\uB0B4 \uBA54\uC2DC\uC9C0\uC785\uB2C8\uB2E4.",
    content:
      "[\uD559\uC6D0 \uC548\uB0B4] {studentName}\uB2D8 {courseName} \uBBF8\uB0A9 \uAE08\uC561\uC740 {unpaidAmount}\uC774\uBA70 \uB0A9\uBD80 \uAE30\uD55C\uC740 {dueDate}\uC785\uB2C8\uB2E4. \uBE60\uB978 \uC2DC\uC77C \uB0B4\uC5D0 \uB0A9\uBD80 \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4.\n\n\uBB38\uC758: \uD559\uC6D0 \uC5F0\uB77D\uCC98\uB294 \uAD00\uB9AC\uC790\uC5D0\uAC8C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.",
    variables: ["studentName", "courseName", "unpaidAmount", "dueDate"],
    sampleValues: {
      name: "Hong Gil-dong",
      studentName: "Hong Gil-dong",
      courseName: "2026 \uC885\uD569\uBC18",
      unpaidAmount: "200,000\uC6D0",
      dueDate: "2026.03.10",
    },
    envKey: "SOLAPI_TEMPLATE_PAYMENT_OVERDUE",
  },
};

export function notificationTypeFromStatus(status: StudentStatus) {
  switch (status) {
    case StudentStatus.WARNING_1:
      return NotificationType.WARNING_1;
    case StudentStatus.WARNING_2:
      return NotificationType.WARNING_2;
    case StudentStatus.DROPOUT:
      return NotificationType.DROPOUT;
    default:
      return null;
  }
}

function formatRecoveryDate(value?: Date | null) {
  if (!value) {
    return "-";
  }

  return value.toLocaleDateString("ko-KR");
}

function stringifyNumber(value?: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

export function buildNotificationTemplateValues(input: NotificationMessageInput) {
  const studentName = input.studentName.trim();
  const customMessage = input.customMessage?.trim() ?? "";
  const recoveryDate = formatRecoveryDate(input.recoveryDate);
  const weekAbsenceCount = stringifyNumber(input.weekAbsenceCount);
  const monthAbsenceCount = stringifyNumber(input.monthAbsenceCount);
  const pointAmount = stringifyNumber(input.pointAmount);
  const absenceNoteOutcome = input.absenceNoteOutcome?.trim() ?? "";
  const absenceNoteFollowUp = input.absenceNoteFollowUp?.trim() ?? "";
  const recipientName = input.recipientName?.trim() ?? studentName;
  const sessionLabel = input.sessionLabel?.trim() ?? "";
  const examDateLabel = input.examDateLabel?.trim() ?? "";
  const missingScoreCount = stringifyNumber(input.missingScoreCount);
  const periodName = input.periodName?.trim() ?? "";
  const courseName = input.courseName?.trim() ?? "";
  const enrollmentPeriod = input.enrollmentPeriod?.trim() ?? "";
  const paymentAmount = input.paymentAmount?.trim() ?? "";
  const paymentMethod = input.paymentMethod?.trim() ?? "";
  const refundAmount = input.refundAmount?.trim() ?? "";
  const unpaidAmount = input.unpaidAmount?.trim() ?? "";
  const dueDate = input.dueDate?.trim() ?? "";

  return {
    name: studentName,
    studentName,
    recoveryDate,
    weekAbsenceCount,
    monthAbsenceCount,
    pointAmount,
    customMessage,
    absenceNoteOutcome,
    absenceNoteFollowUp,
    recipientName,
    sessionLabel,
    examDateLabel,
    missingScoreCount,
    periodName,
    courseName,
    enrollmentPeriod,
    paymentAmount,
    paymentMethod,
    refundAmount,
    unpaidAmount,
    dueDate,
  } satisfies Record<string, string>;
}

export function renderNotificationTemplateContent(
  content: string,
  values: Record<string, string>,
) {
  return content
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => values[key] ?? match)
    .trim();
}

export function extractNotificationTemplatePlaceholders(content: string) {
  return Array.from(
    new Set(
      Array.from(content.matchAll(/\{([a-zA-Z0-9_]+)\}/g), (match) => match[1]),
    ),
  );
}

export function validateNotificationTemplateContent(
  content: string,
  allowedVariables: string[],
) {
  const allowed = new Set(allowedVariables);
  const unknownVariables = extractNotificationTemplatePlaceholders(content).filter(
    (variable) => !allowed.has(variable),
  );

  if (unknownVariables.length > 0) {
    throw new Error(
      `Unknown template variables: ${unknownVariables
        .map((variable) => `{${variable}}`)
        .join(", ")}`,
    );
  }
}

export function buildNotificationVariables(
  input: NotificationMessageInput,
  renderedMessage?: string,
) {
  const values = buildNotificationTemplateValues(input);
  const messageBody = renderedMessage ?? values.customMessage;

  return {
    ...values,
    student_name: values.studentName,
    recovery_date: values.recoveryDate,
    week_absence_count: values.weekAbsenceCount,
    month_absence_count: values.monthAbsenceCount,
    point_amount: values.pointAmount,
    custom_message: values.customMessage,
    absence_note_outcome: values.absenceNoteOutcome,
    absence_note_follow_up: values.absenceNoteFollowUp,
    recipient_name: values.recipientName,
    session_label: values.sessionLabel,
    exam_date_label: values.examDateLabel,
    missing_score_count: values.missingScoreCount,
    period_name: values.periodName,
    messageBody,
    message_body: messageBody,
  } satisfies Record<string, string>;
}

export function getDefaultNotificationTemplateId(type: NotificationType) {
  const envKey = DEFAULT_TEMPLATE_DEFINITIONS[type].envKey;
  return envKey ? process.env[envKey]?.trim() || null : null;
}

export function getDefaultNotificationTemplateDefinition(
  type: NotificationType,
  channel: NotificationChannel = NotificationChannel.ALIMTALK,
): NotificationTemplateSummary {
  const definition = DEFAULT_TEMPLATE_DEFINITIONS[type];
  const envFallbackTemplateId = getDefaultNotificationTemplateId(type);

  return {
    id: `default:${type}:${channel}`,
    type,
    channel,
    label: definition.label,
    description: definition.description,
    content: definition.content,
    variables: definition.variables,
    solapiTemplateId: envFallbackTemplateId,
    envFallbackTemplateId,
    updatedAt: null,
    updatedBy: null,
    sampleValues: definition.sampleValues,
    preview: renderNotificationTemplateContent(definition.content, definition.sampleValues),
    usesDefault: true,
  };
}

export function listDefaultNotificationTemplateDefinitions(
  channel: NotificationChannel = NotificationChannel.ALIMTALK,
) {
  return NOTIFICATION_TEMPLATE_TYPES.map((type) =>
    getDefaultNotificationTemplateDefinition(type, channel),
  );
}

export function buildDefaultNotificationMessage(input: NotificationMessageInput) {
  const customMessage = input.customMessage?.trim();

  if (customMessage) {
    return customMessage;
  }

  const template = getDefaultNotificationTemplateDefinition(input.type);
  return renderNotificationTemplateContent(
    template.content,
    buildNotificationTemplateValues(input),
  );
}

