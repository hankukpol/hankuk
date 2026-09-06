import { invalidateDistributionCache, type DistributionRefreshNotice } from '@/lib/distribution/cache'
import { getUnreceivedMaterialsForEnrollment } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
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
  | { kind: 'selected'; materials: DistributionMaterialOption[] }

export type DistributedMaterialSummary = {
  id: number
  name: string
  materialType: MaterialType
}

export type DistributionExecutionResult = DistributionRefreshNotice & (
  | {
    kind: 'distributed'
    studentName: string
    materials: DistributedMaterialSummary[]
  }
  | {
    kind: 'partial'
    studentName: string
    materials: DistributedMaterialSummary[]
    reason: string
  }
  | {
    kind: 'failed'
    reason: string
  }
)

export async function resolvePendingDistributionSelection(params: {
  enrollmentId: number
  courseId: number
  materialId?: number
  materialIds?: number[]
  requireExplicitSelection?: boolean
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

  const requestedIds = Array.from(
    new Set(
      [params.materialId, ...(params.materialIds ?? [])]
        .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0),
    ),
  )

  if (requestedIds.length === 0 && materials.length === 1 && !params.requireExplicitSelection) {
    return { kind: 'selected', materials: [materials[0]] }
  }

  if (requestedIds.length === 0) {
    return { kind: 'needs_selection', materials }
  }

  const materialMap = new Map(materials.map((material) => [material.id, material]))
  const selectedMaterials = requestedIds
    .map((materialId) => materialMap.get(materialId))
    .filter((material): material is DistributionMaterialOption => Boolean(material))

  if (selectedMaterials.length !== requestedIds.length) {
    if (params.materialId === undefined && (!params.materialIds || params.materialIds.length === 0)) {
      return { kind: 'needs_selection', materials }
    }

    return { kind: 'invalid_selection', materials }
  }

  return { kind: 'selected', materials: selectedMaterials }
}

export async function distributeMaterialsToEnrollment(params: {
  enrollmentId: number
  studentName: string
  materials: DistributionMaterialOption[]
}): Promise<DistributionExecutionResult> {
  const db = createServerClient()
  const division = await getServerTenantType()
  const distributedMaterials: DistributedMaterialSummary[] = []

  for (const material of params.materials) {
    const rpcResult = await db.rpc('distribute_material_atomic', {
      p_division: division,
      p_enrollment_id: params.enrollmentId,
      p_material_id: material.id,
    }).then(result => result, error => ({ data: null, error }))

    if (rpcResult.error) {
      if (distributedMaterials.length > 0) {
        return {
          ...await invalidateDistributionCache(),
          kind: 'partial',
          studentName: params.studentName,
          materials: distributedMaterials,
          reason: 'DISTRIBUTION_FAILED',
        }
      }

      return { kind: 'failed', reason: 'DISTRIBUTION_FAILED' }
    }

    const result = rpcResult.data as DistributionResult | null
    if (!result?.success) {
      const reason = result?.reason ?? 'DISTRIBUTION_FAILED'

      if (distributedMaterials.length > 0) {
        return {
          ...await invalidateDistributionCache(),
          kind: 'partial',
          studentName: result?.student_name ?? params.studentName,
          materials: distributedMaterials,
          reason,
        }
      }

      return { kind: 'failed', reason }
    }

    distributedMaterials.push({
      id: material.id,
      name: result.material_name ?? material.name,
      materialType: material.material_type,
    })
  }

  const notice = distributedMaterials.length > 0 ? await invalidateDistributionCache() : {}

  return {
    ...notice,
    kind: 'distributed',
    studentName: params.studentName,
    materials: distributedMaterials,
  }
}
