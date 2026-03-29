import { ExamType, Gender, PassCutSnapshotStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { buildPassCutPredictionRows } from "@/lib/pass-cut";
import {
  evaluateAutoPassCutRows,
  resolveNextReleaseNumberFromList,
  runAutoPassCutRelease,
  toSnapshotFromEvaluatedRow,
} from "@/lib/pass-cut-auto-release";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseExamType(value: string | null): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER_RESCUE) return ExamType.CAREER_RESCUE;
  if (value === ExamType.CAREER_ACADEMIC) return ExamType.CAREER_ACADEMIC;
  if (value === ExamType.CAREER_EMT) return ExamType.CAREER_EMT;
  return null;
}

function parseGender(value: string | null): Gender | null {
  if (value === Gender.MALE) return Gender.MALE;
  if (value === Gender.FEMALE) return Gender.FEMALE;
  return null;
}

function resolveCohortGender(params: {
  examType: ExamType;
  requestedGender: Gender | null;
  recruitAcademicCombined: number;
}): { gender: Gender | null; error: string | null } {
  const { examType, requestedGender, recruitAcademicCombined } = params;

  if (examType === ExamType.CAREER_RESCUE) {
    return { gender: Gender.MALE, error: null };
  }

  if (examType === ExamType.CAREER_ACADEMIC && recruitAcademicCombined > 0) {
    return { gender: null, error: null };
  }

  if (!requestedGender) {
    return { gender: null, error: "이 시험 유형에서는 gender 값이 필요합니다." };
  }

  return { gender: requestedGender, error: null };
}

function fallbackCurrentSnapshot() {
  return {
    participantCount: 0,
    recruitCount: 0,
    applicantCount: null,
    targetParticipantCount: null,
    coverageRate: null,
    stabilityScore: null,
    status: PassCutSnapshotStatus.COLLECTING_INSUFFICIENT_SAMPLE,
    statusReason: "표본 부족",
    averageScore: null,
    oneMultipleCutScore: null,
    sureMinScore: null,
    likelyMinScore: null,
    possibleMinScore: null,
  };
}

