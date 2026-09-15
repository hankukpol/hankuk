import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

test("desktop student table stays in a horizontal scroll frame", () => {
  const source = ts.createSourceFile("StudentListManager.tsx", fs.readFileSync(new URL("../../components/students/StudentListManager.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let tables = 0;
  function visit(node: ts.Node, inFrame = false) {
    if (ts.isJsxElement(node)) {
      const attributes = node.openingElement.attributes.properties;
      const className = attributes.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "className");
      if (className && ts.isJsxAttribute(className) && className.initializer && ts.isStringLiteral(className.initializer)) inFrame ||= className.initializer.text.split(/\s+/).includes("admin-table-frame");
      if (node.openingElement.tagName.getText(source) === "table") {
        tables++;
        assert.ok(inFrame, "A sidebar breakpoint must not push the student table outside the document");
      }
    }
    ts.forEachChild(node, child => visit(child, inFrame));
  }
  visit(source);
  assert.ok(tables > 0);
});
