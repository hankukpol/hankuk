import bcrypt from "bcryptjs";
import {
  BonusType,
  DifficultyRatingLevel,
  ExamType,
  Gender,
  PrismaClient,
  Role,
} from "@prisma/client";
import { POLICE_PREDICTION_MODEL_VERSION } from "../src/lib/police/prediction-model";

type TenantType = "police" | "fire";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);
const ALLOWED_PORTS = new Set(["54332"]);
const LOCAL_CONFIRMATION = "SCORE_PREDICT_LOCAL_ONLY";
const TENANT_SCHEMAS: Record<TenantType, string> = {
  police: "score_predict_police",
  fire: "score_predict_fire",
};

const sharedLogin = "010-9000-0000";
const tenantPasswords: Record<TenantType, string> = {
  police: "PoliceLocal!123",
  fire: "FireLocal!123",
};
const adminPasswords: Record<TenantType, string> = {
  police: "PoliceAdmin!123",
  fire: "FireAdmin!123",
};
const requestedPoliceAdmin = {
  username: "admin",
  password: "1234!!",
};

function getLocalBaseUrl(): URL {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required.");
  const parsed = new URL(rawUrl);
  const stagingProjectRef = process.env.STAGING_PROJECT_REF ?? "";
  const stagingConfirmation = `RESET_SCORE_PREDICT_STAGING_${stagingProjectRef}`;
  const isApprovedStaging =
    stagingProjectRef.length > 0 &&
    stagingProjectRef !== "pbonwjwbtqyrfrxqdwlu" &&
    process.env.STAGING_SEED_CONFIRM === stagingConfirmation &&
    (parsed.hostname === `db.${stagingProjectRef}.supabase.co` || rawUrl.includes(`postgres.${stagingProjectRef}`)) &&
    (parsed.port === "5432" || parsed.port === "6543");

  if (isApprovedStaging) return parsed;

  if (process.env.LOCAL_SEED_CONFIRM !== LOCAL_CONFIRMATION) {
    throw new Error(`LOCAL_SEED_CONFIRM must equal ${LOCAL_CONFIRMATION}.`);
  }
  if (/\.supabase\.(?:co|com)/i.test(rawUrl)) {
    throw new Error("Hosted Supabase URL detected without staging confirmation.");
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname) || !ALLOWED_PORTS.has(parsed.port)) {
    throw new Error(`Unsafe local database target: ${parsed.hostname}:${parsed.port}`);
  }
  return parsed;
}

function tenantUrl(baseUrl: URL, tenantType: TenantType): string {
  const nextUrl = new URL(baseUrl);
  nextUrl.searchParams.set("schema", TENANT_SCHEMAS[tenantType]);
  return nextUrl.toString();
}

