const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')

const root = process.cwd()
const PUBLIC_LABEL = '\uacf5\ucc44'
const CAREER_LABEL = '\uacbd\ucc44'
const CAREER_DETAIL_LABEL = '\uacbd\ud589\uacbd\ucc44'

function loadEnv() {
  const envText = fs.readFileSync('.env.local', 'utf8')
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    const key = trimmed.slice(0, index)
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    process.env[key] = process.env[key] || value
  }
}

function createTsLoader() {
  const cache = new Map()

  function resolveLocal(id, baseDir) {
    const base = id.startsWith('@/')
      ? path.join(root, 'src', id.slice(2))
      : path.resolve(baseDir, id)
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
    ]
    const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    if (!found) throw new Error(`Cannot resolve ${id} from ${baseDir}`)
    return found
  }

  function loadTs(file) {
    const abs = path.resolve(root, file)
    if (cache.has(abs)) return cache.get(abs).exports

    const source = fs.readFileSync(abs, 'utf8')
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText
    const mod = { exports: {} }
    cache.set(abs, mod)

    const localRequire = (id) => {
      if (id === 'server-only') return {}
      if (id === 'next/cache') return { revalidateTag: () => undefined, unstable_cache: (fn) => fn }
      if (id.startsWith('.') || id.startsWith('@/')) {
        return loadTs(path.relative(root, resolveLocal(id, path.dirname(abs))))
      }
      return require(id)
    }

    vm.runInNewContext(js, {
      require: localRequire,
      exports: mod.exports,
      module: mod,
      console,
      process,
      Intl,
      Date,
      Set,
      Map,
      Number,
      Math,
      String,
      Array,
      Boolean,
      URLSearchParams,
    }, { filename: abs })
    return mod.exports
  }

  return loadTs
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Supabase env missing')
const host = new URL(url).hostname
if (!/^(127\.0\.0\.1|localhost)$/.test(host)) {
  throw new Error(`Refusing to write non-local Supabase host: ${host}`)
}

const db = createClient(url, key, {
  db: { schema: 'class_pass' },
  auth: { persistSession: false, autoRefreshToken: false },
})
const loadTs = createTsLoader()
const { buildSettlementReport } = loadTs('src/lib/payments/settlement-report.ts')
const { listSettlementDetailPayments } = loadTs('src/lib/payments/service.ts')
const { getPaymentSettlement, summarizeSettlementRows } = loadTs('src/lib/payments/settlement.ts')

const targetDivision = 'codex-settlement-audit'
const noiseDivision = 'codex-settlement-noise'
const divisions = [targetDivision, noiseDivision]
const day = '2026-04-15'
const nextDay = '2026-04-16'
const monthFrom = '2026-04-01'
const monthTo = '2026-04-30'
const marker = 'codex-settlement-audit'
const refundReceiptBase = Number(process.env.CODEX_SETTLEMENT_AUDIT_RECEIPT_BASE || (800000 + (Date.now() % 100000)))
const paymentReceiptBase = Number(process.env.CODEX_SETTLEMENT_AUDIT_PAYMENT_RECEIPT_BASE || (700000 + (Date.now() % 100000)))

function refundReceiptNo(mmdd, offset) {
  return `${mmdd}-R${String(refundReceiptBase + offset).padStart(3, '0')}`
}

function paymentReceiptNo(mmdd, offset) {
  return `${mmdd}-${String(paymentReceiptBase + offset).padStart(3, '0')}`
}

async function must(result, label) {
  const resolved = await result
  if (resolved.error) throw new Error(`${label}: ${resolved.error.message}`)
  return resolved.data
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function deleteInChunks(table, column, ids) {
  const normalized = Array.from(new Set(ids.filter(Boolean)))
  for (const part of chunk(normalized, 500)) {
    for (;;) {
      const deleted = await must(db.from(table).delete().in(column, part).select(column), `delete ${table}`)
      if (!deleted || deleted.length < 1000) break
    }
  }
}

async function selectAll(buildQuery, label) {
  const pageSize = 1000
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await must(buildQuery().range(offset, offset + pageSize - 1), label)
    rows.push(...(page || []))
    if (!page || page.length < pageSize) break
  }
  return rows
}

