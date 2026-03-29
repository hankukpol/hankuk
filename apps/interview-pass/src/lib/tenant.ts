/**
 * Runtime tenant configuration for the interview-pass service.
 *
 * This app serves multiple divisions from one running instance.
 * Division is resolved per-request via path slug or cookie, not a fixed build.
 */

export type TenantType = 'police' | 'fire'

export const TENANT_HEADER = 'x-hankuk-division'
export const TENANT_COOKIE = 'hankuk_division'
export const TENANT_TYPES: TenantType[] = ['police', 'fire']
export const DEFAULT_TENANT_TYPE: TenantType =
  process.env.NEXT_PUBLIC_TENANT_TYPE === 'fire' ? 'fire' : 'police'

export interface TenantConfig {
  type: TenantType
  defaultAppName: string
  defaultDescription: string
  adminTitle: string
  packageName: string
  labels: {
    series: string
    region: string
  }
  showRegionInScan: boolean
  studentListHeaders: string[]
  studentListFields: ('name' | 'phone' | 'series' | 'exam_number' | 'gender' | 'region')[]
  unreceivedHeaders: string[]
  logHeaders: string[]
  logColSpan: number
  bulkPasteGuide: string
  bulkPastePreviewHeaders: string[]
  receiptFields: [
    string,
    (student: {
      name: string
      exam_number?: string | null
      gender?: string | null
      region?: string | null
      series?: string | null
    }) => string,
  ][]
  exportSeriesLabel: string
  exportRegionLabel: string
  editFormFields: [string, string][]
}

const POLICE_CONFIG: TenantConfig = {
  type: 'police',
  defaultAppName: '경찰 면접 모바일 합격증',
  defaultDescription: '경찰 면접 합격증 및 자료 배부 운영 서비스',
  adminTitle: '경찰 면접 합격증 관리',
  packageName: 'police-interview-mobile-pass',
  labels: { series: '구분', region: '응시청' },
  showRegionInScan: true,
  studentListHeaders: ['이름', '휴대전화', '구분', '수험번호', '성별', '응시청', ''],
  studentListFields: ['name', 'phone', 'series', 'exam_number', 'gender', 'region'],
  unreceivedHeaders: ['이름', '수험번호', '구분', '응시청', '배부'],
  logHeaders: ['일시', '학생', '수험번호', '구분', '응시청', '자료', '처리자', '메모'],
  logColSpan: 8,
  bulkPasteGuide: '이름 / 휴대전화 / 구분 / 수험번호 / 성별 / 응시청',
  bulkPastePreviewHeaders: ['이름', '휴대전화', '구분', '수험번호', '성별', '응시청'],
  receiptFields: [
    ['이름', (student) => student.name],
    ['수험번호', (student) => student.exam_number ?? '-'],
    ['성별', (student) => student.gender ?? '-'],
    ['응시청', (student) => student.region ?? '-'],
    ['구분', (student) => student.series ?? '-'],
  ],
  exportSeriesLabel: '구분',
  exportRegionLabel: '응시청',
  editFormFields: [
    ['name', '이름*'],
    ['phone', '휴대전화*'],
    ['series', '구분'],
    ['exam_number', '수험번호'],
    ['gender', '성별'],
    ['region', '응시청'],
  ],
}

const FIRE_CONFIG: TenantConfig = {
  type: 'fire',
  defaultAppName: '소방 면접 모바일 접수증',
  defaultDescription: '소방 면접 자료 배부 QR 접수 서비스',
  adminTitle: '면접 접수 관리',
  packageName: 'interview-receipt-next',
  labels: { series: '직렬', region: '응시지역' },
  showRegionInScan: false,
  studentListHeaders: ['이름', '휴대전화', '수험번호', '직렬', '응시지역', ''],
  studentListFields: ['name', 'phone', 'exam_number', 'series', 'region'],
  unreceivedHeaders: ['이름', '수험번호', '직렬', '응시지역', '배부'],
  logHeaders: ['일시', '학생', '수험번호', '직렬', '자료', '처리자', '메모'],
  logColSpan: 7,
  bulkPasteGuide: '이름 / 휴대전화 / 수험번호 / 성별 / 응시지역 / 직렬',
  bulkPastePreviewHeaders: ['이름', '휴대전화', '수험번호', '성별', '응시지역', '직렬'],
  receiptFields: [
    ['이름', (student) => student.name],
    ['수험번호', (student) => student.exam_number ?? '-'],
    ['성별', (student) => student.gender ?? '-'],
    ['응시지역', (student) => student.region ?? '-'],
    ['직렬', (student) => student.series ?? '-'],
  ],
  exportSeriesLabel: '직렬',
  exportRegionLabel: '응시지역',
  editFormFields: [
    ['name', '이름*'],
    ['phone', '휴대전화*'],
    ['exam_number', '수험번호'],
    ['gender', '성별'],
    ['region', '응시지역'],
    ['series', '직렬'],
  ],
}

function readBrowserCookie(name: string) {
  if (typeof document === 'undefined') {
    return null
  }

  const prefix = `${name}=`
  const entry = document.cookie.split('; ').find((item) => item.startsWith(prefix))
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null
}

export function normalizeTenantType(value: string | null | undefined): TenantType | null {
  if (value === 'police' || value === 'fire') {
    return value
  }

  return null
}

export function parseTenantTypeFromPathname(pathname: string | null | undefined): TenantType | null {
  if (!pathname) {
    return null
  }

  const match = pathname.match(/^\/(police|fire)(?=\/|$)/)
  return match ? normalizeTenantType(match[1]) : null
}

export function stripTenantPrefix(pathname: string): string {
  const nextPath = pathname.replace(/^\/(?:police|fire)(?=\/|$)/, '')
  return nextPath === '' ? '/' : nextPath
}

export function withTenantPrefix(pathname: string, tenant: TenantType): string {
  const sanitized = pathname === '' ? '/' : pathname
  const stripped = stripTenantPrefix(sanitized)
  return stripped === '/' ? `/${tenant}` : `/${tenant}${stripped}`
}

export function getTenantConfigByType(type: TenantType): TenantConfig {
  return type === 'fire' ? FIRE_CONFIG : POLICE_CONFIG
}

export function getTenantType(): TenantType {
  if (typeof window === 'undefined') {
    return DEFAULT_TENANT_TYPE
  }

  return (
    parseTenantTypeFromPathname(window.location.pathname)
    ?? normalizeTenantType(readBrowserCookie(TENANT_COOKIE))
    ?? DEFAULT_TENANT_TYPE
  )
}

export function getTenantConfig(): TenantConfig {
  return getTenantConfigByType(getTenantType())
}
