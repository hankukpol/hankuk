import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildPoliceShadowPrediction,
  POLICE_SHADOW_MODEL_VERSION,
} from "../src/lib/police/shadow-prediction-model";
import {
  POLICE_PREDICTION_MODEL_CALIBRATED,
  POLICE_SAMPLE_RANK_GRADE_OUTPUT_ENABLED,
} from "../src/lib/police/prediction-model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function verifyShadowCalculation() {
  const result = buildPoliceShadowPrediction({
    scoreBands: [
      { score: 220, count: 10 },
      { score: 210, count: 20 },
      { score: 200, count: 30 },
      { score: 190, count: 40 },
      { score: 180, count: 50 },
      { score: 170, count: 60 },
    ],
    recruitCount: 50,
    writtenPassCount: 100,
    applicantCount: 500,
    releaseNumber: 4,
  });

  assert(
    POLICE_SHADOW_MODEL_VERSION === "police-shadow-propensity-sensitivity-v1",
    "관리자 그림자 모델 버전이 고정되지 않았습니다."
  );
  assert(
    result.status === "CALIBRATION_REQUIRED",
    "공식 결과로 교정되지 않은 그림자 모델이 검증 대기 상태가 아닙니다."
  );
  assert(result.participantCount === 210, "점수대별 인원 합계가 참여인원과 다릅니다.");
  assert(result.rawOneMultipleCutScore === 200, "원표본 1배수 컷 계산이 틀렸습니다.");
  assert(result.rawWrittenPassCutScore === 190, "원표본 필기 선발배수 컷 계산이 틀렸습니다.");
  assert(result.scenarioCount === 0, "미교정 모델이 민감도 시나리오 결과를 노출합니다.");
  assert(result.correctedWrittenPassCutScore === null, "미교정 모델이 보정 선발배수를 노출합니다.");
  assert(result.possibleMinScore === null, "미교정 모델이 가능권 경계를 노출합니다.");
  assert(result.likelyMinScore === null, "미교정 모델이 유력권 경계를 노출합니다.");
  assert(result.sureMinScore === null, "미교정 모델이 확실권 경계를 노출합니다.");
  assert(
    result.sensitivityLowScore === null && result.sensitivityHighScore === null,
    "미교정 모델이 민감도 범위를 노출합니다."
  );
  assert(
    result.assumptions.gradeAgreementThresholds.possible === 0.35 &&
      result.assumptions.gradeAgreementThresholds.likely === 0.7 &&
      result.assumptions.gradeAgreementThresholds.sure === 0.9,
    "등급 경계의 시나리오 합의 기준이 응답에 명시되지 않았습니다."
  );

  const merged = buildPoliceShadowPrediction({
    scoreBands: [
      { score: 200, count: 8 },
      { score: 190, count: 12 },
      { score: 200, count: 7 },
      { score: 180, count: 18 },
      { score: 170, count: 20 },
    ],
    recruitCount: 10,
    writtenPassCount: 20,
    applicantCount: 100,
    releaseNumber: 2,
  });
  assert(merged.participantCount === 65, "중복 점수대가 합산되지 않았습니다.");
  assert(merged.rawOneMultipleCutScore === 200, "동점 점수대의 1배수 컷 계산이 틀렸습니다.");
  assert(merged.rawWrittenPassCutScore === 190, "동점 점수대의 선발배수 컷 계산이 틀렸습니다.");

  const sparse = buildPoliceShadowPrediction({
    scoreBands: [
      { score: 200, count: 5 },
      { score: 190, count: 4 },
    ],
    recruitCount: 20,
    writtenPassCount: 40,
    applicantCount: 400,
    releaseNumber: 1,
  });
  assert(sparse.status === "INSUFFICIENT_SAMPLE", "소표본이 계산 가능으로 오판됩니다.");
  assert(sparse.correctedWrittenPassCutScore === null, "소표본에 보정 컷이 생성됩니다.");
  assert(sparse.sureMinScore === null, "소표본에 확실권이 생성됩니다.");

  const belowWrittenPassRank = buildPoliceShadowPrediction({
    scoreBands: [
      { score: 200, count: 12 },
      { score: 190, count: 17 },
      { score: 180, count: 15 },
      { score: 170, count: 15 },
    ],
    recruitCount: 46,
    writtenPassCount: 92,
    applicantCount: 1_035,
    releaseNumber: 4,
  });
  assert(
    belowWrittenPassRank.status === "INSUFFICIENT_SAMPLE",
    "표본이 필기 선발인원보다 적은데 보정 계산 가능으로 오판됩니다."
  );
  assert(
    belowWrittenPassRank.rawWrittenPassCutScore === null,
    "표본에 존재하지 않는 필기 선발배수 컷을 원표본 값으로 만듭니다."
  );
  assert(
    belowWrittenPassRank.correctedWrittenPassCutScore === null,
    "필기 선발인원보다 적은 표본에 보정 컷이 생성됩니다."
  );

  const missingApplicants = buildPoliceShadowPrediction({
    scoreBands: [
      { score: 200, count: 20 },
      { score: 190, count: 20 },
      { score: 180, count: 20 },
    ],
    recruitCount: 10,
    writtenPassCount: 20,
    applicantCount: null,
    releaseNumber: 3,
  });
  assert(missingApplicants.status === "MISSING_APPLICANTS", "출원인원 누락 상태가 구분되지 않습니다.");
  assert(missingApplicants.correctedWrittenPassCutScore === null, "출원인원 없이 보정 컷을 만듭니다.");
}

async function verifyAdminOnlyBoundary() {
  const files = {
    route: await readFile(
      resolve(process.cwd(), "src/app/api/admin/police-prediction-shadow/route.ts"),
      "utf8"
    ),
    page: await readFile(resolve(process.cwd(), "src/app/admin/pass-cut/page.tsx"), "utf8"),
    publicPrediction: await readFile(
      resolve(process.cwd(), "src/lib/police/prediction.ts"),
      "utf8"
    ),
  };

  assert(files.route.includes("requireAdminRoute"), "그림자 모델 API에 관리자 권한 검사가 없습니다.");
  assert(
    files.route.includes('guard.tenantType !== "police"'),
    "그림자 모델 API가 경찰 직렬로 제한되지 않았습니다."
  );
  assert(files.route.includes("publicExposure: false"), "API가 사용자 미노출 상태를 명시하지 않습니다.");
  assert(
    files.page.includes("/api/admin/police-prediction-shadow"),
    "관리자 합격컷 화면이 그림자 모델 API를 사용하지 않습니다."
  );
  assert(files.page.includes("보정모델 검증 대기"), "관리자 화면에 보정 수치 잠금 상태가 없습니다.");
  assert(
    !files.page.includes('row.status === "READY"'),
    "관리자 화면에 미교정 보정 수치 출력 분기가 남아 있습니다."
  );
  assert(
    !files.publicPrediction.includes("shadow-prediction"),
    "학생용 경찰 예측 경로가 그림자 모델을 참조합니다."
  );
  assert(POLICE_PREDICTION_MODEL_CALIBRATED === false, "공개 경찰 모델의 미보정 잠금이 풀렸습니다.");
  assert(
    POLICE_SAMPLE_RANK_GRADE_OUTPUT_ENABLED === false,
    "학생 화면의 표본순위 등급 출력 잠금이 풀렸습니다."
  );
}

async function main() {
  verifyShadowCalculation();
  await verifyAdminOnlyBoundary();
  console.log("경찰 관리자 전용 그림자 합격예측 모델 검증 통과");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