async function cleanup() {
  const courses = await selectAll(
    () => db.from('courses').select('id').in('division', divisions).order('id', { ascending: true }),
    'load cleanup courses',
  )
  const courseIds = courses.map((row) => row.id)
  if (courseIds.length > 0) {
    const enrollments = await selectAll(
      () => db.from('enrollments').select('id').in('course_id', courseIds).order('id', { ascending: true }),
      'load cleanup enrollments',
    )
    const enrollmentIds = enrollments.map((row) => row.id)
    const payments = await selectAll(
      () => db.from('enrollment_payments').select('id').in('course_id', courseIds).order('id', { ascending: true }),
      'load cleanup payments',
    )
    const paymentIds = payments.map((row) => row.id)
    await deleteInChunks('enrollment_refunds', 'payment_id', paymentIds)
    await deleteInChunks('payment_events', 'payment_id', paymentIds)
    await deleteInChunks('enrollment_payment_items', 'payment_id', paymentIds)
    await deleteInChunks('enrollment_payments', 'id', paymentIds)
    await deleteInChunks('enrollment_billing', 'enrollment_id', enrollmentIds)
    await deleteInChunks('enrollments', 'id', enrollmentIds)
    await deleteInChunks('courses', 'id', courseIds)
  }

  const branches = await selectAll(
    () => db.from('branches').select('id').in('slug', divisions).order('id', { ascending: true }),
    'load cleanup branches',
  )
  const branchIds = branches.map((row) => row.id)
  await deleteInChunks('branch_series_options', 'branch_id', branchIds)
  await deleteInChunks('branches', 'id', branchIds)
}

async function insertRows(table, rows, label, size = 500) {
  const inserted = []
  for (const part of chunk(rows, size)) {
    const data = await must(db.from(table).insert(part).select('*'), label)
    inserted.push(...(data || []))
  }
  return inserted
}

function expectEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
  console.log(`PASS ${label}: ${actual}`)
}

