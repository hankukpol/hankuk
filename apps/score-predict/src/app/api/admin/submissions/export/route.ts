import ExcelJS from "exceljs";
import { ExamType, SubmissionSuspicionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import {
  buildAdminSubmissionOrderBy,
  buildAdminSubmissionWhere,
  parseAdminSubmissionSort,
} from "@/lib/admin-submissions";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import {
  getTenantExamTypeErrorMessage,
  isExamTypeForTenant,
  TENANT_EXAM_TYPES,
} from "@/lib/tenant-exam";
import { hasPoliceWrittenCutoff } from "@/lib/police/written-policy";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

function formatBonusType(bonusType: string): string {
  switch (bonusType) {
    case "VETERAN_5":
      return "보훈 5%";
    case "VETERAN_10":
      return "보훈 10%";
    case "HERO_3":
      return "의사상자 3%";
    case "HERO_5":
      return "의사상자 5%";
    default:
      return "없음";
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) {
    return guard.error;
  }
  const featureError = await requireAdminSiteFeature("submissions");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const examId = parsePositiveInt(searchParams.get("examId"));
    const regionId = parsePositiveInt(searchParams.get("regionId"));
    const userId = parsePositiveInt(searchParams.get("userId"));
    const examTypeValue = searchParams.get("examType");
    const examType = isExamTypeForTenant(guard.tenantType, examTypeValue)
      ? examTypeValue
      : null;
    const search = searchParams.get("search")?.trim() ?? "";
    const suspicious = searchParams.get("suspicious");
    const suspicionStatusValue = searchParams.get("suspicionStatus");
    const suspicionStatus = Object.values(SubmissionSuspicionStatus).includes(
      suspicionStatusValue as SubmissionSuspicionStatus
    )
      ? (suspicionStatusValue as SubmissionSuspicionStatus)
      : null;
    const submissionSort = parseAdminSubmissionSort(
      searchParams.get("sortBy"),
      searchParams.get("sortOrder")
    );

    if (searchParams.get("examType") && !examType) {
      return NextResponse.json({ error: getTenantExamTypeErrorMessage(guard.tenantType) }, { status: 400 });
    }

    const rows = await prisma.submission.findMany({
      where: buildAdminSubmissionWhere({
        examId,
        regionId,
        userId,
        examType,
        search,
        suspicious,
        suspicionStatus,
      }, {
        allowedExamTypes: TENANT_EXAM_TYPES[guard.tenantType],
      }),
      orderBy: buildAdminSubmissionOrderBy(submissionSort),
      select: {
        id: true,
        userId: true,
        examNumber: true,
        examType: true,
        gender: true,
        totalScore: true,
        finalScore: true,
        bonusType: true,
        bonusRate: true,
        isSuspicious: true,
        suspiciousReason: true,
        suspicionStatus: true,
        suspicionManualDecision: true,
        suspicionReviewNote: true,
        createdAt: true,
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
        subjectScores: {
          select: {
            isFailed: true,
          },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Codex";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("제출현황");
    worksheet.columns = [
      { header: "제출 ID", key: "submissionId", width: 12 },
      { header: "회원 ID", key: "userId", width: 12 },
      { header: "이름", key: "userName", width: 16 },
      { header: "아이디", key: "userPhone", width: 18 },
      { header: "연락처", key: "userContactPhone", width: 18 },
      { header: "시험", key: "examName", width: 28 },
      { header: "채용유형", key: "examType", width: 14 },
      { header: "성별", key: "gender", width: 10 },
      { header: "지역", key: "regionName", width: 14 },
      { header: "응시번호", key: "examNumber", width: 18 },
      { header: "총점", key: "totalScore", width: 12 },
      { header: "최종점수", key: "finalScore", width: 12 },
      { header: "가산점 유형", key: "bonusType", width: 14 },
      { header: "가산점 비율", key: "bonusRate", width: 12 },
      { header: "과락 여부", key: "hasCutoff", width: 12 },
      { header: "검토 상태", key: "suspicionStatus", width: 14 },
      { header: "자동 감지 사유", key: "suspiciousReason", width: 32 },
      { header: "관리자 확정", key: "suspicionManualDecision", width: 12 },
      { header: "관리자 메모", key: "suspicionReviewNote", width: 32 },
      { header: "제출일시", key: "createdAt", width: 22 },
    ];

    worksheet.addRows(
      rows.map((row) => ({
        submissionId: row.id,
        userId: row.userId,
        userName: row.user.name,
        userPhone: row.user.phone,
        userContactPhone: row.user.contactPhone,
        examName: `${row.exam.year}년 ${row.exam.round}차 ${row.exam.name}`,
        examType: formatExamType(row.examType),
        gender: formatGender(row.gender),
        regionName: row.region.name,
        examNumber: row.examNumber,
        totalScore: Number(row.totalScore),
        finalScore: Number(row.finalScore),
        bonusType: formatBonusType(row.bonusType),
        bonusRate: Number(row.bonusRate),
        hasCutoff: (
          guard.tenantType === "police"
            ? hasPoliceWrittenCutoff({
                examType: row.examType,
                totalScore: Number(row.totalScore),
                subjectScores: row.subjectScores,
              })
            : row.subjectScores.some((score) => score.isFailed)
        ) ? "과락" : "정상",
        suspicionStatus:
          row.suspicionStatus === SubmissionSuspicionStatus.EXCLUDED
            ? "통계 제외"
            : row.suspicionStatus === SubmissionSuspicionStatus.REVIEW
              ? "검토 필요"
              : "정상",
        suspiciousReason: row.suspiciousReason ?? "",
        suspicionManualDecision: row.suspicionManualDecision ? "확정" : "자동",
        suspicionReviewNote: row.suspicionReviewNote ?? "",
        createdAt: formatDate(row.createdAt),
      }))
    );

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = {
      from: "A1",
      to: "T1",
    };

    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
      const row = worksheet.getRow(rowIndex);
      row.getCell("K").numFmt = "0.00";
      row.getCell("L").numFmt = "0.00";
      row.getCell("N").numFmt = "0.00";
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `제출현황_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const clientIp = getClientIp(request);

    console.log(
      `[감사] 제출현황 엑셀 내보내기 - 관리자ID=${guard.session.user.id}, IP=${clientIp}, 건수=${rows.length}, 시간=${new Date().toISOString()}`
    );

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error("제출현황 엑셀 내보내기 오류:", error);
    return NextResponse.json({ error: "제출현황 엑셀 내보내기에 실패했습니다." }, { status: 500 });
  }
}
