import { AdminRole, ExamType, Prisma, ProspectSource, ProspectStage } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const size = Math.min(100, Math.max(1, Number(searchParams.get("size") ?? "20")));
  const search = searchParams.get("search")?.trim() ?? "";
  const convertedParam = searchParams.get("converted");
  const stageParam = searchParams.get("stage") as ProspectStage | null;
  const sourceParam = searchParams.get("source") as ProspectSource | null;

  const where: Prisma.ConsultationProspectWhereInput = {};

  // stage filter: "converted" shorthand or explicit stage param
  if (convertedParam === "true") {
    where.stage = ProspectStage.REGISTERED;
  } else if (convertedParam === "false") {
    where.stage = { not: ProspectStage.REGISTERED };
  } else if (stageParam && Object.values(ProspectStage).includes(stageParam)) {
    where.stage = stageParam;
  }

  if (sourceParam && Object.values(ProspectSource).includes(sourceParam)) {
    where.source = sourceParam;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, prospects] = await Promise.all([
    getPrisma().consultationProspect.count({ where }),
    getPrisma().consultationProspect.findMany({
      where,
      orderBy: { visitedAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      include: {
        staff: { select: { name: true } },
      },
    }),
  ]);

  return NextResponse.json({ data: { prospects, total, page, size } });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, phone, examType, source, stage, note, visitedAt } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }
    if (source && !Object.values(ProspectSource).includes(source)) {
      return NextResponse.json({ error: "유효하지 않은 유입경로입니다." }, { status: 400 });
    }
    if (stage && !Object.values(ProspectStage).includes(stage)) {
      return NextResponse.json({ error: "유효하지 않은 단계입니다." }, { status: 400 });
    }
    if (examType && !Object.values(ExamType).includes(examType)) {
      return NextResponse.json({ error: "유효하지 않은 시험유형입니다." }, { status: 400 });
    }

    const prospect = await getPrisma().consultationProspect.create({
      data: {
        name: name.trim(),
        phone: phone?.trim() || null,
        examType: examType || null,
        source: source || ProspectSource.WALK_IN,
        stage: stage || ProspectStage.INQUIRY,
        note: note?.trim() || null,
        staffId: auth.context.adminUser.id,
        visitedAt: visitedAt ? new Date(visitedAt) : new Date(),
      },
      include: {
        staff: { select: { name: true } },
      },
    });

    return NextResponse.json({ data: { prospect } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 400 },
    );
  }
}
