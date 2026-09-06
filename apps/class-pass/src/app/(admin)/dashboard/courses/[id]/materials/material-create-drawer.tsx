'use client'

import type { FormEvent } from 'react'
import { AdminDrawer } from '@/components/admin/AdminDrawer'
import { getUserErrorMessage } from '@/lib/user-error-message'
import type { CourseSubject, MaterialType } from '@/types/database'
import { MaterialFormFields, type MaterialForm } from './material-form-fields'

type Props = {
  open: boolean
  materialType: MaterialType
  courseName: string
  value: MaterialForm
  subjects: CourseSubject[]
  saving: boolean
  locked?: boolean
  error: string
  onChange: (value: MaterialForm) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}

export function MaterialCreateDrawer({ open, materialType, courseName, value, subjects, saving, locked = false, error, onChange, onClose, onSubmit }: Props) {
  const label = materialType === 'textbook' ? '교재' : '배부자료'
  return <AdminDrawer open={open} title={`새 ${label} 만들기`} description={courseName}
    closeDisabled={saving || locked} onClose={onClose} onSubmit={onSubmit}
    footer={<>
      <button type="button" className="admin-button" disabled={saving || locked} onClick={onClose}>취소</button>
      <button type="submit" className="admin-button admin-button-primary" disabled={saving}>{saving ? '생성 중...' : `${label} 생성`}</button>
    </>}>
    <MaterialFormFields value={value} onChange={onChange} nameLabel={`${label} 이름`}
      handout={materialType === 'handout'} subjects={subjects} disabled={saving || locked} />
    {error ? <div className="mt-4"><p role="alert" className="admin-material-notice text-red-600">{getUserErrorMessage(error)}</p></div> : null}
  </AdminDrawer>
}
