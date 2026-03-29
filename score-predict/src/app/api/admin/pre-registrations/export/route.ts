import { ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { buildAdminPreRegistrationWhere, parseAdminExamType } from "@/lib/admin-pre-registrations";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { parsePositiveInt } from "@/lib/exam-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatExamType(examType: ExamType): string {
  switch (examType) {
    case ExamType.PUBLIC:
      return "공채";
    case ExamType.CAREER:
      return "경행경채";
    case ExamType.CAREER_RESCUE:
      return "구조 경채";
    case ExamType.CAREER_ACADEMIC:
      return "소방학과 경채";
    case ExamType.CAREER_EMT:
      return "구급 경채";
    default:
      return examType;
  }
}

function formatGender(gender: "MALE" | "FEMALE"): string {
  return gender === "MALE" ? "남성" : "여성";
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) {
    return guard.error;
  }
  const featureError = await requireAdminSiteFeature("preRegistrations");
  if (featureError) {
    return featureError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const examId = parsePositiveInt(searchParams.get("examId"));
    const regionId = parsePositiveInt(searchParams.get("regionId"));
    const examType = parseAdminExamType(searchParams.get("examType"));
    const search = searchParams.get("search")?.trim() ?? "";

    if (searchParams.get("examType") && !examType) {
      return NextResponse.json({ error: "examType은 PUBLIC 또는 CAREER여야 합니다." }, { status: 400 });
    }

    const rows = await prisma.preRegistration.findMany({
      where: buildAdminPreRegistrationWhere({
        examId,
        regionId,
        examType,
        search,
      }),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        examType: true,
        gender: true,
        examNumber: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            name: true,
            phone: true,
            contactPhone: true,
          },
        },
        exam: {
          select: {
            year: true,
            round: true,
            name: true,
          },
        },
        region: {
          select: {
            name: true,
          },
        },
      },
    });

    const header = [
      "이름",
      "아이디",
      "연락처",
      "시험",
      "지역",
      "채용유형",
      "성별",
      "응시번호",
      "최초 등록",
      "최종 수정",
    ].join(",");

    const lines = rows.map((row) =>
      [
        escapeCsvField(row.user.name),
        escapeCsvField(row.user.phone),
        escapeCsvField(row.user.contactPhone),
        escapeCsvField(`${row.exam.year}-${row.exam.round} ${row.exam.name}`),
        escapeCsvField(row.region.name),
        escapeCsvField(formatExamType(row.examType)),
        escapeCsvField(formatGender(row.gender)),
        escapeCsvField(row.examNumber),
        escapeCsvField(formatDate(row.createdAt)),
        escapeCsvField(formatDate(row.updatedAt)),
      ].join(",")
    );

    const csv = "\uFEFF" + [header, ...lines].join("\n");
    const filename = `사전등록목록_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error("사전등록 CSV 내보내기 오류:", error);
    return NextResponse.json({ error: "사전등록 CSV 내보내기에 실패했습니다." }, { status: 500 });
  }
}
