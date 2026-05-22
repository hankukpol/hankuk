import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveBranchSeriesOptionRequestFromOptions } from '../../src/lib/branch-series'
import { parseEnrollmentBulkText } from '../../src/lib/bulk'
import type { BranchSeriesOption } from '../../src/types/database'

const seriesOptions: BranchSeriesOption[] = [
  {
    id: 1,
    branch_id: 1,
    group_key: 'public',
    label: '공채',
    is_default: true,
    is_active: true,
    display_order: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    branch_id: 1,
    group_key: 'career',
    label: '경채',
    is_default: false,
    is_active: true,
    display_order: 10,
    created_at: '',
    updated_at: '',
  },
]

describe('parseEnrollmentBulkText — header mode, empty 기수 (the fix)', () => {
  it('empty 기수 cell in the middle stays undefined so existing cohort is preserved', () => {
    // 기수 컬럼이 중간에 있고 셀이 빈 경우.
    const text = [
      '학번\t기수\t이름\t연락처\t생년월일\t성별\t직렬',
      'A-001\t\t홍길동\t01012345678\t990315\t남\t공채',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cohort_label, undefined, '빈 기수는 undefined여야 함 (기존 값 덮어쓰지 않음)')
    assert.equal(rows[0].exam_number, 'A-001')
    assert.equal(rows[0].name, '홍길동')
    assert.equal(rows[0].gender, '남')
    assert.equal(rows[0].series, '공채')
  })

  it('empty 기수 cell at end stays undefined', () => {
    const text = [
      '학번\t이름\t연락처\t생년월일\t기수',
      'A-001\t홍길동\t01012345678\t990315\t',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cohort_label, undefined)
  })

  it('whitespace-only 기수 cell stays undefined', () => {
    const text = [
      '학번\t기수\t이름\t연락처\t생년월일',
      'A-001\t   \t홍길동\t01012345678\t990315',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cohort_label, undefined)
  })

  it('non-empty 기수 cell is preserved unchanged', () => {
    const text = [
      '학번\t기수\t이름\t연락처\t생년월일\t성별\t직렬',
      'A-001\t50\t홍길동\t01012345678\t990315\t남\t공채',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cohort_label, '50')
  })

  it('header without 기수 column produces undefined cohort_label (no key in payload upstream)', () => {
    const text = [
      '학번\t이름\t연락처\t생년월일',
      'A-001\t홍길동\t01012345678\t990315',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cohort_label, undefined)
  })
})

describe('parseEnrollmentBulkText — header mode, regression guard for other fields', () => {
  it('empty 성별/직렬 stay undefined', () => {
    const text = [
      '학번\t이름\t연락처\t생년월일\t성별\t직렬',
      'A-001\t홍길동\t01012345678\t990315\t\t',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].gender, undefined)
    assert.equal(rows[0].series, undefined)
  })

  it('empty 학번 stays undefined', () => {
    const text = [
      '이름\t학번\t연락처\t생년월일',
      '홍길동\t\t01012345678\t990315',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].exam_number, undefined)
    assert.equal(rows[0].name, '홍길동')
  })
})

describe('parseEnrollmentBulkText — no-header (positional) mode', () => {
  it('exam_number + name + phone + birthdate + gender + series', () => {
    const text = 'A-001\t홍길동\t01012345678\t990315\t남\t공채'

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cohort_label, undefined)
    assert.equal(rows[0].exam_number, 'A-001')
    assert.equal(rows[0].name, '홍길동')
    assert.equal(rows[0].phone, '01012345678')
    assert.equal(rows[0].birth_date, '990315')
    assert.equal(rows[0].gender, '남')
    assert.equal(rows[0].series, '공채')
    assert.equal(rows[0].memo, undefined)
  })

  it('cohort + exam_number prefix detects cohort_label correctly', () => {
    const text = '50\tA-001\t홍길동\t01012345678\t990315\t남\t공채'

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cohort_label, '50')
    assert.equal(rows[0].exam_number, 'A-001')
  })

  it('trailing column is treated as memo when course has no custom fields', () => {
    const text = '50\tA-001\t홍길동\t01012345678\t990315\t남\t공채\t교재 미수령'

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cohort_label, '50')
    assert.equal(rows[0].series, '공채')
    assert.equal(rows[0].memo, '교재 미수령')
  })

  it('memo comes after course custom fields (custom fields filled, memo last)', () => {
    const text = '50\tA-001\t홍길동\t01012345678\t990315\t남\t공채\t공무원\t서울\t교재 미수령'

    const rows = parseEnrollmentBulkText(text, ['직업', '주소'])
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].custom_data, { 직업: '공무원', 주소: '서울' })
    assert.equal(rows[0].memo, '교재 미수령')
  })

  it('no trailing extra column → memo undefined (no false-positive overwrite)', () => {
    const text = 'A-001\t홍길동\t01012345678\t990315\t남\t공채'

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].memo, undefined)
  })
})

