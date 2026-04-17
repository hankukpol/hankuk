import type { RefObject } from 'react'
import { formatMaterialLabel } from './scan-page-utils'
import type { MaterialItem, OverlayState, ScanState } from './scan-page-types'

type QrDistributionPanelProps = {
  staffScanEnabled: boolean
  scanState: ScanState
  overlay: OverlayState | null
  lastStudentName: string
  selectedCourseName: string | null
  materialsCount: number
  selectOptions: MaterialItem[]
  containerRef: RefObject<HTMLDivElement | null>
  onRestartScanner: () => void
  onSelectMaterial: (materialId: number) => void
}

export function QrDistributionPanel({
  staffScanEnabled,
  scanState,
  overlay,
  lastStudentName,
  selectedCourseName,
  materialsCount,
  selectOptions,
  containerRef,
  onRestartScanner,
  onSelectMaterial,
}: QrDistributionPanelProps) {
  return (
    <section className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-gray-900">QR 스캔</h2>
            <p className="mt-2 text-sm text-gray-500">
              {staffScanEnabled
                ? '수강생 QR 코드를 스캔하면 다음 필요 자료를 즉시 배부합니다.'
                : 'QR 스캔 기능이 현재 비활성화되어 있습니다.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onRestartScanner}
            disabled={!staffScanEnabled}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
          >
            다시 시작
          </button>
        </div>

        <div ref={containerRef} className="relative mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
          <div id="class-pass-qr-reader" className="min-h-[320px] w-full" />

          {scanState === 'processing' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/65">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent" />
            </div>
          ) : null}

          {overlay ? (
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center px-5 text-center ${
                overlay.success ? 'bg-emerald-700/90' : 'bg-red-700/90'
              }`}
            >
              <p className="text-2xl font-bold text-white">{overlay.title}</p>
              {overlay.description ? (
                <p className="mt-2 text-sm text-white/80">{overlay.description}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {lastStudentName ? (
          <p className="mt-4 text-sm text-gray-500">
            마지막 수강생: <span className="font-semibold text-gray-900">{lastStudentName}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-extrabold text-gray-900">선택된 강좌</h2>
          <p className="mt-2 text-sm text-gray-500">
            QR 토큰에 강좌 정보가 포함되어 있지만, 현장 직원이 세션을 확인할 수 있도록 현재 강좌를 표시합니다.
          </p>

          <div className="mt-5 rounded-2xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-gray-500">현재 강좌</p>
            <p className="mt-2 text-xl font-bold text-gray-900">{selectedCourseName ?? '선택된 강좌 없음'}</p>
            <p className="mt-2 text-sm text-gray-500">활성 자료 {materialsCount}</p>
          </div>
        </section>

        {selectOptions.length > 0 ? (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-extrabold text-gray-900">자료 선택</h2>
            <p className="mt-2 text-sm text-gray-500">
              이 수강생이 아직 수령하지 않은 자료가 여러 개 있습니다. 지금 배부할 자료를 선택해 주세요.
            </p>

            <div className="mt-5 grid gap-3">
              {selectOptions.map((material) => (
                <button
                  key={material.id}
                  type="button"
                  onClick={() => onSelectMaterial(material.id)}
                  className="rounded-2xl bg-slate-900 px-4 py-4 text-left text-sm font-semibold text-white"
                >
                  {formatMaterialLabel(material.name, material.material_type)}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-extrabold text-gray-900">안내</h2>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              수강생이 수강증 페이지 URL을 직접 열면 토큰도 자동으로 처리됩니다. 카메라 접근이 차단된 경우 전화번호로 수동 배부를 이용해 주세요.
            </p>
          </section>
        )}
      </div>
    </section>
  )
}