function toFallbackStatus(params: {
  participantCount: number;
  applicantCount: number | null;
  oneMultipleCutScore: number | null;
}) {
  if (params.applicantCount === null) {
    return {
      status: PassCutSnapshotStatus.COLLECTING_MISSING_APPLICANT_COUNT,
      statusReason: "응시인원 미입력",
    };
  }
  if (params.participantCount < 1 || params.oneMultipleCutScore === null) {
    return {
      status: PassCutSnapshotStatus.COLLECTING_INSUFFICIENT_SAMPLE,
      statusReason: "표본 부족",
    };
  }
  return {
    status: PassCutSnapshotStatus.READY,
    statusReason: null,
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const examIdQuery = parsePositiveInt(searchParams.get("examId"));
  const regionId = parsePositiveInt(searchParams.get("regionId"));
  const examType = parseExamType(searchParams.get("examType"));
  const genderQueryRaw = searchParams.get("gender");
  const requestedGender = parseGender(genderQueryRaw);
  if (genderQueryRaw !== null && !requestedGender) {
    return NextResponse.json({ error: "gender는 MALE 또는 FEMALE이어야 합니다." }, { status: 400 });
  }

  if (!regionId) {
    return NextResponse.json({ error: "regionId는 필수입니다." }, { status: 400 });
  }
  if (!examType) {
    return NextResponse.json(
      { error: "examType은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  const examId =
    examIdQuery ??
    (
      await prisma.exam.findFirst({
        where: { isActive: true },
        orderBy: [{ examDate: "desc" }, { id: "desc" }],
        select: { id: true },
      })
    )?.id ??
    null;

  if (!examId) {
    return NextResponse.json({
      releases: [],
      current: fallbackCurrentSnapshot(),
    });
  }

  const quota = await prisma.examRegionQuota.findUnique({
    where: {
      examId_regionId: {
        examId,
        regionId,
      },
    },
    select: {
      recruitAcademicCombined: true,
    },
  });
  const cohortGenderResolved = resolveCohortGender({
    examType,
    requestedGender,
    recruitAcademicCombined: quota?.recruitAcademicCombined ?? 0,
  });
  if (cohortGenderResolved.error) {
    return NextResponse.json({ error: cohortGenderResolved.error }, { status: 400 });
  }
  const cohortGender = cohortGenderResolved.gender;

  let autoRows = [] as Awaited<ReturnType<typeof evaluateAutoPassCutRows>>;
  try {
    const autoResult = await runAutoPassCutRelease({
      examId,
      trigger: "traffic",
    });
    if (autoResult.rows.length > 0) {
      autoRows = autoResult.rows;
    }
  } catch (error) {
    console.error("보조 자동 합격컷 발표 트리거 실행에 실패했습니다.", error);
  }

  const releases = await prisma.passCutRelease.findMany({
    where: { examId },
    orderBy: [{ releaseNumber: "asc" }, { id: "asc" }],
    select: {
      releaseNumber: true,
      releasedAt: true,
      participantCount: true,
      snapshots: {
        where: {
          regionId,
          examType,
          ...(cohortGender === null
            ? { gender: null }
            : {
                OR: [{ gender: cohortGender }, { gender: null }],
              }),
        },
        select: {
          gender: true,
          participantCount: true,
          recruitCount: true,
          applicantCount: true,
          targetParticipantCount: true,
          coverageRate: true,
          stabilityScore: true,
          status: true,
          statusReason: true,
          averageScore: true,
          oneMultipleCutScore: true,
          sureMinScore: true,
          likelyMinScore: true,
          possibleMinScore: true,
        },
        take: cohortGender === null ? 1 : 2,
      },
    },
  });

  const nextReleaseNumber =
    resolveNextReleaseNumberFromList(releases.map((item) => item.releaseNumber)) ?? 4;

  if (autoRows.length < 1) {
    try {
      autoRows = await evaluateAutoPassCutRows({
        examId,
        releaseNumberForThreshold: nextReleaseNumber,
      });
    } catch (error) {
      console.error("현재 스냅샷용 자동 합격컷 행 계산에 실패했습니다.", error);
    }
  }

  let current = toSnapshotFromEvaluatedRow(
    autoRows.find(
      (row) =>
        row.regionId === regionId &&
        row.examType === examType &&
        (row.gender === cohortGender || (cohortGender !== null && row.gender === null))
    )
  );

  if (autoRows.length < 1) {
    try {
      const settings = await getSiteSettingsUncached();
      const rows = await buildPassCutPredictionRows({
        examId,
        includeCareerExamType: Boolean(settings["site.careerExamEnabled"] ?? true),
      });
      const matched = rows.find(
        (row) =>
          row.regionId === regionId &&
          row.examType === examType &&
          (row.gender === cohortGender || (cohortGender !== null && row.gender === null))
      );
      if (matched) {
        const fallbackStatus = toFallbackStatus({
          participantCount: matched.participantCount,
          applicantCount: matched.applicantCount,
          oneMultipleCutScore: matched.oneMultipleCutScore,
        });
        current = {
          participantCount: matched.participantCount,
          recruitCount: matched.recruitCount,
          applicantCount: matched.applicantCount,
          targetParticipantCount: null,
          coverageRate: null,
          stabilityScore: null,
          status: fallbackStatus.status,
          statusReason: fallbackStatus.statusReason,
          averageScore: matched.averageScore,
          oneMultipleCutScore: matched.oneMultipleCutScore,
          sureMinScore: matched.sureMinScore,
          likelyMinScore: matched.likelyMinScore,
          possibleMinScore: matched.possibleMinScore,
        };
      }
    } catch (error) {
      console.error("대체용 현재 합격컷 스냅샷 생성에 실패했습니다.", error);
    }
  }

  return NextResponse.json({
    releases: releases.map((release) => {
      const snapshot =
        release.snapshots.find((item) => item.gender === cohortGender) ??
        (cohortGender !== null ? release.snapshots.find((item) => item.gender === null) : null) ??
        null;
      return {
        releaseNumber: release.releaseNumber,
        releasedAt: release.releasedAt.toISOString(),
        totalParticipantCount: release.participantCount,
        snapshot: snapshot
          ? {
              participantCount: snapshot.participantCount,
              recruitCount: snapshot.recruitCount,
              applicantCount: snapshot.applicantCount,
              targetParticipantCount: snapshot.targetParticipantCount,
              coverageRate: snapshot.coverageRate,
              stabilityScore: snapshot.stabilityScore,
              status: snapshot.status,
              statusReason: snapshot.statusReason,
              averageScore: snapshot.averageScore,
              oneMultipleCutScore: snapshot.oneMultipleCutScore,
              sureMinScore: snapshot.sureMinScore,
              likelyMinScore: snapshot.likelyMinScore,
              possibleMinScore: snapshot.possibleMinScore,
            }
          : null,
      };
    }),
    current,
  });
}
