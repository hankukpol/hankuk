import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ExamType, Gender } from "@prisma/client";
import {
  getFireApplicantCount,
  getFirePassMultiple,
  getFireRecruitCount,
  getFireRecruitmentCohorts,
} from "../src/lib/fire/prediction-policy";
import {
  getPolicePassMultiple,
  getPoliceRecruitCount,
  getPoliceRecruitmentCohorts,
} from "../src/lib/police/prediction-policy";
import { TENANT_EXAM_TYPES, getTenantSubjectOrder } from "../src/lib/tenant-exam";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function read(relativePath: string) {
  return readFile(resolve(process.cwd(), relativePath), "utf8");
}

async function assertMissing(relativePath: string) {
  try {
    await access(resolve(process.cwd(), relativePath));
    throw new Error(`${relativePath}: tenant-default legacy module must not exist.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function verifyActiveCalculationRouting() {
  const activeRoutes = [
    "src/app/api/submission/route.ts",
    "src/app/api/prediction/route.ts",
    "src/app/api/prediction/competitor/route.ts",
    "src/app/api/result/route.ts",
    "src/app/api/final-prediction/route.ts",
    "src/app/api/main-stats/route.ts",
    "src/app/api/pass-cut-history/route.ts",
    "src/app/api/admin/rescore/route.ts",
    "src/app/api/admin/pass-cut-release/route.ts",
  ];
  const forbiddenRootCalculationImports = [
    '@/lib/scoring"',
    '@/lib/prediction"',
    '@/lib/pass-cut"',
    '@/lib/final-prediction"',
  ];

  for (const route of activeRoutes) {
    const source = await read(route);
    for (const forbiddenImport of forbiddenRootCalculationImports) {
      assert(!source.includes(forbiddenImport), `${route}: legacy fire-root calculation import remains (${forbiddenImport}).`);
    }
  }

  for (const legacyModule of [
    "src/lib/scoring.ts",
    "src/lib/prediction.ts",
    "src/lib/pass-cut.ts",
    "src/lib/final-prediction.ts",
    "src/lib/exam-number.ts",
    "src/lib/policy.ts",
    "src/lib/correct-rate.ts",
    "src/lib/mock-data.ts",
  ]) {
    await assertMissing(legacyModule);
  }

  const submission = await read("src/app/api/submission/route.ts");
  assert(submission.includes("calculateTenantScore"), "Submission route does not use tenant scoring dispatch.");
  assert(submission.includes("parseExamType(tenantType"), "Submission exam type is not tenant-scoped.");
  assert(
    submission.includes("resolvePoliceWrittenBonus") &&
      submission.includes("resolveFireWrittenBonus") &&
      !submission.includes("validateBonusPassCap"),
    "Police and fire written-bonus policies are not isolated or a sample-based submission cap remains."
  );

  const prediction = await read("src/app/api/prediction/route.ts");
  assert(prediction.includes("calculateTenantPrediction(tenantType"), "Prediction route does not use tenant prediction dispatch.");

  const finalPrediction = await read("src/app/api/final-prediction/route.ts");
  assert(finalPrediction.includes("policeFinalPrediction"), "Police final-prediction module is not wired.");
  assert(finalPrediction.includes("fireFinalPrediction"), "Fire final-prediction module is not wired.");
  assert(finalPrediction.includes("isExamTypeForTenant"), "Final prediction lacks tenant exam-type rejection.");
  assert(
    finalPrediction.indexOf("if (!isExamTypeForTenant") <
      finalPrediction.indexOf('if (tenantType === "police")'),
    "Final-prediction GET validates the exam type after entering the police calculation branch."
  );

  const stats = await read("src/app/api/stats/route.ts");
  assert(stats.includes("tenantExamTypes"), "Admin stats are not tenant-scoped.");
  assert(stats.includes("recruitCountCareer"), "Police career quota is missing from admin stats.");
  assert(stats.includes("getTenantRecruitmentCohorts"), "Admin stats bypass tenant recruitment cohorts.");
  assert(!stats.includes('LEAST(FLOOR(GREATEST("finalScore", 0) / 10), 24)'), "Admin stats still clamp every tenant to 250 points.");

  const prisma = await read("src/lib/prisma.ts");
  assert(!prisma.includes("SCORE_PREDICT_TENANT"), "A fixed tenant env can still override request-scoped Prisma.");
  assert(!prisma.includes("SCORE_PREDICT_PRISMA_SCHEMA"), "A fixed schema env can still override request-scoped Prisma.");

  const tenantServer = await read("src/lib/tenant.server.ts");
  assert(!tenantServer.includes("TENANT_COOKIE"), "Server tenant resolution still trusts a tenant cookie.");
  assert(!tenantServer.includes("TENANT_HEADER"), "Server tenant resolution still trusts an unsigned tenant header.");

  const mockData = await read("src/app/api/admin/mock-data/route.ts");
  assert(mockData.includes("policeMockData.generateMockData"), "Police mock generation still uses the fire generator.");
  assert(mockData.includes("fireMockData.generateMockData"), "Fire mock generator is not explicitly wired.");

  const adminPreview = await read("src/lib/admin-preview.ts");
  assert(
    adminPreview.includes("TENANT_EXAM_TYPES[tenantType]"),
    "Admin preview candidates are not restricted to the current tenant exam types."
  );

  const examsRoute = await read("src/app/api/exams/route.ts");
  assert(
    examsRoute.includes("examType: { in: [...allowedExamTypes] }") &&
      examsRoute.includes("sortTenantRegions(tenantType"),
    "Exam metadata does not restrict subjects and region ordering by tenant."
  );

  const policeInput = await read("src/app/exam/input/_PolicePage.tsx");
  assert(
    policeInput.includes("Record<PoliceExamType") &&
      !policeInput.includes("ExamType.CAREER_RESCUE") &&
      !policeInput.includes("ExamType.CAREER_ACADEMIC") &&
      !policeInput.includes("ExamType.CAREER_EMT"),
    "Police OMR state still contains fire exam types."
  );

  const fireInput = await read("src/app/exam/input/_FirePage.tsx");
  assert(
    fireInput.includes("Record<FireExamType") && !/ExamType\.CAREER(?!_)/.test(fireInput),
    "Fire OMR state still contains the police career exam type."
  );
}

async function verifyTenantColorRouting() {
  const tailwind = await read("tailwind.config.ts");
  assert(
    tailwind.includes('600: "#2563eb"') && tailwind.includes('600: "#dc2626"'),
    "Police blue and fire red palettes are not both defined."
  );
  assert(
    tailwind.includes('600: "var(--service-600)"'),
    "Shared service color does not resolve through the tenant CSS variable."
  );

  const rootLayout = await read("src/app/layout.tsx");
  assert(rootLayout.includes("data-tenant={tenant.type}"), "Root layout does not expose the tenant palette scope.");

  const sharedBrandSurfaces = [
    "src/app/admin/layout.tsx",
    "src/app/admin/page.tsx",
    "src/components/admin/AdminSidebar.tsx",
    "src/components/admin/DashboardSetupChecklist.tsx",
    "src/components/exam/DifficultySelector.tsx",
    "src/components/exam/OmrInputModeToggle.tsx",
    "src/components/exam/QuickOmrInput.tsx",
    "src/components/exam/RadioOmrInput.tsx",
    "src/components/landing/ExamFunctionArea.tsx",
    "src/components/landing/ExamMainOverviewPanel.tsx",
    "src/components/landing/HeroFallback.tsx",
    "src/components/landing/LiveStatsCounter.tsx",
    "src/components/landing/NoticeBar.tsx",
    "src/components/layout/ExamTabNavigation.tsx",
    "src/components/layout/Header.tsx",
  ];
  for (const surface of sharedBrandSurfaces) {
    const source = await read(surface);
    assert(
      !/(?:bg|text|border|ring)-(?:fire|police)-\d+/.test(source),
      `${surface}: a tenant-specific brand color leaked into a shared surface.`
    );
  }
}

function verifyIndependentRules() {
  assert(
    JSON.stringify(TENANT_EXAM_TYPES.police) === JSON.stringify([ExamType.PUBLIC, ExamType.CAREER]),
    "Police exam types are not isolated."
  );
  assert(
    !TENANT_EXAM_TYPES.fire.includes(ExamType.CAREER) &&
      TENANT_EXAM_TYPES.fire.includes(ExamType.CAREER_RESCUE) &&
      TENANT_EXAM_TYPES.fire.includes(ExamType.CAREER_EMT),
    "Fire exam types are not isolated."
  );

  assert(
    JSON.stringify(getTenantSubjectOrder("police", ExamType.PUBLIC)) ===
      JSON.stringify(["헌법", "형사법", "경찰학"]),
    "Police public subject order is incorrect."
  );
  assert(
    getTenantSubjectOrder("fire", ExamType.PUBLIC).includes("소방학개론") &&
      !getTenantSubjectOrder("fire", ExamType.PUBLIC).includes("헌법"),
    "Fire public subjects are mixed with police subjects."
  );

  for (const recruitCount of [1, 2, 5, 6, 20, 50, 100, 150, 300]) {
    assert(
      getPolicePassMultiple(recruitCount) === 2,
      `Police pass-multiple must be 2.0 for recruit count ${recruitCount}.`
    );
  }
  for (const invalidRecruitCount of [0, -1, 1.5, Number.NaN]) {
    assert(
      getPolicePassMultiple(invalidRecruitCount) === null,
      `Police pass-multiple accepted invalid recruit count ${invalidRecruitCount}.`
    );
  }
  assert(
    getFirePassMultiple(20, ExamType.PUBLIC) === 2.5,
    "Fire public pass-multiple rule changed unexpectedly."
  );
  assert(
    getFirePassMultiple(20, ExamType.CAREER_RESCUE) === 1.8 &&
      getFirePassMultiple(5, ExamType.CAREER_RESCUE) === 2,
    "Fire career pass-multiple rule changed unexpectedly."
  );

  const policeQuota = { recruitCount: 30, recruitCountCareer: 7 };
  assert(getPoliceRecruitCount(policeQuota, ExamType.PUBLIC) === 30, "Police public quota lookup failed.");
  assert(getPoliceRecruitCount(policeQuota, ExamType.CAREER) === 7, "Police career quota lookup failed.");

  const fireQuota = {
    recruitPublicMale: 12,
    recruitPublicFemale: 8,
    recruitRescue: 5,
    recruitAcademicMale: 4,
    recruitAcademicFemale: 3,
    recruitAcademicCombined: 0,
    recruitEmtMale: 6,
    recruitEmtFemale: 2,
  };
  assert(
    getFireRecruitCount(fireQuota, ExamType.PUBLIC, Gender.FEMALE) === 8,
    "Fire gender-split public quota lookup failed."
  );
  assert(
    getFireRecruitCount(fireQuota, ExamType.CAREER_RESCUE, Gender.MALE) === 5,
    "Fire rescue quota lookup failed."
  );

  const separateAcademicCohorts = getFireRecruitmentCohorts(
    fireQuota,
    ExamType.CAREER_ACADEMIC
  );
  assert(
    separateAcademicCohorts.length === 2 &&
      separateAcademicCohorts.some((cohort) => cohort.gender === Gender.MALE && cohort.recruitCount === 4) &&
      separateAcademicCohorts.some((cohort) => cohort.gender === Gender.FEMALE && cohort.recruitCount === 3),
    "Fire academic gender cohorts are incorrect."
  );

  const combinedFireQuota = { ...fireQuota, recruitAcademicCombined: 9 };
  const combinedAcademicCohorts = getFireRecruitmentCohorts(
    combinedFireQuota,
    ExamType.CAREER_ACADEMIC
  );
  assert(
    combinedAcademicCohorts.length === 1 &&
      combinedAcademicCohorts[0]?.gender === null &&
      combinedAcademicCohorts[0]?.populationGender === null &&
      combinedAcademicCohorts[0]?.recruitCount === 9,
    "Fire combined academic recruitment must be one nine-person cohort."
  );
  assert(
    getFireApplicantCount(
      {
        recruitAcademicCombined: 9,
        applicantPublicMale: null,
        applicantPublicFemale: null,
        applicantRescue: null,
        applicantAcademicMale: 30,
        applicantAcademicFemale: 20,
        applicantAcademicCombined: 77,
        applicantEmtMale: null,
        applicantEmtFemale: null,
      },
      ExamType.CAREER_ACADEMIC,
      null
    ) === 77,
    "Fire combined academic applicant count is not isolated."
  );

  const policeCohorts = getPoliceRecruitmentCohorts(policeQuota, ExamType.CAREER);
  assert(
    policeCohorts.length === 1 &&
      policeCohorts[0]?.gender === null &&
      policeCohorts[0]?.recruitCount === 7,
    "Police recruitment must stay a gender-neutral single cohort."
  );
}

async function main() {
  await verifyActiveCalculationRouting();
  await verifyTenantColorRouting();
  verifyIndependentRules();
  console.log(JSON.stringify({ tenantModuleIsolation: "passed" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
