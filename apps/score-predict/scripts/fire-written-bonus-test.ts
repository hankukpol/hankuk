import { BonusType } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  finalizeFireWrittenBonus,
  resolveFireWrittenBonus,
} from "../src/lib/fire/written-bonus";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function verifyPolicy() {
  const veteranBelowMinimum = resolveFireWrittenBonus({
    bonusType: BonusType.VETERAN_5,
    declaredRate: 0.05,
    recruitCount: 3,
  });
  assert(
    veteranBelowMinimum.status === "NOT_APPLIED" &&
      veteranBelowMinimum.effectiveRate === 0,
    "소방 취업지원 가산점 최소 모집인원 판정 오류"
  );

  const veteranApplied = resolveFireWrittenBonus({
    bonusType: BonusType.VETERAN_10,
    declaredRate: 0.1,
    recruitCount: 4,
  });
  assert(
    veteranApplied.status === "APPLIED" && veteranApplied.effectiveRate === 0.1,
    "소방 취업지원 가산점 적용 오류"
  );

  const heroBelowMinimum = resolveFireWrittenBonus({
    bonusType: BonusType.HERO_3,
    declaredRate: 0.03,
    recruitCount: 9,
  });
  assert(
    heroBelowMinimum.status === "NOT_APPLIED" && heroBelowMinimum.effectiveRate === 0,
    "소방 의사상자 가산점 최소 모집인원 판정 오류"
  );

  const heroApplied = resolveFireWrittenBonus({
    bonusType: BonusType.HERO_5,
    declaredRate: 0.05,
    recruitCount: 10,
  });
  assert(
    heroApplied.status === "APPLIED" && heroApplied.effectiveRate === 0.05,
    "소방 의사상자 가산점 적용 오류"
  );

  const cutoff = finalizeFireWrittenBonus(heroApplied, 0);
  assert(
    cutoff.status === "NOT_APPLIED" && cutoff.reason === "CUTOFF",
    "소방 과락 가산점 안내 판정 오류"
  );
}

async function verifySubmissionSafety() {
  const submissionRoute = await readFile(
    resolve(process.cwd(), "src/app/api/submission/route.ts"),
    "utf8"
  );
  const scoring = await readFile(
    resolve(process.cwd(), "src/lib/fire/scoring.ts"),
    "utf8"
  );

  assert(
    submissionRoute.includes("resolveFireWrittenBonus") &&
      !submissionRoute.includes("validateBonusPassCap") &&
      !submissionRoute.includes("getBonusMinRecruitError"),
    "소방 제출 경로에 표본 기반 제출 차단이 남아 있습니다."
  );
  assert(
    scoring.includes("resolveFireWrittenBonus") &&
      scoring.includes("bonusRate: bonusDecision.effectiveRate"),
    "소방 재채점이 모집인원별 법정 가산점 정책을 사용하지 않습니다."
  );
}

async function main() {
  verifyPolicy();
  await verifySubmissionSafety();
  console.log(JSON.stringify({ fireWrittenBonus: "passed" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
