#!/usr/bin/env node

/*
 * End-to-end local payment verification.
 *
 * This script intentionally goes through the HTTP APIs for registration,
 * bundle registration, refunds, settlement confirmations, and then validates
 * the generated "report" XLSX against the settlement report model.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx-js-style');

const APP_ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.PAY100_BASE_URL || 'http://127.0.0.1:3000';
const LOCAL_ONLY = process.env.PAY100_ALLOW_REMOTE === '1' ? false : true;
const KEEP_DATA = process.env.PAY100_KEEP_DATA === '1';
const RUN_ID = process.env.PAY100_RUN_ID || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DIVISION = process.env.PAY100_DIVISION || process.env.NEXT_PUBLIC_TENANT_TYPE || 'police';
const ISOLATED_TEST_DAY = String((parseInt(RUN_ID.slice(-2), 36) % 20) + 1).padStart(2, '0');
const TEST_DATE = process.env.PAY100_DATE || `2036-05-${ISOLATED_TEST_DAY}`;
const PAID_AT_BASE = `${TEST_DATE}T10:00:00+09:00`;
const REFUNDED_AT_BASE = `${TEST_DATE}T15:00:00+09:00`;
const OUTPUT_DIR = path.join(APP_ROOT, '.codex-temp', `payment-100-${RUN_ID}`);

loadEnv(path.join(APP_ROOT, '.env.local'));
loadEnv(path.join(APP_ROOT, '..', '..', '.env.local'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
}

if (LOCAL_ONLY) {
  const host = new URL(SUPABASE_URL).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    throw new Error(`Refusing to run against non-local Supabase host: ${host}`);
  }
}

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const db = service.schema('class_pass');

const state = {
  branchId: null,
  accountId: null,
  membershipId: null,
  courses: {},
  createdStudents: [],
  createdEnrollments: [],
  createdPayments: [],
  createdRefunds: [],
  createdBranch: false,
  expected: {
    students: 100,
    enrollments: 0,
    payments: 0,
    refundAmount: 0,
    grossAmount: 0,
    singlePaymentRows: 0,
    bundlePaymentRows: 0,
    freeEnrollments: 0,
  },
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function log(message) {
  console.log(`[pay100:${RUN_ID}] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function money(value) {
  return Number(value || 0);
}

function setCookieHeader(response) {
  const entries = [];
  if (typeof response.headers.getSetCookie === 'function') {
    entries.push(...response.headers.getSetCookie());
  }

  const raw = response.headers.get('set-cookie') || '';
  entries.push(...raw.split(/,(?=[^;,]+=)/));

  const byName = new Map();
  for (const entry of entries) {
    const cookie = entry.split(';')[0].trim();
    if (!cookie) continue;
    const name = cookie.split('=')[0];
    byName.set(name, cookie);
  }

  return [...byName.values()].join('; ');
}

function dateTime(minutes) {
  const base = new Date(PAID_AT_BASE);
  base.setMinutes(base.getMinutes() + minutes);
  return base.toISOString();
}

function refundDateTime(minutes) {
  const base = new Date(REFUNDED_AT_BASE);
  base.setMinutes(base.getMinutes() + minutes);
  return base.toISOString();
}

function methodPayload(method, amount, index) {
  const cardCompanies = ['KB', 'NH', 'SINHAN', 'SAMSUNG', 'HYUNDAI'];
  if (method === 'card') {
    return {
      method,
      amount,
      cardCompany: cardCompanies[index % cardCompanies.length],
      memo: `card-${index}`,
    };
  }
  if (method === 'homepage') {
    return {
      method,
      amount,
      cardCompany: cardCompanies[index % cardCompanies.length],
      memo: `homepage-card-${index}`,
    };
  }
  if (method === 'bank_transfer') {
    return {
      method,
      amount,
      bankName: ['KB', 'NH', 'SINHAN'][index % 3],
      bankAccountLast4: String(1000 + index).slice(-4),
      memo: `bank-${index}`,
    };
  }
  if (method === 'cash') {
    return {
      method,
      amount,
      cashReceiptApprovalNo: `CR${String(index).padStart(6, '0')}`,
      memo: `cash-${index}`,
    };
  }
  if (method === 'point') {
    return {
      method,
      amount,
      memo: `point-${index}`,
    };
  }
  return {
    method: 'other',
    amount,
    memo: `other-${index}`,
  };
}

function splitPaymentPayloads(total, index) {
  const patterns = [
    ['card', 'cash', 0.65],
    ['card', 'point', 0.5],
    ['bank_transfer', 'point', 0.7],
    ['cash', 'bank_transfer', 0.45],
  ];
  const pattern = patterns[index % patterns.length];
  const firstAmount = Math.round((total * pattern[2]) / 1000) * 1000;
  const secondAmount = total - firstAmount;
  return [
    methodPayload(pattern[0], firstAmount, index * 2),
    methodPayload(pattern[1], secondAmount, index * 2 + 1),
  ];
}

function studentPayload(index) {
  return {
    exam_number: `P100-${RUN_ID}-${String(index).padStart(3, '0')}`,
    name: `Pay Test ${String(index).padStart(3, '0')}`,
    phone: `010${String(50000000 + index).padStart(8, '0')}`,
    birth_date: '',
    series: index % 2 === 0 ? 'Public' : 'Career',
    student_type: index % 4 === 0 ? 'general' : 'academy',
    memo: `pay100 ${RUN_ID}`,
    custom_data: { marker: `pay100-${RUN_ID}` },
  };
}

async function supaQuery(builder, label) {
  const { data, error } = await builder;
  if (error) fail(`${label}: ${error.message}`);
  return data;
}

async function deleteInChunks(table, column, values, chunkSize = 100) {
  const unique = [...new Set(values.filter(Boolean))];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { error } = await db.from(table).delete().in(column, chunk);
    if (error) fail(`cleanup ${table}.${column}: ${error.message}`);
  }
}

async function selectAll(buildQuery, label, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supaQuery(buildQuery().range(offset, offset + pageSize - 1), label);
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
}

async function setupBranchAndAdmin() {
  const branchSlug = DIVISION;
  const branchName = DIVISION === 'police' ? 'Police' : `Codex Pay100 ${RUN_ID}`;

  const existingBranch = await supaQuery(
    db.from('branches').select('id').eq('slug', branchSlug).maybeSingle(),
    'select branch',
  );

  if (existingBranch?.id) {
    state.branchId = existingBranch.id;
  } else {
    const branch = await supaQuery(
      db
        .from('branches')
        .insert({
        slug: branchSlug,
        name: branchName,
        track_type: 'police',
        description: 'pay100 verification branch',
        admin_title: 'Pay100 Admin',
        series_label: 'Series',
        region_label: 'Region',
        app_name: 'Pay100',
        theme_color: '#1A237E',
        is_active: true,
        })
        .select('id')
        .single(),
      'insert branch',
    );
    state.branchId = branch.id;
    state.createdBranch = true;

    await supaQuery(
      db.from('branch_series_options').insert([
        {
          branch_id: state.branchId,
          group_key: 'public',
          label: 'Public',
          is_default: true,
          is_active: true,
          display_order: 1,
        },
        {
          branch_id: state.branchId,
          group_key: 'career',
          label: 'Career',
          is_default: false,
          is_active: true,
          display_order: 2,
        },
      ]),
      'insert branch series options',
    );
  }

  const account = await supaQuery(
    db
      .from('operator_accounts')
      .insert({
        login_id: `codex-pay100-${RUN_ID}`,
        display_name: `Codex Pay100 ${RUN_ID}`,
        is_active: true,
      })
      .select('id')
      .single(),
    'insert operator account',
  );
  state.accountId = account.id;

  const membership = await supaQuery(
    db
      .from('operator_memberships')
      .insert({
        operator_account_id: state.accountId,
        branch_id: state.branchId,
        role: 'BRANCH_ADMIN',
        is_active: true,
      })
      .select('id')
      .single(),
    'insert operator membership',
  );
  state.membershipId = membership.id;
}

async function createCourses() {
  const rows = [
    {
      key: 'basic',
      title: `Pay100 Basic ${RUN_ID}`,
      slug: `pay100-basic-${RUN_ID}`,
      settlement_report_code: '11',
      tuition: 60000,
    },
    {
      key: 'studio',
      title: `Pay100 Studio ${RUN_ID}`,
      slug: `pay100-studio-${RUN_ID}`,
      settlement_report_code: '5',
      tuition: 80000,
    },
    {
      key: 'book',
      title: `Pay100 Book ${RUN_ID}`,
      slug: `pay100-book-${RUN_ID}`,
      settlement_report_code: '4',
      tuition: 39600,
    },
    {
      key: 'mock',
      title: `Pay100 Mock ${RUN_ID}`,
      slug: `pay100-mock-${RUN_ID}`,
      settlement_report_code: '29',
      tuition: 9000,
    },
    {
      key: 'free',
      title: `Pay100 Free ${RUN_ID}`,
      slug: `pay100-free-${RUN_ID}`,
      settlement_report_code: '0',
      tuition: 0,
    },
  ];

  const inserted = await supaQuery(
    db
      .from('courses')
      .insert(
        rows.map((course, index) => ({
          name: course.title,
          slug: course.slug,
          division: DIVISION,
          course_type: 'lecture',
          status: 'active',
          tuition_amount: course.tuition,
          target_date: '2026-12-31',
          notice_content: `Pay100 verification course ${course.key}`,
          settlement_report_code: course.settlement_report_code,
        })),
      )
      .select('id, slug, name, tuition_amount, settlement_report_code'),
    'insert courses',
  );

  for (const row of inserted || []) {
    const found = rows.find((course) => course.slug === row.slug);
    state.courses[found.key] = {
      ...row,
      tuition: row.tuition_amount,
      title: row.name,
    };
  }
}

async function devLogin() {
  const body = new URLSearchParams();
  body.set('accountId', state.accountId);
  body.set('membershipId', state.membershipId);

  let lastCookieNames = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${BASE_URL}/api/auth/admin/dev-login`, {
      method: 'POST',
      body,
      redirect: 'manual',
    });

    if (!response.ok && response.status !== 303 && response.status !== 302) {
      const text = await response.text();
      fail(`dev login failed: ${response.status} ${text}`);
    }

    const cookie = setCookieHeader(response);
    if (cookie.includes(`cp_admin__${DIVISION}=`)) {
      return cookie;
    }
    lastCookieNames = cookie
      .split(';')
      .map((entry) => entry.trim().split('=')[0])
      .filter(Boolean);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  fail(`dev login did not return branch admin session cookie. cookie names: ${lastCookieNames.join(', ') || '(none)'}`);
}

async function api(cookie, route, payload, expectedStatuses = [200, 201]) {
  const response = await fetch(`${BASE_URL}${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      referer: `${BASE_URL}/${DIVISION}/dashboard`,
      'x-hankuk-division': DIVISION,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = { raw: text };
    }
  }

  if (!expectedStatuses.includes(response.status)) {
    fail(`${route} expected ${expectedStatuses.join('/')} but got ${response.status}: ${text}`);
  }

  return { status: response.status, json };
}

function registerExpected(enrollmentCount, paymentPayloads, isBundle = false, freeCount = 0) {
  state.expected.enrollments += enrollmentCount;
  state.expected.payments += paymentPayloads.length;
  state.expected.grossAmount += paymentPayloads.reduce((sum, row) => sum + money(row.amount), 0);
  state.expected.freeEnrollments += freeCount;
  if (isBundle) {
    state.expected.bundlePaymentRows += paymentPayloads.length;
  } else {
    state.expected.singlePaymentRows += paymentPayloads.length;
  }
}

async function createSingleRegistration(cookie, index, course, payments, overrides = {}) {
  const payable = payments.reduce((sum, payment) => sum + money(payment.amount), 0);
  const tuition = overrides.tuitionAmount ?? money(course.tuition);
  const discountAmount = Math.max(0, tuition - payable);

  const payload = {
    courseId: course.id,
    ...studentPayload(index),
    billing: {
      expectedAmount: tuition,
      discountAmount,
      discountReason: discountAmount > 0 ? 'pay100 discount' : null,
      payableAmount: payable,
      tuitionExempt: false,
    },
    payments: payments.map((payment) => ({
      ...payment,
      paidAt: dateTime(index),
    })),
  };

  const { json } = await api(cookie, '/api/enrollments', payload, [201]);
  const enrollmentId = json?.enrollment?.id;
  assert(enrollmentId, `single registration ${index} did not return enrollment id`);
  state.createdEnrollments.push(enrollmentId);
  state.createdStudents.push(json.enrollment.student_id);

  registerExpected(1, payments, false, payments.length === 0 ? 1 : 0);
  return json;
}

async function createBundleRegistration(cookie, index, courseInputs, payment, expectedPaymentRows) {
  const payload = {
    ...studentPayload(index),
    registrations: courseInputs.map((item) => {
      const expectedAmount = money(item.course.tuition);
      const discountAmount = item.discountAmount || 0;
      return {
      courseId: item.course.id,
        billing: {
          expectedAmount,
          discountAmount,
          discountReason: discountAmount ? 'bundle discount' : null,
          payableAmount: Math.max(expectedAmount - discountAmount, 0),
          tuitionExempt: false,
        },
      };
    }),
    payments: payment
      ? [
          {
            ...payment,
            paidAt: dateTime(index),
          },
        ]
      : [],
  };

  const { json } = await api(cookie, '/api/enrollments/batch', payload, [201]);
  const enrollments = json?.enrollments || [];
  assert(enrollments.length === courseInputs.length, `bundle ${index} enrollment count mismatch`);
  for (const enrollment of enrollments) {
    state.createdEnrollments.push(enrollment.id);
    state.createdStudents.push(enrollment.student_id);
  }

  const paidRows = payment
    ? splitBundlePaymentForExpected(courseInputs, payment, expectedPaymentRows)
    : [];
  const freeCount = courseInputs.filter((item) => money(item.course.tuition) - (item.discountAmount || 0) === 0).length;
  registerExpected(courseInputs.length, paidRows, true, freeCount);
  return json;
}

function splitBundlePaymentForExpected(courseInputs, payment, expectedRows) {
  const rows = courseInputs
    .map((item) => {
      const payable = money(item.course.tuition) - (item.discountAmount || 0);
      return payable > 0 ? { ...payment, amount: payable } : null;
    })
    .filter(Boolean);
  assert(
    rows.length === expectedRows,
    `expected ${expectedRows} bundle payment rows but calculated ${rows.length}`,
  );
  return rows;
}

async function createRegistrations(cookie) {
  const methods = ['card', 'bank_transfer', 'point', 'cash', 'homepage', 'other'];
  const basic = state.courses.basic;
  const studio = state.courses.studio;
  const book = state.courses.book;
  const mock = state.courses.mock;
  const free = state.courses.free;

  log('creating 50 paid single registrations');
  for (let i = 0; i < 50; i += 1) {
    const course = [basic, studio, book, mock][i % 4];
    const tuition = money(course.tuition);
    const discount = i % 10 === 0 ? Math.min(10000, tuition) : 0;
    const payable = tuition - discount;
    const payments = i >= 35 ? splitPaymentPayloads(payable, i) : [methodPayload(methods[i % methods.length], payable, i)];
    await createSingleRegistration(cookie, i, course, payments, { tuitionAmount: tuition });
    if ((i + 1) % 10 === 0) log(`created ${i + 1}/50 paid singles`);
  }

  log('creating 5 free single registrations');
  for (let i = 50; i < 55; i += 1) {
    await createSingleRegistration(cookie, i, free, [], { tuitionAmount: 0 });
  }

  log('creating 35 two-course paid bundle registrations');
  for (let i = 55; i < 90; i += 1) {
    const pair = i % 3 === 0 ? [basic, studio] : i % 3 === 1 ? [basic, book] : [studio, mock];
    const payable = pair.reduce((sum, course) => sum + money(course.tuition), 0);
    const payment = methodPayload(methods[i % methods.length], payable, i);
    await createBundleRegistration(
      cookie,
      i,
      pair.map((course) => ({ course })),
      payment,
      2,
    );
    if ((i - 54) % 10 === 0) log(`created ${i - 54}/35 paid bundles`);
  }

  log('creating 10 zero+paid bundle registrations');
  for (let i = 90; i < 100; i += 1) {
    const paidCourse = i % 2 === 0 ? basic : studio;
    const payable = money(paidCourse.tuition);
    const payment = methodPayload(methods[i % methods.length], payable, i);
    await createBundleRegistration(
      cookie,
      i,
      [{ course: free }, { course: paidCourse }],
      payment,
      1,
    );
  }

  assert(state.createdStudents.length === 145, 'student row references should follow enrollment count');
}

async function verifyMixedBundleRejected(cookie) {
  const basic = state.courses.basic;
  const studio = state.courses.studio;
  const total = money(basic.tuition) + money(studio.tuition);
  const payload = {
    ...studentPayload(999),
    exam_number: `P100-BAD-${RUN_ID}`,
      name: 'Pay Test Bad Mixed',
    registrations: [
      {
        courseId: basic.id,
        billing: {
          expectedAmount: money(basic.tuition),
          discountAmount: 0,
          discountReason: null,
          payableAmount: money(basic.tuition),
          tuitionExempt: false,
        },
      },
      {
        courseId: studio.id,
        billing: {
          expectedAmount: money(studio.tuition),
          discountAmount: 0,
          discountReason: null,
          payableAmount: money(studio.tuition),
          tuitionExempt: false,
        },
      },
    ],
    payments: [
      methodPayload('card', total - 40000, 998),
      methodPayload('cash', 40000, 999),
    ],
  };

  const result = await api(cookie, '/api/enrollments/batch', payload, [400]);
  assert(result.status === 400, 'mixed payment bundle should be rejected');
  const badStudents = await supaQuery(
    db.from('students').select('id').eq('division', DIVISION).eq('exam_number', `P100-BAD-${RUN_ID}`),
    'select rejected mixed bundle student',
  );
  assert((badStudents || []).length === 0, 'rejected mixed bundle left a student row behind');
}

async function verifyReactivatedTextbookRollback(cookie) {
  const basic = state.courses.basic;
  const studio = state.courses.studio;
  const marker = `P100-ROLLBACK-${RUN_ID}`;
  const cleanupState = {
    studentId: null,
    enrollmentIds: [],
    paymentIds: [],
    materialIds: [],
  };

  try {
    const materials = await supaQuery(
      db
        .from('materials')
        .insert([
          {
            course_id: basic.id,
            name: `Pay100 rollback old ${RUN_ID}`,
            material_type: 'textbook',
            is_active: true,
          },
          {
            course_id: basic.id,
            name: `Pay100 rollback new ${RUN_ID}`,
            material_type: 'textbook',
            is_active: true,
          },
        ])
        .select('id'),
      'insert rollback textbook materials',
    );
    cleanupState.materialIds = (materials || []).map((material) => material.id);
    const [oldTextbook, newTextbook] = cleanupState.materialIds;
    assert(oldTextbook && newTextbook, 'rollback textbook materials were not created');

    const createResult = await api(
      cookie,
      '/api/enrollments',
      {
        courseId: basic.id,
        ...studentPayload(1200),
        exam_number: marker,
        name: 'Pay Rollback Student',
        billing: {
          expectedAmount: money(basic.tuition),
          discountAmount: 0,
          discountReason: null,
          payableAmount: money(basic.tuition),
          tuitionExempt: false,
        },
        payments: [{
          ...methodPayload('card', money(basic.tuition), 1200),
          paidAt: dateTime(1200),
        }],
      },
      [201],
    );
    const enrollmentId = createResult.json?.enrollment?.id;
    cleanupState.studentId = createResult.json?.enrollment?.student_id;
    cleanupState.enrollmentIds.push(enrollmentId);
    assert(enrollmentId && cleanupState.studentId, 'rollback setup enrollment was not created');

    const setupPayments = await supaQuery(
      db
        .from('enrollment_payments')
        .select('id, amount')
        .eq('enrollment_id', enrollmentId),
      'select rollback setup payment',
    );
    const setupPayment = setupPayments?.[0];
    assert(setupPayment?.id, 'rollback setup payment was not created');
    cleanupState.paymentIds.push(setupPayment.id);

    await supaQuery(
      db
        .from('textbook_assignments')
        .insert({
          enrollment_id: enrollmentId,
          material_id: oldTextbook,
          assigned_by: 'before-rollback-test',
        }),
      'insert rollback original assignment',
    );

    const refundResult = await api(
      cookie,
      '/api/payments/refunds',
      {
        refunds: [{
          paymentId: setupPayment.id,
          amount: money(setupPayment.amount),
          method: 'card_cancel',
          reasonCategory: 'payment_correction',
          reason: 'rollback setup full refund',
          refundedAt: refundDateTime(1200),
          cancelReceiptNo: `RB${RUN_ID}`,
        }],
      },
      [201],
    );
    assert(refundResult.json?.refunds?.[0]?.id, 'rollback setup refund was not created');

    const failedResult = await api(
      cookie,
      '/api/enrollments/batch',
      {
        studentId: cleanupState.studentId,
        updateSelectedStudent: false,
        name: 'Pay Rollback Student',
        phone: createResult.json.enrollment.phone,
        exam_number: marker,
        birth_date: '',
        student_type: 'academy',
        registrations: [
          {
            courseId: basic.id,
            textbookIds: [oldTextbook, newTextbook],
            billing: {
              expectedAmount: money(basic.tuition),
              discountAmount: 0,
              discountReason: null,
              payableAmount: money(basic.tuition),
              tuitionExempt: false,
            },
          },
          {
            courseId: studio.id,
            billing: {
              expectedAmount: money(studio.tuition),
              discountAmount: 0,
              discountReason: null,
              payableAmount: money(studio.tuition),
              tuitionExempt: false,
            },
          },
        ],
        payments: [{
          ...methodPayload('card', money(basic.tuition) + money(studio.tuition), 1201),
          paidAt: 'not-a-date',
        }],
      },
      [400],
    );
    assert(failedResult.status === 400, 'rollback batch should fail before committing payment');

    const restoredEnrollment = await supaQuery(
      db
        .from('enrollments')
        .select('id,status')
        .eq('id', enrollmentId)
        .single(),
      'select rollback restored enrollment',
    );
    assert(restoredEnrollment.status === 'refunded', `reactivated enrollment status was not restored: ${restoredEnrollment.status}`);

    const assignments = await supaQuery(
      db
        .from('textbook_assignments')
        .select('material_id,assigned_by')
        .eq('enrollment_id', enrollmentId)
        .order('material_id'),
      'select rollback restored assignments',
    );
    assert(assignments.length === 1, `rollback assignment count mismatch: ${assignments.length}`);
    assert(assignments[0].material_id === oldTextbook, 'rollback left the newly assigned textbook behind');
    assert(assignments[0].assigned_by === 'before-rollback-test', 'rollback did not restore original assignment metadata');

    const unexpectedStudio = await supaQuery(
      db
        .from('enrollments')
        .select('id')
        .eq('student_id', cleanupState.studentId)
        .eq('course_id', studio.id),
      'select rollback unexpected created enrollment',
    );
    assert((unexpectedStudio || []).length === 0, 'rollback left a created bundle enrollment behind');
  } finally {
    let enrollmentIds = cleanupState.enrollmentIds.filter(Boolean);
    if (cleanupState.studentId) {
      const remainingEnrollments = await supaQuery(
        db.from('enrollments').select('id').eq('student_id', cleanupState.studentId),
        'rollback cleanup select enrollments',
      );
      enrollmentIds = Array.from(new Set([
        ...enrollmentIds,
        ...((remainingEnrollments || []).map((enrollment) => enrollment.id)),
      ]));
    }

    let paymentIds = [...cleanupState.paymentIds];
    if (enrollmentIds.length > 0) {
      const enrollmentPayments = await supaQuery(
        db.from('enrollment_payments').select('id').in('enrollment_id', enrollmentIds),
        'rollback cleanup select enrollment payments',
      );
      paymentIds = Array.from(new Set([
        ...paymentIds,
        ...((enrollmentPayments || []).map((payment) => payment.id)),
      ]));
    }

    const payments = paymentIds.length
      ? await supaQuery(
        db.from('enrollment_payments').select('id').in('id', paymentIds),
        'rollback cleanup select payments',
      )
      : [];
    const existingPaymentIds = (payments || []).map((payment) => payment.id);
    if (existingPaymentIds.length > 0) {
      await deleteInChunks('settlement_entry_confirmations', 'payment_id', existingPaymentIds);
      await deleteInChunks('enrollment_refunds', 'payment_id', existingPaymentIds);
      await deleteInChunks('payment_events', 'payment_id', existingPaymentIds);
      await deleteInChunks('enrollment_payment_items', 'payment_id', existingPaymentIds);
      await deleteInChunks('enrollment_payments', 'id', existingPaymentIds);
    }
    if (enrollmentIds.length > 0) {
      await deleteInChunks('payment_events', 'enrollment_id', enrollmentIds);
      await deleteInChunks('textbook_assignments', 'enrollment_id', enrollmentIds);
      await deleteInChunks('enrollment_billing', 'enrollment_id', enrollmentIds);
      await deleteInChunks('enrollments', 'id', enrollmentIds);
    }
    if (cleanupState.studentId) {
      await deleteInChunks('students', 'id', [cleanupState.studentId]);
    }
    if (cleanupState.materialIds.length > 0) {
      await deleteInChunks('materials', 'id', cleanupState.materialIds);
    }
  }
}

async function verifyPaymentReceiptConcurrency() {
  const basic = state.courses.basic;
  const enrollmentIds = [];
  const paymentIds = [];

  try {
    const enrollment = await supaQuery(
      db
        .from('enrollments')
        .insert({
          course_id: basic.id,
          name: `Pay Receipt Race ${RUN_ID}`,
          phone: `01077${RUN_ID.slice(-6).replace(/[^0-9]/g, '0').padStart(6, '0')}`,
          exam_number: `P100-RECEIPT-${RUN_ID}`,
          status: 'active',
        })
        .select('id')
        .single(),
      'insert receipt race enrollment',
    );
    enrollmentIds.push(enrollment.id);

    const inserts = await Promise.all(Array.from({ length: 20 }, (_, index) => (
      db
        .from('enrollment_payments')
        .insert({
          enrollment_id: enrollment.id,
          course_id: basic.id,
          amount: 1000 + index,
          method: 'cash',
          category: 'etc',
          paid_at: dateTime(1400),
          memo: `receipt race ${index}`,
        })
        .select('id,display_receipt_no')
        .single()
    )));

    for (const result of inserts) {
      if (result.error) {
        fail(`receipt race insert failed: ${result.error.message}`);
      }
      paymentIds.push(result.data.id);
    }

    const receiptNos = inserts.map((result) => result.data.display_receipt_no);
    assert(
      new Set(receiptNos).size === receiptNos.length,
      `receipt race created duplicate display_receipt_no: ${receiptNos.join(', ')}`,
    );
  } finally {
    if (paymentIds.length > 0) {
      await deleteInChunks('settlement_entry_confirmations', 'payment_id', paymentIds);
      await deleteInChunks('enrollment_refunds', 'payment_id', paymentIds);
      await deleteInChunks('payment_events', 'payment_id', paymentIds);
      await deleteInChunks('enrollment_payment_items', 'payment_id', paymentIds);
      await deleteInChunks('enrollment_payments', 'id', paymentIds);
    }
    if (enrollmentIds.length > 0) {
      await deleteInChunks('payment_events', 'enrollment_id', enrollmentIds);
      await deleteInChunks('enrollment_billing', 'enrollment_id', enrollmentIds);
      await deleteInChunks('enrollments', 'id', enrollmentIds);
    }
  }
}

async function verifyPaymentBundleRpcOverpayGuard() {
  const basic = state.courses.basic;
  const enrollmentIds = [];
  const paymentIds = [];

  try {
    const enrollment = await supaQuery(
      db
        .from('enrollments')
        .insert({
          course_id: basic.id,
          name: `Pay RPC Race ${RUN_ID}`,
          phone: `01088${RUN_ID.slice(-6).replace(/[^0-9]/g, '0').padStart(6, '0')}`,
          exam_number: `P100-RPC-RACE-${RUN_ID}`,
          status: 'active',
        })
        .select('id')
        .single(),
      'insert rpc race enrollment',
    );
    enrollmentIds.push(enrollment.id);

    await supaQuery(
      db
        .from('enrollment_billing')
        .insert({
          enrollment_id: enrollment.id,
          course_id: basic.id,
          expected_amount: 60000,
          discount_amount: 0,
          payable_amount: 60000,
          tuition_exempt: false,
          status: 'unpaid',
        }),
      'insert rpc race billing',
    );

    const rpcPayload = {
      p_enrollment_id: enrollment.id,
      p_course_id: basic.id,
      p_division: DIVISION,
      p_actor_staff_id: state.accountId,
      p_billing: null,
      p_payments: [{
        amount: 60000,
        method: 'card',
        category: 'tuition',
        paidAt: dateTime(1410),
        memo: 'rpc overpay race',
        cardCompany: 'KB',
        installmentMonths: 0,
        items: [{ label: 'rpc overpay race', amount: 60000, sortOrder: 0 }],
      }],
      p_checkout_group_id: null,
    };

    const results = await Promise.all([
      db.rpc('create_payment_bundle_atomic', rpcPayload),
      db.rpc('create_payment_bundle_atomic', rpcPayload),
    ]);
    const successes = results.filter((result) => !result.error);
    const failures = results.filter((result) => result.error);
    assert(successes.length === 1, `rpc overpay guard expected 1 success, got ${successes.length}`);
    assert(failures.length === 1, `rpc overpay guard expected 1 failure, got ${failures.length}`);

    const payments = await supaQuery(
      db
        .from('enrollment_payments')
        .select('id,amount')
        .eq('enrollment_id', enrollment.id),
      'select rpc race payments',
    );
    paymentIds.push(...((payments || []).map((payment) => payment.id)));
    assert(payments.length === 1, `rpc overpay guard left ${payments.length} payments`);
    assert(money(payments[0].amount) === 60000, 'rpc overpay guard payment amount mismatch');
  } finally {
    if (paymentIds.length > 0) {
      await deleteInChunks('settlement_entry_confirmations', 'payment_id', paymentIds);
      await deleteInChunks('enrollment_refunds', 'payment_id', paymentIds);
      await deleteInChunks('payment_events', 'payment_id', paymentIds);
      await deleteInChunks('enrollment_payment_items', 'payment_id', paymentIds);
      await deleteInChunks('enrollment_payments', 'id', paymentIds);
    }
    if (enrollmentIds.length > 0) {
      await deleteInChunks('payment_events', 'enrollment_id', enrollmentIds);
      await deleteInChunks('enrollment_billing', 'enrollment_id', enrollmentIds);
      await deleteInChunks('enrollments', 'id', enrollmentIds);
    }
  }
}

async function captureCreatedPayments() {
  const rows = await supaQuery(
    db
      .from('enrollment_payments')
      .select(
        'id, enrollment_id, course_id, amount, method, card_company, bank_account_last4, checkout_group_id, paid_at, paid_date, status',
      )
      .in('enrollment_id', state.createdEnrollments)
      .order('created_at', { ascending: true }),
    'select created payments',
  );
  state.createdPayments = rows || [];
}

function refundPayloadFor(payment, index) {
  const amount = Math.min(10000 + (index % 3) * 5000, money(payment.amount));
  const method =
    payment.method === 'card' || payment.method === 'homepage'
      ? 'card_cancel'
      : payment.method === 'bank_transfer'
        ? 'bank_transfer'
        : payment.method === 'cash'
          ? 'cash'
          : payment.method === 'point'
            ? 'point'
            : 'other';
  const payload = {
    paymentId: payment.id,
    amount,
    method,
    reasonCategory: 'payment_correction',
    reason: `pay100 refund ${index}`,
    refundedAt: refundDateTime(index),
    memo: `pay100 refund memo ${index}`,
  };
  if (method === 'card_cancel') payload.cancelReceiptNo = `CC${RUN_ID}${String(index).padStart(3, '0')}`;
  if (method === 'bank_transfer') payload.refundAccountLast4 = String(7000 + index).slice(-4);
  return payload;
}

async function createRefunds(cookie) {
  await captureCreatedPayments();
  const candidates = [];
  const wantedMethods = ['card', 'homepage', 'bank_transfer', 'cash', 'point', 'other'];
  for (const method of wantedMethods) {
    const matches = state.createdPayments.filter((payment) => payment.method === method);
    candidates.push(...matches.slice(0, method === 'card' ? 4 : 3));
  }
  const unique = [];
  const seen = new Set();
  for (const payment of candidates) {
    if (!seen.has(payment.id) && unique.length < 18) {
      seen.add(payment.id);
      unique.push(payment);
    }
  }
  assert(unique.length >= 12, `expected at least 12 refund candidates, got ${unique.length}`);

  const refunds = unique.map(refundPayloadFor);
  const saved = [];
  for (const refund of refunds) {
    const { json } = await api(cookie, '/api/payments/refunds', { refunds: [refund] }, [201]);
    saved.push(...(json?.refunds || []));
  }
  assert(saved.length === refunds.length, `refund count mismatch: expected ${refunds.length}, got ${saved.length}`);
  state.createdRefunds = saved;
  state.expected.refundAmount = refunds.reduce((sum, row) => sum + money(row.amount), 0);
}

async function confirmSettlementEntries(cookie) {
  const groupPayment = state.createdPayments.find((payment) => payment.checkout_group_id);
  const groupId = groupPayment?.checkout_group_id;
  assert(groupId && groupPayment?.id, 'expected at least one bundled payment checkout_group_id');

  const unconfirmedGroupPayment = state.createdPayments.find((payment) => (
    payment.checkout_group_id && payment.checkout_group_id !== groupId
  ));
  if (unconfirmedGroupPayment?.checkout_group_id) {
    const emptyCancelResult = await api(
      cookie,
      '/api/settlements/entry-confirmation',
      {
        date: TEST_DATE,
        kind: 'payment',
        paymentId: unconfirmedGroupPayment.id,
        checkoutGroupId: unconfirmedGroupPayment.checkout_group_id,
        action: 'cancel',
      },
      [200],
    );
    assert(
      Array.isArray(emptyCancelResult.json?.entries) && emptyCancelResult.json.entries.length === 0,
      'unconfirmed bundle cancel should return an empty entries array',
    );
  }

  const groupResult = await api(
    cookie,
    '/api/settlements/entry-confirmation',
    {
      date: TEST_DATE,
      kind: 'payment',
      paymentId: groupPayment.id,
      checkoutGroupId: groupId,
      action: 'confirm',
    },
    [200],
  );
  const grouped = groupResult.json?.entries || [];
  assert(grouped.length >= 2, `bundle confirmation expected >=2 entries, got ${grouped.length}`);
  assert(
    grouped.every((entry) => entry.status === 'confirmed'),
    'bundle confirmation should mark every grouped payment as confirmed',
  );

  const groupCancelResult = await api(
    cookie,
    '/api/settlements/entry-confirmation',
    {
      date: TEST_DATE,
      kind: 'payment',
      paymentId: groupPayment.id,
      checkoutGroupId: groupId,
      action: 'cancel',
    },
    [200],
  );
  const canceledGroup = groupCancelResult.json?.entries || [];
  assert(canceledGroup.length === grouped.length, 'bundle cancel should return every existing grouped confirmation');
  assert(
    canceledGroup.every((entry) => entry.status === 'canceled'),
    'bundle cancel should mark every grouped confirmation as canceled',
  );

  const groupReconfirmResult = await api(
    cookie,
    '/api/settlements/entry-confirmation',
    {
      date: TEST_DATE,
      kind: 'payment',
      paymentId: groupPayment.id,
      checkoutGroupId: groupId,
      action: 'confirm',
    },
    [200],
  );
  const reconfirmedGroup = groupReconfirmResult.json?.entries || [];
  assert(reconfirmedGroup.length === grouped.length, 'bundle reconfirm should return every grouped confirmation');
  assert(
    reconfirmedGroup.every((entry) => entry.status === 'confirmed'),
    'bundle reconfirm should restore every grouped confirmation to confirmed',
  );

  const single = state.createdPayments.find((payment) => !payment.checkout_group_id);
  assert(single, 'expected at least one non-group payment for settlement confirmation');
  const singleResult = await api(
    cookie,
    '/api/settlements/entry-confirmation',
    {
      date: TEST_DATE,
      kind: 'payment',
      paymentId: single.id,
      action: 'confirm',
    },
    [200],
  );
  assert(singleResult.json?.entry?.status === 'confirmed', 'single confirmation should create one confirmed entry');

  const refund = state.createdRefunds[0];
  assert(refund?.id, 'expected at least one refund for settlement confirmation');
  const refundResult = await api(
    cookie,
    '/api/settlements/entry-confirmation',
    {
      date: TEST_DATE,
      kind: 'refund',
      paymentId: refund.payment_id,
      refundId: refund.id,
      action: 'confirm',
    },
    [200],
  );
  assert(refundResult.json?.entry?.status === 'confirmed', 'refund confirmation should create one confirmed entry');
}

async function verifyDatabase() {
  await captureCreatedPayments();
  const enrollments = await supaQuery(
    db.from('enrollments').select('id, course_id, student_id, status').in('id', state.createdEnrollments),
    'select enrollments',
  );
  assert(enrollments.length === state.expected.enrollments, `enrollment count mismatch: ${enrollments.length}`);

  const students = await supaQuery(
    db
      .from('students')
      .select('id')
      .eq('division', DIVISION)
      .like('exam_number', `P100-${RUN_ID}-%`),
    'select students',
  );
  assert(students.length === state.expected.students, `student count mismatch: expected 100, got ${students.length}`);

  assert(
    state.createdPayments.length === state.expected.payments,
    `payment row count mismatch: expected ${state.expected.payments}, got ${state.createdPayments.length}`,
  );

  const gross = state.createdPayments.reduce((sum, payment) => sum + money(payment.amount), 0);
  assert(gross === state.expected.grossAmount, `gross amount mismatch: expected ${state.expected.grossAmount}, got ${gross}`);

  for (const payment of state.createdPayments) {
    if (payment.method === 'card') {
      assert(payment.card_company, `card payment ${payment.id} is missing card_company`);
    }
    if (payment.method === 'bank_transfer') {
      assert(payment.bank_account_last4, `bank transfer payment ${payment.id} is missing bank_account_last4`);
    }
  }

  const groupCounts = new Map();
  for (const payment of state.createdPayments) {
    if (!payment.checkout_group_id) continue;
    groupCounts.set(payment.checkout_group_id, (groupCounts.get(payment.checkout_group_id) || 0) + 1);
  }
  assert(groupCounts.size >= 35, `expected >=35 checkout groups, got ${groupCounts.size}`);
  const oneRowGroups = [...groupCounts.values()].filter((count) => count === 1).length;
  const twoRowGroups = [...groupCounts.values()].filter((count) => count === 2).length;
  assert(oneRowGroups >= 10, `zero+paid bundles should create one paid row per group, got ${oneRowGroups}`);
  assert(twoRowGroups >= 35, `paid bundles should create two paid rows per group, got ${twoRowGroups}`);

  const billingRows = await supaQuery(
    db.from('enrollment_billing').select('enrollment_id, expected_amount, discount_amount, payable_amount').in('enrollment_id', state.createdEnrollments),
    'select billing rows',
  );
  const billingByEnrollment = new Map(billingRows.map((row) => [row.enrollment_id, row]));
  const paymentByEnrollment = new Map();
  for (const payment of state.createdPayments) {
    paymentByEnrollment.set(payment.enrollment_id, (paymentByEnrollment.get(payment.enrollment_id) || 0) + money(payment.amount));
  }
  for (const enrollment of enrollments) {
    const billing = billingByEnrollment.get(enrollment.id);
    assert(billing, `missing billing for enrollment ${enrollment.id}`);
    const paymentTotal = paymentByEnrollment.get(enrollment.id) || 0;
    assert(
      paymentTotal === money(billing.payable_amount),
      `payment/billing mismatch for enrollment ${enrollment.id}: payment=${paymentTotal}, payable=${billing.payable_amount}`,
    );
  }

  const refunds = await supaQuery(
    db.from('enrollment_refunds').select('id, payment_id, amount, method, refund_date').in('payment_id', state.createdPayments.map((row) => row.id)),
    'select refunds',
  );
  assert(refunds.length === state.createdRefunds.length, `refund row count mismatch: expected ${state.createdRefunds.length}, got ${refunds.length}`);
  const refundTotal = refunds.reduce((sum, refund) => sum + money(refund.amount), 0);
  assert(refundTotal === state.expected.refundAmount, `refund amount mismatch: expected ${state.expected.refundAmount}, got ${refundTotal}`);
}

function makeTsLoader() {
  const cache = new Map();
  const moduleAliases = {
    'server-only': {},
    'next/cache': {
      unstable_cache: (fn) => fn,
      revalidateTag: () => undefined,
    },
  };

  function loadTsModule(filePath) {
    const resolved = path.resolve(filePath);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const source = fs.readFileSync(resolved, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: resolved,
    }).outputText;
    const mod = { exports: {} };
    cache.set(resolved, mod);

    function localRequire(request) {
      if (Object.prototype.hasOwnProperty.call(moduleAliases, request)) {
        return moduleAliases[request];
      }
      if (request.startsWith('@/')) {
        const base = path.join(APP_ROOT, 'src', request.slice(2));
        return resolveProjectRequire(base);
      }
      if (request.startsWith('./') || request.startsWith('../')) {
        return resolveProjectRequire(path.resolve(path.dirname(resolved), request));
      }
      return require(request);
    }

    const context = {
      require: localRequire,
      module: mod,
      exports: mod.exports,
      __filename: resolved,
      __dirname: path.dirname(resolved),
      process,
      console,
      Buffer,
      setTimeout,
      clearTimeout,
      URL,
      Blob: global.Blob,
    };
    vm.runInNewContext(transpiled, context, { filename: resolved });
    return mod.exports;
  }

  function resolveProjectRequire(basePath) {
    const candidates = [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      path.join(basePath, 'index.ts'),
      path.join(basePath, 'index.tsx'),
      path.join(basePath, 'index.js'),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      if (candidate.endsWith('.ts') || candidate.endsWith('.tsx')) {
        return loadTsModule(candidate);
      }
      return require(candidate);
    }
    return require(basePath);
  }

  return { loadTsModule };
}

async function verifySettlementReportAndXlsx() {
  const { loadTsModule } = makeTsLoader();
  const serviceModule = loadTsModule(path.join(APP_ROOT, 'src/lib/payments/service.ts'));
  const reportModule = loadTsModule(path.join(APP_ROOT, 'src/lib/payments/settlement-report.ts'));
  const exportModule = loadTsModule(path.join(APP_ROOT, 'src/lib/payments/xlsx-export.ts'));

  const payments = await serviceModule.listSettlementDetailPayments(
    {
      from: TEST_DATE,
      to: TEST_DATE,
      limit: 1000,
    },
    DIVISION,
  );
  const report = reportModule.buildSettlementReport(payments, TEST_DATE, TEST_DATE);

  assert(report.paymentRows.length === state.createdPayments.length, `report paymentRows mismatch: ${report.paymentRows.length}`);
  assert(report.refundRows.length === state.createdRefunds.length, `report refundRows mismatch: ${report.refundRows.length}`);
  assert(report.summary.grossAmount === state.expected.grossAmount, `report gross mismatch: ${report.summary.grossAmount}`);
  assert(report.summary.refundAmount === state.expected.refundAmount, `report refund mismatch: ${report.summary.refundAmount}`);
  assert(
    report.summary.netAmount === state.expected.grossAmount - state.expected.refundAmount,
    `report net mismatch: ${report.summary.netAmount}`,
  );

  const missingCodes = report.ledgerRows.filter((row) => !row.courseReportCode);
  assert(missingCodes.length === 0, `ledger rows missing course report code: ${missingCodes.length}`);

  const methodsInLedger = new Set(report.ledgerRows.map((row) => row.method));
  for (const method of ['card', 'bank_transfer', 'point', 'cash']) {
    assert(methodsInLedger.has(method), `ledger missing method ${method}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const oldCwd = process.cwd();
  process.chdir(OUTPUT_DIR);
  try {
    exportModule.downloadDailySettlementReportXlsx(report, TEST_DATE);
  } finally {
    process.chdir(oldCwd);
  }

  const outputFile = path.join(OUTPUT_DIR, `settlement-report-${TEST_DATE.replaceAll('-', '')}.xlsx`);
  assert(fs.existsSync(outputFile), `report xlsx was not created: ${outputFile}`);

  const workbook = XLSX.readFile(outputFile, { cellStyles: true });
  const sheetName = '\ubcf4\uace0\uc6a9';
  const sheet = workbook.Sheets[sheetName];
  assert(sheet, `missing sheet ${sheetName}`);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const expectedHeaders = {
    A1: '\uc6d4/\uc77c',
    B1: '\uc774\ub984',
    C1: 'Code',
    D1: '\uad6c\ubd84',
    E1: '\ub0b4\uc5ed \ubc0f NO.',
    F1: '\uacb0\uc81c\uc218\ub2e8',
    F2: '\ud604\uae08',
    G2: '\uce74\ub4dc',
    H2: '\ud3ec\uc778\ud2b8',
    I2: '\uacc4\uc88c\uc785\uae08',
    J1: '\uce74\ub4dc\uc0ac\n\uad6c\ubd84',
    K1: '\ube44\uace0',
  };
  for (const [cell, expected] of Object.entries(expectedHeaders)) {
    const actual = sheet[cell]?.v;
    assert(actual === expected, `xlsx header ${cell} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  const expectedMerges = new Set(['A1:A2', 'B1:B2', 'C1:C2', 'D1:D2', 'E1:E2', 'F1:I1', 'J1:J2', 'K1:K2']);
  const actualMerges = new Set((sheet['!merges'] || []).map((merge) => XLSX.utils.encode_range(merge)));
  for (const merge of expectedMerges) {
    assert(actualMerges.has(merge), `xlsx merge missing: ${merge}`);
  }

  assert((sheet['!cols'] || []).length === 11, `xlsx column width count should be 11, got ${(sheet['!cols'] || []).length}`);

  const dataRows = rows.slice(2).filter((row) => row.some((value) => value !== ''));
  assert(dataRows.length === report.ledgerRows.length, `xlsx data row count mismatch: expected ${report.ledgerRows.length}, got ${dataRows.length}`);
  const xlsxLedgerRows = [...report.ledgerRows].sort((left, right) => {
    const occurredCompare = left.occurredAt.localeCompare(right.occurredAt);
    return occurredCompare === 0 ? left.id.localeCompare(right.id) : occurredCompare;
  });

  const codeMissingRows = dataRows.filter((row) => !String(row[2] || '').trim());
  assert(codeMissingRows.length === 0, `xlsx Code column has blanks: ${codeMissingRows.length}`);

  const sums = dataRows.reduce(
    (acc, row) => {
      acc.cash += money(row[5]);
      acc.card += money(row[6]);
      acc.point += money(row[7]);
      acc.bank += money(row[8]);
      return acc;
    },
    { cash: 0, card: 0, point: 0, bank: 0 },
  );
  const totalFromXlsx = sums.cash + sums.card + sums.point + sums.bank;
  assert(totalFromXlsx === report.summary.netAmount, `xlsx amount total mismatch: expected ${report.summary.netAmount}, got ${totalFromXlsx}`);
  assert(sums.cash !== 0, 'xlsx cash column should contain amounts');
  assert(sums.card !== 0, 'xlsx card column should contain amounts');
  assert(sums.point !== 0, 'xlsx point column should contain amounts');
  assert(sums.bank !== 0, 'xlsx bank transfer column should contain amounts');

  const cardRowsWithoutCompany = dataRows.filter((row, index) => {
    const ledgerRow = xlsxLedgerRows[index];
    return money(row[6]) !== 0
      && (ledgerRow?.method === 'card'
        || (ledgerRow?.method === 'card_cancel' && ledgerRow?.originalPaymentMethod === 'card'))
      && !String(row[9] || '').trim();
  });
  assert(cardRowsWithoutCompany.length === 0, `xlsx card rows missing card company: ${cardRowsWithoutCompany.length}`);

  const rowsWithoutReceiptNoInDetail = dataRows.filter((row, index) => {
    const ledgerRow = xlsxLedgerRows[index];
    return ledgerRow?.receiptNo && !String(row[4] || '').includes(ledgerRow.receiptNo);
  });
  assert(
    rowsWithoutReceiptNoInDetail.length === 0,
    `xlsx detail column missing receipt numbers: ${rowsWithoutReceiptNoInDetail.length}`,
  );

  return {
    outputFile,
    report,
    xlsxSums: sums,
  };
}

async function cleanup() {
  log('cleaning test data');
  const courses = await selectAll(
    () => db.from('courses').select('id').eq('division', DIVISION).like('slug', `pay100-%-${RUN_ID}`).order('id'),
    'cleanup select courses',
  );
  const courseIds = (courses || []).map((row) => row.id);
  let enrollmentIds = [];
  let paymentIds = [];
  let studentIds = [];

  if (courseIds.length > 0) {
    const enrollments = await selectAll(
      () => db.from('enrollments').select('id, student_id').in('course_id', courseIds).order('id'),
      'cleanup select enrollments',
    );
    enrollmentIds = (enrollments || []).map((row) => row.id);
    studentIds = (enrollments || []).map((row) => row.student_id);

    const payments = await selectAll(
      () => db.from('enrollment_payments').select('id').in('course_id', courseIds).order('id'),
      'cleanup select payments',
    );
    paymentIds = (payments || []).map((row) => row.id);
  }

  if (paymentIds.length > 0) {
    await deleteInChunks('settlement_entry_confirmations', 'payment_id', paymentIds);
    await deleteInChunks('enrollment_refunds', 'payment_id', paymentIds);
    await deleteInChunks('payment_events', 'payment_id', paymentIds);
    await deleteInChunks('enrollment_payment_items', 'payment_id', paymentIds);
    await deleteInChunks('enrollment_payments', 'id', paymentIds);
  }
  if (enrollmentIds.length > 0) {
    await deleteInChunks('payment_events', 'enrollment_id', enrollmentIds);
    await deleteInChunks('textbook_assignments', 'enrollment_id', enrollmentIds);
    await deleteInChunks('enrollment_billing', 'enrollment_id', enrollmentIds);
    await deleteInChunks('enrollments', 'id', enrollmentIds);
  }

  const directStudents = await selectAll(
    () => db
      .from('students')
      .select('id')
      .eq('division', DIVISION)
      .or(`exam_number.like.P100-${RUN_ID}-%,exam_number.eq.P100-BAD-${RUN_ID}`)
      .order('id'),
    'cleanup select direct students',
  );
  studentIds.push(...(directStudents || []).map((row) => row.id));
  if (studentIds.length > 0) {
    const remainingEnrollments = await selectAll(
      () => db.from('enrollments').select('id').in('student_id', [...new Set(studentIds)]).order('id'),
      'cleanup select remaining enrollments by student',
    );
    const remainingEnrollmentIds = (remainingEnrollments || []).map((row) => row.id);
    if (remainingEnrollmentIds.length > 0) {
      const remainingPayments = await selectAll(
        () => db.from('enrollment_payments').select('id').in('enrollment_id', remainingEnrollmentIds).order('id'),
        'cleanup select remaining payments by enrollment',
      );
      const remainingPaymentIds = (remainingPayments || []).map((row) => row.id);
      if (remainingPaymentIds.length > 0) {
        await deleteInChunks('settlement_entry_confirmations', 'payment_id', remainingPaymentIds);
        await deleteInChunks('enrollment_refunds', 'payment_id', remainingPaymentIds);
        await deleteInChunks('payment_events', 'payment_id', remainingPaymentIds);
        await deleteInChunks('enrollment_payment_items', 'payment_id', remainingPaymentIds);
        await deleteInChunks('enrollment_payments', 'id', remainingPaymentIds);
      }
      await deleteInChunks('payment_events', 'enrollment_id', remainingEnrollmentIds);
      await deleteInChunks('textbook_assignments', 'enrollment_id', remainingEnrollmentIds);
      await deleteInChunks('enrollment_billing', 'enrollment_id', remainingEnrollmentIds);
      await deleteInChunks('enrollments', 'id', remainingEnrollmentIds);
    }
    await deleteInChunks('students', 'id', studentIds);
  }
  if (courseIds.length > 0) {
    await deleteInChunks('courses', 'id', courseIds);
  }
  if (state.membershipId) {
    await supaQuery(
      db.from('operator_memberships').delete().eq('id', state.membershipId),
      'cleanup operator membership',
    );
  } else if (state.accountId) {
    await supaQuery(
      db.from('operator_memberships').delete().eq('operator_account_id', state.accountId),
      'cleanup operator memberships by account',
    );
  }
  if (state.createdBranch && state.branchId) {
    await supaQuery(
      db.from('branch_series_options').delete().eq('branch_id', state.branchId),
      'cleanup branch series options',
    );
    await supaQuery(
      db.from('branches').delete().eq('id', state.branchId),
      'cleanup branch',
    );
  }
  if (state.accountId) {
    await supaQuery(
      db.from('operator_accounts').delete().eq('id', state.accountId),
      'cleanup operator account',
    );
  }
}

async function main() {
  log(`base url ${BASE_URL}`);
  log(`division ${DIVISION}`);
  await cleanup();
  if (process.env.PAY100_CLEANUP_ONLY === '1') {
    log('cleanup-only complete');
    return;
  }
  await setupBranchAndAdmin();
  await createCourses();
  const cookie = await devLogin();
  await verifyMixedBundleRejected(cookie);
  await verifyReactivatedTextbookRollback(cookie);
  await verifyPaymentReceiptConcurrency();
  await verifyPaymentBundleRpcOverpayGuard();
  await createRegistrations(cookie);
  await createRefunds(cookie);
  await confirmSettlementEntries(cookie);
  await verifyDatabase();
  const result = await verifySettlementReportAndXlsx();

  log(`students verified: ${state.expected.students}`);
  log(`enrollments verified: ${state.expected.enrollments}`);
  log(`payment rows verified: ${state.expected.payments}`);
  log(`gross verified: ${state.expected.grossAmount}`);
  log(`refund verified: ${state.expected.refundAmount}`);
  log(`xlsx verified: ${result.outputFile}`);

  if (!KEEP_DATA) {
    await cleanup();
  } else {
    log('PAY100_KEEP_DATA=1, test rows were left in the local DB');
  }
}

main().catch(async (error) => {
  console.error(`[pay100:${RUN_ID}] FAILED`);
  console.error(error);
  console.error(`[pay100:${RUN_ID}] Test data was kept for debugging.`);
  process.exitCode = 1;
});
