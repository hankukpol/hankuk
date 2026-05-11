import { notFound } from 'next/navigation'
import SettlementIntegrityClientPage from './settlement-integrity-client'

export const dynamic = 'force-dynamic'

export default function SettlementIntegrityPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  return <SettlementIntegrityClientPage />
}
