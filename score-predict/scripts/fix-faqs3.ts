/**
 * FAQ 추가 오류 수정 스크립트 (3차)
 * 실행: npx tsx scripts/fix-faqs3.ts
 *
 * 수정 항목:
 * 1. ID 18 — 재채점 절차 4번 항목 "해당 회원에게 알림 표시" 삭제
 *            (코드에 사용자 대상 재채점 알림 UI 없음 — RescoreDetail.isRead 필드는 DB에 있으나
 *             app/ 하위 어떤 페이지에도 사용자 노출 컴포넌트 없음)
 * 2. ID 25 — "마이페이지 > 회원탈퇴" 메뉴 언급 삭제
 *            (일반 사용자용 마이페이지 라우트가 없음 — /exam/my, /mypage 등 미존재.
 *             탈퇴 처리는 관리자 페이지(/api/admin/users)에서만 가능)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const fixes: Array<{ id: number; question: string; answer: string }> = [
  // ─── ID 18: 재채점 알림 표시 항목 삭제 ───────────────────────────
  {
    id: 18,
    question: "확정 답안이 발표되면 자동으로 재채점이 되나요?",
    answer:
      "네. 관리자가 확정 답안을 업로드하면 해당 시험의 모든 제출자 답안이 자동으로 일괄 재채점됩니다.\n\n재채점 절차:\n1. 관리자가 확정 답안을 시스템에 입력\n2. 전체 제출자 답안과 확정 답안을 대조하여 점수 재산출\n3. 순위 및 합격예측도 함께 갱신\n\n따라서 가답안으로 먼저 입력해도 확정 답안 발표 후 별도 수정 없이 정확한 최종 점수와 순위를 확인할 수 있습니다. 재채점 완료 후에는 결과 페이지를 새로고침하여 변경된 점수와 순위를 직접 확인하세요.\n\n단, 가답안 기간에는 예측이 불안정할 수 있으니 참고용으로만 활용하세요.",
  },

  // ─── ID 25: 마이페이지 > 회원탈퇴 메뉴 언급 삭제 ────────────────
  {
    id: 25,
    question: "회원 탈퇴 시 입력한 데이터는 어떻게 되나요?",
    answer:
      "회원 탈퇴 시 개인식별정보(이름·연락처·비밀번호)는 즉시 삭제됩니다.\n\n제출된 답안 데이터(점수, 순위 통계)는 전체 통계 산출의 정확도 유지를 위해 익명화 처리 후 일정 기간 보관될 수 있습니다. 익명화된 데이터는 개인식별이 불가능하며, 집계 통계 목적으로만 활용됩니다.\n\n개인정보 처리방침의 상세 내용은 회원가입 시 동의한 개인정보 처리방침에서 확인할 수 있습니다.\n\n탈퇴 및 개인정보 삭제 요청은 관리자 이메일로 문의해 주시면 처리해 드립니다.",
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

  console.log("\n3차 수정 완료.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });