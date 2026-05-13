import 'server-only'

import { createServerClient } from '@/lib/supabase/server'
import { buildFallbackTenantConfig } from '@/lib/tenant'
import { getServerTenantType } from '@/lib/tenant.server'
import { getBranchBySlug, upsertBranch, type BranchRecord } from '@/lib/branch-ops'
import type { Enrollment, StudentCohortOption } from '@/types/database'

export type StudentCohortOptionInput = {
  label: string
  is_active?: boolean
  display_order?: number | null
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'unknown error')
  }

  return 'unknown error'
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

export function normalizeCohortNumber(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }

  const raw = String(value).trim()
  if (!raw) {
    return null
  }

  const match = raw.match(/^(\d{1,3})\s*기?$/)
  if (!match) {
    throw new Error('기수는 숫자만 입력해 주세요.')
  }

  const number = Number(match[1])
  if (!Number.isInteger(number) || number <= 0 || number > 999) {
    throw new Error('기수는 1부터 999 사이 숫자로 입력해 주세요.')
  }

  return number
}

export function cohortNumberToLabel(cohortNumber: number) {
  return `${cohortNumber}기`
}

export function cohortLabelToNumberString(label: string | null | undefined) {
  try {
    const parsed = normalizeCohortNumber(label)
    return typeof parsed === 'number' ? String(parsed) : ''
  } catch {
    return ''
  }
}

function mapCohortOption(row: Record<string, unknown>): StudentCohortOption {
  return {
    id: Number(row.id),
    branch_id: Number(row.branch_id),
    label: String(row.label ?? ''),
    is_active: Boolean(row.is_active),
    display_order: Number(row.display_order) || 0,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function sortCohortOptions(options: StudentCohortOption[]) {
  return [...options].sort((left, right) => {
    const orderCompare = left.display_order - right.display_order
    if (orderCompare !== 0) return orderCompare
    return left.id - right.id
  })
}

async function getCurrentBranch(): Promise<BranchRecord> {
  const tenant = await getServerTenantType()
  const branch = await getBranchBySlug(tenant)
  if (branch) {
    return branch
  }

  const fallback = buildFallbackTenantConfig(tenant)
  return upsertBranch({
    slug: tenant,
    name: fallback.branchName,
    track_type: fallback.trackType,
    description: fallback.defaultDescription,
    admin_title: fallback.adminTitle,
    series_label: fallback.labels.series,
    region_label: fallback.labels.region,
    app_name: fallback.defaultAppName,
    theme_color: fallback.defaultThemeColor,
  })
}

async function listBranchCohortOptions(branchId: number, includeInactive: boolean) {
  const db = createServerClient()
  let query = db
    .from('student_cohort_options')
    .select('*')
    .eq('branch_id', branchId)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load student cohort options: ${getErrorMessage(error)}`)
  }

  return sortCohortOptions(((data ?? []) as Array<Record<string, unknown>>).map(mapCohortOption))
}

export async function listStudentCohortOptions(options: { includeInactive?: boolean } = {}) {
  const branch = await getCurrentBranch()
  return listBranchCohortOptions(branch.id, Boolean(options.includeInactive))
}

export async function createStudentCohortOption(input: StudentCohortOptionInput) {
  const label = normalizeLabel(input.label)
  if (!label) {
    throw new Error('기수명을 입력해 주세요.')
  }

  const branch = await getCurrentBranch()
  const db = createServerClient()
  const { error } = await db
    .from('student_cohort_options')
    .insert({
      branch_id: branch.id,
      label,
      is_active: input.is_active ?? true,
      display_order: Number.isInteger(input.display_order) ? input.display_order : 0,
    })

  if (error) {
    throw new Error(`Failed to create student cohort option: ${getErrorMessage(error)}`)
  }

  return listBranchCohortOptions(branch.id, true)
}

export async function updateStudentCohortOption(
  optionId: number,
  patch: Partial<StudentCohortOptionInput>,
) {
  const branch = await getCurrentBranch()
  const existing = await listBranchCohortOptions(branch.id, true)
  if (!existing.some((option) => option.id === optionId)) {
    throw new Error('Invalid student cohort option id')
  }

  const payload: Record<string, unknown> = {}
  if (patch.label !== undefined) {
    const label = normalizeLabel(patch.label)
    if (!label) {
      throw new Error('기수명을 입력해 주세요.')
    }
    payload.label = label
  }
  if (patch.is_active !== undefined) {
    payload.is_active = patch.is_active
  }
  if (patch.display_order !== undefined) {
    payload.display_order = Number.isInteger(patch.display_order) ? patch.display_order : 0
  }

  if (Object.keys(payload).length === 0) {
    return existing
  }

  const db = createServerClient()
  const { error } = await db
    .from('student_cohort_options')
    .update(payload)
    .eq('branch_id', branch.id)
    .eq('id', optionId)

  if (error) {
    throw new Error(`Failed to update student cohort option: ${getErrorMessage(error)}`)
  }

  return listBranchCohortOptions(branch.id, true)
}

export async function deactivateStudentCohortOption(optionId: number) {
  return updateStudentCohortOption(optionId, { is_active: false })
}

export async function resolveStudentCohortOptionByNumber(cohortNumber: number | null | undefined) {
  if (!cohortNumber) {
    return null
  }

  const label = cohortNumberToLabel(cohortNumber)
  const branch = await getCurrentBranch()
  const existing = await listBranchCohortOptions(branch.id, true)
  const found = existing.find((option) => option.label === label)
  if (found) {
    if (!found.is_active) {
      await updateStudentCohortOption(found.id, { is_active: true, display_order: cohortNumber })
      return { ...found, is_active: true, display_order: cohortNumber }
    }
    return found
  }

  const db = createServerClient()
  const { error } = await db
    .from('student_cohort_options')
    .insert({
      branch_id: branch.id,
      label,
      is_active: true,
      display_order: cohortNumber,
    })

  if (error && !String(error.code ?? '').includes('23505')) {
    throw new Error(`Failed to create student cohort option: ${getErrorMessage(error)}`)
  }

  return resolveStudentCohortOption({ label, includeInactive: true })
}

export async function resolveStudentCohortOption(input: {
  optionId?: number | null
  label?: string | null
  includeInactive?: boolean
} = {}) {
  const options = await listStudentCohortOptions({ includeInactive: Boolean(input.includeInactive) })
  const normalizedLabel = normalizeLabel(input.label)

  if (input.optionId) {
    return options.find((candidate) => candidate.id === input.optionId) ?? null
  }

  if (normalizedLabel) {
    return options.find((candidate) => candidate.label === normalizedLabel) ?? null
  }

  return null
}

export async function getCohortLabelMap(optionIds: Array<number | null | undefined>) {
  const ids = Array.from(new Set(
    optionIds.filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0),
  ))
  if (ids.length === 0) {
    return new Map<number, string>()
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('student_cohort_options')
    .select('id,label')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to load student cohort labels: ${getErrorMessage(error)}`)
  }

  return new Map((data ?? []).map((row) => [Number(row.id), String(row.label ?? '')]))
}

