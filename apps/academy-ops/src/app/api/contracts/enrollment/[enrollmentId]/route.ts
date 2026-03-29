import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ enrollmentId: string }> };

type ContractItem = { label: string; amount: number };

type PatchBody = {
  items?: unknown;
  note?: unknown;
  privacyConsentGiven?: unknown;
};

function buildDefaultItems(enrollment: {
  product: { name: string } | null;
  cohort: { name: string } | null;
  specialLecture: { name: string } | null;
  finalFee: number;
}) {
  const label =
    enrollment.product?.name ??
    enrollment.cohort?.name ??
    enrollment.specialLecture?.name ??
    "수강료";

  return [{ label, amount: enrollment.finalFee }] satisfies ContractItem[];
}

async function getScopedEnrollment(enrollmentId: string, academyId: number | null) {
  return getPrisma().courseEnrollment.findFirst({
    where: applyAcademyScope({ id: enrollmentId }, academyId),
    select: {
      id: true,
      examNumber: true,
      academyId: true,
      courseType: true,
      finalFee: true,
      product: { select: { name: true } },
      cohort: { select: { name: true } },
      specialLecture: { select: { name: true } },
      student: {
        select: {
          name: true,
          examNumber: true,
          phone: true,
          notificationConsent: true,
          consentedAt: true,
        },
      },
    },
  });
}

function isValidContractItems(input: unknown): input is ContractItem[] {
  return (
    Array.isArray(input) &&
    input.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).label === "string" &&
        typeof (item as Record<string, unknown>).amount === "number",
    )
  );
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { enrollmentId } = await context.params;
  const academyId = resolveVisibleAcademyId(auth.context);
  const enrollment = await getScopedEnrollment(enrollmentId, academyId);

  if (!enrollment) {
    return NextResponse.json({ error: "수강 등록을 찾을 수 없습니다." }, { status: 404 });
  }

  let contract = await getPrisma().courseContract.findUnique({
    where: { enrollmentId },
  });

  if (!contract) {
    contract = await getPrisma().courseContract.create({
      data: {
        enrollmentId,
        items: buildDefaultItems(enrollment),
        privacyConsentedAt: new Date(),
        staffId: auth.context.adminUser.id,
      },
    });
  }

  return NextResponse.json({
    data: {
      contract,
      enrollment,
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { enrollmentId } = await context.params;
  const academyId = resolveVisibleAcademyId(auth.context);
  const enrollment = await getScopedEnrollment(enrollmentId, academyId);

  if (!enrollment) {
    return NextResponse.json({ error: "수강 등록을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  if (body.items !== undefined && !isValidContractItems(body.items)) {
    return NextResponse.json(
      { error: "계약 항목은 label과 amount를 포함한 배열이어야 합니다." },
      { status: 400 },
    );
  }

  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return NextResponse.json({ error: "특약 사항은 문자열이어야 합니다." }, { status: 400 });
  }

  if (body.privacyConsentGiven !== undefined && typeof body.privacyConsentGiven !== "boolean") {
    return NextResponse.json(
      { error: "개인정보 동의 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const existing = await getPrisma().courseContract.findUnique({ where: { enrollmentId } });
  if (!existing) {
    return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });
  }

  const nextPrivacyConsentedAt =
    body.privacyConsentGiven === undefined
      ? existing.privacyConsentedAt
      : body.privacyConsentGiven
        ? existing.privacyConsentedAt ?? new Date()
        : null;

  const updated = await getPrisma().courseContract.update({
    where: { enrollmentId },
    data: {
      ...(body.items !== undefined ? { items: body.items } : {}),
      ...(body.note !== undefined ? { note: body.note as string | null } : {}),
      ...(body.privacyConsentGiven !== undefined
        ? { privacyConsentedAt: nextPrivacyConsentedAt }
        : {}),
    },
  });

  if (body.privacyConsentGiven !== undefined && nextPrivacyConsentedAt !== existing.privacyConsentedAt) {
    await getPrisma().auditLog.create({
      data: {
        adminId: auth.context.adminUser.id,
        action: body.privacyConsentGiven ? "PRIVACY_CONSENT_RECORDED" : "PRIVACY_CONSENT_CLEARED",
        targetType: "CourseContract",
        targetId: updated.id,
        after: {
          enrollmentId,
          examNumber: enrollment.examNumber,
          privacyConsentedAt: nextPrivacyConsentedAt?.toISOString() ?? null,
        },
        ipAddress: request.headers.get("x-forwarded-for"),
      },
    });
  }

  return NextResponse.json({ data: { contract: updated } });
}
