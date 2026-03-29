import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// All known rule types — default enabled
const ALL_RULE_TYPES = [
  // 수강 관련
  "ENROLLMENT_COMPLETE",
  // 수납 관련
  "PAYMENT_COMPLETE",
  "REFUND_COMPLETE",
  // 출결 관련
  "WARNING_1",
  "WARNING_2",
  "DROPOUT",
  "ABSENCE_NOTE",
  // 관리자
  "SCORE_DEADLINE",
  // 기타
  "POINT",
  "NOTICE",
] as const;

export type NotificationRulesConfig = Record<string, boolean>;

function buildDefaultRules(): NotificationRulesConfig {
  const defaults: NotificationRulesConfig = {};
  for (const ruleType of ALL_RULE_TYPES) {
    defaults[ruleType] = true;
  }
  return defaults;
}

async function getNotificationRules(): Promise<NotificationRulesConfig> {
  try {
    const row = await getPrisma().systemConfig.findUnique({
      where: { id: "singleton" },
    });
    if (!row) return buildDefaultRules();
    const data = row.data as Record<string, unknown>;
    const saved = data.notificationRules as Record<string, boolean> | undefined;
    if (!saved || typeof saved !== "object") return buildDefaultRules();
    // Merge: any missing keys default to true
    const defaults = buildDefaultRules();
    return { ...defaults, ...saved };
  } catch {
    return buildDefaultRules();
  }
}

export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rules = await getNotificationRules();
  return NextResponse.json({ data: rules });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { ruleType, enabled } = body as { ruleType: string; enabled: boolean };

    if (typeof ruleType !== "string" || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "ruleType(string)과 enabled(boolean)이 필요합니다." },
        { status: 400 },
      );
    }

    const prisma = getPrisma();

    // Read current config row
    const row = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
    const currentData = (row?.data ?? {}) as Record<string, unknown>;
    const currentRules = (currentData.notificationRules ?? {}) as Record<string, boolean>;

    const updatedRules = { ...buildDefaultRules(), ...currentRules, [ruleType]: enabled };

    const updated = await prisma.systemConfig.upsert({
      where: { id: "singleton" },
      update: {
        data: { ...currentData, notificationRules: updatedRules } as object,
        updatedBy: auth.context.adminUser.id,
      },
      create: {
        id: "singleton",
        data: { notificationRules: updatedRules } as object,
        updatedBy: auth.context.adminUser.id,
      },
    });

    const savedData = updated.data as Record<string, unknown>;
    return NextResponse.json({ data: savedData.notificationRules });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}