describe('parseEnrollmentBulkText — 비고/memo header', () => {
  it('비고 cell with text is captured as memo', () => {
    const text = [
      '이름\t연락처\t생년월일\t비고',
      '홍길동\t01012345678\t990315\t교재 미수령',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].memo, '교재 미수령')
  })

  it('empty 비고 cell stays undefined so existing memo is preserved', () => {
    const text = [
      '이름\t연락처\t생년월일\t비고',
      '홍길동\t01012345678\t990315\t',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].memo, undefined)
  })

  it('memo header aliases (메모/note/remark) are recognized', () => {
    const aliases = ['메모', 'note', 'remark', 'memo']
    for (const alias of aliases) {
      const text = [
        `이름\t연락처\t생년월일\t${alias}`,
        '홍길동\t01012345678\t990315\t환불 요청',
      ].join('\n')

      const rows = parseEnrollmentBulkText(text)
      assert.equal(rows.length, 1, `alias='${alias}' should parse`)
      assert.equal(rows[0].memo, '환불 요청', `alias='${alias}' should set memo`)
    }
  })

  it('multi-row import keeps memo per row independently', () => {
    const text = [
      '이름\t연락처\t생년월일\t비고',
      '홍길동\t01012345678\t990315\t교재 미수령',
      '김소방\t01087654321\t990704\t',
      '박철수\t01011112222\t000123\t환불 요청',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text)
    assert.equal(rows.length, 3)
    assert.equal(rows[0].memo, '교재 미수령')
    assert.equal(rows[1].memo, undefined)
    assert.equal(rows[2].memo, '환불 요청')
  })
})

describe('parseEnrollmentBulkText — custom field handling (the second fix)', () => {
  it('only assigns provided custom fields, leaves omitted ones undefined for merge upstream', () => {
    const text = [
      '이름\t연락처\t생년월일\t직업\t주소',
      '홍길동\t01012345678\t990315\t교사\t',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text, ['직업', '주소'])
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].custom_data, { 직업: '교사' })
  })

  it('maps custom fields by header label even when columns are reordered', () => {
    const text = [
      '이름\t연락처\t생년월일\t주소\t직업',
      '홍길동\t01012345678\t990315\t서울\t교사',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text, [
      { key: 'job', label: '직업' },
      { key: 'address', label: '주소' },
    ])
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].custom_data, { job: '교사', address: '서울' })
  })

  it('omits custom_data entirely when no custom values supplied', () => {
    const text = [
      '이름\t연락처\t생년월일\t직업\t주소',
      '홍길동\t01012345678\t990315\t\t',
    ].join('\n')

    const rows = parseEnrollmentBulkText(text, ['직업', '주소'])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].custom_data, undefined)
  })
})

describe('branch series strict request validation', () => {
  it('rejects an unknown explicit label instead of falling back to the default option', () => {
    const result = resolveBranchSeriesOptionRequestFromOptions(seriesOptions, { label: '공채x' })

    assert.equal(result.option, null)
    assert.match(result.error ?? '', /공채x/)
  })

  it('rejects conflicting option id and label', () => {
    const result = resolveBranchSeriesOptionRequestFromOptions(seriesOptions, {
      optionId: 1,
      label: '경채',
    })

    assert.equal(result.option, null)
    assert.match(result.error ?? '', /일치하지/)
  })
})
