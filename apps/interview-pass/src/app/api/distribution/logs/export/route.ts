import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantConfig } from '@/lib/tenant.server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'

interface JoinedStudent {
  name: string
  phone: string
  exam_number: string | null
  series: string | null
  region: string | null
}

interface JoinedMaterial {
  name: string
}

interface ExportRow {
  id: number
  distributed_at: string
  distributed_by: string
  note: string
  students: JoinedStudent | null
  materials: JoinedMaterial | null
}

const PAGE_SIZE = 1000

const escapeCsv = (value: string | null | undefined): string => {
  const text = String(value ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .replace(/"/g, '""')

  return `"${text}"`
}

async function loadRows(
  division: 'police' | 'fire',
  exportAll: boolean,
  dateFrom: string,
  dateTo: string,
): Promise<ExportRow[]> {
  const db = createServerClient()
  const rows: ExportRow[] = []
  const scope = getScopedDivisionValues(division)

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const buildQuery = (scoped: boolean) => {
      let query = db
        .from('distribution_logs')
        .select(
          'id, distributed_at, distributed_by, note, students(name, phone, exam_number, series, region), materials(name)',
        )
        .order('distributed_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (scoped) {
        query = query.in('division', scope)
      }

      if (!exportAll) {
        query = query
          .gte('distributed_at', `${dateFrom}T00:00:00+09:00`)
          .lte('distributed_at', `${dateTo}T23:59:59.999+09:00`)
      }

      return query
    }

    const { data, error } = await withDivisionFallback(
      () => buildQuery(true),
      () => buildQuery(false),
    )
    if (error) throw error

    const batch = (data ?? []) as unknown as ExportRow[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }

  return rows
}

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_distribution_logs_enabled')
  if (featureError) {
    return featureError
  }

  const tenant = await getServerTenantConfig()

  const sp = req.nextUrl.searchParams
  const exportAll = sp.get('all') === '1'
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const dateFrom = sp.get('date_from') ?? today
  const dateTo = sp.get('date_to') ?? today

  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!exportAll && (!datePattern.test(dateFrom) || !datePattern.test(dateTo))) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  let rows: ExportRow[]
  try {
    rows = await loadRows(tenant.type, exportAll, dateFrom, dateTo)
  } catch {
    return NextResponse.json({ error: '데이터를 불러오지 못했습니다.' }, { status: 500 })
  }

  const header = [
    'ID',
    '배부 일시(KST)',
    '학생명',
    '휴대전화',
    '수험번호',
    tenant.exportSeriesLabel,
    tenant.exportRegionLabel,
    '자료명',
    '처리자',
    '메모',
  ]
  const lines = [
    header.join(','),
    ...rows.map((row) => {
      const student = row.students
      const material = row.materials
      const kst = new Date(row.distributed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

      return [
        row.id,
        escapeCsv(kst),
        escapeCsv(student?.name),
        escapeCsv(student?.phone),
        escapeCsv(student?.exam_number),
        escapeCsv(student?.series),
        escapeCsv(student?.region),
        escapeCsv(material?.name),
        escapeCsv(row.distributed_by),
        escapeCsv(row.note),
      ].join(',')
    }),
  ]

  const bom = '\uFEFF'
  const filename = exportAll
    ? 'distribution_logs_all.csv'
    : `distribution_logs_${dateFrom}${dateFrom !== dateTo ? `_${dateTo}` : ''}.csv`

  return new NextResponse(bom + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
