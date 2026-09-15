import assert from "node:assert/strict";
import test from "node:test";
import { formatPrintDocument } from "../../components/exams/analysis/print-document";
const { JSDOM } = require("jsdom");

test("print copy converts metrics and answer pairs to tables without changing the live report", () => {
  const doc: Document = new JSDOM(`<main><div><header><h2>개인 성적</h2></header></div>
    <section role="tabpanel" aria-labelledby="tab">
      <div class="admin-metric-strip" data-report-section="overview">
        ${["0", "자료 없음", "90점"].map(value => `<div class="admin-metric-box"><div class="admin-metric-box-label">점수</div><div class="admin-metric-box-value">${value}</div></div>`).join("")}
      </div>
      <dl class="paper-review-answers"><div><dt>복습 문항</dt><dd><strong>1, 3, 5</strong></dd></div></dl>
      <table id="scores"><tbody><tr><td>기존 성적</td></tr></tbody></table>
    </section></main>`).window.document;
  const source = doc.querySelector("main")!;
  const original = source.innerHTML;
  const copy = source.cloneNode(true) as HTMLElement;
  formatPrintDocument(copy, doc);
  assert.equal(source.innerHTML, original);
  assert.equal(copy.firstElementChild?.tagName, "HEADER");
  assert.equal(copy.querySelectorAll("[role=tabpanel]").length, 0);
  assert.equal(copy.querySelectorAll(".admin-metric-strip").length, 0);
  assert.deepEqual(Array.from(copy.querySelectorAll(".report-summary-table td")).map(cell => cell.textContent), ["0", "자료 없음", "90점"]);
  assert.equal(copy.querySelector(".report-summary-table tr:last-child td")?.getAttribute("colspan"), "3");
  assert.equal(copy.querySelector("caption")?.textContent, "성적 요약");
  assert.equal(copy.querySelector(".report-detail-table td strong")?.textContent, "1, 3, 5");
  assert.equal(copy.querySelector("#scores")?.textContent, "기존 성적");
});

test("unrelated definition lists and empty metric groups are preserved", () => {
  const doc: Document = new JSDOM('<main><dl><dt>일반 항목</dt><dd>내용</dd></dl><div class="admin-metric-strip"></div></main>').window.document;
  const copy = doc.querySelector("main")!;
  formatPrintDocument(copy, doc);
  assert.equal(copy.querySelector("dl")?.textContent, "일반 항목내용");
  assert.equal(copy.querySelectorAll("table").length, 0);
});
