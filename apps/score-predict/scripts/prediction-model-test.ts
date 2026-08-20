import { ExamType } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildFirePredictionBands,
  classifyFirePredictionGrade,
} from "../src/lib/fire/prediction-model";
import { getFirePassMultiple } from "../src/lib/fire/prediction-policy";
import {
  buildPolicePredictionBands,
  classifyPolicePredictionGrade,
  POLICE_PREDICTION_MODEL_CALIBRATED,
  POLICE_PREDICTION_MODEL_VERSION,
  POLICE_SAMPLE_RANK_GRADE_OUTPUT_ENABLED,
  resolvePoliceGradeAvailability,
} from "../src/lib/police/prediction-model";
import {
  getPolicePassMultiple,
  getPoliceWrittenPassCount,
} from "../src/lib/police/prediction-policy";
import {
  getPoliceCareerCutoffScore,
  hasPoliceWrittenCutoff,
} from "../src/lib/police/written-policy";
import {
  calculateKnownFinalScore,
  getAppliedPoliceWrittenBonusRate,
} from "../src/lib/police/final-score-policy";
import {
  calculateSampleTopPercent,
  canShowSampleAverage,
  canShowSampleOneMultiplePoint,
} from "../src/lib/public-sample-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function verifyPoliceModel() {
  assert(
    POLICE_PREDICTION_MODEL_VERSION === "police-2026-2x-rank-first-v2",
    "경찰 예측 모델 버전이 최신 안전 모델과 일치하지 않습니다."
  );
  const passMultiple = getPolicePassMultiple(100);
  assert(passMultiple === 2, "경찰 필기 합격배수는 2배수여야 합니다.");
  assert(getPoliceWrittenPassCount(3, ExamType.CAREER) === 8, "경행경채 3명 모집은 8명을 선발해야 합니다.");
  assert(getPoliceWrittenPassCount(5, ExamType.CAREER) === 10, "경행경채 5명 모집은 10명을 선발해야 합니다.");
  assert(getPoliceWrittenPassCount(6, ExamType.CAREER) === 12, "경행경채 6명 이상은 2배수여야 합니다.");
  assert(getPoliceWrittenPassCount(3, ExamType.PUBLIC) === 6, "공채는 소수 모집도 2배수여야 합니다.");
  assert(getPoliceCareerCutoffScore() === 150, "경행경채 총점 60% 과락선은 150점이어야 합니다.");
  assert(
    hasPoliceWrittenCutoff({ examType: ExamType.CAREER, totalScore: 149.5, subjectScores: [] }),
    "경행경채 150점 미만을 과락 처리하지 않습니다."
  );
  assert(
    !hasPoliceWrittenCutoff({ examType: ExamType.CAREER, totalScore: 150, subjectScores: [{ isFailed: true }] }),
    "경행경채 총점 60% 통과자를 과목별 40%로 오과락 처리합니다."
  );
  const finalScore = calculateKnownFinalScore({
    writtenScore: 262.5,
    fitnessPassed: true,
    martialDanLevel: 2,
    appliedWrittenBonusRate: getAppliedPoliceWrittenBonusRate({
      rawWrittenScore: 237.5,
      finalWrittenScore: 262.5,
    }),
  });
  assert(finalScore.written50 === 52.5, "실제 적용된 필기 가점이 50점 환산에 반영되지 않습니다.");
  assert(finalScore.fitnessBonus25 === 2.5, "실제 적용된 법정 가점이 체력 단계에 반영되지 않습니다.");
  assert(
    getAppliedPoliceWrittenBonusRate({ rawWrittenScore: 237.5, finalWrittenScore: 237.5 }) === 0,
    "필기에 적용되지 않은 선언 가점이 최종예측에 재사용됩니다."
  );

  const reliable = buildPolicePredictionBands({
    recruitCount: 100,
    participantCount: 300,
    referenceApplicantCount: 1000,
    isApplicantCountExact: true,
    passMultiple,
  });
  assert(reliable.sampleStage === "RELIABLE", "경찰 30% 표본이 신뢰 구간에 진입하지 않았습니다.");
  assert(reliable.sureMaxRank === 90, "경찰 확실권은 1배수와 분리된 보수 컷이어야 합니다.");
  assert(reliable.likelyMaxRank === 100, "경찰 유력권 상한은 1배수여야 합니다.");
  assert(reliable.possibleMaxRank === 200, "경찰 가능권 상한은 고정 2배수여야 합니다.");
  assert(classifyPolicePredictionGrade(90, reliable) === "확실권", "경찰 확실권 분류 오류");
  assert(classifyPolicePredictionGrade(91, reliable) === "유력권", "경찰 유력권 분류 오류");
  assert(classifyPolicePredictionGrade(150, reliable) === "가능권", "경찰 가능권 분류 오류");
  assert(classifyPolicePredictionGrade(201, reliable) === "도전권", "경찰 도전권 분류 오류");

  const unavailable = resolvePoliceGradeAvailability({
    featureEnabled: false,
    participantCount: 300,
    recruitCount: 100,
    applicantCount: 1000,
  });
  assert(POLICE_PREDICTION_MODEL_CALIBRATED === false, "캘리브레이션 전 경찰 등급은 잠겨 있어야 합니다.");
  assert(POLICE_SAMPLE_RANK_GRADE_OUTPUT_ENABLED === false, "표본 2배수 기반 경찰 등급 출력은 잠겨 있어야 합니다.");
  assert(unavailable.gradeAvailability === "UNAVAILABLE", "경찰 등급 기본 OFF가 적용되지 않았습니다.");
  assert(unavailable.unavailableReasons.includes("FEATURE_DISABLED"), "기능 비활성 사유가 누락되었습니다.");
  assert(unavailable.unavailableReasons.includes("UNCALIBRATED"), "미보정 사유가 누락되었습니다.");

  const tripleGate = resolvePoliceGradeAvailability({
    featureEnabled: true,
    calibrated: true,
    participantCount: 29,
    recruitCount: 10,
    applicantCount: 100,
  });
  assert(
    tripleGate.unavailableReasons.includes("INSUFFICIENT_SAMPLE"),
    "절대 표본·모집인원 대비·참여율 3중 게이트가 적용되지 않았습니다."
  );

  const initial = buildPolicePredictionBands({
    recruitCount: 100,
    participantCount: 49,
    referenceApplicantCount: 1000,
    isApplicantCountExact: true,
    passMultiple,
  });
  assert(initial.sampleStage === "INITIAL", "경찰 5% 미만 표본 단계 오류");
  assert(initial.sureMaxRank === 0 && initial.likelyMaxRank === 0, "초기 경찰 표본이 과신되고 있습니다.");
  assert(classifyPolicePredictionGrade(1, initial) === "가능권", "초기 경찰 표본은 확실·유력권을 표시하면 안 됩니다.");

  const estimated = buildPolicePredictionBands({
    recruitCount: 100,
    participantCount: 400,
    referenceApplicantCount: 1000,
    isApplicantCountExact: false,
    passMultiple,
  });
  assert(estimated.sampleStage === "ESTIMATED", "경찰 추정 출원인원 단계 오류");
  assert(estimated.sureMaxRank === 0, "출원인원 미확정 상태에서 경찰 확실권을 표시하면 안 됩니다.");

  const forming = buildPolicePredictionBands({
    recruitCount: 100,
    participantCount: 150,
    referenceApplicantCount: 1000,
    isApplicantCountExact: true,
    passMultiple,
  });
  assert(forming.sampleStage === "FORMING", "경찰 15% 표본 단계 오류");
  assert(forming.sureMaxRank === 75, "경찰 예측 윤곽 단계의 확실권 안전계수 오류");
}

