import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyBulkImportMasterIdentity,
  getBulkImportEnrollmentSnapshotMismatches,
  getBulkImportIdentityMismatches,
  mergeBulkImportProgress,
  normalizeBulkImportEditableRow,
  type BulkImportEditableRow,
  type BulkImportMasterSnapshot,
} from '../../src/lib/enrollment-bulk-workflow'

function makeRow(index: number): BulkImportEditableRow {
  const suffix = String(index).padStart(4, '0')
  return {
    sourceLineNumber: index + 2,
    sourceText: `학생${index}\t0101234${suffix}\t990101\tA-${suffix}`,
    name: `학생${index}`,
    phone: `0101234${suffix}`,
    examNumber: `A-${suffix}`,
    cohortLabel: '50',
    birthDate: '990101',
    gender: index % 2 === 0 ? '남' : '여',
    series: '공채',
    memo: `메모 ${index}`,
    photoUrl: '',
    customData: { 지역: '서울', 접수: String(index) },
  }
}

function makeMaster(row: BulkImportEditableRow, id: number): BulkImportMasterSnapshot {
  return {
    id,
    name: row.name,
    phone: row.phone,
    examNumber: row.examNumber,
    birthDate: row.birthDate,
    cohortOptionId: 50,
  }
}

describe('bulk enrollment preflight workflow', () => {
  it('classifies the 278-row operating scenario as 274 clean and 4 conflicts', () => {
    const rows = Array.from({ length: 278 }, (_, index) => makeRow(index + 1))
    const masters = rows.map((row, index) => makeMaster(row, index + 1))

    rows[117] = { ...rows[117]!, name: '다른이름' }
    rows[140] = { ...rows[140]!, birthDate: '000202' }
    rows[166] = { ...rows[166]!, phone: '01099990929' }
    rows[202] = { ...rows[202]!, birthDate: '010303' }

    const conflicts = rows
      .map((row, index) => ({
        lineNumber: row.sourceLineNumber,
        fields: getBulkImportIdentityMismatches(row, masters[index]!),
      }))
      .filter((result) => result.fields.length > 0)

    assert.equal(rows.length - conflicts.length, 274)
    assert.equal(conflicts.length, 4)
    assert.deepEqual(conflicts.map((result) => result.fields), [
      ['name'],
      ['birth_date'],
      ['phone'],
      ['birth_date'],
    ])
  })

  it('applies only master identity fields and preserves course-scoped input values', () => {
    const input = makeRow(17)
    const master: BulkImportMasterSnapshot = {
      id: 901,
      name: '마스터이름',
      phone: '01077778888',
      examNumber: 'MASTER-17',
      birthDate: '1999-03-15',
      cohortOptionId: 12,
    }

    const applied = applyBulkImportMasterIdentity(input, master)

    assert.deepEqual(
      {
        name: applied.name,
        phone: applied.phone,
        examNumber: applied.examNumber,
        birthDate: applied.birthDate,
      },
      {
        name: master.name,
        phone: master.phone,
        examNumber: master.examNumber,
        birthDate: master.birthDate,
      },
    )
    assert.equal(applied.cohortLabel, input.cohortLabel)
    assert.equal(applied.gender, input.gender)
    assert.equal(applied.series, input.series)
    assert.equal(applied.memo, input.memo)
    assert.deepEqual(applied.customData, input.customData)
    assert.notEqual(applied, input)
  })

  it('normalizes a corrected retry row without losing its original line or extra fields', () => {
    const normalized = normalizeBulkImportEditableRow({
      ...makeRow(23),
      sourceLineNumber: 119,
      name: '  홍 길동  ',
      phone: '010-1234-5678',
      examNumber: ' A-0023 ',
      cohortLabel: ' 50 ',
      birthDate: '990315',
      series: ' 공 채 ',
      memo: '  확인 완료 ',
      customData: { 지역: ' 서울 ', 빈값: ' ' },
    })

    assert.equal(normalized.sourceLineNumber, 119)
    assert.equal(normalized.name, '홍 길동')
    assert.equal(normalized.phone, '01012345678')
    assert.equal(normalized.examNumber, 'A-0023')
    assert.equal(normalized.cohortLabel, '50')
    assert.equal(normalized.birthDate, '990315')
    assert.equal(normalized.series, '공 채')
    assert.equal(normalized.memo, '확인 완료')
    assert.deepEqual(normalized.customData, { 지역: '서울' })
  })

  it('keeps the original total and accumulates successful rows across retries', () => {
    assert.deepEqual(
      mergeBulkImportProgress(
        { totalCount: 278, importedCount: 274, errorCount: 4 },
        { totalCount: 4, importedCount: 2, errorCount: 2 },
        true,
      ),
      { totalCount: 278, importedCount: 276, errorCount: 2 },
    )

    assert.deepEqual(
      mergeBulkImportProgress(
        { totalCount: 278, importedCount: 276, errorCount: 2 },
        { totalCount: 2, importedCount: 2, errorCount: 0 },
        true,
      ),
      { totalCount: 278, importedCount: 278, errorCount: 0 },
    )
  })

  it('blocks a conflicting legacy enrollment snapshot before creating a new master', () => {
    const input = {
      ...makeRow(31),
      name: '붙여넣은 다른 이름',
      phone: '01099998888',
    }

    assert.deepEqual(
      getBulkImportEnrollmentSnapshotMismatches(input, {
        name: '기존 수강생',
        phone: '01011112222',
      }),
      ['name', 'phone'],
    )
    assert.deepEqual(
      getBulkImportEnrollmentSnapshotMismatches(
        { name: ' 기존 수강생 ', phone: '010-1111-2222' },
        { name: '기존 수강생', phone: '01011112222' },
      ),
      [],
    )
  })
})
