import 'server-only'

import { createServerClient } from '@/lib/supabase/server'
import { buildFallbackTenantConfig, type TrackType } from '@/lib/tenant'
import { getServerTenantType } from '@/lib/tenant.server'
import { getBranchBySlug, upsertBranch, type BranchRecord } from '@/lib/branch-ops'
import type { BranchSeriesGroup, BranchSeriesOption } from '@/types/database'

export const SERIES_GROUP_LABEL: Record<BranchSeriesGroup, string> = {
  public: '공채',
  career: '경채',
}

export type BranchSeriesOptionInput = {
  id?: number | null
  group_key: BranchSeriesGroup
  label: string
  is_default?: boolean
  is_active?: boolean
  display_order?: number | null
}

const SERIES_GROUP_ORDER: Record<BranchSeriesGroup, number> = {
  public: 0,
  career: 1,
}

const DEFAULT_SERIES_TEMPLATES: Record<TrackType, BranchSeriesOptionInput[]> = {
  police: [
    { group_key: 'public', label: '공채', is_default: true, is_active: true, display_order: 0 },
    { group_key: 'career', label: '경행경채', is_default: false, is_active: true, display_order: 10 },
  ],
  fire: [
    { group_key: 'public', label: '공채', is_default: true, is_active: true, display_order: 0 },
    { group_key: 'career', label: '학과경채', is_default: false, is_active: true, display_order: 10 },
    { group_key: 'career', label: '구급경채', is_default: false, is_active: true, display_order: 20 },
    { group_key: 'career', label: '구조경채', is_default: false, is_active: true, display_order: 30 },
  ],
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'unknown error')
  }

  return 'unknown error'
}

