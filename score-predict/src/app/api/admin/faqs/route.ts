import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";

interface FaqPayload {
  question?: unknown;
  answer?: unknown;
  isActive?: unknown;
  priority?: unknown;
}

function parseFaqId(request: NextRequest): number | null {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("id");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function parsePriority(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

export async function GET() {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("faqs");
  if (featureError) return featureError;

  const tenantType = await getServerTenantType();

  try {
    const faqs = await prisma.faq.findMany({
      where: { tenantType },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    });

    return NextResponse.json({
      faqs: faqs.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("FAQ 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "FAQ 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("faqs");
  if (featureError) return featureError;

  const tenantType = await getServerTenantType();

  try {
    const body = (await request.json()) as FaqPayload;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    const isActive = parseBoolean(body.isActive);
    const priority = parsePriority(body.priority);

    if (!question) {
      return NextResponse.json({ error: "질문을 입력해 주세요." }, { status: 400 });
    }
    if (!answer) {
      return NextResponse.json({ error: "답변을 입력해 주세요." }, { status: 400 });
    }
    if (isActive === null) {
      return NextResponse.json({ error: "isActive 값이 올바르지 않습니다." }, { status: 400 });
    }
    if (priority === null) {
      return NextResponse.json({ error: "priority 값은 정수여야 합니다." }, { status: 400 });
    }

    const created = await prisma.faq.create({
      data: {
        tenantType,
        question,
        answer,
        isActive,
        priority,
      },
    });

    return NextResponse.json(
      {
        success: true,
        faq: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("FAQ 생성 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "FAQ 생성에 실패했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("faqs");
  if (featureError) return featureError;

  const faqId = parseFaqId(request);
  if (!faqId) {
    return NextResponse.json({ error: "수정할 FAQ ID가 필요합니다." }, { status: 400 });
  }

  const tenantType = await getServerTenantType();

  try {
    const body = (await request.json()) as FaqPayload;

    const updateData: {
      question?: string;
      answer?: string;
      isActive?: boolean;
      priority?: number;
    } = {};

    if (body.question !== undefined) {
      if (typeof body.question !== "string" || !body.question.trim()) {
        return NextResponse.json({ error: "질문이 올바르지 않습니다." }, { status: 400 });
      }
      updateData.question = body.question.trim();
    }

    if (body.answer !== undefined) {
      if (typeof body.answer !== "string" || !body.answer.trim()) {
        return NextResponse.json({ error: "답변이 올바르지 않습니다." }, { status: 400 });
      }
      updateData.answer = body.answer.trim();
    }

    if (body.isActive !== undefined) {
      const parsed = parseBoolean(body.isActive);
      if (parsed === null) {
        return NextResponse.json({ error: "isActive 값이 올바르지 않습니다." }, { status: 400 });
      }
      updateData.isActive = parsed;
    }

    if (body.priority !== undefined) {
      const parsed = parsePriority(body.priority);
      if (parsed === null) {
        return NextResponse.json({ error: "priority 값은 정수여야 합니다." }, { status: 400 });
      }
      updateData.priority = parsed;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "수정할 값이 없습니다." }, { status: 400 });
    }

    const current = await prisma.faq.findFirst({
      where: {
        id: faqId,
        tenantType,
      },
      select: { id: true },
    });

    if (!current) {
      return NextResponse.json({ error: "수정할 FAQ를 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.faq.update({
      where: { id: faqId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      faq: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("FAQ 수정 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "FAQ 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("faqs");
  if (featureError) return featureError;

  const faqId = parseFaqId(request);
  if (!faqId) {
    return NextResponse.json({ error: "삭제할 FAQ ID가 필요합니다." }, { status: 400 });
  }

  const tenantType = await getServerTenantType();

  try {
    const existing = await prisma.faq.findFirst({
      where: {
        id: faqId,
        tenantType,
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "삭제할 FAQ를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.faq.delete({ where: { id: faqId } });
    return NextResponse.json({ success: true, deletedId: faqId });
  } catch (error) {
    console.error("FAQ 삭제 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "FAQ 삭제에 실패했습니다." }, { status: 500 });
  }
}
