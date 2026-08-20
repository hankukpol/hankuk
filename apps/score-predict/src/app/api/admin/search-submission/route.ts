import { NextRequest, NextResponse } from "next/server";
import { ExamType } from "@prisma/client";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";
import { hasPoliceWrittenCutoff } from "@/lib/police/written-policy";

export const runtime = "nodejs";

const EXAM_TYPE_LABEL: Record<string, string> = {
  PUBLIC: "공채",
  CAREER: "경행경채",
  CAREER_RESCUE: "구조 경채",
  CAREER_ACADEMIC: "소방학과 경채",
  CAREER_EMT: "구급 경채",
};

const GENDER_LABEL: Record<string, string> = {
  MALE: "M",
  FEMALE: "F",
};

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;

  const featureError = await requireAdminSiteFeature("submissions");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  if (query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const activeExam = await prisma.exam.findFirst({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const allowedExamTypes =
    guard.tenantType === "police"
      ? [ExamType.PUBLIC, ExamType.CAREER]
      : [ExamType.PUBLIC, ExamType.CAREER_RESCUE, ExamType.CAREER_ACADEMIC, ExamType.CAREER_EMT];

  const submissions = await prisma.submission.findMany({
    where: {
      ...(activeExam ? { examId: activeExam.id } : {}),
      examType: { in: allowedExamTypes },
      OR: [
        { examNumber: { contains: query, mode: "insensitive" } },
        { user: { name: { contains: query, mode: "insensitive" } } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true,
      examNumber: true,
      examType: true,
      gender: true,
      totalScore: true,
      finalScore: true,
      isSuspicious: true,
      subjectScores: {
        select: { isFailed: true },
      },
      user: {
        select: { name: true },
      },
      region: {
        select: { name: true },
      },
      exam: {
        select: { year: true, round: true },
      },
    },
  });

  const results = submissions.map((submission) => ({
    submissionId: submission.id,
    userName: submission.user.name,
    examNumber: submission.examNumber ?? "-",
    examTypeLabel: EXAM_TYPE_LABEL[submission.examType] ?? submission.examType,
    genderLabel:
      guard.tenantType === "police"
        ? "-"
        : GENDER_LABEL[submission.gender] ?? submission.gender,
    regionName: submission.region.name,
    examLabel: `${submission.exam.year} / Round ${submission.exam.round}`,
    totalScore: Number(submission.totalScore),
    finalScore: Number(submission.finalScore),
    hasCutoff:
      guard.tenantType === "police"
        ? hasPoliceWrittenCutoff({
            examType: submission.examType,
            totalScore: Number(submission.totalScore),
            subjectScores: submission.subjectScores,
          })
        : submission.subjectScores.some((subjectScore) => subjectScore.isFailed),
    isSuspicious: submission.isSuspicious,
  }));

  return NextResponse.json({ results });
}
