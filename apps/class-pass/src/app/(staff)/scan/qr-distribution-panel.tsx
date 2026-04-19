import type { RefObject } from 'react'
import { formatMaterialLabel } from './scan-page-utils'
import type { MaterialItem, OverlayState, ScanState } from './scan-page-types'

type QrDistributionPanelProps = {
  staffScanEnabled: boolean
  scanState: ScanState
  overlay: OverlayState | null
  lastStudentName: string
  selectedCourseName: string | null
  courseMaterials: MaterialItem[]
  materialsCount: number
  selectOptions: MaterialItem[]
  selectedMaterialIds: number[]
  containerRef: RefObject<HTMLDivElement | null>
  onRestartScanner: () => void
  onToggleMaterial: (materialId: number) => void
  onSelectAllMaterials: () => void
  onClearSelection: () => void
  onConfirmSelection: () => void
}

function getScanStatusLabel(scanState: ScanState) {
  switch (scanState) {
    case 'processing':
      return '배부를 처리하는 중입니다.'
    case 'selecting':
      return '선택한 자료를 한 번에 배부할 수 있습니다.'
    case 'scanning':
      return '카메라가 준비되었습니다. 학생 QR을 비춰 주세요.'
    default:
      return '스캔을 시작하려면 카메라를 다시 준비해 주세요.'
  }
}

export function QrDistributionPanel({
  staffScanEnabled,
  scanState,
  overlay,
  lastStudentName,
  selectedCourseName,
  courseMaterials,
  materialsCount,
  selectOptions,
  selectedMaterialIds,
  containerRef,
  onRestartScanner,
  onToggleMaterial,
  onSelectAllMaterials,
  onClearSelection,
  onConfirmSelection,
}: QrDistributionPanelProps) {
  const allSelected = selectOptions.length > 0 && selectedMaterialIds.length === selectOptions.length

  return (
    <>
      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="student-eyebrow student-eyebrow-light">QR 스캔</h2>
            <p className="mt-2 text-[20px] font-semibold leading-[1.15] tracking-[-0.04em] text-[var(--student-text)]">
              학생 모바일 수강증 UI로 스캔합니다
            </p>
            <p className="student-body mt-2">
              {staffScanEnabled
                ? '학생이 보여주는 QR을 읽고, 필요한 자료를 한 번에 배부합니다.'
                : 'QR 스캔 기능이 현재 비활성화되어 있습니다.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onRestartScanner}
            disabled={!staffScanEnabled}
            className="student-pill-button student-pill-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다시 시작
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className={`student-status-dot ${scanState === 'scanning' ? 'student-status-dot-active' : 'student-status-dot-idle'}`} />
          <p className="text-[13px] font-medium text-[var(--student-text-muted)]">{getScanStatusLabel(scanState)}</p>
        </div>

        <div
          ref={containerRef}
          className="relative mt-4 overflow-hidden rounded-[20px] border border-[var(--student-line)] bg-[#020617] p-3 shadow-[0_20px_40px_rgba(15,23,42,0.18)]"
        >
          <div id="class-pass-qr-reader" className="min-h-[320px] w-full overflow-hidden rounded-[16px]" />

          {scanState === 'processing' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/65">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent" />
            </div>
          ) : null}

          {overlay ? (
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center px-5 text-center ${
                overlay.success ? 'bg-[#19703a]/92' : 'bg-[#b42318]/92'
              }`}
            >
              <p className="text-[24px] font-semibold tracking-[-0.04em] text-white">{overlay.title}</p>
              {overlay.description ? (
                <p className="mt-2 text-[13px] text-white/80">{overlay.description}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {lastStudentName ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[24px] bg-[var(--student-surface-soft)] px-4 py-3">
            <div>
              <p className="text-[12px] font-medium text-[var(--student-text-muted)]">마지막 처리</p>
              <p className="mt-1 text-[15px] font-semibold text-[var(--student-text)]">{lastStudentName}</p>
            </div>
            <span className="student-chip bg-[#eefaf1] text-[#19703a]">완료</span>
          </div>
        ) : null}
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
              <td className="w-[88px] py-2 pr-3 text-[var(--student-text-muted)]">배부 방식</td>
              <td className="py-2 font-medium text-[var(--student-text)]">한 번 스캔 후 일괄 배부</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="student-eyebrow student-eyebrow-light">배부 자료</h2>
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
                <span className="ml-auto text-[12px] text-[var(--student-text-muted)]">
                  {material.material_type === 'textbook' ? '교재' : '배부 자료'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="student-body py-2">이 강좌에는 현재 활성화된 자료나 교재가 없습니다.</p>
        )}

        <p className="student-body mt-3">교재는 학생에게 배정된 경우에만 실제 배부 대상으로 자동 판별됩니다.</p>
      </section>

      {selectOptions.length > 0 ? (
        <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="student-eyebrow student-eyebrow-light">배부 확인</h2>
            <span className="student-chip bg-[rgba(0,113,227,0.08)] text-[var(--student-blue)]">
              {selectedMaterialIds.length} / {selectOptions.length} 선택
            </span>
          </div>

          <p className="text-[20px] font-semibold leading-[1.15] tracking-[-0.04em] text-[var(--student-text)]">
            한 번에 여러 자료를 배부할 수 있습니다
          </p>
          <p className="student-body mt-2">
            스캔은 이미 완료되었습니다. 체크된 자료를 한 번에 배부하려면 아래 버튼만 누르면 됩니다.
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {selectOptions.map((material) => {
              const selected = selectedMaterialIds.includes(material.id)

              return (
                <li key={material.id}>
                  <button
                    type="button"
                    onClick={() => onToggleMaterial(material.id)}
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
                      {selected ? '배부 예정' : '선택 안 함'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={allSelected ? onClearSelection : onSelectAllMaterials}
              className="student-pill-button student-pill-secondary flex-1"
            >
              {allSelected ? '선택 해제' : '전체 선택'}
            </button>
            <button
              type="button"
              onClick={onConfirmSelection}
              disabled={selectedMaterialIds.length === 0}
              className="student-pill-button student-pill-primary flex-[1.3] disabled:cursor-not-allowed disabled:opacity-50"
            >
              선택한 {selectedMaterialIds.length}건 배부
            </button>
          </div>
        </section>
      ) : (
        <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
          <h2 className="student-eyebrow student-eyebrow-light mb-3">안내</h2>
          <p className="student-body">
            학생이 수강증 페이지 URL을 직접 열어도 토큰은 자동으로 읽힙니다. 카메라 사용이 어려우면 수동 배부 탭으로 전환해 전화번호로 처리할 수 있습니다.
          </p>
        </section>
      )}
    </>
  )
}
