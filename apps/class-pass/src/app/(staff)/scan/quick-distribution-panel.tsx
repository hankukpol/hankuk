import { formatMaterialLabel } from './scan-page-utils'
import type { MaterialItem } from './scan-page-types'

type QuickDistributionPanelProps = {
  quickPhone: string
  quickStudentName: string
  quickLoading: boolean
  quickMaterials: MaterialItem[]
  selectedMaterialId: number | null
  selectedCourseName: string | null
  materialsCount: number
  onQuickPhoneChange: (value: string) => void
  onSelectedMaterialChange: (materialId: number | null) => void
  onSubmit: () => void
}

export function QuickDistributionPanel({
  quickPhone,
  quickStudentName,
  quickLoading,
  quickMaterials,
  selectedMaterialId,
  selectedCourseName,
  materialsCount,
  onQuickPhoneChange,
  onSelectedMaterialChange,
  onSubmit,
}: QuickDistributionPanelProps) {
  return (
    <section className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
        className="rounded-2xl bg-white p-6 shadow-sm"
      >
        <h2 className="text-2xl font-extrabold text-gray-900">수동 배부</h2>
        <p className="mt-2 text-sm text-gray-500">
          현장에서 QR 스캔이 어려운 경우, 전화번호로 수강생을 찾아 수동으로 자료를 배부합니다.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-gray-700">전화번호</span>
            <input
              value={quickPhone}
              onChange={(event) => onQuickPhoneChange(event.target.value.replace(/\D/g, ''))}
              placeholder="01012345678"
              inputMode="numeric"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
            />
          </label>

          {quickStudentName ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              조회된 수강생: <span className="font-semibold text-slate-900">{quickStudentName}</span>
            </div>
          ) : null}

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-gray-700">자료</span>
            <select
              value={selectedMaterialId ?? ''}
              onChange={(event) => onSelectedMaterialChange(event.target.value ? Number(event.target.value) : null)}
              disabled={quickMaterials.length === 0}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-gray-900 outline-none focus:border-slate-400"
            >
              <option value="">자동 선택 또는 직접 선택</option>
              {quickMaterials.map((material) => (
                <option key={material.id} value={material.id}>
                  {formatMaterialLabel(material.name, material.material_type)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={quickLoading}
          className="mt-6 rounded-2xl px-5 py-4 text-lg font-bold text-white disabled:opacity-60"
          style={{ background: 'var(--theme)' }}
        >
          {quickLoading ? '처리 중...' : '배부 실행'}
        </button>
      </form>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-extrabold text-gray-900">현장 메모</h2>
        <div className="mt-5 grid gap-4">
          <article className="rounded-2xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-gray-500">현재 강좌</p>
            <p className="mt-2 text-xl font-bold text-gray-900">{selectedCourseName ?? '선택된 강좌 없음'}</p>
          </article>
          <article className="rounded-2xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-gray-500">활성 자료</p>
            <p className="mt-2 text-xl font-bold text-gray-900">{materialsCount}</p>
          </article>
          <article className="rounded-2xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-gray-500">팁</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              전화번호 배부는 선택한 강좌 안에서만 수강생을 검색합니다. 강좌를 먼저 확인하면 더 빠르게 조회할 수 있습니다.
            </p>
          </article>
        </div>
      </section>
    </section>
  )
}