export async function attachCohortLabelsToEnrollments<T extends Enrollment>(enrollments: T[]): Promise<T[]> {
  const labelMap = await getCohortLabelMap(enrollments.map((enrollment) => (
    enrollment.cohort_option_id ?? enrollment.student_profile?.cohort_option_id ?? null
  )))

  return enrollments.map((enrollment) => {
    const cohortId = enrollment.cohort_option_id ?? enrollment.student_profile?.cohort_option_id ?? null
    const cohortLabel = cohortId ? labelMap.get(cohortId) ?? null : null
    return {
      ...enrollment,
      cohort_option_id: cohortId,
      cohort_label: cohortLabel,
      student_profile: enrollment.student_profile
        ? {
            ...enrollment.student_profile,
            cohort_option_id: cohortId,
            cohort_label: cohortLabel,
          }
        : enrollment.student_profile,
    }
  })
}

export type CohortSearchStudent = {
  cohort_option_id?: number | null
  cohort_label?: string | null
}

export async function attachCohortLabelsToStudents<T extends CohortSearchStudent>(students: T[]): Promise<T[]> {
  const labelMap = await getCohortLabelMap(students.map((student) => student.cohort_option_id ?? null))
  return students.map((student) => {
    const cohortId = student.cohort_option_id ?? null
    return {
      ...student,
      cohort_label: cohortId ? labelMap.get(cohortId) ?? null : null,
    }
  })
}

export async function assertCohortOptionBelongsToCurrentBranch(
  cohortOptionId: number | null | undefined,
) {
  if (!cohortOptionId) {
    return null
  }

  const option = await resolveStudentCohortOption({ optionId: cohortOptionId })
  if (!option) {
    throw new Error('선택한 기수는 현재 지점에서 사용할 수 없습니다.')
  }

  return option
}
