import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";

  const textbooks = await getPrisma().textbook.findMany({
    where: {
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ textbooks });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { title, author, publisher, price, stock, subject, isActive } = body;

    if (!title?.trim()) throw new Error("교재명을 입력하세요.");
    if (price === undefined || price === null || Number(price) < 0)
      throw new Error("가격은 0원 이상이어야 합니다.");
    if (stock === undefined || stock === null || Number(stock) < 0)
      throw new Error("재고는 0개 이상이어야 합니다.");

    const textbook = await getPrisma().$transaction(async (tx) => {
      const created = await tx.textbook.create({
        data: {
          title: title.trim(),
          author: author?.trim() || null,
          publisher: publisher?.trim() || null,
          price: Number(price),
          stock: Number(stock),
          subject: subject || null,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_TEXTBOOK",
          targetType: "textbook",
          targetId: String(created.id),
          after: { title: created.title, price: created.price, stock: created.stock },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return created;
    });

    return NextResponse.json({ textbook });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
