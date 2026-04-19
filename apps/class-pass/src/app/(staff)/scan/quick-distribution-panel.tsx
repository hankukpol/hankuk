import { formatMaterialLabel } from './scan-page-utils'
import type { MaterialItem } from './scan-page-types'

type QuickDistributionPanelProps = {
  quickPhone: string
  quickStudentName: string
  quickLoading: boolean
  quickMaterials: MaterialItem[]
  selectedMaterialId: number | null
  selectedCourseName: string | null
  courseMaterials: MaterialItem[]
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
  courseMaterials,
  materialsCount,
  onQuickPhoneChange,
  onSelectedMaterialChange,
  onSubmit,
}: QuickDistributionPanelProps) {
  return (
    <>
      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <h2 className="student-eyebrow student-eyebrow-light">수동 배부</h2>
        <p className="mt-2 text-[20px] font-semibold leading-[1.15] tracking-[-0.04em] text-[var(--student-text)]">
          전화번호로 바로 배부합니다
        </p>
        <p className="student-body mt-2">
          QR 스캔이 어려운 경우에도 학생 모바일 화면과 같은 자료 흐름으로 배부할 수 있습니다.
        </p>

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium text-[var(--student-text-muted)]">전화번호</span>
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
            {quickLoading ? '처리 중...' : '배부 실행'}
          </button>
        </form>
      </section>

      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <h2 className="student-eyebrow student-eyebrow-light mb-3">스캔 정보</h2>
        <table className="w-full text-[14px]">
          <tbody>
            <tr>
              <td className="w-[88px] py-2 pr-3 text-[var(--student-text-muted)]">현재 강좌</td>
              <td className="py-2 font-medium text-[var(--student-text)]">{selectedCourseName ?? '선택된 강좌 없음'}</td>
            </tr>
            <tr>
              <td className="w-[88px] py-2 pr-3 text-[var(--student-text-muted)]">활성 자료</td>
              <td className="py-2 font-medium text-[var(--student-text)]">{materialsCount}건</td>
            </tr>
            <tr>
              <td className="w-[88px] py-2 pr-3 text-[var(--student-text-muted)]">조회 범위</td>
              <td className="py-2 font-medium text-[var(--student-text)]">선택한 강좌의 수강생만 검색</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="student-eyebrow student-eyebrow-light">강좌 자료</h2>
          <span className="student-chip bg-[rgba(0,113,227,0.08)] text-[var(--student-blue)]">
            {materialsCount}건
          </span>
        </div>

        {courseMaterials.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {courseMaterials.map((material) => (
              <li
                key={material.id}
                className="flex items-center gap-3 rounded-[24px] bg-[var(--student-surface-soft)] px-4 py-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--student-line-strong)] text-transparent">
                  ·
                </span>
                <span className="text-[14px] font-medium text-[var(--student-text)]">
                  {formatMaterialLabel(material.name, material.material_type)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="student-body py-2">이 강좌에는 현재 활성화된 자료나 교재가 없습니다.</p>
        )}
      </section>

      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="student-eyebrow student-eyebrow-light">학생 확인</h2>
          {quickStudentName ? (
            <span className="student-chip bg-[#eefaf1] text-[#19703a]">조회 완료</span>
          ) : null}
        </div>

        {quickStudentName ? (
          <>
            <p className="text-[20px] font-semibold leading-[1.15] tracking-[-0.04em] text-[var(--student-text)]">
              {quickStudentName}
            </p>
            <p className="student-body mt-2">배부 가능한 자료가 여러 개면 아래 목록에서 한 건을 선택한 뒤 실행해 주세요.</p>

            {quickMaterials.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {quickMaterials.map((material) => {
                  const selected = selectedMaterialId === material.id

                  return (
                    <li key={material.id}>
                      <button
                        type="button"
                        onClick={() => onSelectedMaterialChange(material.id)}
                        className={`flex w-full items-center gap-3 rounded-[24px] px-4 py-3 text-left ${
                          selected
                            ? 'bg-[rgba(0,113,227,0.08)]'
                            : 'bg-[var(--student-surface-soft)]'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                            selected
                              ? 'bg-[var(--student-blue)] text-transparent'
                              : 'border-2 border-[var(--student-line-strong)] text-transparent'
                          }`}
                        >
                          ·
                        </span>
                        <span className={`text-[14px] ${selected ? 'font-semibold text-[var(--student-blue)]' : 'font-medium text-[var(--student-text)]'}`}>
                          {formatMaterialLabel(material.name, material.material_type)}
                        </span>
                        <span className="ml-auto text-[12px] text-[var(--student-text-muted)]">
                          {selected ? '배부 예정' : '선택 가능'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="student-body mt-3">배부 가능한 자료를 확인하는 중입니다.</p>
            )}
          </>
        ) : (
          <p className="student-body">
            전화번호를 입력하고 배부 실행을 누르면 학생을 찾은 뒤, 필요한 자료가 여러 개인 경우 이 영역에 선택 목록이 나타납니다.
          </p>
        )}
      </section>
    </>
  )
}
