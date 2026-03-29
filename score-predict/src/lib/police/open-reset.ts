import "server-only";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface OpenResetResult {
  deleted: {
    preRegistrations: number;
    submissions: number;
    users: number;
    comments: number;
    answerKeys: number;
    answerKeyLogs: number;
    rescoreEvents: number;
    passCutReleases: number;
    visitorLogs: number;
  };
  preserved: {
    adminUsers: number;
  };
}

interface CountDelegate<TArgs = unknown> {
  count: (args?: TArgs) => Promise<number>;
}

interface DeleteManyResult {
  count?: number | null;
}

interface DeleteManyDelegate<TArgs = unknown> {
  deleteMany: (args?: TArgs) => Promise<DeleteManyResult>;
}

async function safeCount<TArgs>(
  delegate: CountDelegate<TArgs> | null | undefined,
  args?: TArgs
) {
  if (!delegate || typeof delegate.count !== "function") return 0;
  return delegate.count(args);
}

async function safeDeleteMany<TArgs>(
  delegate: DeleteManyDelegate<TArgs> | null | undefined,
  args?: TArgs
) {
  if (!delegate || typeof delegate.deleteMany !== "function") return 0;
  const result = await delegate.deleteMany(args);
  return result?.count ?? 0;
}

export async function runOpenReset(): Promise<OpenResetResult> {
  return prisma.$transaction(
    async (tx) => {
      const adminUsers = await safeCount(tx.user, { where: { role: Role.ADMIN } });

      const answerKeyLogs = await safeDeleteMany(tx.answerKeyLog, {});
      await safeDeleteMany(tx.passCutSnapshot, {});
      const passCutReleases = await safeDeleteMany(tx.passCutRelease, {});
      await safeDeleteMany(tx.rescoreDetail, {});
      const rescoreEvents = await safeDeleteMany(tx.rescoreEvent, {});
      const comments = await safeDeleteMany(tx.comment, {});
      const visitorLogs = await safeDeleteMany(tx.visitorLog, {});
      const preRegistrations = await safeDeleteMany(tx.preRegistration, {});
      await safeDeleteMany(tx.userAnswer, {});
      await safeDeleteMany(tx.subjectScore, {});
      await safeDeleteMany(tx.difficultyRating, {});
      await safeDeleteMany(tx.finalPrediction, {});
      await safeDeleteMany(tx.submissionLog, {});
      const submissions = await safeDeleteMany(tx.submission, {});
      await safeDeleteMany(tx.passwordResetToken, {});
      await safeDeleteMany(tx.recoveryCode, {});

      const deletedUsers = await safeDeleteMany(tx.user, {
        where: { role: Role.USER },
      });

      const answerKeys = await safeDeleteMany(tx.answerKey, {});

      return {
        deleted: {
          preRegistrations,
          submissions,
          users: deletedUsers,
          comments,
          answerKeys,
          answerKeyLogs,
          rescoreEvents,
          passCutReleases,
          visitorLogs,
        },
        preserved: {
          adminUsers,
        },
      };
    },
    {
      maxWait: 10_000,
      timeout: 60_000,
    }
  );
}
