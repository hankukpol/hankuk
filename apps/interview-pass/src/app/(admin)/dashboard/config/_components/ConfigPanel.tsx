// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelSlot = any

type ConfigPanelProps = {
  eyebrow?: string
  title: string
  description?: string
  children: PanelSlot
  footer?: PanelSlot
}

export default function ConfigPanel({
  eyebrow,
  title,
  description,
  children,
  footer,
}: ConfigPanelProps) {
  return (
    <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          {description ? <p className="text-sm leading-6 text-gray-600">{description}</p> : null}
        </div>
      </div>

      {children}

      {footer ? <div>{footer}</div> : null}
    </section>
  )
}