function verifyPublicSamplePolicy() {
  assert(!canShowSampleAverage(14) && canShowSampleAverage(15), "입력자 평균 공개 하한은 15명이어야 합니다.");
  assert(!canShowSampleOneMultiplePoint(29, 2), "소수 모집에서 30명 미만 표본 1배수 지점이 공개됩니다.");
  assert(!canShowSampleOneMultiplePoint(99, 100), "모집인원보다 적은 표본으로 1배수 지점이 공개됩니다.");
  assert(canShowSampleOneMultiplePoint(100, 100), "공개 기준을 충족한 표본 1배수 지점이 차단됩니다.");
  assert(calculateSampleTopPercent(1, 1) === null, "소표본 상위 비율이 노출됩니다.");
  assert(calculateSampleTopPercent(1, 20) === 5, "표본 상위 비율 산식이 등수 기준과 다릅니다.");
}

function verifyFireModel() {
  const publicPassMultiple = getFirePassMultiple(100, ExamType.PUBLIC);
  assert(publicPassMultiple === 1.5, "소방 공채 100명 선발 배수는 1.5배수여야 합니다.");

  const publicBands = buildFirePredictionBands({
    recruitCount: 100,
    participantCount: 300,
    referenceApplicantCount: 1000,
    isApplicantCountExact: true,
    passMultiple: publicPassMultiple,
  });
  assert(publicBands.sureMaxRank === 85, "소방 확실권 안전계수가 경찰과 분리되지 않았습니다.");
  assert(publicBands.likelyMaxRank === 100, "소방 유력권 상한 오류");
  assert(publicBands.possibleMaxRank === 150, "소방 공채 가능권 상한 오류");
  assert(classifyFirePredictionGrade(85, publicBands) === "확실권", "소방 확실권 분류 오류");
  assert(classifyFirePredictionGrade(86, publicBands) === "유력권", "소방 유력권 분류 오류");
  assert(classifyFirePredictionGrade(125, publicBands) === "가능권", "소방 가능권 분류 오류");
  assert(classifyFirePredictionGrade(151, publicBands) === "도전권", "소방 도전권 분류 오류");

  const careerPassMultiple = getFirePassMultiple(5, ExamType.CAREER_RESCUE);
  assert(careerPassMultiple === 2, "소방 소수 경채 배수표가 변경되었습니다.");
  const careerBands = buildFirePredictionBands({
    recruitCount: 5,
    participantCount: 30,
    referenceApplicantCount: 100,
    isApplicantCountExact: true,
    passMultiple: careerPassMultiple,
  });
  assert(careerBands.possibleMaxRank === 10, "소방 소수 경채 가능권 상한 오류");
}