async function seedAuditData() {
  const branches = await insertRows('branches', [
    {
      slug: targetDivision,
      name: 'Codex Settlement Audit',
      track_type: 'police',
      description: marker,
      admin_title: 'Audit Admin',
      series_label: 'Series',
      region_label: 'Region',
      app_name: 'Audit',
      theme_color: '#1A237E',
    },
    {
      slug: noiseDivision,
      name: 'Codex Settlement Noise',
      track_type: 'police',
      description: marker,
      admin_title: 'Noise Admin',
      series_label: 'Series',
      region_label: 'Region',
      app_name: 'Noise',
      theme_color: '#1A237E',
    },
  ], 'insert branches')
  const branchBySlug = Object.fromEntries(branches.map((branch) => [branch.slug, branch]))

  await insertRows('branch_series_options', [
    { branch_id: branchBySlug[targetDivision].id, group_key: 'public', label: PUBLIC_LABEL, is_default: true, display_order: 0 },
    { branch_id: branchBySlug[targetDivision].id, group_key: 'career', label: CAREER_LABEL, is_default: false, display_order: 10 },
    { branch_id: branchBySlug[targetDivision].id, group_key: 'career', label: CAREER_DETAIL_LABEL, is_default: false, display_order: 20 },
    { branch_id: branchBySlug[noiseDivision].id, group_key: 'public', label: PUBLIC_LABEL, is_default: true, display_order: 0 },
  ], 'insert series')

  const courses = await insertRows('courses', [
    { division: targetDivision, name: 'Codex Settlement Course A', slug: 'codex-settlement-audit-a', course_type: 'general', status: 'active', tuition_amount: 300000 },
    { division: targetDivision, name: 'Codex Settlement Course B', slug: 'codex-settlement-audit-b', course_type: 'general', status: 'active', tuition_amount: 120000 },
    { division: noiseDivision, name: 'Codex Settlement Noise', slug: 'codex-settlement-noise', course_type: 'general', status: 'active', tuition_amount: 1000 },
  ], 'insert courses')
  const courseA = courses.find((course) => course.slug === 'codex-settlement-audit-a')
  const courseB = courses.find((course) => course.slug === 'codex-settlement-audit-b')
  const noiseCourse = courses.find((course) => course.slug === 'codex-settlement-noise')

  const enrollments = await insertRows('enrollments', [
    { course_id: courseA.id, name: 'Audit A Partial Refund', phone: '010-9000-0001', exam_number: 'AUD-A', series_group: 'public', series: PUBLIC_LABEL, custom_data: { marker } },
    { course_id: courseA.id, name: 'Audit B Next Day Full Refund', phone: '010-9000-0002', exam_number: 'AUD-B', series_group: 'career', series: CAREER_DETAIL_LABEL, custom_data: { marker } },
    { course_id: courseA.id, name: 'Audit C Textbook Partial Refund', phone: '010-9000-0003', exam_number: 'AUD-C', series_group: 'public', series: PUBLIC_LABEL, custom_data: { marker } },
    { course_id: courseA.id, name: 'Audit D Prior Month Refund', phone: '010-9000-0004', exam_number: 'AUD-D', series_group: 'public', series: PUBLIC_LABEL, custom_data: { marker } },
    { course_id: courseA.id, name: 'Audit E Voided Payment', phone: '010-9000-0005', exam_number: 'AUD-E', series_group: 'public', series: PUBLIC_LABEL, custom_data: { marker } },
    { course_id: courseA.id, name: 'Audit F Bulk Payments', phone: '010-9000-0006', exam_number: 'AUD-F', series_group: 'public', series: PUBLIC_LABEL, custom_data: { marker } },
    { course_id: courseB.id, name: 'Audit G Other Course', phone: '010-9000-0007', exam_number: 'AUD-G', series_group: 'career', series: CAREER_LABEL, custom_data: { marker } },
    { course_id: noiseCourse.id, name: 'Audit Noise', phone: '010-9000-0999', exam_number: 'AUD-N', series_group: 'public', series: PUBLIC_LABEL, custom_data: { marker } },
  ], 'insert enrollments')
  const byExam = Object.fromEntries(enrollments.map((enrollment) => [enrollment.exam_number, enrollment]))

  const noisePayment = (await insertRows('enrollment_payments', [{
    enrollment_id: byExam['AUD-N'].id,
    course_id: noiseCourse.id,
    amount: 2000,
    method: 'cash',
    status: 'partial_refunded',
    category: 'tuition',
    paid_at: '2026-04-15T08:00:00+09:00',
    display_receipt_no: paymentReceiptNo('0415', 0),
    memo: marker,
    installment_months: 0,
    series_group_snapshot: 'public',
    series_label_snapshot: PUBLIC_LABEL,
  }], 'insert noise payment'))[0]
  await insertRows('enrollment_refunds', Array.from({ length: 1005 }, (_, index) => ({
    payment_id: noisePayment.id,
    amount: 1,
    method: 'cash',
    reason_category: 'other',
    reason: `noise refund ${index + 1}`,
    refunded_at: '2026-04-15T08:30:00+09:00',
    display_receipt_no: refundReceiptNo('0415', index),
    memo: marker,
  })), 'insert noise refunds')

  const basePayments = await insertRows('enrollment_payments', [
    { enrollment_id: byExam['AUD-A'].id, course_id: courseA.id, amount: 300000, method: 'card', status: 'partial_refunded', category: 'tuition', paid_at: '2026-04-15T09:00:00+09:00', display_receipt_no: paymentReceiptNo('0415', 1000), memo: marker, card_last4: '1111', card_company: 'KB', installment_months: 0, series_group_snapshot: 'public', series_label_snapshot: PUBLIC_LABEL },
    { enrollment_id: byExam['AUD-B'].id, course_id: courseA.id, amount: 200000, method: 'cash', status: 'fully_refunded', category: 'tuition', paid_at: '2026-04-15T10:00:00+09:00', display_receipt_no: paymentReceiptNo('0415', 1001), memo: marker, installment_months: 0, series_group_snapshot: 'career', series_label_snapshot: CAREER_DETAIL_LABEL },
    { enrollment_id: byExam['AUD-C'].id, course_id: courseA.id, amount: 50000, method: 'bank_transfer', status: 'partial_refunded', category: 'textbook', paid_at: '2026-04-15T11:00:00+09:00', display_receipt_no: paymentReceiptNo('0415', 1002), memo: marker, installment_months: 0, bank_name: 'Audit Bank', bank_account_last4: '3333', depositor_name: 'Audit C', series_group_snapshot: 'public', series_label_snapshot: PUBLIC_LABEL },
    { enrollment_id: byExam['AUD-D'].id, course_id: courseA.id, amount: 80000, method: 'card', status: 'partial_refunded', category: 'tuition', paid_at: '2026-03-31T23:30:00+09:00', display_receipt_no: paymentReceiptNo('0331', 1003), memo: marker, installment_months: 0, card_last4: '4444', card_company: 'NH', series_group_snapshot: 'public', series_label_snapshot: PUBLIC_LABEL },
    { enrollment_id: byExam['AUD-E'].id, course_id: courseA.id, amount: 99999, method: 'card', status: 'voided', category: 'tuition', paid_at: '2026-04-15T12:00:00+09:00', display_receipt_no: paymentReceiptNo('0415', 1004), memo: marker, installment_months: 0, card_last4: '5555', card_company: 'SAMSUNG', series_group_snapshot: 'public', series_label_snapshot: PUBLIC_LABEL },
    { enrollment_id: byExam['AUD-G'].id, course_id: courseB.id, amount: 120000, method: 'card', status: 'partial_refunded', category: 'exam_fee', paid_at: '2026-04-20T13:00:00+09:00', display_receipt_no: paymentReceiptNo('0420', 1005), memo: marker, installment_months: 0, card_last4: '7777', card_company: 'HYUNDAI', series_group_snapshot: 'career', series_label_snapshot: CAREER_LABEL },
  ], 'insert base payments')
  const byEnrollment = new Map(basePayments.map((payment) => [payment.enrollment_id, payment]))

  await insertRows('enrollment_payments', Array.from({ length: 1005 }, (_, index) => ({
    enrollment_id: byExam['AUD-F'].id,
    course_id: courseA.id,
    amount: 1,
    method: 'cash',
    status: 'paid',
    category: 'etc',
    paid_at: `2026-04-15T14:${String(index % 60).padStart(2, '0')}:00+09:00`,
    display_receipt_no: paymentReceiptNo('0415', 3000 + index),
    memo: `${marker} bulk ${index + 1}`,
    installment_months: 0,
    series_group_snapshot: 'public',
    series_label_snapshot: PUBLIC_LABEL,
  })), 'insert bulk target payments')

  await insertRows('enrollment_refunds', [
    { payment_id: byEnrollment.get(byExam['AUD-A'].id).id, amount: 100000, method: 'card_cancel', reason_category: 'policy_application', reason: 'same day partial refund', cancel_receipt_no: 'CANCEL-A', refunded_at: '2026-04-15T15:00:00+09:00', display_receipt_no: refundReceiptNo('0415', 2000), memo: marker },
    { payment_id: byEnrollment.get(byExam['AUD-B'].id).id, amount: 200000, method: 'cash', reason_category: 'withdrawal', reason: 'next day full refund', refunded_at: '2026-04-16T09:00:00+09:00', display_receipt_no: refundReceiptNo('0416', 3000), memo: marker },
    { payment_id: byEnrollment.get(byExam['AUD-C'].id).id, amount: 10000, method: 'cash', reason_category: 'payment_correction', reason: 'textbook partial refund', refunded_at: '2026-04-15T16:00:00+09:00', display_receipt_no: refundReceiptNo('0415', 2001), memo: marker },
    { payment_id: byEnrollment.get(byExam['AUD-D'].id).id, amount: 30000, method: 'bank_transfer', reason_category: 'other', reason: 'prior month payment refunded in current month', refund_account_last4: '4444', refunded_at: '2026-04-15T17:00:00+09:00', display_receipt_no: refundReceiptNo('0415', 2002), memo: marker },
    { payment_id: byEnrollment.get(byExam['AUD-G'].id).id, amount: 20000, method: 'card_cancel', reason_category: 'schedule_change', reason: 'other course monthly refund', cancel_receipt_no: 'CANCEL-G', refunded_at: '2026-04-21T10:00:00+09:00', display_receipt_no: refundReceiptNo('0421', 4000), memo: marker },
  ], 'insert target refunds')

  return { courseA, courseB }
}

