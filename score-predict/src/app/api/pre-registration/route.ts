import { ExamType, Gender, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parsePositiveInt } from "@/lib/exam-utils";
import {
  checkExamNumberAvailability,
  getExamRegionQuotaSnapshot,
  getQuotaValidationError,
  lockExamNumberMutation,
  lockUserExamMutation,
} from "@/lib/pre-registration";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export const runtime = "nodejs";

type PreRegistrationRequestBody = {
  examId?: unknown;
  examType?: unknown;
  gender?: unknown;
  regionId?: unknown;
  examNumber?: unknown;
};

class PreRegistrationRouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PreRegistrationRouteError";
    this.status = status;
  }
}

function parseExamType(value: unknown): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER) return ExamType.CAREER;
  return null;
}

function parseGender(value: unknown): Gender | null {
  if (value === Gender.MALE) return Gender.MALE;
  if (value === Gender.FEMALE) return Gender.FEMALE;
  return null;
}

function parseExamNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, 50);
}

function parseOptionalExamId(rawValue: unknown, sourceLabel: string): number | null {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  const parsed = parsePositiveInt(rawValue);
  if (!parsed) {
    throw new PreRegistrationRouteError(`${sourceLabel}가 올바르지 않습니다.`, 400);
  }

  return parsed;
}

function getPreRegistrationDisabledMessage(settings: Record<string, unknown>): string {
  const closedMessage = settings["site.preRegistrationClosedMessage"];
  if (typeof closedMessage === "string" && closedMessage.trim()) {
    return closedMessage.trim();
  }
  return "사전등록이 종료되었습니다. 답안 입력 시점에 다시 이용해 주세요.";
}

async function ensureExistingUser(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new PreRegistrationRouteError(
      "세션이 만료되었거나 사용자 정보를 찾을 수 없습니다. 다시 로그인해 주세요.",
      401
    );
  }
}

