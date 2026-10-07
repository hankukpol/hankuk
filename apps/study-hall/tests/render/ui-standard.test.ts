import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import postcss from "postcss";

/*
 * 화면 기준 확정(DESIGN.md 0절 12항, 운영자 결정 2026-10-07)이 다시 무너지지 않게 막는 검사.
 * - 화면에서 쓰는 .admin-button-* 이름은 모두 globals.css 에 정의돼 있어야 한다(정의 없는 이름 금지).
 * - 대화상자 하단(<DialogActions>)은 취소 → 확인 순서, 채움 버튼은 하나이고 맨 오른쪽(마지막).
 * - 화면마다 Tailwind 로 직접 만든 버튼(rounded·bg·border·px 유틸 + admin- 클래스 없음)은 늘리지 않는다.
 * - 버튼·입력 높이 토큰은 40 / 32 / 48, 768px 미만 44 / 36 이다.
 */

const root = path.resolve(__dirname, "../..");
const files = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const sources = ["app", "components"].flatMap((dir) => files(path.join(root, dir))).filter((file) => file.endsWith(".tsx"));
const read = (file: string) => fs.readFileSync(file, "utf8");
const css = read(path.join(root, "app/globals.css"));

function definedButtonClasses(stylesheet: string) {
  const names = new Set<string>();
  postcss.parse(stylesheet).walkRules((rule) => {
    for (const match of Array.from(rule.selector.matchAll(/\.(admin-button(?:-[a-z0-9]+)*)/g))) names.add(match[1]);
  });
  return names;
}

export function undefinedButtonClasses(source: string, stylesheet: string) {
  const defined = definedButtonClasses(stylesheet);
  const used = new Set(Array.from(source.matchAll(/(?<![a-z0-9-])(admin-button(?:-[a-z0-9]+)+)(?![a-z0-9-])/g)).map((match) => match[1]));
  return Array.from(used).filter((name) => !defined.has(name)).sort();
}

function buttonKinds(block: string) {
  return Array.from(block.matchAll(/<(?:button|a|Link)\b[\s\S]*?className=\{?["`]([^"`]*)["`]/g)).map((match) => {
    const name = match[1];
    if (name.includes("admin-button-primary")) return "P";
    if (/admin-button-danger(?!-)/.test(name)) return "D";
    if (name.includes("admin-button")) return "o";
    return "?";
  });
}

export function dialogFooterProblems(file: string, source: string) {
  const problems: string[] = [];
  for (const match of Array.from(source.matchAll(/<DialogActions>([\s\S]*?)<\/DialogActions>/g))) {
    const kinds = buttonKinds(match[1]);
    const strong = kinds.flatMap((kind, index) => (kind === "P" || kind === "D" ? [index] : []));
    const line = source.slice(0, match.index).split("\n").length;
    if (kinds.includes("?")) problems.push(`${file}:${line} 하단 버튼이 .admin-button 이 아님`);
    if (strong.length > 1) problems.push(`${file}:${line} 채움 버튼이 둘 이상`);
    if (strong.length === 1 && strong[0] !== kinds.length - 1) problems.push(`${file}:${line} 확인 버튼이 맨 오른쪽이 아님`);
  }
  return problems;
}

export function handStyledButtons(source: string) {
  let count = 0;
  for (const match of Array.from(source.matchAll(/<button\b/g))) {
    const head = source.slice(match.index! + 7, match.index! + 600);
    const className = head.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
    if (!className || className.index! > 300) continue;
    const value = className[1] ?? className[2] ?? "";
    if (value.includes("admin-")) continue;
    if (/\brounded|\bbg-|\bborder\b|\bpx-\d|\bpy-\d/.test(value)) count += 1;
  }
  return count;
}

// 2026-10-07 정리 직후 남은 수: 콤보 상자 선택지·사이드바·출결 상태 지정처럼 버튼 모양이 아닌 조작 요소다. 늘리지 않는다.
const HAND_STYLED_BUTTON_CAP = 10;

test("every .admin-button-* name used on screens is defined in globals.css", () => {
  const source = sources.map(read).join("\n");
  assert.deepEqual(undefinedButtonClasses(source, css), []);
});

test("dialog footers put cancel first and a single filled confirm last", () => {
  assert.deepEqual(sources.flatMap((file) => dialogFooterProblems(path.relative(root, file), read(file))), []);
});

test("hand-styled Tailwind buttons do not grow back", () => {
  const total = sources.reduce((sum, file) => sum + handStyledButtons(read(file)), 0);
  assert.ok(total <= HAND_STYLED_BUTTON_CAP, `손으로 만든 버튼 ${total}개 (상한 ${HAND_STYLED_BUTTON_CAP}) — .admin-button 계열을 쓴다`);
});

test("control height tokens follow the 40 / 32 / 48 standard (44 / 36 under 768px)", () => {
  const layer = css.slice(css.indexOf("화면 기준 확정 레이어"));
  assert.match(layer, /--admin-control-height: 40px;/);
  assert.match(layer, /--admin-control-compact: 32px;/);
  assert.match(layer, /--admin-control-large: 48px;/);
  assert.match(layer, /@media \(max-width: 767px\) \{\s*:root \{\s*--admin-control-height: 44px;\s*--admin-control-compact: 36px;/);
});

test("the checks catch the regressions they guard against", () => {
  assert.deepEqual(undefinedButtonClasses(`className="admin-button admin-button-secondary"`, css), ["admin-button-secondary"]);
  const footer = `<DialogActions><button className="admin-button admin-button-primary">저장</button><button className="admin-button">취소</button></DialogActions>`;
  assert.deepEqual(dialogFooterProblems("x.tsx", footer), ["x.tsx:1 확인 버튼이 맨 오른쪽이 아님"]);
  assert.deepEqual(dialogFooterProblems("x.tsx", `<DialogActions><button className="rounded-lg border px-4">취소</button><button className="admin-button admin-button-primary">저장</button></DialogActions>`), ["x.tsx:1 하단 버튼이 .admin-button 이 아님"]);
  assert.equal(handStyledButtons(`<button type="button" className="rounded-lg border px-3 py-2">x</button>`), 1);
  assert.equal(handStyledButtons(`<button type="button" className="admin-button">x</button>`), 0);
});
