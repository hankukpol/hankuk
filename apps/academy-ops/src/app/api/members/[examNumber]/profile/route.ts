import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  MEMBER_NOT_FOUND_ERROR,
  MEMBER_PROFILE_NOT_READY_ERROR,
  getMemberProfileView,
  saveMemberProfile,
  type MemberProfileEnrollSource,
  type MemberProfileStatus,
} from "@/lib/members/profile";

export const dynamic = "force-dynamic";

const MSG = {
  examNumberRequired: "\uD559\uBC88\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
  memberNotFound: "\uD68C\uC6D0\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  loadFailed: "\uD68C\uC6D0 \uD504\uB85C\uD544\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  invalidBody: "\uC694\uCCAD \uBCF8\uBB38\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  invalidBirthDate: "\uC0DD\uB144\uC6D4\uC77C\uC740 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.",
  invalidEnrollSource: "\uB4F1\uB85D \uACBD\uB85C \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  invalidStatus: "\uC0C1\uD0DC \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  saveFailed: "\uD68C\uC6D0 \uD504\uB85C\uD544\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  modelNotReady: "\uD68C\uC6D0 \uD504\uB85C\uD544 \uBAA8\uB378\uC774 \uC544\uC9C1 \uC900\uBE44\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
} as const;

const ENROLL_SOURCES: MemberProfileEnrollSource[] = [
  "VISIT",
  "PHONE",
  "ONLINE",
  "REFERRAL",
  "SNS",
  "OTHER",
];

const MEMBER_STATUSES: MemberProfileStatus[] = ["ACTIVE", "SUSPENDED", "WITHDRAWN", "GRADUATED"];

function isValidEnrollSource(value: unknown): value is MemberProfileEnrollSource {
  return typeof value === "string" && ENROLL_SOURCES.includes(value as MemberProfileEnrollSource);
}

function isValidMemberStatus(value: unknown): value is MemberProfileStatus {
  return typeof value === "string" && MEMBER_STATUSES.includes(value as MemberProfileStatus);
}

function invalidResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: { examNumber: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const examNumber = params.examNumber?.trim();
  if (!examNumber) {
    return invalidResponse(MSG.examNumberRequired);
  }

  try {
    const data = await getMemberProfileView(examNumber);
    if (!data.student) {
      return NextResponse.json({ error: MSG.memberNotFound }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : MSG.loadFailed,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { examNumber: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const examNumber = params.examNumber?.trim();
  if (!examNumber) {
    return invalidResponse(MSG.examNumberRequired);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return invalidResponse(MSG.invalidBody);
  }

  const birthDate =
    typeof body.birthDate === "string" ? body.birthDate.trim() : body.birthDate === null ? null : undefined;
  if (birthDate !== undefined && birthDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return invalidResponse(MSG.invalidBirthDate);
  }

  const enrollSource = body.enrollSource === null ? null : body.enrollSource;
  if (enrollSource !== null && enrollSource !== undefined && !isValidEnrollSource(enrollSource)) {
    return invalidResponse(MSG.invalidEnrollSource);
  }

  const status = body.status;
  if (status !== undefined && !isValidMemberStatus(status)) {
    return invalidResponse(MSG.invalidStatus);
  }

  try {
    const data = await saveMemberProfile(examNumber, {
      birthDate: birthDate ?? undefined,
      address:
        typeof body.address === "string" || body.address === null ? (body.address as string | null) : undefined,
      photoUrl:
        typeof body.photoUrl === "string" || body.photoUrl === null ? (body.photoUrl as string | null) : undefined,
      enrollSource: (enrollSource as MemberProfileEnrollSource | null | undefined) ?? undefined,
      status: (status as MemberProfileStatus | undefined) ?? undefined,
      withdrawReason:
        typeof body.withdrawReason === "string" || body.withdrawReason === null
          ? (body.withdrawReason as string | null)
          : undefined,
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === MEMBER_NOT_FOUND_ERROR) {
      return NextResponse.json({ error: MSG.memberNotFound }, { status: 404 });
    }

    if (error instanceof Error && error.message === MEMBER_PROFILE_NOT_READY_ERROR) {
      return NextResponse.json({ error: MSG.modelNotReady }, { status: 503 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : MSG.saveFailed,
      },
      { status: 500 },
    );
  }
}