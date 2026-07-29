import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCourseSlugCandidate,
  COURSE_SLUG_MAX_LENGTH,
  decideCourseSlugUpdate,
} from '../../src/lib/course-slug'

describe('decideCourseSlugUpdate', () => {
  it('운영 강좌의 slug 직접 변경을 거부한다', () => {
    assert.deepEqual(
      decideCourseSlugUpdate({
        currentName: '운영 강좌',
        currentSlug: 'active-course',
        currentStatus: 'active',
        copiedAt: null,
        nextName: '운영 강좌',
        nextStatus: 'active',
        requestedSlug: 'changed-course',
      }),
      { type: 'reject-active-change' },
    )
  })

  it('운영 강좌의 이름만 바꾸면 기존 slug를 유지한다', () => {
    assert.deepEqual(
      decideCourseSlugUpdate({
        currentName: '운영 강좌',
        currentSlug: 'active-course',
        currentStatus: 'active',
        copiedAt: null,
        nextName: '운영 강좌 새 이름',
        nextStatus: 'active',
        requestedSlug: undefined,
      }),
      { type: 'use', slug: 'active-course' },
    )
  })

  it('보관된 템플릿 복사본의 이름이 바뀌면 slug 재생성을 요청한다', () => {
    assert.deepEqual(
      decideCourseSlugUpdate({
        currentName: '원본 강좌 (템플릿 복사본)',
        currentSlug: 'original-template-copy',
        currentStatus: 'archived',
        copiedAt: '2026-07-29T00:00:00.000Z',
        nextName: '새 강좌',
        nextStatus: 'archived',
        requestedSlug: undefined,
      }),
      { type: 'regenerate' },
    )
  })

  it('보관 강좌를 운영으로 전환하면서 직접 slug를 바꾸는 요청을 거부한다', () => {
    assert.deepEqual(
      decideCourseSlugUpdate({
        currentName: '보관 강좌',
        currentSlug: 'archived-course',
        currentStatus: 'archived',
        copiedAt: null,
        nextName: '보관 강좌',
        nextStatus: 'active',
        requestedSlug: 'changed-course',
      }),
      { type: 'reject-active-change' },
    )
  })
})

describe('buildCourseSlugCandidate', () => {
  it('강좌명을 URL에 사용할 수 있는 slug로 변환한다', () => {
    assert.equal(
      buildCourseSlugCandidate({
        courseName: '26년 2차대비 알짜 문제풀이',
        courseId: 11,
        sequence: 1,
      }),
      '26년-2차대비-알짜-문제풀이',
    )
  })

  it('중복 순번은 -2, -3 형식으로 붙인다', () => {
    assert.equal(
      buildCourseSlugCandidate({ courseName: '알짜 문제풀이', courseId: 11, sequence: 2 }),
      '알짜-문제풀이-2',
    )
    assert.equal(
      buildCourseSlugCandidate({ courseName: '알짜 문제풀이', courseId: 11, sequence: 3 }),
      '알짜-문제풀이-3',
    )
  })

  it('suffix를 포함해 데이터베이스 최대 길이를 넘지 않는다', () => {
    const candidate = buildCourseSlugCandidate({
      courseName: '가'.repeat(COURSE_SLUG_MAX_LENGTH),
      courseId: 11,
      sequence: 12,
    })

    assert.equal(candidate.length, COURSE_SLUG_MAX_LENGTH)
    assert.match(candidate, /-12$/)
  })

  it('slug로 만들 문자가 없으면 강좌 ID를 사용한다', () => {
    assert.equal(
      buildCourseSlugCandidate({ courseName: '!!!', courseId: 27, sequence: 1 }),
      'course-27',
    )
  })
})
