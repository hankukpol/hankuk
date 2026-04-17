import { notFound } from 'next/navigation'
import { PreviewClient } from './preview-client'

export const dynamic = 'force-dynamic'

export default function DevPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  return <PreviewClient />
}
