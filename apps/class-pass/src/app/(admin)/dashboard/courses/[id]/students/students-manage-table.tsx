import type { Enrollment, EnrollmentFieldDef } from '@/types/database'
import { formatDateTime } from '@/lib/utils'

type StudentsManageTableProps = {
  filtered: Enrollment[]
  search: string
  statusFilter: 'all' | 'active' | 'refunded'
  customFields: EnrollmentFieldDef[]
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: 'all' | 'active' | 'refunded') => void
  onEdit: (enrollment: Enrollment) => void
  onResetPin: (enrollment: Enrollment) => void
  onRefund: (enrollment: Enrollment) => void
  onDelete: (enrollment: Enrollment) => void
}

export function StudentsManageTable({
  filtered,
  search,
  statusFilter,
  customFields,
  onSearchChange,
  onStatusFilterChange,
  onEdit,
  onResetPin,
  onRefund,
  onDelete,
}: StudentsManageTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="이름, 연락처, 응시번호 검색..."
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 sm:w-64"
        />
        <div className="flex gap-1">
          {(['all', 'active', 'refunded'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onStatusFilterChange(value)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                statusFilter === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'
              }`}
            >
              {value === 'all' ? '전체' : value === 'active' ? '활성' : '환불'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-gray-400">
          {search ? '검색 결과 없음' : '등록된 수강생이 없습니다.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                <th className="px-5 py-3">응시번호</th>
                <th className="px-3 py-3">이름</th>
                <th className="px-3 py-3">연락처</th>
                {customFields.map((field) => (
                  <th key={field.key} className="hidden px-3 py-3 lg:table-cell">{field.label}</th>
                ))}
                <th className="px-3 py-3">상태</th>
                <th className="hidden px-3 py-3 md:table-cell">등록일</th>
                <th className="px-5 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((enrollment) => (
                <tr key={enrollment.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3 text-gray-500">{enrollment.exam_number || '-'}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900">
                    <div className="flex flex-col gap-1">
                      <span>{enrollment.name}</span>
                      <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                        enrollment.student_profile?.auth_method === 'birth_date'
                          ? 'bg-blue-50 text-blue-700'
                          : enrollment.student_profile?.auth_method === 'pin'
                            ? 'bg-violet-50 text-violet-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}>
                        {enrollment.student_profile?.auth_method === 'birth_date'
                          ? '생년월일 인증'
                          : enrollment.student_profile?.auth_method === 'pin'
                            ? 'PIN 인증'
                            : '인증 미설정'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-500">{enrollment.phone}</td>
                  {customFields.map((field) => (
                    <td key={field.key} className="hidden px-3 py-3 text-gray-500 lg:table-cell">
                      {(enrollment.custom_data ?? {})[field.key] || '-'}
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      enrollment.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {enrollment.status === 'active' ? '활성' : '환불'}
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 text-xs text-gray-400 md:table-cell">
                    {formatDateTime(enrollment.created_at).split(' ')[0]}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(enrollment)}
                        className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                      >
                        편집
                      </button>
                      {enrollment.student_profile?.auth_method === 'pin' && enrollment.student_id ? (
                        <button
                          type="button"
                          onClick={() => onResetPin(enrollment)}
                          className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                        >
                          PIN 재설정
                        </button>
                      ) : null}
                      {enrollment.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => onRefund(enrollment)}
                          className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          환불
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDelete(enrollment)}
                        className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
