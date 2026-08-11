import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ExamType, PrismaClient } from "@prisma/client";
import { POLICE_REGION_ORDER } from "../src/lib/police/regions";

type TenantSchema = "score_predict_police" | "score_predict_fire";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dockerEnvPath = resolve(appDir, ".env.docker.local");
const allowedHosts = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);
const allowedPorts = new Set(["54332"]);
const targetRegionNames = ["대구", "경북"] as const;
const initialPublicPerRegion = 200;
const supplementalPublicPerRegion = 20;
const expectedPublicPerRegion = initialPublicPerRegion + supplementalPublicPerRegion;
const careerPerRegion = 40;

const regionalSettings = {
  대구: {
    recruitCount: 46,
    recruitCountCareer: 3,
    applicantCount: 1045,
    applicantCountCareer: 45,
    examNumberStart: "2026004000",
    examNumberEnd: "2026004999",
    examNumberStartCareer: "2026104000",
    examNumberEndCareer: "2026104999",
  },
  경북: {
    recruitCount: 192,
    recruitCountCareer: 9,
    applicantCount: 1595,
    applicantCountCareer: 56,
    examNumberStart: "2026003000",
    examNumberEnd: "2026003999",
    examNumberStartCareer: "2026103000",
    examNumberEndCareer: "2026103999",
  },
} as const;

function readDockerEnvValue(key: string): string {
  const lines = readFileSync(dockerEnvPath, "utf8").split(/\r?\n/);
  const prefix = `${key}=`;
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  if (!line) {
    throw new Error(`${key} is missing from ${dockerEnvPath}.`);
  }

  const rawValue = line.slice(prefix.length).trim();
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }
  return rawValue;
}

