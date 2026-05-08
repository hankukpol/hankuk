import { formatMaterialLabel } from './scan-page-utils'
import type { MaterialItem } from './scan-page-types'

type QuickDistributionPanelProps = {
  quickPhone: string
  quickStudentName: string
  quickLoading: boolean
  quickMaterials: MaterialItem[]
  selectedMaterialId: number | null
  selectedCourseName: string | null
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
  onQuickPhoneChange,
  onSelectedMaterialChange,
  onSubmit,
}: QuickDistributionPanelProps) {
  return (
    <>
      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <h2 className="student-eyebrow student-eyebrow-light">수동 배부</h2>
        <p className="mt-1 text-[15px] font-semibold text-[var(--student-text)]">
          {selectedCourseName ?? '강의 선택 필요'}
        </p>
        <p className="student-body mt-2">
          휴대폰 번호로 학생을 찾은 뒤, 배부할 교재나 자료를 바로 선택합니다.
        </p>

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium text-[var(--student-text-muted)]">휴대폰 번호</span>
            <input
              value={quickPhone}
              onChange={(event) => onQuickPhoneChange(event.target.value.replace(/\D/g, ''))}
              placeholder="01012345678"
              inputMode="numeric"
              className="student-input"
            />
          </label>

          <button
            type="submit"
            disabled={quickLoading}
            className="student-pill-button student-pill-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {quickLoading ? '조회 중...' : '학생 조회'}
          </button>
        </form>
      </section>

      <section className="student-card mx-4 mt-3 px-4 py-4 sm:mx-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="student-eyebrow student-eyebrow-light">배부 선택</h2>
          {quickStudentName ? (
            <span className="student-chip bg-[#eefaf1] text-[#19703a]">조회 완료</span>
          ) : null}
        </div>

        {quickStudentName ? (
          <>
            <p className="text-[20px] font-semibold leading-[1.15] tracking-[-0.04em] text-[var(--student-text)]">
              {quickStudentName}
            </p>
            <p className="student-body mt-2">자료를 선택하고 배부 처리를 누르세요.</p>

            {quickMaterials.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {quickMaterials.map((material) => {
                  const selected = selectedMaterialId === material.id

                  return (
                    <li key={material.id}>
                      <button
                        type="button"
                        onClick={() => onSelectedMaterialChange(material.id)}
                        className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[16px] px-4 py-3 text-left ${
                          selected
                            ? 'bg-[rgba(0,113,227,0.08)]'
                            : 'bg-[var(--student-surface-soft)]'
                        }`}
                      >
                        <span className={`truncate text-[15px] ${selected ? 'font-semibold text-[var(--student-blue)]' : 'font-medium text-[var(--student-text)]'}`}>
                          {formatMaterialLabel(material.name, material.material_type)}
                        </span>
                        <span className="student-chip shrink-0 bg-white text-[var(--student-blue)]">
                          {selected ? '선택됨' : '선택'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="student-body mt-3">배부 가능한 자료를 확인하는 중입니다.</p>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={quickLoading || quickMaterials.length > 1 && !selectedMaterialId}
              className="student-pill-button student-pill-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quickLoading ? '처리 중...' : '배부 처리'}
            </button>
          </>
        ) : (
          <p className="student-body">
            번호를 입력하고 학생을 조회하면 이 영역에 배부할 교재와 자료가 표시됩니다.
          </p>
        )}
      </section>
    </>
  )
}
