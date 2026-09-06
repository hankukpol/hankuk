'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { formatWon } from '@/lib/payments/format'
import { getTuitionExemptBillingRuleError } from '@/lib/payments/billing-rules'
import type { Course } from '@/types/database'
import styles from './registration-courses.module.css'

export type RegistrationBillingDraft = {
  expectedAmount?: string
  discountAmount: string
  discountReason: string
  tuitionExempt?: boolean
  tuitionExemptReason?: string
}

export type RegistrationBillingRow = {
  course: Course
  expectedAmount: number
  discountAmount: number
  discountReason: string
  payableAmount: number
  tuitionExempt: boolean
  tuitionExemptReason: string
}

export function getRegistrationBillingIssue(row: RegistrationBillingRow) {
  if (!Number.isSafeInteger(row.expectedAmount) || row.expectedAmount < 0) {
    return { field: 'expectedAmount', message: '강좌 정가를 확인해 주세요.' }
  }
  if (!Number.isSafeInteger(row.discountAmount) || row.discountAmount < 0 || row.discountAmount > row.expectedAmount) {
    return { field: 'discountAmount', message: '할인 금액은 정가 이하로 입력해 주세요.' }
  }
  if (row.tuitionExempt) {
    const message = !row.tuitionExemptReason ? '무료 수강 또는 수납 면제 사유를 입력해 주세요.' : getTuitionExemptBillingRuleError(row)
    return message ? { field: 'tuitionExemptReason', message } : null
  }
  if (row.discountAmount > 0 && !row.discountReason) {
    return { field: 'discountReason', message: '할인 사유를 입력해 주세요.' }
  }
  if (row.expectedAmount > 0 && row.payableAmount === 0) {
    return { field: 'discountAmount', message: '전액 면제라면 이 강좌의 무료 수강을 선택해 주세요.' }
  }
  return null
}

type Props = {
  rows: RegistrationBillingRow[]
  drafts: Record<number, RegistrationBillingDraft>
  baseCourseId: number
  addableCourses: Course[]
  courseToAdd: string
  onCourseToAdd: (value: string) => void
  onAdd: () => void
  onRemove: (id: number) => void
  onChange: (id: number, patch: Partial<RegistrationBillingDraft>) => void
  allExempt: boolean
  onAllExempt: (value: boolean) => void
  commonReason: string
  onCommonReason: (value: string) => void
  attempted: boolean
}