async function verifyBundleCareerFallback(courseA) {
  const enrollment = (await insertRows('enrollments', [{
    course_id: courseA.id,
    name: 'Audit H Career Blank Series',
    phone: '010-9000-0008',
    exam_number: 'AUD-H',
    series_group: 'career',
    series: null,
    custom_data: { marker },
  }], 'insert fallback enrollment'))[0]

  const rows = await must(db.rpc('create_payment_bundle_atomic', {
    p_enrollment_id: enrollment.id,
    p_course_id: courseA.id,
    p_division: targetDivision,
    p_actor_staff_id: null,
    p_billing: null,
    p_payments: [{
      amount: 123,
      method: 'cash',
      category: 'etc',
      paidAt: '2026-04-22T10:00:00+09:00',
      memo: marker,
    }],
  }), 'rpc create_payment_bundle_atomic')
  const paymentId = rows[0].payment_id
  const payment = await must(db.from('enrollment_payments').select('series_group_snapshot,series_label_snapshot').eq('id', paymentId).single(), 'load fallback payment')
  expectEqual('career bundle fallback group', payment.series_group_snapshot, 'career')
  expectEqual('career bundle fallback label', payment.series_label_snapshot, CAREER_LABEL)
}

async function verify() {
  await cleanup()
  const { courseA } = await seedAuditData()

  const dayReport = buildSettlementReport(
    await listSettlementDetailPayments({ from: day, to: day, courseId: courseA.id, limit: 10 }, targetDivision),
    day,
    day,
  )
  expectEqual('daily gross', dayReport.summary.grossAmount, 551005)
  expectEqual('daily refund', dayReport.summary.refundAmount, 140000)
  expectEqual('daily net', dayReport.summary.netAmount, 411005)
  expectEqual('daily paymentCount', dayReport.summary.paymentCount, 1008)
  expectEqual('daily refundCount', dayReport.summary.refundCount, 3)
  expectEqual('daily payerCount excludes refund-only payer', dayReport.summary.payerCount, 4)
  expectEqual('daily voided excluded', dayReport.ledgerRows.some((row) => row.examNumber === 'AUD-E') ? 1 : 0, 0)
  expectEqual('daily prior-month payment gross excluded but refund included', dayReport.refundRows.some((row) => row.examNumber === 'AUD-D') ? 1 : 0, 1)
  expectEqual('daily refund original payment amount preserved', dayReport.refundRows.find((row) => row.examNumber === 'AUD-D').originalPaymentAmount, 80000)
  expectEqual('daily noise refunds ignored despite limit 10', dayReport.refundRows.some((row) => row.examNumber === 'AUD-N') ? 1 : 0, 0)

  const nextDayReport = buildSettlementReport(
    await listSettlementDetailPayments({ from: nextDay, to: nextDay, courseId: courseA.id, limit: 10 }, targetDivision),
    nextDay,
    nextDay,
  )
  expectEqual('refund-only day gross', nextDayReport.summary.grossAmount, 0)
  expectEqual('refund-only day refund', nextDayReport.summary.refundAmount, 200000)
  expectEqual('refund-only day net', nextDayReport.summary.netAmount, -200000)
  expectEqual('refund-only day paymentCount', nextDayReport.summary.paymentCount, 0)
  expectEqual('refund-only day payerCount', nextDayReport.summary.payerCount, 0)

  const monthReport = buildSettlementReport(
    await listSettlementDetailPayments({ from: monthFrom, to: monthTo, limit: 10 }, targetDivision),
    monthFrom,
    monthTo,
  )
  expectEqual('monthly gross', monthReport.summary.grossAmount, 671005)
  expectEqual('monthly refund', monthReport.summary.refundAmount, 360000)
  expectEqual('monthly net', monthReport.summary.netAmount, 311005)
  expectEqual('monthly paymentCount', monthReport.summary.paymentCount, 1009)
  expectEqual('monthly refundCount', monthReport.summary.refundCount, 5)
  expectEqual('monthly payerCount excludes refund-only prior-month payer', monthReport.summary.payerCount, 5)
  expectEqual('monthly course rows total net', monthReport.courseRows.reduce((sum, row) => sum + row.netAmount, 0), 311005)
  expectEqual('monthly daily rows total net', monthReport.dailyRows.reduce((sum, row) => sum + row.netAmount, 0), 311005)
  expectEqual('monthly category rows total net', monthReport.categories.reduce((sum, row) => sum + row.netAmount, 0), 311005)
  expectEqual('monthly series rows total net', monthReport.seriesRows.reduce((sum, row) => sum + row.netAmount, 0), 311005)

  const rpcDaySummary = summarizeSettlementRows(await getPaymentSettlement({ from: day, to: day, courseId: courseA.id, division: targetDivision }))
  expectEqual('RPC daily gross', rpcDaySummary.grossAmount, 551005)
  expectEqual('RPC daily refund', rpcDaySummary.refundAmount, 140000)
  expectEqual('RPC daily net', rpcDaySummary.netAmount, 411005)
  expectEqual('RPC daily paymentCount', rpcDaySummary.paymentCount, 1008)

  const rpcMonthSummary = summarizeSettlementRows(await getPaymentSettlement({ from: monthFrom, to: monthTo, division: targetDivision }))
  expectEqual('RPC monthly gross', rpcMonthSummary.grossAmount, 671005)
  expectEqual('RPC monthly refund', rpcMonthSummary.refundAmount, 360000)
  expectEqual('RPC monthly net', rpcMonthSummary.netAmount, 311005)
  expectEqual('RPC monthly paymentCount', rpcMonthSummary.paymentCount, 1009)

  await verifyBundleCareerFallback(courseA)
  console.log('RESULT all settlement insertion/refund/monthly/daily checks passed')
}

let passed = false

verify()
  .then(async () => {
    passed = true
    if (process.env.KEEP_CODEX_SETTLEMENT_AUDIT_DATA !== '1') {
      await cleanup()
      console.log('CLEANUP removed codex settlement audit data')
    } else {
      console.log('CLEANUP skipped by KEEP_CODEX_SETTLEMENT_AUDIT_DATA=1')
    }
  })
  .catch((error) => {
    console.error(error)
    if (!passed) {
      console.error('Audit data left in local DB for debugging; rerun script after fixes to clean it first.')
    }
    process.exitCode = 1
  })
