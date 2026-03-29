type ConfigStatusMessageProps = {
  text: string
  tone?: 'success' | 'error' | 'info'
}

export default function ConfigStatusMessage({
  text,
  tone = 'info',
}: ConfigStatusMessageProps) {
  const toneClass =
    tone === 'success'
      ? 'border-green-200 bg-green-50 text-green-700'
      : tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-blue-200 bg-blue-50 text-blue-700'

  return (
    <p className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`}>
      {text}
    </p>
  )
}
