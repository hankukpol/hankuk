import assert from "node:assert/strict";
import { rewritePromotionFrameNavigation } from "../src/lib/promotions/frame-navigation";

const input = `
  <a class="score-cta" href="#exam-functions">바로 채점</a>
  <a href='/#exam-functions' target="_self">채점하기</a>
  <a href="#other">다른 섹션</a>
`;

const output = rewritePromotionFrameNavigation(input, {
  examFunctionsHref: "/police/exam/input",
});

assert.match(
  output,
  /href="\/police\/exam\/input" target="_top">바로 채점/,
  "기본 CTA는 경찰 채점 화면을 최상위 창에서 열어야 합니다.",
);
assert.match(
  output,
  /href="\/police\/exam\/input" target="_top">채점하기/,
  "슬래시가 붙은 기존 CTA와 기존 target도 안전하게 정규화해야 합니다.",
);
assert.match(output, /href="#other"/, "다른 내부 링크는 변경하지 않아야 합니다.");

console.log("promotion-frame-navigation-test: passed");
