import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const adminRoot = path.join(root, 'src/app/(admin)')
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? filesIn(target) : target.endsWith('.tsx') ? [target] : []
  })
}
const files = [
  ...filesIn(adminRoot),
  ...filesIn(path.join(root, 'src/app/admin')),
  ...filesIn(path.join(root, 'src/app/super-admin')),
  ...filesIn(path.join(root, 'src/components/admin')),
  ...filesIn(path.join(root, 'src/components/payments')),
]
const problems = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function report(node, reason) {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
    problems.push(`${path.relative(root, file)}:${line + 1}: ${reason}`)
  }
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'autoFocus') {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (!ts.isJsxElement(parent)) continue
        const opening = parent.openingElement
        const isDialog = opening.tagName.getText(source) === 'SeatEditModal'
          || opening.attributes.properties.some((prop) => ts.isJsxAttribute(prop)
            && prop.name.getText(source) === 'role' && prop.initializer
            && ts.isStringLiteral(prop.initializer) && prop.initializer.text === 'dialog')
        if (isDialog) {
          report(node, 'dialog focus must be owned by the modal controller, not autoFocus')
          break
        }
      }
    }
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'badge'
      && node.initializer && ts.isStringLiteral(node.initializer)
      && /^[a-z][a-z\s]+$/i.test(node.initializer.text)) {
      report(node, `decorative English badge: ${node.initializer.text}`)
    }
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(source)
      const staticText = node.children.filter(ts.isJsxText).map((child) => child.text).join(' ').trim()
      const attributes = node.openingElement.attributes.getText(source)
      if (['p', 'div'].includes(tag) && attributes.includes('uppercase') && /^[a-z][a-z\s]+$/i.test(staticText)) {
        report(node, `decorative English heading: ${staticText}`)
      }
      if (['p', 'span', 'div'].includes(tag)) {
        for (const child of node.children.filter(ts.isJsxExpression)) {
          const expression = child.expression?.getText(source) ?? ''
          if (/^(course\.id|course\.slug|tenant\.slug|branch\.slug|membershipsToText\(account\))$/.test(expression) || /slug \$\{course\.slug\}/.test(expression)) {
            report(child, 'internal identifier rendered as supporting text')
          }
        }
      }
      if (tag === 'p' && /^Code\b/.test(staticText)) report(node, 'report-code subtitle')
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'input' && /value=\{form\.slug\}/.test(node.getText(source))) {
      report(node, 'automatic slug shown in a read-only field')
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
assert.deepEqual(problems, [], `Administrator presentation contract violations:\n${problems.join('\n')}`)

const settings = readFileSync(path.join(adminRoot, 'dashboard/courses/[id]/course-detail-page-client.tsx'), 'utf8')
assert.match(settings, /slug: undefined/, 'do not change slug-update API behavior')
assert.match(settings, /form\.settlement_report_code/, 'keep the operational report-code field')
const students = readFileSync(path.join(adminRoot, 'dashboard/courses/[id]/students/course-students-page-client.tsx'), 'utf8')
assert.match(students, /courseId: row\.course\.id/, 'registration still sends course IDs')
assert.match(students, /slug: course\.slug/, 'export contract keeps the underlying slug')
const seats = readFileSync(path.join(adminRoot, 'dashboard/courses/[id]/designated-seats/designated-seats-page-client.tsx'), 'utf8')
assert.match(seats, /\{registrationCode\.code\}/, 'device enrollment codes remain visible')
console.log(`PASS: ${files.length} administrator/payment surfaces checked; metadata hidden and operational identifiers preserved.`)
