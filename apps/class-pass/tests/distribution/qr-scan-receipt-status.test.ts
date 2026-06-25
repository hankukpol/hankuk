import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function section(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `missing section start: ${startMarker}`)

  const end = endMarker === '<EOF>'
    ? source.length
    : source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(end, -1, `missing section end: ${endMarker}`)

  return source.slice(start, end)
}

describe('QR scan receipt status workflow', () => {
  const serviceSource = readProjectFile('src/lib/distribution/service.ts')
  const scanRouteSource = readProjectFile('src/app/api/distribution/scan/route.ts')
  const staffPageSource = readProjectFile('src/app/(staff)/scan/page.tsx')
  const staffUtilsSource = readProjectFile('src/app/(staff)/scan/scan-page-utils.ts')
  const staffPanelSource = readProjectFile('src/app/(staff)/scan/qr-distribution-panel.tsx')
  const studentPageSource = readProjectFile('src/app/(student)/courses/[courseSlug]/page.tsx')
  const adminMatrixSource = readProjectFile('src/app/(admin)/dashboard/courses/[id]/students/students-matrix-panel.tsx')

  it('does not auto-distribute the only unreceived material on the initial QR scan', () => {
    assert.match(serviceSource, /requireExplicitSelection\?:\s*boolean/)
    assert.match(serviceSource, /materials\.length === 1 && !params\.requireExplicitSelection/)

    const selectionCall = section(
      scanRouteSource,
      'const selection = await resolvePendingDistributionSelection',
      'if (selection.kind ===',
    )
    assert.match(selectionCall, /requireExplicitSelection:/)
    assert.match(selectionCall, /parsed\.data\.materialId == null/)
    assert.match(selectionCall, /parsed\.data\.materialIds\?\.length/)
  })

  it('shows clear staff-facing status when there is no material to receive', () => {
    assert.match(staffPageSource, /'수령자료 없음'/)
    assert.match(staffUtilsSource, /현재 받을 미수령 자료가 없습니다/)
    assert.match(staffPanelSource, /미수령 자료를 확인한 뒤 배부하세요/)
    assert.match(staffPanelSource, /미수령 자료 \{selectOptions\.length\}건/)
  })

  it('keeps student and admin receipt dates as full date strings instead of splitting ko-KR output', () => {
    assert.match(studentPageSource, /formatKoreanDate/)
    assert.match(studentPageSource, /미수령 자료 \{unreceivedMaterials\.length\}건/)
    assert.match(studentPageSource, /미수령 교재 \{unreceivedTextbooks\.length\}건/)
    assert.match(adminMatrixSource, /formatKoreanDate\(receipt\.distributed_at\)/)
    assert.doesNotMatch(adminMatrixSource, /formatDateTime\(receipt\.distributed_at\)\.split\(' '\)\[0\]/)
  })

  it('refreshes the student QR token before the ten-minute token expires', () => {
    assert.match(studentPageSource, /QR_TOKEN_REFRESH_MS\s*=\s*5 \* 60 \* 1000/)
    assert.match(studentPageSource, /qrRefreshTimer = setInterval/)
    assert.match(studentPageSource, /void load\(\)\.catch\(\(\) => null\)/)
    assert.match(studentPageSource, /document\.visibilityState !== 'visible'/)
    assert.match(staffUtilsSource, /학생 수강증을 새로고침하거나 다시 열어 달라고 안내/)
  })
})
