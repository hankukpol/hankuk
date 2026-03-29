import type { ReactNode } from 'react'

type FeatureDisabledPanelProps = {
  title: string
  description: string
  action?: ReactNode
  fullPage?: boolean
}

export default function FeatureDisabledPanel({
  title,
  description,
  action,
  fullPage = false,
}: FeatureDisabledPanelProps) {
  const wrapperClassName = fullPage
    ? 'flex min-h-dvh items-center justify-center bg-[#F9FAFB] px-5 py-8'
    : 'flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white px-5 py-10'

  return (
    <div className={wrapperClassName}>
      <div className="w-full max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
          기능 비활성
        </p>
        <h1 className="mt-3 text-2xl font-bold text-amber-950">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-amber-900">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  )
}
