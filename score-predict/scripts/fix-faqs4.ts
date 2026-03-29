/**
 * FAQ 추가 오류 수정 스크립트 (4차)
 * 실행: npx tsx scripts/fix-faqs4.ts
 *
 * 수정 항목:
 * 1. ID 19 — "타 지역과의 대략적인 수준 비교 가능" 삭제
 *            (GradeAnalysisTable "전체 입력자 비교" 섹션은 동일 지역·유형·성별 풀만 표시;
 *             result/route.ts의 모든 SQL에 regionId 조건이 포함되어 크로스 지역 비교 불가)
 * 2. ID 22 — "두 기준을 상황에 맞게 활용" → 실제로는 한 가지 기준만 자동 표시됨
 *            (result/route.ts:392 rankingBasis = submissionHasCutoff ? "ALL_PARTICIPANTS" : "NON_CUTOFF_PARTICIPANTS"
 *             → 사용자가 선택하는 것이 아니라 과락 여부에 따라 시스템이 자동 결정)
 * 3. ID 31 — "관리자가 검토 후 공개" → 실제로는 자동 공개
 *            (pass-cut-history/route.ts: runAutoPassCutRelease({trigger:"traffic"})
 *             → 페이지 조회 시 커버리지율·안정성 지수가 기준값 이상이면 자동 공개)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const fixes: Array<{ id: number; question: string; answer: string }> = [
  // ─── ID 19: 크로스 지역 비교 오류 수정 ───────────────────────────
  {
    id: 19,
    question: "다른 지역 점수와 비교하거나 전국 순위를 볼 수 있나요?",
    answer:
      "현재 서비스는 동일 지역·동일 유형(공채 남/여, 경채 분야별) 내의 참여자끼리 순위를 산출합니다. 이는 실제 소방공무원 채용이 지역별로 별도 진행되기 때문입니다.\n\n예를 들어 대구 공채 남자로 입력하면, 대구 공채 남자 참여자 중 내 순위를 확인할 수 있습니다.\n\n'전체 입력자 비교' 섹션에서는 동일 지역·동일 유형의 참여자들에 대한 과목별 평균·최고점·최저점·상위10%·상위30% 평균을 확인할 수 있습니다. 이 데이터는 나와 같은 지역·유형·성별로 접수한 참여자 기준이므로, 타 지역과의 비교는 제공되지 않습니다.\n\n전국 통합 순위 기능은 현재 제공되지 않으며, 향후 업데이트에서 검토할 예정입니다.",
  },

  // ─── ID 22: 순위 기준 설명 수정 (사용자 선택 X → 자동 결정) ───────
  {
    id: 22,
    question: "순위 기준이 '과락 미해당자 기준'과 '전체 참여자 기준' 두 가지인데 어떤 걸 봐야 하나요?",
    answer:
      "본 서비스는 본인의 과락 여부에 따라 순위 기준을 자동으로 결정하며, 결과 화면 상단에 어떤 기준으로 산출되었는지 표시됩니다.\n\n■ 과락이 없는 경우 → '과락 미해당자 기준' 자동 표시\n  - 모든 과목에서 과락이 없는 참여자만을 대상으로 순위를 산출합니다.\n  - 실제 합격을 다툴 수 있는 유효 경쟁자 내에서의 내 위치를 나타냅니다.\n  - 합격예측 등급(확실권·유력권·가능권·도전권)도 이 기준으로 산출됩니다.\n\n■ 과락이 있는 경우 → '전체 참여자 기준' 자동 표시\n  - 과락 여부와 무관하게 모든 참여자를 포함한 순위입니다.\n  - 전체 응시자 중 내 점수 위치를 파악하는 데 참고할 수 있습니다.\n  - 단, 과락이 있으면 필기 합격배수에서 제외되므로 합격예측 등급은 제공되지 않습니다.\n\n합격 여부에 실질적으로 중요한 지표는 '과락 미해당자 기준' 순위이며, 과락이 없는 경우 이 기준으로 자동 표시됩니다.",
  },

  // ─── ID 31: 합격 컷 공개 방식 수정 (관리자 수동 → 자동) ─────────
  {
    id: 31,
    question: "합격 컷 예측 점수는 언제 공개되나요?",
    answer:
      "합격 컷 예측(PassCut) 데이터는 서비스가 참여자 수와 데이터 안정성을 자동으로 평가하여 기준 충족 시 단계적으로 공개합니다.\n\n공개 기준:\n- 커버리지율: 전체 응시 인원 대비 참여자 비율이 일정 수준 이상\n- 안정성 지수: 최근 일정 시간 내 순위 변동이 안정화된 수준\n두 기준이 모두 충족되면 자동으로 해당 차수 데이터가 공개됩니다.\n\n공개 단계:\n- 1차 공개: 참여자 수가 충분히 확보되고 데이터가 안정적일 때 (보통 시험 다음날 이후)\n- 2차~4차 공개: 추가 참여자 누적 및 안정성 기준 재충족 시 순차적으로 업데이트\n\n공개되는 정보:\n- 합격 확실권 점수 (1배수 컷)\n- 합격 유력권 점수\n- 합격 가능권 점수\n- 참여자 수, 커버리지율(전체 응시자 대비 참여 비율), 안정성 지수\n\n데이터가 기준에 미달하거나 응시 인원이 미입력된 경우에는 예측값 대신 현재 수집 중임을 나타내는 상태 메시지가 표시됩니다.",
  },
];

async function main() {
  console.log(`총 ${fixes.length}개의 FAQ를 수정합니다...\n`);

  for (const fix of fixes) {
    try {
      const updated = await prisma.faq.update({
        where: { id: fix.id },
        data: {
          question: fix.question,
          answer: fix.answer,
        },
      });
      console.log(`✓ [ID:${updated.id}] ${fix.question.slice(0, 45)}...`);
    } catch (error) {
      console.error(`✗ 실패 [ID:${fix.id}]:`, error);
    }
  }

  console.log("\n4차 수정 완료.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });