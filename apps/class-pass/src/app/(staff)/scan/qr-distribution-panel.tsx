import type { RefObject } from 'react'
import { formatMaterialLabel } from './scan-page-utils'
import type { MaterialItem, OverlayState, ScanState } from './scan-page-types'

type QrDistributionPanelProps = {
  staffScanEnabled: boolean
  scanState: ScanState
  overlay: OverlayState | null
  lastStudentName: string
  selectedCourseName: string | null
  selectOptions: MaterialItem[]
  containerRef: RefObject<HTMLDivElement | null>
  onRestartScanner: () => void
  onDistributeMaterial: (materialId: number) => void
  onDistributeAllMaterials: () => void
  onCancelSelection: () => void
}

function getScanStatusLabel(scanState: ScanState) {
  switch (scanState) {
    case 'processing':
      return '배부를 처리하고 있습니다.'
    case 'selecting':
      return '미수령 자료를 확인한 뒤 배부하세요.'
    case 'scanning':
      return '학생 QR을 카메라에 비춰 주세요.'
    default:
      return '카메라를 준비해 주세요.'
  }
}

function getMaterialTypeLabel(materialType?: MaterialItem['material_type']) {
  return materialType === 'textbook' ? '교재' : '자료'
}

export function QrDistributionPanel({
  staffScanEnabled,
  scanState,
  overlay,
  lastStudentName,
  selectedCourseName,
  selectOptions,
  containerRef,
  onRestartScanner,
  onDistributeMaterial,
  onDistributeAllMaterials,
  onCancelSelection,
}: QrDistributionPanelProps) {
  return (
    <>
      <section className="student-card mx-4 mt-4 px-4 py-4 sm:mx-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="student-eyebrow student-eyebrow-light">QR 스캔</h2>
            <p className="mt-1 truncate text-[15px] font-semibold text-[var(--student-text)]">
              {selectedCourseName ?? '강의 선택 필요'}
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

        <div className="mt-3 flex items-center gap-2">
          <span className={`student-status-dot ${scanState === 'scanning' ? 'student-status-dot-active' : 'student-status-dot-idle'}`} />
          <p className="text-[13px] font-medium text-[var(--student-text-muted)]">{getScanStatusLabel(scanState)}</p>
        </div>

        <div
          ref={containerRef}
          className="relative mt-4 overflow-hidden rounded-[20px] border border-[var(--student-line)] bg-[#020617] p-2 shadow-[0_20px_40px_rgba(15,23,42,0.18)]"
        >
          <div id="class-pass-qr-reader" className="min-h-[300px] w-full overflow-hidden rounded-[16px]" />

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
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-[var(--student-surface-soft)] px-4 py-3">
            <div>
              <p className="text-[12px] font-medium text-[var(--student-text-muted)]">마지막 처리</p>
              <p className="mt-1 text-[15px] font-semibold text-[var(--student-text)]">{lastStudentName}</p>
            </div>
            <span className="student-chip bg-[#eefaf1] text-[#19703a]">완료</span>
          </div>
        ) : null}
      </section>

      {selectOptions.length > 0 ? (
        <section className="student-card mx-4 mt-3 px-4 py-4 sm:mx-5">
          <div className="mb-3 flex flex-col gap-3">
            <div>
              <h2 className="student-eyebrow student-eyebrow-light">배부 선택</h2>
              <p className="mt-1 text-[15px] font-semibold text-[var(--student-text)]">
                미수령 자료 {selectOptions.length}건
              </p>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={onDistributeAllMaterials}
                disabled={scanState === 'processing'}
                className="student-pill-button student-pill-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                미수령 {selectOptions.length}건 전체 배부
              </button>
              <button
                type="button"
                onClick={onCancelSelection}
                className="student-pill-button student-pill-secondary px-4"
              >
                완료
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {selectOptions.map((material) => (
              <button
                key={material.id}
                type="button"
                onClick={() => onDistributeMaterial(material.id)}
                disabled={scanState === 'processing'}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[16px] bg-[rgba(0,113,227,0.08)] px-4 py-3 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-[var(--student-text)]">
                    {formatMaterialLabel(material.name, material.material_type)}
                  </span>
                  <span className="mt-0.5 block text-[12px] font-medium text-[var(--student-blue)]">
                    클릭 배부
                  </span>
                </span>
                <span className="student-chip shrink-0 bg-white text-[var(--student-blue)]">
                  {getMaterialTypeLabel(material.material_type)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="mx-4 mt-3 px-2 text-center sm:mx-5">
          <p className="text-[13px] font-medium text-[var(--student-text-muted)]">
            여러 미수령 자료가 있으면 QR 카메라 바로 아래에 배부 버튼이 표시됩니다.
          </p>
        </section>
      )}
    </>
  )
}
