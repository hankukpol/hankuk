'use client'

import { useId } from 'react'
import styles from './course-feature-settings.module.css'

const GROUPS = [
  { title: '수강증 표시', items: [
    ['feature_qr_pass', 'QR 수강증'], ['feature_time_window', '시간 제한'],
    ['feature_photo', '사진 표시'], ['feature_dday', 'D-day'],
    ['feature_weekday_color', '요일별 색상'], ['feature_anti_forgery_motion', '위조 방지 효과'],
  ] },
  { title: '수업 기능', items: [
    ['feature_qr_distribution', '자료 배부'], ['feature_seat_assignment', '좌석 배정'],
    ['feature_designated_seat', '지정좌석'], ['feature_attendance', '출결 체크 기능 사용'],
    ['feature_exam_delivery_mode', '시험 배부 모드'],
  ] },
  { title: '공지·안내', items: [
    ['feature_notices', '공지 사용'], ['notice_visible', '공지 공개'], ['feature_refund_policy', '환불 규정'],
  ] },
] as const

type FeatureKey = typeof GROUPS[number]['items'][number][0] | 'designated_seat_open'
type Props = {
  value: Record<FeatureKey, boolean>
  onChange: (key: FeatureKey, checked: boolean) => void
}

export function CourseFeatureSettings({ value, onChange }: Props) {
  const helpId = useId()
  return <div className={styles.groups}>
    {GROUPS.map(group => <fieldset key={group.title} className={styles.group}>
      <legend className={styles.legend}>{group.title}</legend>
      <div className={styles.options}>
        {group.items.map(([key, label]) => <label key={key} className={styles.option}>
          <input type="checkbox" checked={Boolean(value[key])} onChange={event => onChange(key, event.target.checked)} />
          <span>{label}</span>
        </label>)}
      </div>
    </fieldset>)}
    <fieldset className={styles.group}>
      <legend className={styles.legend}>신청 운영</legend>
      <div className={styles.options}>
        <label className={styles.option}>
          <input type="checkbox" checked={value.designated_seat_open}
            disabled={!value.feature_designated_seat} aria-describedby={helpId}
            onChange={event => onChange('designated_seat_open', event.target.checked)} />
          <span>지정좌석 학생 신청 열기</span>
        </label>
      </div>
      <p id={helpId} className={styles.help}>
        {value.feature_designated_seat
          ? '체크하면 학생이 지정좌석을 신청할 수 있습니다. 변경 후 강좌 저장을 눌러 적용합니다.'
          : '수업 기능의 지정좌석을 먼저 켜야 학생 신청을 열 수 있습니다.'}
      </p>
    </fieldset>
  </div>
}
