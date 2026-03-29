import { getPrisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export async function getOrCreatePointBalance(examNumber: string): Promise<number> {
  const prisma = getPrisma()
  const existing = await prisma.pointBalance.findUnique({ where: { examNumber } })
  if (existing) return existing.balance

  // Compute from PointLog and create PointBalance
  const agg = await prisma.pointLog.aggregate({
    where: { examNumber },
    _sum: { amount: true }
  })
  const balance = Math.max(0, agg._sum.amount ?? 0)

  await prisma.pointBalance.upsert({
    where: { examNumber },
    create: { id: `pb_${examNumber}`, examNumber, balance },
    update: { balance }
  })
  return balance
}

export async function adjustPointBalance(
  examNumber: string,
  delta: number,
  tx?: TransactionClient
): Promise<number> {
  const db = tx ?? getPrisma()
  const updated = await db.pointBalance.upsert({
    where: { examNumber },
    create: { id: `pb_${examNumber}`, examNumber, balance: Math.max(0, delta) },
    update: { balance: { increment: delta } }
  })
  return updated.balance
}
