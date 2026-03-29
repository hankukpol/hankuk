import { Prisma } from "@prisma/client";

export function toAuditJson(value: unknown) {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