async function verifySourceIsolation() {
  const files = {
    policeModel: await readFile(resolve(process.cwd(), "src/lib/police/prediction-model.ts"), "utf8"),
    fireModel: await readFile(resolve(process.cwd(), "src/lib/fire/prediction-model.ts"), "utf8"),
    policePrediction: await readFile(resolve(process.cwd(), "src/lib/police/prediction.ts"), "utf8"),
    firePrediction: await readFile(resolve(process.cwd(), "src/lib/fire/prediction.ts"), "utf8"),
    policeAutoRelease: await readFile(resolve(process.cwd(), "src/lib/police/pass-cut-auto-release.ts"), "utf8"),
    fireAutoRelease: await readFile(resolve(process.cwd(), "src/lib/fire/pass-cut-auto-release.ts"), "utf8"),
    policePassCut: await readFile(resolve(process.cwd(), "src/lib/police/pass-cut.ts"), "utf8"),
    firePassCut: await readFile(resolve(process.cwd(), "src/lib/fire/pass-cut.ts"), "utf8"),
    policeFinalPrediction: await readFile(resolve(process.cwd(), "src/lib/police/final-prediction.ts"), "utf8"),
    calibrationSnapshot: await readFile(resolve(process.cwd(), "src/lib/police/calibration-snapshot.ts"), "utf8"),
    prismaSchema: await readFile(resolve(process.cwd(), "prisma/schema.prisma"), "utf8"),
    dashboard: await readFile(resolve(process.cwd(), "src/components/prediction/PredictionLiveDashboard.tsx"), "utf8"),
    predictionRoute: await readFile(resolve(process.cwd(), "src/lib/police/prediction.ts"), "utf8"),
    faqFix: await readFile(resolve(process.cwd(), "scripts/fix-faqs.ts"), "utf8"),
  };

  assert(!files.policeModel.includes("/fire/"), "경찰 예측 모델이 소방 모듈을 참조합니다.");
  assert(!files.fireModel.includes("/police/"), "소방 예측 모델이 경찰 모듈을 참조합니다.");
  assert(
    files.policePrediction.includes("buildPolicePredictionBands") &&
      !files.policePrediction.includes("buildFirePredictionBands"),
    "경찰 실시간 예측이 경찰 전용 모델로 연결되지 않았습니다."
  );
  assert(
    files.firePrediction.includes("buildFirePredictionBands") &&
      !files.firePrediction.includes("buildPolicePredictionBands"),
    "소방 실시간 예측이 소방 전용 모델로 연결되지 않았습니다."
  );
  assert(
    files.policePassCut.includes("buildPolicePredictionBands") &&
      !files.policePassCut.includes("buildFirePredictionBands"),
    "경찰 컷 계산이 경찰 전용 모델로 연결되지 않았습니다."
  );
  assert(
    files.firePassCut.includes("buildFirePredictionBands") &&
      !files.firePassCut.includes("buildPolicePredictionBands"),
    "소방 컷 계산이 소방 전용 모델로 연결되지 않았습니다."
  );
  for (const [name, source] of [
    ["policeAutoRelease", files.policeAutoRelease],
    ["fireAutoRelease", files.fireAutoRelease],
  ] as const) {
    assert(
      source.includes("row.applicantCount ?? row.estimatedApplicants"),
      `${name}: 컷 공개 참여율이 전체 출원인원을 분모로 사용하지 않습니다.`
    );
    assert(
      !source.includes("row.recruitCount * passMultiple"),
      `${name}: 컷 공개 참여율에 합격배수 모집인원이 남아 있습니다.`
    );
  }
  assert(
    !files.dashboard.includes("0.15점 차이") && !files.dashboard.includes("1배수(92등)"),
    "합격예측 화면에 과거 목업 경합 값이 남아 있습니다."
  );
  assert(!files.dashboard.includes("marginRank"), "표본 순위와 모집단 경계를 뺀 여유 등수가 남아 있습니다.");
  assert(
    files.predictionRoute.includes("gradeAvailability") &&
      files.predictionRoute.includes("predictionGrade: PredictionGrade | null") &&
      files.predictionRoute.includes("const passCount: number | null = null") &&
      files.predictionRoute.includes("const passLineScore: number | null = null"),
    "경찰 등급이 서버 응답에서 차단되지 않았습니다."
  );
  assert(
    files.dashboard.includes("style={{ width: `${d.percent}%` }}"),
    "합격예측 분포 막대가 실제 인원 비율을 사용하지 않습니다."
  );
  assert(
    !files.faqFix.includes("1.2배 이내") && files.faqFix.includes("고정 2배수"),
    "FAQ 보정 스크립트가 예전 공통 1.2배 기준을 다시 적용할 수 있습니다."
  );
  assert(
    files.policeFinalPrediction.includes("quota.exam.policeWrittenPassMultiple") &&
      files.policeFinalPrediction.includes("getPassMultiple(") ,
    "경찰 최종예측이 시험별 저장 필기 합격배수를 사용하지 않습니다."
  );
  assert(
    files.calibrationSnapshot.includes("examId_regionId_examType_phase_modelVersion") &&
      files.prismaSchema.includes("@@unique([examId, regionId, examType, phase, modelVersion])"),
    "경찰 캘리브레이션 스냅샷이 모델 버전별로 보존되지 않습니다."
  );
}

async function main() {
  verifyPoliceModel();
  verifyPublicSamplePolicy();
  verifyFireModel();
  await verifySourceIsolation();

  console.log(JSON.stringify({ predictionModel: "passed" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