function mapSeriesOption(row: Record<string, unknown>): BranchSeriesOption {
  return {
    id: Number(row.id),
    branch_id: Number(row.branch_id),
    group_key: row.group_key === 'career' ? 'career' : 'public',
    label: String(row.label ?? ''),
    is_default: Boolean(row.is_default),
    is_active: Boolean(row.is_active),
    display_order: Number(row.display_order) || 0,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function sortSeriesOptions(options: BranchSeriesOption[]) {
  return [...options].sort((left, right) => {
    const groupCompare = SERIES_GROUP_ORDER[left.group_key] - SERIES_GROUP_ORDER[right.group_key]
    if (groupCompare !== 0) return groupCompare
    const orderCompare = left.display_order - right.display_order
    if (orderCompare !== 0) return orderCompare
    return left.id - right.id
  })
}

function normalizeInputOptions(inputs: BranchSeriesOptionInput[]) {
  const seenLabels = new Set<string>()
  const normalized: BranchSeriesOptionInput[] = []

  for (const [index, input] of inputs.entries()) {
    const label = input.label.trim()
    if (!label || seenLabels.has(label)) {
      continue
    }

    seenLabels.add(label)
    normalized.push({
      id: input.id ?? null,
      group_key: input.group_key === 'career' ? 'career' : 'public',
      label,
      is_default: Boolean(input.is_default),
      is_active: input.is_active !== false,
      display_order: Number.isInteger(input.display_order) ? Number(input.display_order) : index * 10,
    })
  }

  if (normalized.length === 0) {
    normalized.push({ ...DEFAULT_SERIES_TEMPLATES.police[0] })
  }

  if (!normalized.some((option) => option.group_key === 'public' && option.is_active)) {
    normalized.unshift({ group_key: 'public', label: '공채', is_default: true, is_active: true, display_order: -10 })
  }

  const activeOptions = normalized.filter((option) => option.is_active)
  let defaultIndex = normalized.findIndex((option) => option.is_active && option.is_default)
  if (defaultIndex < 0) {
    defaultIndex = normalized.findIndex((option) => option.is_active && option.group_key === 'public')
  }
  if (defaultIndex < 0) {
    defaultIndex = normalized.findIndex((option) => option.is_active)
  }
  if (defaultIndex < 0 && normalized.length > 0) {
    normalized[0].is_active = true
    defaultIndex = 0
  }

  for (const [index, option] of normalized.entries()) {
    option.is_default = index === defaultIndex
    if (option.is_default) {
      option.is_active = true
    }
  }

  void activeOptions
  return normalized.map((option, index) => ({
    ...option,
    display_order: index * 10,
  }))
}

export function getDefaultSeriesOptionTemplates(trackType: TrackType) {
  return DEFAULT_SERIES_TEMPLATES[trackType] ?? DEFAULT_SERIES_TEMPLATES.police
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

async function listBranchOptions(branchId: number, includeInactive: boolean) {
  const db = createServerClient()
  let query = db
    .from('branch_series_options')
    .select('*')
    .eq('branch_id', branchId)
    .order('group_key', { ascending: false })
    .order('display_order', { ascending: true })
    .order('id', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load branch series options: ${getErrorMessage(error)}`)
  }

  return sortSeriesOptions(((data ?? []) as Array<Record<string, unknown>>).map(mapSeriesOption))
}

async function ensureDefaultSeriesOptions(branch: BranchRecord) {
  const existing = await listBranchOptions(branch.id, true)
  if (existing.length > 0) {
    return existing
  }

  const db = createServerClient()
  const templates = getDefaultSeriesOptionTemplates(branch.track_type)
  const { error } = await db
    .from('branch_series_options')
    .insert(templates.map((option) => ({
      branch_id: branch.id,
      group_key: option.group_key,
      label: option.label,
      is_default: Boolean(option.is_default),
      is_active: option.is_active !== false,
      display_order: option.display_order ?? 0,
    })))

  if (error) {
    throw new Error(`Failed to seed branch series options: ${getErrorMessage(error)}`)
  }

  return listBranchOptions(branch.id, true)
}

export async function listBranchSeriesOptions(options: { includeInactive?: boolean } = {}) {
  const branch = await getCurrentBranch()
  await ensureDefaultSeriesOptions(branch)
  return listBranchOptions(branch.id, Boolean(options.includeInactive))
}

export async function saveBranchSeriesOptions(inputs: BranchSeriesOptionInput[]) {
  const branch = await getCurrentBranch()
  const existing = await ensureDefaultSeriesOptions(branch)
  const existingIds = new Set(existing.map((option) => option.id))
  const normalized = normalizeInputOptions(inputs)

  for (const option of normalized) {
    if (option.id && !existingIds.has(option.id)) {
      throw new Error('Invalid branch series option id')
    }
  }

  const db = createServerClient()
  const { error: clearDefaultError } = await db
    .from('branch_series_options')
    .update({ is_default: false })
    .eq('branch_id', branch.id)
    .eq('is_default', true)

  if (clearDefaultError) {
    throw new Error(`Failed to update branch series defaults: ${getErrorMessage(clearDefaultError)}`)
  }

  for (const option of normalized) {
    if (option.id) {
      const { error } = await db
        .from('branch_series_options')
        .update({
          group_key: option.group_key,
          label: option.label,
          is_default: Boolean(option.is_default),
          is_active: option.is_active !== false,
          display_order: option.display_order ?? 0,
        })
        .eq('branch_id', branch.id)
        .eq('id', option.id)

      if (error) {
        throw new Error(`Failed to update branch series option: ${getErrorMessage(error)}`)
      }

      continue
    }

    const { error } = await db
      .from('branch_series_options')
      .insert({
        branch_id: branch.id,
        group_key: option.group_key,
        label: option.label,
        is_default: Boolean(option.is_default),
        is_active: option.is_active !== false,
        display_order: option.display_order ?? 0,
      })

    if (error) {
      throw new Error(`Failed to create branch series option: ${getErrorMessage(error)}`)
    }
  }

  return listBranchOptions(branch.id, true)
}

export type ResolveBranchSeriesOptionInput = {
  optionId?: number | null
  label?: string | null
  group?: BranchSeriesGroup | null
}

export function findBranchSeriesOptionByLabel(
  options: BranchSeriesOption[],
  label: string | null | undefined,
  group?: BranchSeriesGroup | null,
) {
  const normalizedLabel = label?.trim()
  if (!normalizedLabel) {
    return null
  }

  return options.find((candidate) => (
    candidate.label === normalizedLabel
    && (!group || candidate.group_key === group)
  )) ?? null
}

export function resolveBranchSeriesOptionFromOptions(
  options: BranchSeriesOption[],
  input: ResolveBranchSeriesOptionInput = {},
) {
  const normalizedLabel = input.label?.trim()

  if (input.optionId) {
    const option = options.find((candidate) => candidate.id === input.optionId)
    if (option) {
      return option
    }
  }

  if (normalizedLabel) {
    const option = findBranchSeriesOptionByLabel(options, normalizedLabel, input.group)
    if (option) {
      return option
    }
  }

  return (
    options.find((option) => option.is_default && option.is_active)
    ?? options.find((option) => option.group_key === 'public' && option.is_active)
    ?? options.find((option) => option.is_active)
    ?? null
  )
}

export function resolveBranchSeriesOptionRequestFromOptions(
  options: BranchSeriesOption[],
  input: ResolveBranchSeriesOptionInput = {},
) {
  const requestedLabel = input.label?.trim() || null
  const optionByLabel = requestedLabel
    ? findBranchSeriesOptionByLabel(options, requestedLabel, input.group)
    : null

  if (requestedLabel && !optionByLabel) {
    return {
      option: null,
      error: `직렬 '${requestedLabel}'은 현재 지점에서 사용할 수 없습니다.`,
    }
  }

  const option = resolveBranchSeriesOptionFromOptions(options, input)
  if (input.optionId && option?.id !== input.optionId) {
    return {
      option: null,
      error: '선택한 직렬이 현재 지점에서 사용할 수 없습니다.',
    }
  }

  if (input.optionId && optionByLabel && optionByLabel.id !== input.optionId) {
    return {
      option: null,
      error: '선택한 직렬 ID와 직렬명이 일치하지 않습니다.',
    }
  }

  return { option, error: null }
}

export async function resolveBranchSeriesOption(input: ResolveBranchSeriesOptionInput = {}) {
  const options = await listBranchSeriesOptions({ includeInactive: false })
  return resolveBranchSeriesOptionFromOptions(options, input)
}