export function RegistrationCoursesSection(props: Props) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  useEffect(() => {
    const invalidIds = props.rows
      .filter((row) => (props.attempted || row.discountAmount > row.expectedAmount) && getRegistrationBillingIssue(row))
      .map((row) => row.course.id)
    setCollapsed((current) => invalidIds.some((id) => current[id])
      ? { ...current, ...Object.fromEntries(invalidIds.map((id) => [id, false])) }
      : current)
  }, [props.rows, props.attempted])
  const atLimit = props.rows.length >= 8
  const moneyInput = (value: string) => value.replace(/\D/g, '')
  return (
    <section className={styles.section} aria-labelledby="registration-courses-title">
      <div className={styles.heading}>
        <h4 id="registration-courses-title">등록 강좌</h4>
        <span className={styles.caption}>{props.rows.length}개 선택 (최대 8개)</span>
      </div>
      <p className={styles.caption}>강좌별 수강료와 무료 여부를 확인하세요. 수납 기록은 강좌별로 나누어 저장됩니다.</p>
      <div className={styles.toolbar}>
        <select aria-label="추가 강좌 선택" value={props.courseToAdd} onChange={(event) => props.onCourseToAdd(event.target.value)} disabled={atLimit || props.addableCourses.length === 0}>
          <option value="">추가 강좌 선택</option>
          {props.addableCourses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </select>
        <button type="button" onClick={props.onAdd} disabled={atLimit || !props.courseToAdd} className={styles.add}>
          <Plus size={16} aria-hidden="true" />추가
        </button>
      </div>
      {atLimit ? <p className={styles.caption}>한 번에 최대 8강좌까지 등록할 수 있습니다.</p> : null}
      {props.rows.length > 1 || props.allExempt ? (
        <div className={styles.allFree}>
          <label className={styles.choice}>
            <input type="checkbox" checked={props.allExempt} onChange={(event) => props.onAllExempt(event.target.checked)} />
            전체 강좌 무료 수강
          </label>
          {props.allExempt ? (
            <label className={styles.field}>
              <span>공통 면제 사유</span>
              <textarea value={props.commonReason} onChange={(event) => props.onCommonReason(event.target.value)} rows={2} placeholder="예: 장학생, 무료 체험, 운영 지원" aria-required="true" aria-invalid={props.attempted && props.rows.some((row) => getRegistrationBillingIssue(row)?.field === 'tuitionExemptReason')} />
            </label>
          ) : null}
        </div>
      ) : null}
      <div className={styles.list}>
        {props.rows.map((row) => {
          const draft = props.drafts[row.course.id]
          const issue = props.attempted || row.discountAmount > row.expectedAmount ? getRegistrationBillingIssue(row) : null
          const errorId = `registration-course-${row.course.id}-error`
          const fieldsId = `registration-course-${row.course.id}-fields`
          const expanded = !collapsed[row.course.id] || Boolean(issue)
          const fieldError = (field: string) => ({ 'aria-invalid': issue?.field === field || undefined, 'aria-describedby': issue?.field === field ? errorId : undefined })
          return (
            <div key={row.course.id} className={`admin-registration-course ${styles.course}`} role="group" aria-label={row.course.name}>
              <div className={styles.heading}>
                <p className={styles.courseName}>{row.course.name}</p>
                <div className={styles.actions}>
                  {!expanded ? <span className={styles.courseSummary}>{row.tuitionExempt ? '무료 수강' : row.payableAmount === 0 ? '0원 강좌' : '유료'} · {formatWon(row.payableAmount)}</span> : null}
                  <button type="button" className={styles.collapse} aria-label={`${row.course.name} ${expanded ? '접기' : '펼치기'}`} aria-expanded={expanded} aria-controls={fieldsId} disabled={Boolean(issue)} onClick={() => setCollapsed((current) => ({ ...current, [row.course.id]: expanded }))}>
                    {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                    {expanded ? '접기' : '펼치기'}
                  </button>
                  {row.course.id !== props.baseCourseId ? <button type="button" aria-label="강좌 제거" className="admin-dialog-close" onClick={() => props.onRemove(row.course.id)}><Trash2 size={16} aria-hidden="true" /></button> : null}
                </div>
              </div>
              <div id={fieldsId} hidden={!expanded}>
                <div className={styles.details}>
                  <label className={styles.choice}>
                    <input type="checkbox" checked={row.tuitionExempt} disabled={props.allExempt} onChange={(event) => props.onChange(row.course.id, { tuitionExempt: event.target.checked })} />
                    무료 수강
                  </label>
                  <div className={styles.moneyGrid}>
                    <label className={styles.field}>
                      <span>강좌 정가</span>
                      <input inputMode="numeric" value={draft?.expectedAmount ?? String(row.course.tuition_amount ?? 0)} onChange={(event) => props.onChange(row.course.id, { expectedAmount: moneyInput(event.target.value) })} {...fieldError('expectedAmount')} />
                    </label>
                    <label className={styles.field}>
                      <span>할인</span>
                      <input inputMode="numeric" placeholder="0" value={row.tuitionExempt ? '' : draft?.discountAmount ?? ''} disabled={row.tuitionExempt} onChange={(event) => props.onChange(row.course.id, { discountAmount: moneyInput(event.target.value) })} {...fieldError('discountAmount')} />
                    </label>
                    <div className={`${styles.field} ${styles.applied}`}>
                      <span>{row.tuitionExempt ? '무료 수강' : '적용 금액'}</span>
                      <output className={styles.amount}>{formatWon(row.payableAmount)}</output>
                    </div>
                  </div>
                  {row.tuitionExempt ? (!props.allExempt ? (
                    <label className={styles.field}>
                      <span>면제 사유</span>
                      <input value={draft?.tuitionExemptReason ?? ''} placeholder="예: 장학생, 무료 체험, 운영 지원" aria-required="true" onChange={(event) => props.onChange(row.course.id, { tuitionExemptReason: event.target.value })} {...fieldError('tuitionExemptReason')} />
                    </label>
                  ) : null) : (
                    <label className={styles.field}>
                      <span>할인 사유</span>
                      <input value={draft?.discountReason ?? ''} placeholder="형제 할인, 이벤트 등" onChange={(event) => props.onChange(row.course.id, { discountReason: event.target.value })} aria-required={row.discountAmount > 0} {...fieldError('discountReason')} />
                    </label>
                  )}
                  {issue ? <p id={errorId} className={styles.error}>{issue.message}</p> : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
