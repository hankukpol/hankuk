'use client'

import { useState } from 'react'

interface Props {
  url: string
}

export function CopyLinkButton({ url }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded bg-gray-100 px-3 py-2 text-sm break-all">{url}</code>
      <button
        onClick={handleCopy}
        className="shrink-0 rounded-lg bg-[#C55A11] px-3 py-2 text-sm font-medium text-white hover:bg-[#A04A0E]"
      >
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  )
}