async function resolveTargetExam(examId: number | null) {
  if (examId) {
    return prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, name: true, isActive: true },
    });
  }

  return prisma.exam.findFirst({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true, name: true, isActive: true },
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const userId = parsePositiveInt(session.user.id);
    if (!userId) {
      return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
    }

    await ensureExistingUser(userId);

    const { searchParams } = new URL(request.url);
    const requestedExamId = parseOptionalExamId(searchParams.get("examId"), "examId");
    const exam = await resolveTargetExam(requestedExamId);

    if (!exam) {
      return NextResponse.json({ preRegistration: null });
    }

    const preRegistration = await prisma.preRegistration.findUnique({
      where: {
        userId_examId: {
          userId,
          examId: exam.id,
        },
      },
      select: {
        id: true,
        examId: true,
        examType: true,
        gender: true,
        regionId: true,
        examNumber: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ preRegistration });
  } catch (error) {
    if (error instanceof PreRegistrationRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("사전등록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사전등록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    let body: PreRegistrationRequestBody;
    try {
      body = (await request.json()) as PreRegistrationRequestBody;
    } catch {
      return NextResponse.json({ error: "요청 본문(JSON) 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const userId = parsePositiveInt(session.user.id);
    if (!userId) {
      return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
    }

    await ensureExistingUser(userId);

    const requestedExamId = parseOptionalExamId(body.examId, "examId");
    const exam = await resolveTargetExam(requestedExamId);
    if (!exam) {
      return NextResponse.json({ error: "사전등록 가능한 시험이 없습니다." }, { status: 404 });
    }
    if (!exam.isActive) {
      return NextResponse.json({ error: "현재 활성화된 시험만 사전등록할 수 있습니다." }, { status: 400 });
    }

    const examType = parseExamType(body.examType);
    if (!examType) {
      return NextResponse.json({ error: "채용유형은 PUBLIC 또는 CAREER만 가능합니다." }, { status: 400 });
    }

    const settings = await getSiteSettingsUncached();
    const preRegistrationEnabled = Boolean(settings["site.preRegistrationEnabled"] ?? true);
    const careerExamEnabled = Boolean(settings["site.careerExamEnabled"] ?? true);
    if (!preRegistrationEnabled) {
      return NextResponse.json(
        { error: getPreRegistrationDisabledMessage(settings) },
        { status: 403 }
      );
    }
    if (examType === ExamType.CAREER && !careerExamEnabled) {
      return NextResponse.json({ error: "현재 경행경채 시험은 비활성화 상태입니다." }, { status: 400 });
    }

    const gender = parseGender(body.gender);
    if (!gender) {
      return NextResponse.json({ error: "성별 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const regionId = parsePositiveInt(body.regionId);
    if (!regionId) {
      return NextResponse.json({ error: "지역 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const region = await prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true, isActive: true },
    });
    if (!region) {
      return NextResponse.json({ error: "선택한 지역을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!region.isActive) {
      return NextResponse.json({ error: "비활성화된 지역은 사전등록할 수 없습니다." }, { status: 400 });
    }

    const examNumber = parseExamNumber(body.examNumber);
    if (!examNumber) {
      return NextResponse.json({ error: "수험번호는 필수 입력 항목입니다." }, { status: 400 });
    }

    const quota = await getExamRegionQuotaSnapshot(prisma, exam.id, regionId);
    const quotaError = getQuotaValidationError(quota, examType);
    if (quotaError) {
      return NextResponse.json({ error: quotaError }, { status: 400 });
    }

    const preRegistration = await prisma.$transaction(async (tx) => {
      await lockUserExamMutation(tx, { userId, examId: exam.id });
      await lockExamNumberMutation(tx, {
        examId: exam.id,
        regionId,
        examNumber,
      });

      const existingSubmission = await tx.submission.findFirst({
        where: {
          userId,
          examId: exam.id,
        },
        select: { id: true },
      });
      if (existingSubmission) {
        throw new PreRegistrationRouteError("이미 제출을 완료한 시험은 사전등록으로 변경할 수 없습니다.", 409);
      }

      const existingPreRegistration = await tx.preRegistration.findUnique({
        where: {
          userId_examId: {
            userId,
            examId: exam.id,
          },
        },
        select: { id: true },
      });

      const availability = await checkExamNumberAvailability({
        db: tx,
        examId: exam.id,
        regionId,
        examType,
        examNumber,
        userId,
        excludePreRegistrationId: existingPreRegistration?.id,
      });
      if (!availability.available) {
        throw new PreRegistrationRouteError(availability.reason ?? "수험번호를 사용할 수 없습니다.", 409);
      }

      return tx.preRegistration.upsert({
        where: {
          userId_examId: {
            userId,
            examId: exam.id,
          },
        },
        update: {
          regionId,
          examType,
          gender,
          examNumber,
        },
        create: {
          examId: exam.id,
          userId,
          regionId,
          examType,
          gender,
          examNumber,
        },
        select: {
          id: true,
          examId: true,
          examType: true,
          gender: true,
          regionId: true,
          examNumber: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    return NextResponse.json({
      success: true,
      preRegistration,
      message: "사전등록이 저장되었습니다.",
    });
  } catch (error) {
    if (error instanceof PreRegistrationRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "이미 사용 중인 수험번호이거나 동일한 사전등록이 존재합니다." },
        { status: 409 }
      );
    }

    console.error("사전등록 저장 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사전등록 저장에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const userId = parsePositiveInt(session.user.id);
    if (!userId) {
      return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
    }

    await ensureExistingUser(userId);

    const { searchParams } = new URL(request.url);
    const requestedExamId = parseOptionalExamId(searchParams.get("examId"), "examId");
    const exam = await resolveTargetExam(requestedExamId);
    if (!exam) {
      return NextResponse.json({ error: "대상 시험을 찾을 수 없습니다." }, { status: 404 });
    }

    const settings = await getSiteSettingsUncached();
    const preRegistrationEnabled = Boolean(settings["site.preRegistrationEnabled"] ?? true);
    if (!preRegistrationEnabled) {
      return NextResponse.json(
        { error: getPreRegistrationDisabledMessage(settings) },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await lockUserExamMutation(tx, { userId, examId: exam.id });

      const existingSubmission = await tx.submission.findFirst({
        where: {
          userId,
          examId: exam.id,
        },
        select: { id: true },
      });
      if (existingSubmission) {
        throw new PreRegistrationRouteError("이미 제출을 완료한 경우 사전등록을 취소할 수 없습니다.", 409);
      }

      await tx.preRegistration.deleteMany({
        where: {
          userId,
          examId: exam.id,
        },
      });
    });

    return NextResponse.json({ success: true, message: "사전등록이 취소되었습니다." });
  } catch (error) {
    if (error instanceof PreRegistrationRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("사전등록 취소 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사전등록 취소에 실패했습니다." }, { status: 500 });
  }
}
