import { invalidateCache } from '@/lib/cache/revalidate'
import { getUnreceivedMaterialsForEnrollment } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import type { MaterialType } from '@/types/database'

type DistributionResult = {
  success: boolean
  reason?: string
  material_name?: string
  student_name?: string
}

export type DistributionMaterialOption = {
  id: number
  name: string
  material_type: MaterialType
}

export type PendingDistributionSelection =
  | { kind: 'all_received' }
  | { kind: 'needs_selection'; materials: DistributionMaterialOption[] }
  | { kind: 'invalid_selection'; materials: DistributionMaterialOption[] }
  | { kind: 'selected'; material: DistributionMaterialOption }

export type DistributionExecutionResult =
  | {
    kind: 'distributed'
    studentName: string
    materialName: string
    materialType: MaterialType
  }
  | {
    kind: 'failed'
    reason: string
  }

export async function resolvePendingDistributionSelection(params: {
  enrollmentId: number
  courseId: number
  materialId?: number
}): Promise<PendingDistributionSelection> {
  const unreceivedMaterials = await getUnreceivedMaterialsForEnrollment(params.enrollmentId, params.courseId)
  const materials = unreceivedMaterials.map((material) => ({
    id: material.id,
    name: material.name,
    material_type: material.material_type,
  })) satisfies DistributionMaterialOption[]

  if (materials.length === 0) {
    return { kind: 'all_received' }
  }

  if (params.materialId === undefined && materials.length === 1) {
    return { kind: 'selected', material: materials[0] }
  }

  const targetMaterial = materials.find((material) => material.id === params.materialId)
  if (!targetMaterial) {
    if (params.materialId === undefined) {
      return { kind: 'needs_selection', materials }
    }

    return { kind: 'invalid_selection', materials }
  }

  return { kind: 'selected', material: targetMaterial }
}

export async function distributeMaterialToEnrollment(params: {
  enrollmentId: number
  studentName: string
  material: DistributionMaterialOption
}): Promise<DistributionExecutionResult> {
  const db = createServerClient()
  const rpcResult = await db.rpc('distribute_material', {
    p_enrollment_id: params.enrollmentId,
    p_material_id: params.material.id,
  })

  if (rpcResult.error) {
    return { kind: 'failed', reason: 'DISTRIBUTION_FAILED' }
  }

  const result = rpcResult.data as DistributionResult | null
  if (!result?.success) {
    return { kind: 'failed', reason: result?.reason ?? 'DISTRIBUTION_FAILED' }
  }

  await invalidateCache('distribution-logs')

  return {
    kind: 'distributed',
    studentName: result.student_name ?? params.studentName,
    materialName: result.material_name ?? params.material.name,
    materialType: params.material.material_type,
  }
}
