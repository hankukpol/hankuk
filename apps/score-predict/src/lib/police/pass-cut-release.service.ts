import { ExamType, PassCutSnapshotStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PassCutReleaseSource = "ADMIN" | "AUTO";

export class PassCutReleaseServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PassCutReleaseServiceError";
    this.status = status;
  }
}

export interface PassCutSnapshotStatusPayload {
  status: PassCutSnapshotStatus;
  statusReason: string | null;
  applicantCount: number | null;
  targetParticipantCount: number | null;
  coverageRate: number | null;
  stabilityScore: number | null;
}

export interface PassCutSnapshotInput {
  regionId: number;
  examType: ExamType;
  participantCount: number;
  recruitCount: number;
  averageScore: number | null;
  oneMultipleCutScore: number | null;
  sureMinScore: number | null;
  likelyMinScore: number | null;
  possibleMinScore: number | null;
  statusPayload?: PassCutSnapshotStatusPayload;
}

export interface CreatePassCutReleaseParams {
  examId: number;
  releaseNumber: number;
  createdBy: number;
  source: PassCutReleaseSource;
  memo?: string | null;
  autoNotice?: boolean;
  snapshots: PassCutSnapshotInput[];
  customNoticeTitle?: string;
  customNoticeContent?: string;
}

export interface CreatePassCutReleaseResult {
  id: number;
  releaseNumber: number;
  releasedAt: string;
  participantCount: number;
  snapshotCount: number;
}

function toSafeFloat(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

function buildDefaultNoticeTitle(
  releaseNumber: number,
  source: PassCutReleaseSource
): string {
  if (source === "AUTO") {
    return `${releaseNumber}차 합격컷 자동 발표 안내`;
  }
  return `${releaseNumber}차 합격컷 발표 안내`;
}

function buildDefaultNoticeContent(params: {
  examYear: number;
  examRound: number;
  examName: string;
  releaseNumber: number;
  source: PassCutReleaseSource;
}): string {
  if (params.source === "AUTO") {
    return `${params.examYear}년 ${params.examRound}차 ${params.examName} ${params.releaseNumber}차 합격컷이 자동 발표되었습니다.`;
  }
  return `${params.examYear}년 ${params.examRound}차 ${params.examName} ${params.releaseNumber}차 합격컷이 발표되었습니다.`;
}

export async function createPassCutRelease(
  params: CreatePassCutReleaseParams
): Promise<CreatePassCutReleaseResult> {
  if (!Number.isInteger(params.examId) || params.examId <= 0) {
    throw new PassCutReleaseServiceError("examId가 올바르지 않습니다.", 400);
  }
  if (
    !Number.isInteger(params.releaseNumber) ||
    params.releaseNumber < 1 ||
    params.releaseNumber > 4
  ) {
    throw new PassCutReleaseServiceError("releaseNumber는 1~4 범위여야 합니다.", 400);
  }
  if (!Number.isInteger(params.createdBy) || params.createdBy <= 0) {
    throw new PassCutReleaseServiceError(
      "발표 생성자의 사용자 정보가 올바르지 않습니다.",
      401
    );
  }

  const exam = await prisma.exam.findUnique({
    where: { id: params.examId },
    select: {
      id: true,
      name: true,
      year: true,
      round: true,
    },
  });

  if (!exam) {
    throw new PassCutReleaseServiceError("대상 시험을 찾을 수 없습니다.", 404);
  }

  const duplicated = await prisma.passCutRelease.findUnique({
    where: {
      examId_releaseNumber: {
        examId: params.examId,
        releaseNumber: params.releaseNumber,
      },
    },
    select: { id: true },
  });

  if (duplicated) {
    throw new PassCutReleaseServiceError(
      `이미 ${params.releaseNumber}차 합격컷 발표가 등록되어 있습니다.`,
      409
    );
  }

  const snapshots = params.snapshots;
  const participantCount = snapshots.reduce((sum, row) => sum + row.participantCount, 0);
  const autoNotice = params.autoNotice !== false;
  const memo = typeof params.memo === "string" && params.memo.trim() ? params.memo.trim() : null;

  let release: {
    id: number;
    releaseNumber: number;
    releasedAt: Date;
    participantCount: number;
  };
  try {
    release = await prisma.$transaction(async (tx) => {
      const created = await tx.passCutRelease.create({
        data: {
          examId: params.examId,
          releaseNumber: params.releaseNumber,
          participantCount,
          createdBy: params.createdBy,
          memo,
        },
        select: {
          id: true,
          releaseNumber: true,
          releasedAt: true,
          participantCount: true,
        },
      });

      if (snapshots.length > 0) {
        await tx.passCutSnapshot.createMany({
          data: snapshots.map((row) => ({
            passCutReleaseId: created.id,
            regionId: row.regionId,
            examType: row.examType,
            status: row.statusPayload?.status ?? PassCutSnapshotStatus.READY,
            statusReason: row.statusPayload?.statusReason ?? null,
            applicantCount: row.statusPayload?.applicantCount ?? null,
            targetParticipantCount: row.statusPayload?.targetParticipantCount ?? null,
            coverageRate: toSafeFloat(row.statusPayload?.coverageRate),
            stabilityScore: toSafeFloat(row.statusPayload?.stabilityScore),
            participantCount: row.participantCount,
            recruitCount: row.recruitCount,
            averageScore: row.averageScore,
            oneMultipleCutScore: row.oneMultipleCutScore,
            sureMinScore: row.sureMinScore,
            likelyMinScore: row.likelyMinScore,
            possibleMinScore: row.possibleMinScore,
          })),
        });
      }

      if (autoNotice) {
        await tx.notice.create({
          data: {
            tenantType: "police",
            title:
              params.customNoticeTitle ??
              buildDefaultNoticeTitle(params.releaseNumber, params.source),
            content:
              params.customNoticeContent ??
              buildDefaultNoticeContent({
                examYear: exam.year,
                examRound: exam.round,
                examName: exam.name,
                releaseNumber: params.releaseNumber,
                source: params.source,
              }),
            isActive: true,
            priority: params.source === "AUTO" ? 110 : 100,
          },
        });
      }

      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PassCutReleaseServiceError(
        `이미 ${params.releaseNumber}차 합격컷 발표가 등록되어 있습니다.`,
        409
      );
    }
    throw error;
  }

  return {
    id: release.id,
    releaseNumber: release.releaseNumber,
    releasedAt: release.releasedAt.toISOString(),
    participantCount: release.participantCount,
    snapshotCount: snapshots.length,
  };
}