function getSubjects(tenantType: TenantType) {
  if (tenantType === "police") {
    return [
      { name: "헌법", examType: ExamType.PUBLIC, questionCount: 20, pointPerQuestion: 2.5, maxScore: 50 },
      { name: "형사법", examType: ExamType.PUBLIC, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
      { name: "경찰학", examType: ExamType.PUBLIC, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
      { name: "범죄학", examType: ExamType.CAREER, questionCount: 20, pointPerQuestion: 2.5, maxScore: 50 },
      { name: "형사법", examType: ExamType.CAREER, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
      { name: "경찰학", examType: ExamType.CAREER, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
    ];
  }

  return [
    { name: "소방학개론", examType: ExamType.PUBLIC, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
    { name: "소방관계법규", examType: ExamType.PUBLIC, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
    { name: "행정법총론", examType: ExamType.PUBLIC, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
    { name: "소방학개론", examType: ExamType.CAREER_RESCUE, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
    { name: "소방관계법규", examType: ExamType.CAREER_RESCUE, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
    { name: "소방학개론", examType: ExamType.CAREER_ACADEMIC, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
    { name: "소방관계법규", examType: ExamType.CAREER_ACADEMIC, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
    { name: "소방학개론", examType: ExamType.CAREER_EMT, questionCount: 25, pointPerQuestion: 4, maxScore: 100 },
    { name: "응급처치학개론", examType: ExamType.CAREER_EMT, questionCount: 40, pointPerQuestion: 2.5, maxScore: 100 },
  ];
}

function getExamTypes(tenantType: TenantType): ExamType[] {
  return tenantType === "police"
    ? [ExamType.PUBLIC, ExamType.CAREER]
    : [ExamType.PUBLIC, ExamType.CAREER_RESCUE, ExamType.CAREER_ACADEMIC, ExamType.CAREER_EMT];
}

async function seedTenant(baseUrl: URL, tenantType: TenantType) {
  const prisma = new PrismaClient({
    datasources: { db: { url: tenantUrl(baseUrl, tenantType) } },
  });

  try {
    const [adminPassword, userPassword] = await Promise.all([
      bcrypt.hash(adminPasswords[tenantType], 10),
      bcrypt.hash(tenantPasswords[tenantType], 10),
    ]);

    const admin = await prisma.user.create({
      data: {
        name: `${tenantType}-local-admin`,
        phone: "010-0000-0000",
        contactPhone: "010-0000-0000",
        email: `${tenantType}-admin@local.invalid`,
        password: adminPassword,
        role: Role.ADMIN,
        termsAgreedAt: new Date("2026-01-01T00:00:00Z"),
        privacyAgreedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    const users = [];
    for (let index = 0; index < 16; index += 1) {
      const password = index === 0 ? userPassword : await bcrypt.hash(`${tenantType}-user-${index}!`, 8);
      users.push(
        await prisma.user.create({
          data: {
            name: `${tenantType}-local-user-${String(index + 1).padStart(2, "0")}`,
            phone: index === 0 ? sharedLogin : `010-${tenantType === "police" ? "91" : "92"}${String(index).padStart(2, "0")}-${String(1000 + index)}`,
            contactPhone: `010-8000-${String(1000 + index)}`,
            email: `${tenantType}-user-${index}@local.invalid`,
            password,
            termsAgreedAt: new Date("2026-01-01T00:00:00Z"),
            privacyAgreedAt: new Date("2026-01-01T00:00:00Z"),
          },
        })
      );
    }

    const requestedAdmin = tenantType === "police"
      ? await prisma.user.create({
          data: {
            name: "로컬 관리자",
            phone: requestedPoliceAdmin.username,
            contactPhone: "",
            email: "admin@police.local.invalid",
            password: await bcrypt.hash(requestedPoliceAdmin.password, 10),
            role: Role.ADMIN,
            termsAgreedAt: new Date("2026-01-01T00:00:00Z"),
            privacyAgreedAt: new Date("2026-01-01T00:00:00Z"),
          },
        })
      : null;

    const previousExam = await prisma.exam.create({
      data: {
        name: tenantType === "police" ? "2026 경찰공무원 1차 채용시험" : "2026 소방공무원 1차 채용시험",
        year: 2026,
        round: 1,
        examDate: new Date("2026-03-07T01:00:00Z"),
        isActive: false,
        ...(tenantType === "police"
          ? {
              policeWrittenPassMultiple: 2,
              policePredictionModelVersion: POLICE_PREDICTION_MODEL_VERSION,
            }
          : {}),
      },
    });

    const exam = await prisma.exam.create({
      data: {
        name: tenantType === "police" ? "2026 경찰공무원 2차 채용시험" : "2026 소방공무원 2차 채용시험",
        year: 2026,
        round: 2,
        examDate: new Date("2026-08-22T01:00:00Z"),
        isActive: true,
        ...(tenantType === "police"
          ? {
              policeWrittenPassMultiple: 2,
              policePredictionModelVersion: POLICE_PREDICTION_MODEL_VERSION,
            }
          : {}),
      },
    });

    const regionNames = tenantType === "police" ? ["서울", "부산", "경기남부", "경북"] : ["서울", "부산", "경기"];
    const regions = [];
    for (const name of regionNames) {
      regions.push(await prisma.region.create({ data: { name, isActive: true } }));
    }

    for (const [index, region] of regions.entries()) {
      await prisma.examRegionQuota.create({
        data:
          tenantType === "police"
            ? {
                examId: exam.id,
                regionId: region.id,
                recruitCount: 20 + index * 5,
                recruitCountCareer: 8 + index * 2,
                applicantCount: 180 + index * 25,
                applicantCountCareer: 54 + index * 10,
                ...(region.name === "경북"
                  ? {
                      examNumberStart: "2026003000",
                      examNumberEnd: "2026003999",
                    }
                  : {}),
              }
            : {
                examId: exam.id,
                regionId: region.id,
                recruitPublicMale: 20 + index * 5,
                recruitPublicFemale: 5 + index,
                recruitRescue: 4 + index,
                recruitAcademicMale: 3 + index,
                recruitAcademicFemale: 2 + index,
                recruitEmtMale: 6 + index,
                recruitEmtFemale: 4 + index,
                applicantPublicMale: 180 + index * 20,
                applicantPublicFemale: 40 + index * 5,
                applicantRescue: 28 + index * 4,
                applicantAcademicMale: 24 + index * 3,
                applicantAcademicFemale: 18 + index * 2,
                applicantEmtMale: 48 + index * 5,
                applicantEmtFemale: 36 + index * 4,
              },
      });
    }

    const subjects = [];
    for (const subject of getSubjects(tenantType)) {
      const createdSubject = await prisma.subject.create({ data: subject });
      subjects.push(createdSubject);
      await prisma.answerKey.createMany({
        data: [previousExam.id, exam.id].flatMap((examId) =>
          Array.from({ length: subject.questionCount }, (_, index) => ({
            examId,
            subjectId: createdSubject.id,
            questionNumber: index + 1,
            correctAnswer: (index % 4) + 1,
            isConfirmed: true,
          }))
        ),
      });
    }

    const examTypes = getExamTypes(tenantType);
    for (const [index, user] of users.entries()) {
      const examType = examTypes[index % examTypes.length];
      const selectedSubjects = subjects.filter((subject) => subject.examType === examType);
      const isFailed = index === 1;
      const isSuspicious = index === 2;
      const subjectScores = selectedSubjects.map((subject, subjectIndex) => {
        const scoreRatio = isFailed && subjectIndex === 0 ? 0.2 : Math.max(0.45, 0.95 - index * 0.025 - subjectIndex * 0.03);
        const correctCount = Math.min(subject.questionCount, Math.round(subject.questionCount * scoreRatio));
        const rawScore = Number((correctCount * subject.pointPerQuestion).toFixed(2));
        return { subject, correctCount, rawScore, isFailed: rawScore < subject.maxScore * 0.4 };
      });
      const totalScore = subjectScores.reduce((sum, item) => sum + item.rawScore, 0);
      const totalMaxScore = selectedSubjects.reduce((sum, subject) => sum + subject.maxScore, 0);
      if (tenantType === "fire" && totalScore < totalMaxScore * 0.6) {
        for (const item of subjectScores) {
          item.isFailed = true;
        }
      }
      const hasSubjectCutoff = subjectScores.some((item) => item.isFailed);
      const bonusType = index <= (tenantType === "police" ? 1 : 2)
        ? BonusType.VETERAN_5
        : BonusType.NONE;
      const declaredBonusRate = bonusType === BonusType.VETERAN_5 ? 0.05 : 0;
      const bonusBaseScore = tenantType === "police"
        ? hasSubjectCutoff
          ? 0
          : totalMaxScore
        : subjectScores
            .filter((item) => !item.isFailed)
            .reduce((sum, item) => sum + item.subject.maxScore, 0);
      const finalScore = Number((totalScore + bonusBaseScore * declaredBonusRate).toFixed(2));
      const gender = examType === ExamType.CAREER_RESCUE ? Gender.MALE : index % 2 === 0 ? Gender.MALE : Gender.FEMALE;
      const submission = await prisma.submission.create({
        data: {
          examId: index === users.length - 1 ? previousExam.id : exam.id,
          userId: user.id,
          regionId: regions[index % regions.length].id,
          examType,
          gender,
          examNumber: `${tenantType === "police" ? "P" : "F"}${String(index + 1).padStart(5, "0")}`,
          totalScore,
          bonusType,
          bonusRate: declaredBonusRate,
          certificateBonus: 0,
          finalScore,
          isSuspicious,
          suspiciousReason: isSuspicious ? "LOCAL_FIXED_SUSPICIOUS_SAMPLE" : null,
          submitDurationMs: isSuspicious ? 500 : 90_000 + index * 1000,
        },
      });

      for (const item of subjectScores) {
        await prisma.subjectScore.create({
          data: {
            submissionId: submission.id,
            subjectId: item.subject.id,
            rawScore: item.rawScore,
            isFailed: item.isFailed,
          },
        });
        await prisma.userAnswer.createMany({
          data: Array.from({ length: item.subject.questionCount }, (_, answerIndex) => {
            const correctAnswer = (answerIndex % 4) + 1;
            const isCorrect = answerIndex < item.correctCount;
            return {
              submissionId: submission.id,
              subjectId: item.subject.id,
              questionNumber: answerIndex + 1,
              selectedAnswer: isCorrect ? correctAnswer : (correctAnswer % 4) + 1,
              isCorrect,
            };
          }),
        });
        await prisma.difficultyRating.create({
          data: {
            submissionId: submission.id,
            subjectId: item.subject.id,
            rating: index % 3 === 0 ? DifficultyRatingLevel.HARD : DifficultyRatingLevel.NORMAL,
          },
        });
      }
    }

    if (tenantType === "police") {
      await prisma.preRegistration.create({
        data: {
          examId: exam.id,
          userId: users.at(-1)!.id,
          regionId: regions[0].id,
          examType: ExamType.PUBLIC,
          gender: Gender.MALE,
          examNumber: "2026000015",
        },
      });
      await prisma.user.update({
        where: { id: users.at(-1)!.id },
        data: {
          smsMarketingConsentAt: new Date("2026-08-08T00:00:00Z"),
          smsMarketingConsentVersion: "police-sms-marketing-v1",
          smsMarketingConsentWithdrawnAt: null,
        },
      });
    }

    await prisma.siteSetting.createMany({
      data: [
        { key: `${tenantType}::site.title`, value: tenantType === "police" ? "경찰 합격예측" : "소방 합격예측" },
        { key: `${tenantType}::site.careerExamEnabled`, value: "true" },
        { key: `${tenantType}::site.mainCardOverviewEnabled`, value: "true" },
        { key: `${tenantType}::site.mainCardDifficultyEnabled`, value: "true" },
        { key: `${tenantType}::site.mainCardCompetitiveEnabled`, value: "true" },
        { key: `${tenantType}::site.mainCardScoreDistributionEnabled`, value: "true" },
        { key: `${tenantType}::site.mainPageAutoRefresh`, value: "false" },
      ],
    });
    await prisma.notice.create({
      data: { tenantType, title: `${tenantType}-local-notice`, content: "개인정보가 없는 로컬 고정 공지입니다.", priority: 10 },
    });
    await prisma.faq.create({
      data: { tenantType, question: `${tenantType} 로컬 FAQ`, answer: "테넌트 격리 검증용 가상 데이터입니다.", priority: 10 },
    });
    await prisma.banner.create({
      data: {
        tenantType,
        zone: "main",
        imageUrl: `/storage/v1/object/public/uploads/${tenantType}/tenant-proof.svg`,
        altText: `${tenantType} local banner`,
        isActive: true,
      },
    });

    return {
      tenantType,
      schema: TENANT_SCHEMAS[tenantType],
      adminId: admin.id,
      requestedAdminId: requestedAdmin?.id ?? null,
      sharedUserId: users[0].id,
      users: await prisma.user.count(),
      submissions: await prisma.submission.count(),
      subjects: await prisma.subject.count(),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const baseUrl = getLocalBaseUrl();
  const results = [];
  for (const tenantType of ["police", "fire"] as const) {
    results.push(await seedTenant(baseUrl, tenantType));
  }
  console.log(JSON.stringify({ sharedLogin, tenantPasswords, adminPasswords, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
