import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import postcss from "postcss";
import ts from "typescript";

const root = path.resolve(__dirname, "../..");
const files = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const sources = ["app", "components", "lib"].flatMap((dir) => files(path.join(root, dir))).filter((file) => /\.tsx?$/.test(file));
const strings = sources.flatMap((file) => {
  const tree = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const values: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) values.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return values;
}).join("\n");
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

function inspect(source: string, stylesheet: string) {
  const count = (pattern: RegExp) => Array.from(source.matchAll(pattern)).length;
  const classes = new Set<string>();
  postcss.parse(stylesheet).walkRules((rule) => {
    for (const match of Array.from(rule.selector.matchAll(/\.(admin-[a-z][a-z0-9-]*)/g))) classes.add(match[1]);
  });
  return {
    palette: count(/\b(?:bg|text|border|ring|fill|stroke|accent|outline|divide|decoration|from|via|to)-(?:red|rose|amber|emerald|yellow|green|orange|purple|teal|violet|pink|cyan|lime|fuchsia|stone)-\d+/g),
    // Spacing only: preserve the explicitly allowed seat/icon/dot dimensions.
    spacing: count(/\b(?:[pm][trblxyse]?|gap(?:-[xy])?|space-[xy])-\d+\.5\b/g),
    hoverOpacity: count(/hover:opacity-(?:\d|\[)/g),
    ring: count(/\bring-\d+/g),
    border3: count(/\bborder-3\b/g),
    unused: Array.from(classes).filter((name) => !new RegExp(`(?<![a-z0-9-])${name}(?![a-z0-9-])`).test(source)).sort(),
  };
}

// Verified start: palette361, spacing240, unused6. Stages4/5/6 lowered all caps to zero.
const caps = { palette: 0, spacing: 0, hoverOpacity: 0, ring: 0, border3: 0, unused: [] };

test("design cleanup cannot regress beyond the verified zero budgets", () => {
  assert.deepEqual(inspect(strings, css), caps);
});

test("ratchets detect new palette, spacing, interaction and unused-style regressions", () => {
  const bad = inspect(`${strings}\nbg-red-500 px-2.5 hover:opacity-80 ring-2 border-3`, `${css}\n.admin-never-used-fixture { color: inherit; }`);
  assert.equal(bad.palette, 1);
  assert.equal(bad.spacing, 1);
  assert.equal(bad.hoverOpacity, 1);
  assert.equal(bad.ring, 1);
  assert.equal(bad.border3, 1);
  assert.ok(bad.unused.includes("admin-never-used-fixture"));
  assert.throws(() => assert.deepEqual(bad, caps));
});
