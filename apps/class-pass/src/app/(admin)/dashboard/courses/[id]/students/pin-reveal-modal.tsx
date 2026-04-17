import type { PinRevealState } from './students-page-types'

type PinRevealModalProps = {
  reveal: PinRevealState | null
  onClose: () => void
  onCopyPin: (pin: string) => void
}

export function PinRevealModal({ reveal, onClose, onCopyPin }: PinRevealModalProps) {
  if (!reveal) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{reveal.title}</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700">
            닫기
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          PIN은 지금 이 순간에만 표시됩니다. 필요하면 바로 복사해 주세요.
        </p>
        <div className="mt-4 flex max-h-[50dvh] flex-col gap-3 overflow-y-auto">
          {reveal.pins.map((entry) => (
            <div key={`${entry.name}-${entry.phone}-${entry.pin}`} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{entry.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{entry.phone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void onCopyPin(entry.pin)}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                >
                  복사
                </button>
              </div>
              <p className="mt-3 font-mono text-2xl font-black tracking-[0.2em] text-slate-900">{entry.pin}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
