import { NotificationChannel, NotificationType } from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import {
  buildNotificationTemplateValues,
  buildNotificationVariables,
  getDefaultNotificationTemplateDefinition,
  listDefaultNotificationTemplateDefinitions,
  renderNotificationTemplateContent,
  validateNotificationTemplateContent,
  type NotificationMessageInput,
  type NotificationTemplateSummary,
} from "@/lib/notifications/templates";

function mergeNotificationTemplate(
  row:
    | {
        id: string;
        type: NotificationType;
        channel: NotificationChannel;
        solapiTemplateId: string | null;
        content: string;
        variables: string[];
        description: string;
        updatedAt: Date;
        updatedBy: string;
      }
    | null,
  type: NotificationType,
  channel: NotificationChannel = NotificationChannel.ALIMTALK,
): NotificationTemplateSummary {
  const fallback = getDefaultNotificationTemplateDefinition(type, channel);
  const content = row?.content?.trim() ? row.content : fallback.content;
  const variables = row?.variables?.length ? row.variables : fallback.variables;
  const description = row?.description?.trim() ? row.description : fallback.description;
  const solapiTemplateId = row?.solapiTemplateId?.trim() ? row.solapiTemplateId.trim() : null;

  return {
    ...fallback,
    id: row?.id ?? fallback.id,
    content,
    variables,
    description,
    solapiTemplateId,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedBy: row?.updatedBy ?? null,
    preview: renderNotificationTemplateContent(content, fallback.sampleValues),
    usesDefault: !row,
  } satisfies NotificationTemplateSummary;
}

export async function ensureNotificationTemplates(
  adminId: string,
  channel: NotificationChannel = NotificationChannel.ALIMTALK,
) {
  const prisma = getPrisma();
  const defaults = listDefaultNotificationTemplateDefinitions(channel);
  const existing = await prisma.notificationTemplate.findMany({
    where: {
      channel,
      type: {
        in: defaults.map((template) => template.type),
      },
    },
    select: {
      type: true,
    },
  });
  const existingTypes = new Set(existing.map((template) => template.type));
  const missing = defaults.filter((template) => !existingTypes.has(template.type));

  if (missing.length === 0) {
    return;
  }

  await prisma.notificationTemplate.createMany({
    data: missing.map((template) => ({
      type: template.type,
      channel: template.channel,
      solapiTemplateId: null,
      content: template.content,
      variables: template.variables,
      description: template.description,
      updatedBy: adminId,
    })),
    skipDuplicates: true,
  });
}

export async function listNotificationTemplates(
  channel: NotificationChannel = NotificationChannel.ALIMTALK,
) {
  const prisma = getPrisma();
  const defaults = listDefaultNotificationTemplateDefinitions(channel);
  const rows = await prisma.notificationTemplate.findMany({
    where: {
      channel,
      type: {
        in: defaults.map((template) => template.type),
      },
    },
    select: {
      id: true,
      type: true,
      channel: true,
      solapiTemplateId: true,
      content: true,
      variables: true,
      description: true,
      updatedAt: true,
      updatedBy: true,
    },
  });
  const rowMap = new Map(rows.map((row) => [`${row.type}:${row.channel}`, row]));

  return defaults.map((template) =>
    mergeNotificationTemplate(
      rowMap.get(`${template.type}:${template.channel}`) ?? null,
      template.type,
      template.channel,
    ),
  );
}

export async function getResolvedNotificationTemplate(
  type: NotificationType,
  channel: NotificationChannel = NotificationChannel.ALIMTALK,
) {
  const row = await getPrisma().notificationTemplate.findUnique({
    where: {
      type_channel: {
        type,
        channel,
      },
    },
    select: {
      id: true,
      type: true,
      channel: true,
      solapiTemplateId: true,
      content: true,
      variables: true,
      description: true,
      updatedAt: true,
      updatedBy: true,
    },
  });

  return mergeNotificationTemplate(row, type, channel);
}

export async function getResolvedNotificationTemplateMap(
  types: NotificationType[],
  channel: NotificationChannel = NotificationChannel.ALIMTALK,
) {
  const uniqueTypes = Array.from(new Set(types));

  if (uniqueTypes.length === 0) {
    return new Map<NotificationType, NotificationTemplateSummary>();
  }

  const rows = await getPrisma().notificationTemplate.findMany({
    where: {
      channel,
      type: {
        in: uniqueTypes,
      },
    },
    select: {
      id: true,
      type: true,
      channel: true,
      solapiTemplateId: true,
      content: true,
      variables: true,
      description: true,
      updatedAt: true,
      updatedBy: true,
    },
  });
  const rowMap = new Map(rows.map((row) => [row.type, row]));

  return new Map(
    uniqueTypes.map((type) => [type, mergeNotificationTemplate(rowMap.get(type) ?? null, type, channel)]),
  );
}

export function renderNotificationMessageFromTemplate(
  template: NotificationTemplateSummary,
  input: NotificationMessageInput,
) {
  const customMessage = input.customMessage?.trim();
  const message = customMessage
    ? customMessage
    : renderNotificationTemplateContent(
        template.content,
        buildNotificationTemplateValues(input),
      );

  return {
    message,
    template,
    variables: buildNotificationVariables(input, message),
  };
}

export async function renderNotificationMessage(
  input: NotificationMessageInput,
  channel: NotificationChannel = NotificationChannel.ALIMTALK,
) {
  const template = await getResolvedNotificationTemplate(input.type, channel);
  return renderNotificationMessageFromTemplate(template, input);
}

export async function updateNotificationTemplate(input: {
  id: string;
  content: string;
  solapiTemplateId?: string | null;
  adminId: string;
  ipAddress?: string | null;
}) {
  const prisma = getPrisma();
  const content = input.content.trim();
  const solapiTemplateId = input.solapiTemplateId?.trim() || null;

  if (!content) {
    throw new Error("Template content is required.");
  }

  const existing = await prisma.notificationTemplate.findUnique({
    where: {
      id: input.id,
    },
    select: {
      id: true,
      type: true,
      channel: true,
      solapiTemplateId: true,
      content: true,
      variables: true,
      description: true,
      updatedAt: true,
      updatedBy: true,
    },
  });

  if (!existing) {
    throw new Error("Notification template not found.");
  }

  validateNotificationTemplateContent(content, existing.variables);

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.notificationTemplate.update({
      where: {
        id: input.id,
      },
      data: {
        content,
        solapiTemplateId,
        updatedBy: input.adminId,
      },
      select: {
        id: true,
        type: true,
        channel: true,
        solapiTemplateId: true,
        content: true,
        variables: true,
        description: true,
        updatedAt: true,
        updatedBy: true,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "NOTIFICATION_TEMPLATE_UPDATE",
        targetType: "NotificationTemplate",
        targetId: next.id,
        before: toAuditJson(existing),
        after: toAuditJson(next),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return next;
  });

  return mergeNotificationTemplate(updated, updated.type, updated.channel);
}
