import type { CourseSubject } from '@/types/database'

export type MaterialForm = {
  name: string
  description: string
  is_active: boolean
  sort_order: number
  subject_id: number | null
}

type Props = {
  value: MaterialForm
  onChange: (value: MaterialForm) => void
  nameLabel: string
  handout: boolean
  subjects: CourseSubject[]
  disabled: boolean
}

export function MaterialFormFields({ value, onChange, nameLabel, handout, subjects, disabled }: Props) {
  return (
    <fieldset className="admin-material-fields" disabled={disabled}>
      <label className="admin-material-field">
        <span className="admin-material-label">{nameLabel}</span>
        <input className="admin-material-control" required maxLength={100} value={value.name}
          placeholder={nameLabel} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </label>
      <label className="admin-material-field">
        <span className="admin-material-label">설명</span>
        <textarea className="admin-material-control" rows={3} value={value.description}
          placeholder="설명" onChange={(event) => onChange({ ...value, description: event.target.value })} />
      </label>
      <div className="admin-material-field-pair">
        <label className="admin-material-field">
          <span className="admin-material-label">정렬 순서</span>
          <input className="admin-material-control" type="number" min={0} max={999} value={value.sort_order}
            onChange={(event) => onChange({ ...value, sort_order: Number(event.target.value || 0) })} />
        </label>
        <label className="admin-material-active">
          <span>활성 상태</span>
          <span aria-hidden="true">{value.is_active ? '활성' : '비활성'}</span>
          <input type="checkbox" checked={value.is_active}
            onChange={(event) => onChange({ ...value, is_active: event.target.checked })} />
        </label>
      </div>
      <p className="admin-material-help">비활성 자료는 수령 처리 목록에 표시되지 않습니다.</p>
      {handout && subjects.length > 0 ? (
        <label className="admin-material-field">
          <span className="admin-material-label">배부 대상 과목 (선택)</span>
          <select className="admin-material-control" value={value.subject_id ?? ''}
            onChange={(event) => onChange({ ...value, subject_id: event.target.value ? Number(event.target.value) : null })}>
            <option value="">전체 배부 (좌석 무관)</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} 좌석 배정자만</option>)}
          </select>
          <span className="admin-material-help">과목을 지정하면 그 과목 좌석을 배정받은 학생만 이 자료를 받을 수 있습니다.</span>
        </label>
      ) : null}
    </fieldset>
  )
}
