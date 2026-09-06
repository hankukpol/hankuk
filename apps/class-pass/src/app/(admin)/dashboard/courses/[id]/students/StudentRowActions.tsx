'use client'

import { AdminActionMenu, type AdminActionMenuItem } from '@/components/admin/AdminActionMenu'
import type { Enrollment } from '@/types/database'

type Action = (enrollment: Enrollment) => void
type Props = {
  enrollment: Enrollment
  suspended: boolean
  attendanceEnabled: boolean
  onOpenDetail: Action
  onEdit: Action
  onResetPin: Action
  onApproveDeviceReRegistration: Action
  onResetAttendanceDevice: Action
  onSuspend: Action
  onUnsuspend: Action
  onDelete: Action
}

export function StudentRowActions(props: Props) {
  const {enrollment:e,suspended,attendanceEnabled} = props
  const device = e.attendance_device
  const pending = device?.status === 'pending_reset'
  const canReset = (device?.registered_count ?? 0) > 0
  const items: AdminActionMenuItem[] = []
  if (e.student_profile?.auth_method === 'pin' && e.student_id) {
    items.push({id:'pin',label:'PIN 재설정',onSelect:()=>props.onResetPin(e)})
  }
  if (attendanceEnabled) {
    items.push(pending
      ? {id:'approve',label:'기기 승인',onSelect:()=>props.onApproveDeviceReRegistration(e)}
      : {id:'device',label:'기기 초기화',disabled:!canReset,description:canReset ? undefined : '등록된 출석 기기가 없습니다.',onSelect:()=>props.onResetAttendanceDevice(e)})
  }
  if (e.status === 'active') {
    items.push({id:'suspend',label:suspended?'정지 해제':'정지',onSelect:()=>suspended?props.onUnsuspend(e):props.onSuspend(e)})
  }
  items.push({id:'delete',label:'삭제',danger:true,onSelect:()=>props.onDelete(e)})
  return <div className="admin-student-row-actions" role="group" aria-label={`${e.name} 관리`} onClick={event=>event.stopPropagation()}>
    <button type="button" className="admin-row-primary" onClick={()=>props.onOpenDetail(e)}>수납·환불</button>
    <button type="button" onClick={()=>props.onEdit(e)}>편집</button>
    <AdminActionMenu label="더보기" contextLabel={`${e.name} · ${e.exam_number || '수험번호 없음'}`} items={items} portalled />
  </div>
}