function localDatabaseUrl(schema: TenantSchema): string {
  const rawUrl = process.env.DATABASE_URL || readDockerEnvValue("DATABASE_URL");
  if (/\.supabase\.(?:co|com)/i.test(rawUrl)) {
    throw new Error("Hosted Supabase URL detected. Local mock generation aborted.");
  }

  const parsed = new URL(rawUrl);
  if (!allowedHosts.has(parsed.hostname) || !allowedPorts.has(parsed.port)) {
    throw new Error(`Unsafe database target: ${parsed.hostname}:${parsed.port}`);
  }

  if (parsed.hostname === "host.docker.internal") {
    parsed.hostname = "127.0.0.1";
  }
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function createClient(url: string) {
  return new PrismaClient({
    datasources: { db: { url } },
    log: ["warn", "error"],
  });
}

async function snapshotTenantCounts(db: PrismaClient) {
  const [users, exams, submissions, preRegistrations, quotas] = await Promise.all([
    db.user.count(),
    db.exam.count(),
    db.submission.count(),
    db.preRegistration.count(),
    db.examRegionQuota.count(),
  ]);
  return { users, exams, submissions, preRegistrations, quotas };
}

async function main() {
  const policeUrl = localDatabaseUrl("score_predict_police");
  const fireUrl = localDatabaseUrl("score_predict_fire");

  // 동적 import 전에 경찰 스키마를 고정해야 tenant-aware Prisma가 경찰만 사용한다.
  process.env.DATABASE_URL = policeUrl;
  process.env.DIRECT_URL = policeUrl;

  const policeDb = createClient(policeUrl);
  const fireDb = createClient(fireUrl);
  let tenantPrisma: typeof import("../src/lib/prisma").prisma | null = null;

  try {
    const [policeActiveExams, fireActiveExams] = await Promise.all([
      policeDb.exam.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      fireDb.exam.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);

    if (policeActiveExams.length !== 1) {
      throw new Error(`Police must have exactly one active exam; found ${policeActiveExams.length}.`);
    }
    if (fireActiveExams.length !== 1) {
      throw new Error(`Fire must have exactly one active exam; found ${fireActiveExams.length}.`);
    }

    const activeExam = policeActiveExams[0];
    const [fireBefore, nonMockSubmissionCountBefore, nonMockUserCountBefore] = await Promise.all([
      snapshotTenantCounts(fireDb),
      policeDb.submission.count({
        where: { examId: activeExam.id, NOT: { examNumber: { startsWith: "MOCK-" } } },
      }),
      policeDb.user.count({
        where: {
          NOT: {
            AND: [
              { name: { startsWith: "[MOCK]:" } },
              { phone: { startsWith: "090999" } },
            ],
          },
        },
      }),
    ]);

    for (const regionName of POLICE_REGION_ORDER) {
      await policeDb.region.upsert({
        where: { name: regionName },
        update: {},
        create: { name: regionName, isActive: false },
      });
    }

    const targetRegions = new Map<string, number>();
    for (const regionName of targetRegionNames) {
      const region = await policeDb.region.upsert({
        where: { name: regionName },
        update: { isActive: true },
        create: { name: regionName, isActive: true },
        select: { id: true },
      });
      targetRegions.set(regionName, region.id);

      await policeDb.examRegionQuota.upsert({
        where: {
          examId_regionId: {
            examId: activeExam.id,
            regionId: region.id,
          },
        },
        update: regionalSettings[regionName],
        create: {
          examId: activeExam.id,
          regionId: region.id,
          ...regionalSettings[regionName],
        },
      });
    }

    const targetRegionIds = [...targetRegions.values()];
    await policeDb.region.updateMany({
      where: { name: { notIn: [...targetRegionNames] } },
      data: { isActive: false },
    });

    const mockData = await import("../src/lib/police/mock-data");
    const prismaModule = await import("../src/lib/prisma");
    tenantPrisma = prismaModule.prisma;
    const initialResult = await mockData.generateMockData({
      examId: activeExam.id,
      publicPerRegion: initialPublicPerRegion,
      careerPerRegion,
      careerEnabled: true,
      resetBeforeGenerate: true,
      includeFinalPredictionMock: true,
    });
    // 경찰 MOCK 생성기의 1회 상한(200명)은 유지하면서 경북 모집 192명과
    // 과락 표본을 함께 보여주기 위해 공채 20명만 안전하게 추가한다.
    const supplementalResult = await mockData.generateMockData({
      examId: activeExam.id,
      publicPerRegion: supplementalPublicPerRegion,
      careerEnabled: false,
      resetBeforeGenerate: false,
      includeFinalPredictionMock: true,
    });

    const grouped = await policeDb.submission.groupBy({
      by: ["regionId", "examType"],
      where: {
        examId: activeExam.id,
        examNumber: { startsWith: "MOCK-" },
      },
      _count: { _all: true },
    });

    const regionNameById = new Map(
      (await policeDb.region.findMany({
        where: { id: { in: targetRegionIds } },
        select: { id: true, name: true },
      })).map((region) => [region.id, region.name] as const)
    );
    const mockCounts = grouped.map((row) => ({
      region: regionNameById.get(row.regionId) ?? `region:${row.regionId}`,
      examType: row.examType,
      count: row._count._all,
    }));

    const sampleAccounts = [];
    for (const regionName of targetRegionNames) {
      const regionId = targetRegions.get(regionName)!;
      for (const examType of [ExamType.PUBLIC, ExamType.CAREER] as const) {
        const sample = await policeDb.submission.findFirst({
          where: {
            examId: activeExam.id,
            regionId,
            examType,
            examNumber: { startsWith: "MOCK-" },
          },
          orderBy: [{ finalScore: "desc" }, { id: "asc" }],
          select: {
            finalScore: true,
            user: { select: { phone: true } },
          },
        });
        if (!sample) {
          throw new Error(`${regionName} ${examType} sample account is missing.`);
        }
        sampleAccounts.push({
          region: regionName,
          examType,
          username: sample.user.phone,
          password: "mock1234!",
          finalScore: sample.finalScore,
        });
      }
    }

    for (const regionName of targetRegionNames) {
      const regionId = targetRegions.get(regionName)!;
      const publicCount = grouped.find(
        (row) => row.regionId === regionId && row.examType === ExamType.PUBLIC
      )?._count._all;
      const careerCount = grouped.find(
        (row) => row.regionId === regionId && row.examType === ExamType.CAREER
      )?._count._all;
      if (publicCount !== expectedPublicPerRegion || careerCount !== careerPerRegion) {
        throw new Error(
          `${regionName} mock count mismatch: PUBLIC=${publicCount ?? 0}, CAREER=${careerCount ?? 0}.`
        );
      }
    }

    const [nonMockSubmissionCountAfter, nonMockUserCountAfter, fireAfter, mockDetails] =
      await Promise.all([
        policeDb.submission.count({
          where: { examId: activeExam.id, NOT: { examNumber: { startsWith: "MOCK-" } } },
        }),
        policeDb.user.count({
          where: {
            NOT: {
              AND: [
                { name: { startsWith: "[MOCK]:" } },
                { phone: { startsWith: "090999" } },
              ],
            },
          },
        }),
        snapshotTenantCounts(fireDb),
        policeDb.submission.aggregate({
          where: { examId: activeExam.id, examNumber: { startsWith: "MOCK-" } },
          _count: { _all: true },
          _min: { finalScore: true },
          _max: { finalScore: true },
          _avg: { finalScore: true },
        }),
      ]);

    if (nonMockSubmissionCountAfter !== nonMockSubmissionCountBefore) {
      throw new Error("Existing non-mock police submissions changed unexpectedly.");
    }
    if (nonMockUserCountAfter !== nonMockUserCountBefore) {
      throw new Error("Existing non-mock police users changed unexpectedly.");
    }
    if (JSON.stringify(fireAfter) !== JSON.stringify(fireBefore)) {
      throw new Error("Fire tenant data changed unexpectedly.");
    }

    console.log(
      JSON.stringify(
        {
          exam: activeExam,
          officialRecruitCounts: Object.fromEntries(
            targetRegionNames.map((name) => [
              name,
              {
                public: regionalSettings[name].recruitCount,
                careerPoliceAdministration: regionalSettings[name].recruitCountCareer,
              },
            ])
          ),
          officialApplicantCounts: Object.fromEntries(
            targetRegionNames.map((name) => [
              name,
              {
                public: regionalSettings[name].applicantCount,
                careerPoliceAdministration: regionalSettings[name].applicantCountCareer,
              },
            ])
          ),
          mockCounts,
          sampleAccounts,
          scoreSummary: mockDetails,
          generator: {
            initial: initialResult,
            supplementalPublic: supplementalResult,
          },
          preserved: {
            policeNonMockUsers: nonMockUserCountAfter,
            policeNonMockSubmissionsForActiveExam: nonMockSubmissionCountAfter,
            fireTenant: fireAfter,
          },
          activePoliceRegions: targetRegionNames,
        },
        null,
        2
      )
    );
  } finally {
    await tenantPrisma?.$disconnect().catch(() => undefined);
    await Promise.all([policeDb.$disconnect(), fireDb.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
