import { BonusType } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolvePoliceWrittenBonus } from "../src/lib/police/written-bonus";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function verifyPolicy() {
  const standard = resolvePoliceWrittenBonus({
    bonusType: BonusType.VETERAN_10,
    declaredRate: 0.1,
    recruitCount: 4,
    applicantCount: 100,
    hasCutoff: false,
  });
  assert(standard.status === "APPLIED" && standard.effectiveRate === 0.1, "취업지원 표준 적용 오류");

  const pending = resolvePoliceWrittenBonus({
    bonusType: BonusType.VETERAN_5,
    declaredRate: 0.05,
    recruitCount: 3,
    applicantCount: null,
    hasCutoff: false,
  });
  assert(pending.status === "PENDING" && pending.effectiveRate === 0, "출원인원 미확정 잠정 미적용 오류");

  const exception = resolvePoliceWrittenBonus({
    bonusType: BonusType.HERO_5,
    declaredRate: 0.05,
    recruitCount: 9,
    applicantCount: 9,
    hasCutoff: false,
  });
  assert(exception.reason === "APPLIED_APPLICANT_EXCEPTION", "응시인원 이하 예외 적용 오류");

  const belowMinimum = resolvePoliceWrittenBonus({
    bonusType: BonusType.HERO_3,
    declaredRate: 0.03,
    recruitCount: 9,
    applicantCount: 10,
    hasCutoff: false,
  });
  assert(belowMinimum.status === "NOT_APPLIED" && belowMinimum.effectiveRate === 0, "의사상자 최소 모집인원 오류");

  const cutoff = resolvePoliceWrittenBonus({
    bonusType: BonusType.VETERAN_10,
    declaredRate: 0.1,
    recruitCount: 100,
    applicantCount: 1000,
    hasCutoff: true,
  });
  assert(cutoff.reason === "CUTOFF" && cutoff.effectiveRate === 0, "과락 시 전체 가산점 제외 오류");
}

async function verifySubmissionSafety() {
  const submissionRoute = await readFile(resolve(process.cwd(), "src/app/api/submission/route.ts"), "utf8");
  const scoring = await readFile(resolve(process.cwd(), "src/lib/police/scoring.ts"), "utf8");
  assert(
    !submissionRoute.includes("validateBonusPassCap") &&
      !submissionRoute.includes("getBonusMinRecruitError"),
    "서비스 표본으로 법정 가산점 상한을 추정해 제출을 차단하는 코드가 남아 있습니다."
  );
  assert(
    submissionRoute.includes("resolvePoliceWrittenBonus") &&
      submissionRoute.includes("bonusRate: 0"),
    "경찰 제출이 원점수 우선 정책 판정을 사용하지 않습니다."
  );
  assert(
    scoring.includes("const effectiveBonusRate = hasCutoff ? 0 : bonusRate"),
    "한 과목 과락 시 경찰 가산점 전체 제외가 구현되지 않았습니다."
  );
}

async function main() {
  verifyPolicy();
  await verifySubmissionSafety();
  console.log(JSON.stringify({ policeWrittenBonus: "passed" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
