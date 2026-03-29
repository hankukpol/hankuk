import { ExamType, Gender, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { buildAdminPreRegistrationWhere, parseAdminExamType } from "@/lib/admin-pre-registrations";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { parsePositiveInt } from "@/lib/exam-utils";
import {
  checkExamNumberAvailability,
  getExamRegionQuotaSnapshot,
  getQuotaValidationError,
  lockExamNumberMutation,
  lockUserExamMutation,
} from "@/lib/pre-registration";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type PreRegistrationUpdatePayload = {
  examId?: unknown;
  regionId?: unknown;
  examType?: unknown;
  gender?: unknown;
  examNumber?: unknown;
};

class AdminPreRegistrationRouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminPreRegistrationRouteError";
    this.status = status;
  }
}

function parsePage(value: string | null): number {
  return parsePositiveInt(value) ?? 1;
}

function parseLimit(value: string | null): number {
  const parsed = parsePositiveInt(value) ?? 20;
  return Math.min(parsed, 100);
}

function parseRequiredId(value: string | null, label: string): number {
  const parsed = parsePositiveInt(value);
  if (!parsed) {
    throw new AdminPreRegistrationRouteError(`${label}가 올바르지 않습니다.`, 400);
  }
  return parsed;
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

function getGroupCount(group: { _count?: true | { id?: number | null; _all?: number | null } } | undefined): number {
  const count = group?._count;
  if (!count || count === true) return 0;
  return count.id ?? count._all ?? 0;
}

function parseUpdatePayload(body: PreRegistrationUpdatePayload) {
  const examId = parsePositiveInt(body.examId);
  if (!examId) {
    throw new AdminPreRegistrationRouteError("시험 정보가 올바르지 않습니다.", 400);
  }

  const regionId = parsePositiveInt(body.regionId);
  if (!regionId) {
    throw new AdminPreRegistrationRouteError("지역 정보가 올바르지 않습니다.", 400);
  }

  const examType = body.examType === ExamType.PUBLIC || body.examType === ExamType.CAREER ? body.examType : null;
  if (!examType) {
    throw new AdminPreRegistrationRouteError("채용 유형은 PUBLIC 또는 CAREER만 가능합니다.", 400);
  }

  const gender = parseGender(body.gender);
  if (!gender) {
    throw new AdminPreRegistrationRouteError("성별 정보가 올바르지 않습니다.", 400);
  }

  const examNumber = parseExamNumber(body.examNumber);
  if (!examNumber) {
    throw new AdminPreRegistrationRouteError("응시번호를 입력해 주세요.", 400);
  }

  return {
    examId,
    regionId,
    examType,
    gender,
    examNumber,
  };
}

function getUniqueConstraintMessage(error: Prisma.PrismaClientKnownRequestError): string | null {
  if (error.code !== "P2002") return null;

  const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
  if (target.includes("userId") && target.includes("examId")) {
    return "같은 사용자가 해당 시험에 이미 다른 사전등록을 가지고 있습니다.";
  }
  if (target.includes("examId") && target.includes("regionId") && target.includes("examNumber")) {
    return "같은 시험/지역에 동일한 응시번호가 이미 등록되어 있습니다.";
  }

  return "중복되는 사전등록 정보가 있어 저장할 수 없습니다.";
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("preRegistrations");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const requestedPage = parsePage(searchParams.get("page"));
    const limit = parseLimit(searchParams.get("limit"));
    const examId = parsePositiveInt(searchParams.get("examId"));
    const regionId = parsePositiveInt(searchParams.get("regionId"));
    const examType = parseAdminExamType(searchParams.get("examType"));
    const search = searchParams.get("search")?.trim() ?? "";

    if (searchParams.get("examType") && !examType) {
      return NextResponse.json({ error: "examType은 PUBLIC 또는 CAREER여야 합니다." }, { status: 400 });
    }

    const where = buildAdminPreRegistrationWhere({
      examId,
      regionId,
      examType,
      search,
    });

    const [totalCount, groupedByExamType] = await prisma.$transaction([
      prisma.preRegistration.count({ where }),
      prisma.preRegistration.groupBy({
        by: ["examType"],
        orderBy: {
          examType: "asc",
        },
        where,
        _count: { id: true },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const page = Math.min(requestedPage, totalPages);
    const skip = (page - 1) * limit;

    const rows = await prisma.preRegistration.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        examId: true,
        regionId: true,
        examType: true,
        gender: true,
        examNumber: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            contactPhone: true,
          },
        },
        exam: {
          select: {
            name: true,
            year: true,
            round: true,
          },
        },
        region: {
          select: {
            name: true,
          },
        },
      },
    });

    const publicGroup = groupedByExamType.find((item) => item.examType === "PUBLIC");
    const careerGroup = groupedByExamType.find((item) => item.examType === "CAREER");
    const publicCount = getGroupCount(publicGroup);
    const careerCount = getGroupCount(careerGroup);

    return NextResponse.json({
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
      summary: {
        totalCount,
        publicCount,
        careerCount,
      },
      preRegistrations: rows.map((row) => ({
        id: row.id,
        examId: row.examId,
        examName: row.exam.name,
        examYear: row.exam.year,
        examRound: row.exam.round,
        userId: row.user.id,
        userName: row.user.name,
        userPhone: row.user.phone, // 로그인 아이디
        userContactPhone: row.user.contactPhone, // 연락처
        regionId: row.regionId,
        regionName: row.region.name,
        examType: row.examType,
        gender: row.gender,
        examNumber: row.examNumber,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (error) {
    console.error("관리자 사전등록 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사전등록 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("preRegistrations");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const id = parseRequiredId(searchParams.get("id"), "사전등록 ID");

    let body: PreRegistrationUpdatePayload;
    try {
      body = (await request.json()) as PreRegistrationUpdatePayload;
    } catch {
      throw new AdminPreRegistrationRouteError("요청 본문(JSON) 형식이 올바르지 않습니다.", 400);
    }

    const payload = parseUpdatePayload(body);

    const currentPreRegistration = await prisma.preRegistration.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        examId: true,
        regionId: true,
        examNumber: true,
      },
    });

    if (!currentPreRegistration) {
      return NextResponse.json({ error: "수정할 사전등록을 찾을 수 없습니다." }, { status: 404 });
    }

    const [exam, region] = await Promise.all([
      prisma.exam.findUnique({
        where: { id: payload.examId },
        select: { id: true },
      }),
      prisma.region.findUnique({
        where: { id: payload.regionId },
        select: { id: true },
      }),
    ]);

    if (!exam) {
      return NextResponse.json({ error: "선택한 시험을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!region) {
      return NextResponse.json({ error: "선택한 지역을 찾을 수 없습니다." }, { status: 404 });
    }

    const quota = await getExamRegionQuotaSnapshot(prisma, payload.examId, payload.regionId);
    const quotaError = getQuotaValidationError(quota, payload.examType);
    if (quotaError) {
      return NextResponse.json({ error: quotaError }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await lockUserExamMutation(tx, {
        userId: currentPreRegistration.userId,
        examId: currentPreRegistration.examId,
      });
      if (currentPreRegistration.examId !== payload.examId) {
        await lockUserExamMutation(tx, {
          userId: currentPreRegistration.userId,
          examId: payload.examId,
        });
      }

      await lockExamNumberMutation(tx, {
        examId: currentPreRegistration.examId,
        regionId: currentPreRegistration.regionId,
        examNumber: currentPreRegistration.examNumber,
      });
      if (
        currentPreRegistration.examId !== payload.examId ||
        currentPreRegistration.regionId !== payload.regionId ||
        currentPreRegistration.examNumber !== payload.examNumber
      ) {
        await lockExamNumberMutation(tx, {
          examId: payload.examId,
          regionId: payload.regionId,
          examNumber: payload.examNumber,
        });
      }

      const conflictingPreRegistration = await tx.preRegistration.findUnique({
        where: {
          userId_examId: {
            userId: currentPreRegistration.userId,
            examId: payload.examId,
          },
        },
        select: { id: true },
      });
      if (conflictingPreRegistration && conflictingPreRegistration.id !== id) {
        throw new AdminPreRegistrationRouteError(
          "같은 사용자가 선택한 시험에 이미 다른 사전등록을 가지고 있습니다.",
          409
        );
      }

      const existingSubmission = await tx.submission.findFirst({
        where: {
          userId: currentPreRegistration.userId,
          examId: payload.examId,
        },
        select: { id: true },
      });
      if (existingSubmission) {
        throw new AdminPreRegistrationRouteError(
          "이미 제출이 완료된 시험으로는 사전등록을 수정할 수 없습니다.",
          409
        );
      }

      const availability = await checkExamNumberAvailability({
        db: tx,
        examId: payload.examId,
        regionId: payload.regionId,
        examType: payload.examType,
        examNumber: payload.examNumber,
        userId: currentPreRegistration.userId,
        excludePreRegistrationId: id,
      });
      if (!availability.available) {
        throw new AdminPreRegistrationRouteError(
          availability.reason ?? "응시번호를 사용할 수 없습니다.",
          409
        );
      }

      return tx.preRegistration.update({
        where: { id },
        data: {
          examId: payload.examId,
          regionId: payload.regionId,
          examType: payload.examType,
          gender: payload.gender,
          examNumber: payload.examNumber,
        },
        select: {
          id: true,
          updatedAt: true,
        },
      });
    });

    return NextResponse.json({
      success: true,
      preRegistration: updated,
    });
  } catch (error) {
    if (error instanceof AdminPreRegistrationRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const message = getUniqueConstraintMessage(error);
      if (message) {
        return NextResponse.json({ error: message }, { status: 409 });
      }
    }

    console.error("관리자 사전등록 수정 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사전등록 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("preRegistrations");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const id = parseRequiredId(searchParams.get("id"), "사전등록 ID");
    const confirmed = searchParams.get("confirm") === "true";

    if (!confirmed) {
      throw new AdminPreRegistrationRouteError("confirm=true 파라미터가 필요합니다.", 400);
    }

    const preRegistration = await prisma.preRegistration.findUnique({
      where: { id },
      select: {
        id: true,
      },
    });

    if (!preRegistration) {
      return NextResponse.json({ error: "삭제할 사전등록을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.preRegistration.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      deletedPreRegistrationId: id,
    });
  } catch (error) {
    if (error instanceof AdminPreRegistrationRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("관리자 사전등록 삭제 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사전등록 삭제에 실패했습니다." }, { status: 500 });
  }
}
