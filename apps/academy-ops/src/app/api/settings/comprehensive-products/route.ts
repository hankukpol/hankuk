import { AdminRole, ExamCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const examCategory = sp.get("examCategory") as ExamCategory | null;

  const products = await getPrisma().comprehensiveCourseProduct.findMany({
    where: {
      ...(examCategory ? { examCategory } : {}),
    },
    orderBy: [{ examCategory: "asc" }, { durationMonths: "asc" }],
  });

  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, examCategory, durationMonths, regularPrice, salePrice, features, isActive } =
      body;

    if (!name?.trim()) throw new Error("상품명을 입력하세요.");
    if (!examCategory) throw new Error("수험유형을 선택하세요.");
    if (!durationMonths || Number(durationMonths) < 1)
      throw new Error("수강기간(개월)을 입력하세요.");
    if (regularPrice === undefined || regularPrice === null || regularPrice < 0)
      throw new Error("정가를 입력하세요.");
    if (salePrice === undefined || salePrice === null || salePrice < 0)
      throw new Error("판매가를 입력하세요.");

    const product = await getPrisma().$transaction(async (tx) => {
      const created = await tx.comprehensiveCourseProduct.create({
        data: {
          name: name.trim(),
          examCategory,
          durationMonths: Number(durationMonths),
          regularPrice: Number(regularPrice),
          salePrice: Number(salePrice),
          features: features?.trim() || null,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_COMPREHENSIVE_PRODUCT",
          targetType: "comprehensiveCourseProduct",
          targetId: String(created.id),
          after: { name: created.name, examCategory, durationMonths, salePrice },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return created;
    });

    return NextResponse.json({ product });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
