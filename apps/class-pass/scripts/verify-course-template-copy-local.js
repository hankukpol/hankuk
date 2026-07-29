const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

function readEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName)
  if (!fs.existsSync(filePath)) return {}

  const values = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separator = line.indexOf('=')
    if (separator <= 0) continue

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    values[key] = value
  }
  return values
}

function requireLocalConfig() {
  const development = readEnvFile('.env.development.local')
  const fallback = readEnvFile('.env.local')
  const url = development.NEXT_PUBLIC_SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || fallback.NEXT_PUBLIC_SUPABASE_URL
  const key = development.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || fallback.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Local Supabase URL and service role key are required.')
  }

  const parsed = new URL(url)
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`Template copy verification only runs against local Supabase, got ${parsed.hostname}.`)
  }

  return { url, key }
}

async function must(resultPromise, label) {
  const result = await resultPromise
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`)
  }
  return result.data
}

function comparableRoom(room) {
  return {
    name: room.name,
    sort_order: room.sort_order,
    is_active: room.is_active,
  }
}

function comparableLayout(layout) {
  return {
    columns: layout.columns,
    rows: layout.rows,
    aisle_columns: layout.aisle_columns,
  }
}

function comparableSeat(seat) {
  return {
    label: seat.label,
    position_x: seat.position_x,
    position_y: seat.position_y,
    is_active: seat.is_active,
  }
}

function parseCopiedCourse(data, label) {
  const candidate = Array.isArray(data) ? data[0] : data
  assert.ok(candidate && typeof candidate === 'object', `${label} should return a course object`)
  assert.ok(Number.isInteger(candidate.id) && candidate.id > 0, `${label} should return a valid course ID`)
  return candidate
}

function quoteSqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function detectLocalDatabaseContainer(url) {
  const configured = process.env.CLASS_PASS_SUPABASE_DB_CONTAINER
  if (configured) {
    if (!/^supabase_db_[a-zA-Z0-9_.-]+$/.test(configured)) {
      throw new Error('CLASS_PASS_SUPABASE_DB_CONTAINER has an invalid value.')
    }
    return configured
  }

  const apiPort = new URL(url).port
  const result = spawnSync(
    'docker',
    ['ps', '--format', '{{.Names}}|{{.Ports}}'],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`Could not inspect local Supabase containers: ${result.stderr || result.error?.message}`)
  }

  const kongLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('supabase_kong_') && line.includes(`:${apiPort}->8000/tcp`))
  if (!kongLine) {
    throw new Error(`Could not match local Supabase API port ${apiPort} to a Docker stack.`)
  }

  const kongContainer = kongLine.split('|', 1)[0]
  return kongContainer.replace(/^supabase_kong_/, 'supabase_db_')
}

function verifyTransactionalRollback({ url, sourceCourseId, division }) {
  const container = detectLocalDatabaseContainer(url)
  const divisionLiteral = quoteSqlLiteral(division)
  const sql = `
begin;

create function pg_temp.fail_course_template_copy_seat()
returns trigger
language plpgsql
as $trigger$
begin
  if exists (
    select 1
    from class_pass.courses
    where id = new.course_id
      and copied_from_course_id = ${sourceCourseId}
  ) then
    raise exception 'TEMPLATE_COPY_ROLLBACK_TEST';
  end if;
  return new;
end;
$trigger$;

create trigger verify_course_template_copy_rollback
before insert on class_pass.course_seats
for each row execute function pg_temp.fail_course_template_copy_seat();

do $rollback$
declare
  v_before_count integer;
  v_after_count integer;
  v_error_message text;
begin
  select count(*)
    into v_before_count
  from class_pass.courses
  where division = ${divisionLiteral}
    and copied_from_course_id = ${sourceCourseId};

  begin
    perform class_pass.copy_course_template(${sourceCourseId}, ${divisionLiteral});
    raise exception 'COPY_COMPLETED_WITHOUT_EXPECTED_FAILURE';
  exception
    when others then
      v_error_message := sqlerrm;
      if position('TEMPLATE_COPY_ROLLBACK_TEST' in v_error_message) = 0 then
        raise exception 'Unexpected rollback verification error: %', v_error_message;
      end if;
  end;

  select count(*)
    into v_after_count
  from class_pass.courses
  where division = ${divisionLiteral}
    and copied_from_course_id = ${sourceCourseId};

  if v_after_count <> v_before_count then
    raise exception 'Template copy rollback left a partial course';
  end if;
end;
$rollback$;

select 'ROLLBACK_VERIFIED';
rollback;
`

  const result = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
    { input: sql, encoding: 'utf8' },
  )
  if (result.status !== 0 || !result.stdout.includes('ROLLBACK_VERIFIED')) {
    throw new Error(`transaction rollback verification failed: ${result.stderr || result.stdout}`)
  }
}

async function main() {
  const { url, key } = requireLocalConfig()
  const db = createClient(url, key, {
    db: { schema: 'class_pass' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const division = `template-copy-verify-${Date.now().toString(36)}`
  let sourceCourseId = null
  let studentId = null

  try {
    const sourceCourse = await must(
      db
        .from('courses')
        .insert({
          division,
          name: '강좌 템플릿 복사 로컬 검증',
          slug: `template-copy-source-${Date.now().toString(36)}`,
          course_type: 'lecture',
          status: 'active',
          theme_color: '#1A237E',
          tuition_amount: 370000,
          settlement_report_code: 'TPL-COPY',
          feature_qr_pass: true,
          feature_qr_distribution: true,
          feature_seat_assignment: true,
          feature_designated_seat: true,
          feature_attendance: true,
          feature_time_window: true,
          feature_photo: true,
          feature_dday: true,
          feature_notices: true,
          feature_refund_policy: true,
          feature_exam_delivery_mode: true,
          feature_weekday_color: true,
          feature_anti_forgery_motion: true,
          time_window_start: '08:30',
          time_window_end: '22:00',
          target_date: '2026-12-31',
          target_date_label: '개강',
          notice_title: '템플릿 공지',
          notice_content: '템플릿 공지 내용',
          notice_visible: true,
          refund_policy: '템플릿 환불 규정',
          kakao_chat_url: 'https://example.com/kakao',
          extra_site_url: 'https://example.com/course',
          extra_site_label: '강좌 안내',
          presence_location_enabled: true,
          presence_enforcement_mode: 'monitor',
          presence_latitude: 37.5665,
          presence_longitude: 126.978,
          presence_radius_m: 180,
          presence_accuracy_max_m: 250,
          presence_required_for_attendance: true,
          presence_required_for_designated_seat: true,
          enrolled_from: '2026-08-01',
          enrolled_until: '2026-12-31',
          enrollment_fields: [
            { key: 'class_group', label: '반', type: 'select', options: ['A', 'B'] },
          ],
          designated_seat_open: true,
          attendance_open: true,
          sort_order: 7,
        })
        .select('*')
        .single(),
      'seed source course',
    )
    sourceCourseId = sourceCourse.id

    const student = await must(
      db
        .from('students')
        .insert({
          division,
          name: '템플릿 검증 학생',
          phone: `010${String(Date.now()).slice(-8)}`,
        })
        .select('id,name,phone')
        .single(),
      'seed student',
    )
    studentId = student.id

    const subjects = await must(
      db
        .from('course_subjects')
        .insert([
          { course_id: sourceCourse.id, name: '형법', sort_order: 0 },
          { course_id: sourceCourse.id, name: '경찰학', sort_order: 1 },
        ])
        .select('id,course_id,name,sort_order'),
      'seed subjects',
    )

    const rooms = await must(
      db
        .from('course_rooms')
        .insert([
          {
            course_id: sourceCourse.id,
            name: '제1강의실',
            sort_order: 0,
            is_active: true,
            is_open: true,
          },
          {
            course_id: sourceCourse.id,
            name: '제2강의실',
            sort_order: 1,
            is_active: false,
            is_open: true,
          },
        ])
        .select('*'),
      'seed rooms',
    )
    const roomByName = new Map(rooms.map((room) => [room.name, room]))

    await must(
      db
        .from('course_seat_layouts')
        .insert([
          {
            course_id: sourceCourse.id,
            room_id: roomByName.get('제1강의실').id,
            columns: 4,
            rows: 3,
            aisle_columns: [2],
          },
          {
            course_id: sourceCourse.id,
            room_id: roomByName.get('제2강의실').id,
            columns: 3,
            rows: 2,
            aisle_columns: [1, 2],
          },
        ]),
      'seed layouts',
    )

    const sourceSeats = await must(
      db
        .from('course_seats')
        .insert([
          {
            course_id: sourceCourse.id,
            room_id: roomByName.get('제1강의실').id,
            label: 'A1',
            position_x: 1,
            position_y: 1,
            is_active: true,
          },
          {
            course_id: sourceCourse.id,
            room_id: roomByName.get('제1강의실').id,
            label: 'A2',
            position_x: 2,
            position_y: 1,
            is_active: false,
          },
          {
            course_id: sourceCourse.id,
            room_id: roomByName.get('제2강의실').id,
            label: 'B1',
            position_x: 1,
            position_y: 1,
            is_active: true,
          },
        ])
        .select('*'),
      'seed seats',
    )

    const enrollment = await must(
      db
        .from('enrollments')
        .insert({
          course_id: sourceCourse.id,
          student_id: student.id,
          name: student.name,
          phone: student.phone,
        })
        .select('id')
        .single(),
      'seed enrollment',
    )

    await must(
      db.from('course_seat_reservations').insert({
        course_id: sourceCourse.id,
        room_id: roomByName.get('제1강의실').id,
        seat_id: sourceSeats.find((seat) => seat.label === 'A1').id,
        enrollment_id: enrollment.id,
      }),
      'seed reservation',
    )
    await must(
      db.from('materials').insert({
        course_id: sourceCourse.id,
        name: '복사 제외 자료',
        material_type: 'handout',
        subject_id: subjects[0].id,
      }),
      'seed material',
    )

    await must(
      db.from('enrollment_payments').insert({
        enrollment_id: enrollment.id,
        course_id: sourceCourse.id,
        amount: 10000,
        method: 'cash',
        status: 'paid',
        category: 'tuition',
      }),
      'seed payment',
    )

    await must(
      db.from('seat_assignments').insert({
        enrollment_id: enrollment.id,
        subject_id: subjects[0].id,
        seat_number: '12',
      }),
      'seed seat assignment',
    )
    await must(
      db.from('seat_assignment_absence_states').insert({
        enrollment_id: enrollment.id,
        subject_id: subjects[0].id,
        pending_reassignment_reset: true,
      }),
      'seed seat assignment history state',
    )
    await must(
      db.from('course_seat_events').insert({
        course_id: sourceCourse.id,
        enrollment_id: enrollment.id,
        seat_id: sourceSeats.find((seat) => seat.label === 'A1').id,
        event_type: 'reserved',
        details: { source: 'template-copy-verification' },
      }),
      'seed seat event history',
    )

    await must(
      db.from('course_seat_auth_sessions').insert({
        course_id: sourceCourse.id,
        room_id: roomByName.get('제1강의실').id,
        enrollment_id: enrollment.id,
        device_key_hash: `auth-device-${division}`,
        verification_method: 'qr',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        last_verified_rotation: 1,
      }),
      'seed designated-seat auth session',
    )
    await must(
      db.from('attendance_device_bindings').insert({
        course_id: sourceCourse.id,
        enrollment_id: enrollment.id,
        device_key_hash: `attendance-device-${division}`,
      }),
      'seed attendance device binding',
    )

    const attendanceDisplaySession = await must(
      db
        .from('attendance_display_sessions')
        .insert({
          course_id: sourceCourse.id,
          subject_id: subjects[0].id,
          display_token_hash: `attendance-display-${division}`,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single(),
      'seed attendance display session',
    )
    await must(
      db.from('attendance_records').insert({
        course_id: sourceCourse.id,
        enrollment_id: enrollment.id,
        subject_id: subjects[0].id,
        display_session_id: attendanceDisplaySession.id,
        device_key_hash: `attendance-record-${division}`,
      }),
      'seed attendance record',
    )
    await must(
      db.from('attendance_events').insert({
        course_id: sourceCourse.id,
        event_type: 'student_checked_in',
        details: { enrollment_id: enrollment.id },
      }),
      'seed attendance event',
    )

    const displaySchedule = await must(
      db
        .from('course_seat_display_schedules')
        .insert({
          course_id: sourceCourse.id,
          day_of_week: 1,
          start_time: '09:00',
          end_time: '10:00',
          label: '복사 제외 표시 스케줄',
        })
        .select('id')
        .single(),
      'seed display schedule',
    )
    const displaySlot = await must(
      db
        .from('course_seat_display_slots')
        .insert({
          division,
          slot_key: `slot-${Date.now().toString(36)}`,
          label: '복사 제외 표시 슬롯',
          course_id: sourceCourse.id,
        })
        .select('id')
        .single(),
      'seed display slot',
    )
    await must(
      db.from('course_seat_display_slot_schedules').insert({
        slot_id: displaySlot.id,
        day_of_week: 1,
        start_time: '10:00',
        end_time: '11:00',
        label: '복사 제외 슬롯 스케줄',
      }),
      'seed display slot schedule',
    )
    await must(
      db.from('course_seat_display_devices').insert({
        course_id: sourceCourse.id,
        slot_id: displaySlot.id,
        device_name: '복사 제외 표시 기기',
        device_token_hash: `display-device-${division}`,
      }),
      'seed display device',
    )
    await must(
      db.from('course_seat_display_sessions').insert({
        course_id: sourceCourse.id,
        room_id: roomByName.get('제1강의실').id,
        display_slot_id: displaySlot.id,
        schedule_id: displaySchedule.id,
        display_token_hash: `display-session-${division}`,
        source: 'schedule',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
      'seed active display session',
    )

    const firstCopyResult = await must(
      db.rpc('copy_course_template', {
        p_source_course_id: sourceCourse.id,
        p_target_division: division,
      }),
      'copy first template',
    )
    const secondCopyResult = await must(
      db.rpc('copy_course_template', {
        p_source_course_id: sourceCourse.id,
        p_target_division: division,
      }),
      'copy second template',
    )
    const firstCopy = parseCopiedCourse(firstCopyResult, 'first template copy')
    const secondCopy = parseCopiedCourse(secondCopyResult, 'second template copy')
    const firstCopyId = firstCopy.id
    const secondCopyId = secondCopy.id

    assert.notEqual(firstCopyId, secondCopyId)
    assert.equal(firstCopy.division, division)
    assert.equal(secondCopy.division, division)

    const copiedCourse = await must(
      db.from('courses').select('*').eq('id', firstCopyId).single(),
      'load copied course',
    )
    const secondCopiedCourse = await must(
      db.from('courses').select('*').eq('id', secondCopyId).single(),
      'load second copied course',
    )

    assert.equal(copiedCourse.name, `${sourceCourse.name} (템플릿 복사본)`)
    assert.equal(secondCopiedCourse.name, `${sourceCourse.name} (템플릿 복사본 2)`)
    assert.equal(copiedCourse.slug, `${sourceCourse.slug}-template-copy`)
    assert.equal(secondCopiedCourse.slug, `${sourceCourse.slug}-template-copy-2`)
    assert.equal(copiedCourse.status, 'archived')
    assert.equal(copiedCourse.designated_seat_open, false)
    assert.equal(copiedCourse.attendance_open, false)
    assert.equal(copiedCourse.copied_from_course_id, sourceCourse.id)
    assert.equal(copiedCourse.copied_from_course_name, sourceCourse.name)
    assert.ok(copiedCourse.copied_at)

    verifyTransactionalRollback({
      url,
      sourceCourseId: sourceCourse.id,
      division,
    })

    const longSourceName = '가'.repeat(100)
    const longSourceSlug = 's'.repeat(100)
    const longSourceCourse = await must(
      db
        .from('courses')
        .insert({
          division,
          name: longSourceName,
          slug: longSourceSlug,
          status: 'active',
        })
        .select('id')
        .single(),
      'seed maximum-length source course',
    )
    const longCopyResult = await must(
      db.rpc('copy_course_template', {
        p_source_course_id: longSourceCourse.id,
        p_target_division: division,
      }),
      'copy maximum-length template',
    )
    const longCopy = parseCopiedCourse(longCopyResult, 'maximum-length template copy')
    const longNameSuffix = ' (템플릿 복사본)'
    const longSlugSuffix = '-template-copy'
    assert.equal(longCopy.name.length, 100)
    assert.equal(longCopy.slug.length, 100)
    assert.equal(
      longCopy.name,
      `${longSourceName.slice(0, 100 - longNameSuffix.length)}${longNameSuffix}`,
    )
    assert.equal(
      longCopy.slug,
      `${longSourceSlug.slice(0, 100 - longSlugSuffix.length)}${longSlugSuffix}`,
    )

    const copiedSettingFields = [
      'course_type',
      'theme_color',
      'tuition_amount',
      'settlement_report_code',
      'feature_qr_pass',
      'feature_qr_distribution',
      'feature_seat_assignment',
      'feature_designated_seat',
      'feature_attendance',
      'feature_time_window',
      'feature_photo',
      'feature_dday',
      'feature_notices',
      'feature_refund_policy',
      'feature_exam_delivery_mode',
      'feature_weekday_color',
      'feature_anti_forgery_motion',
      'time_window_start',
      'time_window_end',
      'target_date',
      'target_date_label',
      'notice_title',
      'notice_content',
      'notice_visible',
      'refund_policy',
      'kakao_chat_url',
      'extra_site_url',
      'extra_site_label',
      'presence_location_enabled',
      'presence_enforcement_mode',
      'presence_latitude',
      'presence_longitude',
      'presence_radius_m',
      'presence_accuracy_max_m',
      'presence_required_for_attendance',
      'presence_required_for_designated_seat',
      'enrolled_from',
      'enrolled_until',
      'enrollment_fields',
    ]
    for (const field of copiedSettingFields) {
      assert.deepEqual(copiedCourse[field], sourceCourse[field], `course field mismatch: ${field}`)
    }

    const copiedSubjects = await must(
      db
        .from('course_subjects')
        .select('id,name,sort_order')
        .eq('course_id', firstCopyId)
        .order('sort_order')
        .order('id'),
      'load copied subjects',
    )
    assert.deepEqual(
      copiedSubjects.map(({ name, sort_order }) => ({ name, sort_order })),
      subjects.map(({ name, sort_order }) => ({ name, sort_order })),
    )

    const copiedRooms = await must(
      db
        .from('course_rooms')
        .select('*')
        .eq('course_id', firstCopyId)
        .order('sort_order')
        .order('id'),
      'load copied rooms',
    )
    assert.deepEqual(copiedRooms.map(comparableRoom), rooms.map(comparableRoom))
    assert.ok(copiedRooms.every((room) => room.is_open === false))
    assert.ok(copiedRooms.every((room) => !rooms.some((sourceRoom) => sourceRoom.id === room.id)))

    for (const copiedRoom of copiedRooms) {
      const sourceRoom = roomByName.get(copiedRoom.name)
      const [sourceLayout, copiedLayout, originalRoomSeats, copiedRoomSeats] = await Promise.all([
        must(
          db
            .from('course_seat_layouts')
            .select('*')
            .eq('course_id', sourceCourse.id)
            .eq('room_id', sourceRoom.id)
            .single(),
          `load source layout ${sourceRoom.name}`,
        ),
        must(
          db
            .from('course_seat_layouts')
            .select('*')
            .eq('course_id', firstCopyId)
            .eq('room_id', copiedRoom.id)
            .single(),
          `load copied layout ${copiedRoom.name}`,
        ),
        must(
          db
            .from('course_seats')
            .select('*')
            .eq('course_id', sourceCourse.id)
            .eq('room_id', sourceRoom.id)
            .order('position_y')
            .order('position_x'),
          `load source seats ${sourceRoom.name}`,
        ),
        must(
          db
            .from('course_seats')
            .select('*')
            .eq('course_id', firstCopyId)
            .eq('room_id', copiedRoom.id)
            .order('position_y')
            .order('position_x'),
          `load copied seats ${copiedRoom.name}`,
        ),
      ])

      assert.deepEqual(comparableLayout(copiedLayout), comparableLayout(sourceLayout))
      assert.deepEqual(copiedRoomSeats.map(comparableSeat), originalRoomSeats.map(comparableSeat))
      assert.ok(
        copiedRoomSeats.every((seat) => !originalRoomSeats.some((sourceSeat) => sourceSeat.id === seat.id)),
      )
    }

    for (const table of [
      'enrollments',
      'materials',
      'enrollment_payments',
      'attendance_device_bindings',
      'attendance_display_sessions',
      'attendance_records',
      'attendance_events',
      'course_seat_reservations',
      'course_seat_auth_sessions',
      'course_seat_events',
      'course_seat_display_slots',
      'course_seat_display_devices',
      'course_seat_display_schedules',
      'course_seat_display_sessions',
    ]) {
      const rows = await must(
        db.from(table).select('id').eq('course_id', firstCopyId),
        `verify excluded table ${table}`,
      )
      assert.equal(rows.length, 0, `${table} should not be copied`)
    }

    const copiedSubjectIds = copiedSubjects.map((subject) => subject.id)
    const [copiedAssignments, copiedAssignmentHistory] = await Promise.all([
      must(
        db.from('seat_assignments').select('id').in('subject_id', copiedSubjectIds),
        'verify excluded seat assignments',
      ),
      must(
        db
          .from('seat_assignment_absence_states')
          .select('subject_id')
          .in('subject_id', copiedSubjectIds),
        'verify excluded seat assignment history',
      ),
    ])
    assert.equal(copiedAssignments.length, 0, 'seat assignments should not be copied')
    assert.equal(copiedAssignmentHistory.length, 0, 'seat assignment history should not be copied')

    const divisionStudents = await must(
      db.from('students').select('id').eq('division', division),
      'verify students are not copied',
    )
    assert.deepEqual(divisionStudents.map((row) => row.id), [student.id])

    const wrongDivision = await db.rpc('copy_course_template', {
      p_source_course_id: sourceCourse.id,
      p_target_division: `${division}-other`,
    })
    assert.ok(wrongDivision.error)
    assert.match(wrongDivision.error.message, /SOURCE_COURSE_NOT_FOUND/)

    const sourceAfterCopy = await must(
      db.from('courses').select('status,designated_seat_open,attendance_open').eq('id', sourceCourse.id).single(),
      'verify source unchanged',
    )
    assert.deepEqual(sourceAfterCopy, {
      status: 'active',
      designated_seat_open: true,
      attendance_open: true,
    })

    console.log(`course template copy verification passed: ${firstCopyId}, ${secondCopyId}`)
  } finally {
    if (sourceCourseId) {
      const paymentCleanup = await db.from('enrollment_payments').delete().eq('course_id', sourceCourseId)
      if (paymentCleanup.error) {
        throw new Error(`payment cleanup failed: ${paymentCleanup.error.message}`)
      }
    }

    const courseCleanup = await db.from('courses').delete().eq('division', division)
    if (courseCleanup.error) {
      throw new Error(`course cleanup failed: ${courseCleanup.error.message}`)
    }

    const slotCleanup = await db.from('course_seat_display_slots').delete().eq('division', division)
    if (slotCleanup.error) {
      throw new Error(`display slot cleanup failed: ${slotCleanup.error.message}`)
    }

    if (studentId) {
      const studentCleanup = await db.from('students').delete().eq('id', studentId)
      if (studentCleanup.error) {
        throw new Error(`student cleanup failed: ${studentCleanup.error.message}`)
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
