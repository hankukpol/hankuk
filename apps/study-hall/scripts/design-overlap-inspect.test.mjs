import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { inspectOverlaps } from "./design-overlap-inspect.mjs";

test("detects the fixed-width search regression without treating input adornments as overlaps", async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>*{box-sizing:border-box}.admin-filter-bar{display:flex;gap:16px;width:400px}.admin-label{display:block;width:184px;flex-shrink:0}.admin-input-group{width:288px;border:1px solid;display:flex}input,select{height:44px;width:100%;min-width:0}</style><div class="admin-filter-bar"><label class="admin-label">Student<div class="admin-input-group"><span>Search</span><input></div></label><label class="admin-label">Type<select><option>Long exam name</option></select></label></div>`);
    const broken = await page.evaluate(inspectOverlaps);
    assert.equal(broken.checkedControls, 2);
    assert.deepEqual(broken.issues.map(x => x.rule).sort(), ["control-overlap", "field-overflow"]);
    await page.addStyleTag({ content: ".admin-input-group{width:100%;min-width:0}" });
    assert.deepEqual((await page.evaluate(inspectOverlaps)).issues, []);
    await page.setContent('<details><summary>Paste scores</summary><textarea></textarea></details><input>');
    assert.equal((await page.evaluate(inspectOverlaps)).checkedControls, 1, "Closed details content is not painted");
    await page.locator("summary").click();
    assert.equal((await page.evaluate(inspectOverlaps)).checkedControls, 2, "Expanded details are inspected");
  } finally {
    await browser.close();
  }
});
