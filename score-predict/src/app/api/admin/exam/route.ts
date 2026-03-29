import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import {
  ADMIN_SITE_FEATURES,
  type AdminSiteFeatureKey,
} from "@/lib/admin-site-features.shared";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExamPayload {
  name?: string;
  year?: number;
  round?: number;
  examDate?: string;
  isActive?: boolean;
}

function parseExamIdFromRequest(request: NextRequest): number | null {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("id");
  if (!rawId) return null;

  const examId = Number(rawId);
  return Number.isInteger(examId) && examId > 0 ? examId : null;
}

function parseBoolean(value: string | null): boolean | null {
  if (value === null) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function parseFeatureKey(value: string | null): AdminSiteFeatureKey | null {
  if (!value) return null;
  return value in ADMIN_SITE_FEATURES ? (value as AdminSiteFeatureKey) : null;
}

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateCreatePayload(payload: ExamPayload) {
  const name = payload.name?.trim() ?? "";
  const year = Number(payload.year);
  const round = Number(payload.round);
  const examDate = toDate(payload.examDate);
  const isActive = payload.isActive ?? true;

  if (!name) {
    return { error: "시험명을 입력해 주세요." };
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "시험 연도(year)가 올바르지 않습니다." };
  }

  if (!Number.isInteger(round) || round <= 0 || round > 20) {
    return { error: "시험 회차(round)가 올바르지 않습니다." };
  }

  if (!examDate) {
    return { error: "시험일(examDate)이 올바르지 않습니다." };
  }

  return {
    data: {
      name,
      year,
      round,
      examDate,
      isActive,
    },
  };
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const featureKey = parseFeatureKey(searchParams.get("feature"));
  const examId = parseExamIdFromRequest(request);
  const onlyActive = parseBoolean(searchParams.get("active"));

  if (!featureKey) {
    return NextResponse.json({ error: "feature 쿼리는 필수입니다." }, { status: 400 });
  }

  const featureError = await requireAdminSiteFeature(featureKey);
  if (featureError) return featureError;

  const settings = await getSiteSettingsUncached();
  const careerExamEnabled = Boolean(settings["site.careerExamEnabled"] ?? true);

  if (searchParams.get("id") && !examId) {
    return NextResponse.json({ error: "유효한 시험 ID를 전달해 주세요." }, { status: 400 });
  }

  if (examId) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        _count: {
          select: {
            answerKeys: true,
            submissions: true,
          },
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: "해당 시험을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ exam, careerExamEnabled });
  }

  const exams = await prisma.exam.findMany({
    where: onlyActive === null ? undefined : { isActive: onlyActive },
    include: {
      _count: {
        select: {
          answerKeys: true,
          submissions: true,
        },
      },
    },
    orderBy: [{ year: "desc" }, { round: "desc" }, { id: "desc" }],
  });

  return NextResponse.json({ exams, careerExamEnabled });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("exams");
  if (featureError) return featureError;

  try {
    const payload = (await request.json()) as ExamPayload;
    const validated = validateCreatePayload(payload);

    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const exam = await prisma.$transaction(async (tx) => {
      if (validated.data.isActive) {
        await tx.exam.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
      }

      return tx.exam.create({
        data: {
          name: validated.data.name,
          year: validated.data.year,
          round: validated.data.round,
          examDate: validated.data.examDate,
          isActive: validated.data.isActive,
        },
      });
    });

    return NextResponse.json(
      {
        success: true,
        exam,
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "같은 연도/회차 시험이 이미 존재합니다." },
        { status: 409 }
      );
    }

    console.error("시험 생성 중 오류가 발생했습니다.", error);
    return NextResponse.json(
      { error: "시험 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("exams");
  if (featureError) return featureError;

  const examId = parseExamIdFromRequest(request);
  if (!examId) {
    return NextResponse.json({ error: "수정할 시험 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const payload = (await request.json()) as ExamPayload;
    const updateData: Prisma.ExamUpdateInput = {};

    if (typeof payload.name === "string") {
      const name = payload.name.trim();
      if (!name) {
        return NextResponse.json({ error: "시험명을 비워 둘 수 없습니다." }, { status: 400 });
      }
      updateData.name = name;
    }

    if (payload.year !== undefined) {
      const year = Number(payload.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return NextResponse.json(
          { error: "시험 연도(year)가 올바르지 않습니다." },
          { status: 400 }
        );
      }
      updateData.year = year;
    }

    if (payload.round !== undefined) {
      const round = Number(payload.round);
      if (!Number.isInteger(round) || round <= 0 || round > 20) {
        return NextResponse.json(
          { error: "시험 회차(round)가 올바르지 않습니다." },
          { status: 400 }
        );
      }
      updateData.round = round;
    }

    if (payload.examDate !== undefined) {
      const parsedDate = toDate(payload.examDate);
      if (!parsedDate) {
        return NextResponse.json(
          { error: "시험일(examDate)이 올바르지 않습니다." },
          { status: 400 }
        );
      }
      updateData.examDate = parsedDate;
    }

    if (payload.isActive !== undefined) {
      updateData.isActive = payload.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "수정할 데이터가 없습니다." }, { status: 400 });
    }

    const exam = await prisma.$transaction(async (tx) => {
      if (payload.isActive === true) {
        await tx.exam.updateMany({
          where: {
            id: { not: examId },
            isActive: true,
          },
          data: { isActive: false },
        });
      }

      return tx.exam.update({
        where: { id: examId },
        data: updateData,
      });
    });

    return NextResponse.json({
      success: true,
      exam,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "같은 연도/회차 시험이 이미 존재합니다." },
        { status: 409 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "수정할 시험을 찾을 수 없습니다." }, { status: 404 });
    }

    console.error("시험 수정 중 오류가 발생했습니다.", error);
    return NextResponse.json(
      { error: "시험 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
