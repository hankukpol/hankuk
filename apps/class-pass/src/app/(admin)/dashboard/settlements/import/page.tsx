'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useTenantConfig } from '@/components/TenantProvider'
import { formatWon } from '@/lib/payments/format'
import { downloadPaymentImportTemplate } from '@/lib/payments/xlsx-export'
import { withTenantPrefix } from '@/lib/tenant'
import type { Course } from '@/types/database'

type ImportField = 'name' | 'phone' | 'examNumber' | 'birthDate' | 'amount' | 'paidAt' | 'method' | 'cardCompany' | 'bankAccountLast4' | 'category' | 'memo'

type ParsedSheet = {
  headers: string[]
  records: Record<string, string>[]
}

type PreviewRow = {
  rowNumber: number
  name: string
  phone: string
  examNumber: string | null
  amount: number
  paidAt: string
  method: string
  cardCompany: string | null
  bankAccountLast4: string | null
  category: string
  memo: string | null
  status: 'matched' | 'create' | 'duplicate' | 'error'
  enrollmentId: number | null
  message: string
}

type ImportResult = {
  dryRun: boolean
  rows: PreviewRow[]
  matchedCount: number
  createCount: number
  errorCount: number
  duplicateCount: number
  createdEnrollmentCount: number
  createdPaymentCount: number
}

const FIELD_LABEL: Record<ImportField, string> = {
  name: '이름',
  phone: '연락처',
  examNumber: '응시번호',
  birthDate: '생년월일',
  amount: '수강료',
  paidAt: '결제일',
  method: '결제방법',
  cardCompany: '카드사',
  bankAccountLast4: '계좌 마지막 4자리',
  category: '분류',
  memo: '비고',
}

const REQUIRED_FIELDS: ImportField[] = ['name', 'phone', 'amount', 'paidAt', 'method']
const ALL_FIELDS = Object.keys(FIELD_LABEL) as ImportField[]

function inferMapping(headers: string[]) {
  const mapping: Record<ImportField, string> = {
    name: '',
    phone: '',
    examNumber: '',
    birthDate: '',
    amount: '',
    paidAt: '',
    method: '',
    cardCompany: '',
    bankAccountLast4: '',
    category: '',
    memo: '',
  }

  for (const header of headers) {
    const normalized = header.replace(/\s+/g, '').toLowerCase()
    if (!mapping.name && /이름|성명|name/.test(normalized)) mapping.name = header
    if (!mapping.phone && /연락처|전화|휴대폰|phone|mobile/.test(normalized)) mapping.phone = header
    if (!mapping.examNumber && /응시|학번|수험|exam/.test(normalized)) mapping.examNumber = header
    if (!mapping.birthDate && /생년월일|생일|birthdate|birthday|yymmdd/.test(normalized)) mapping.birthDate = header
    if (!mapping.amount && /수강료|금액|결제액|amount|price/.test(normalized)) mapping.amount = header
    if (!mapping.paidAt && /결제일|납부일|수납일|date|paid/.test(normalized)) mapping.paidAt = header
    if (!mapping.method && /결제방법|결제수단|방법|method/.test(normalized)) mapping.method = header
    if (!mapping.cardCompany && /카드사|cardcompany|card_company/.test(normalized)) mapping.cardCompany = header
    if (!mapping.bankAccountLast4 && /계좌.*4|account.*4|bankaccountlast4|bank_account_last4/.test(normalized)) mapping.bankAccountLast4 = header
    if (!mapping.category && /분류|항목|category/.test(normalized)) mapping.category = header
    if (!mapping.memo && /비고|메모|memo|note/.test(normalized)) mapping.memo = header
  }

  return mapping
}

function toImportRows(sheet: ParsedSheet, mapping: Record<ImportField, string>) {
  return sheet.records.map((record) => ({
    name: mapping.name ? record[mapping.name] : '',
    phone: mapping.phone ? record[mapping.phone] : '',
    examNumber: mapping.examNumber ? record[mapping.examNumber] : '',
    birthDate: mapping.birthDate ? record[mapping.birthDate] : '',
    amount: mapping.amount ? record[mapping.amount] : '',
    paidAt: mapping.paidAt ? record[mapping.paidAt] : '',
    method: mapping.method ? record[mapping.method] : '',
    cardCompany: mapping.cardCompany ? record[mapping.cardCompany] : '',
    bankAccountLast4: mapping.bankAccountLast4 ? record[mapping.bankAccountLast4] : '',
    category: mapping.category ? record[mapping.category] : '',
    memo: mapping.memo ? record[mapping.memo] : '',
  }))
}

function getStatusClass(status: PreviewRow['status']) {
  switch (status) {
    case 'matched':
      return 'bg-emerald-50 text-emerald-700'
    case 'create':
      return 'bg-blue-50 text-blue-700'
    case 'duplicate':
      return 'bg-amber-50 text-amber-700'
    default:
      return 'bg-red-50 text-red-700'
  }
}

async function parseWorkbook(file: File): Promise<ParsedSheet> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
  const [rawHeaders, ...rawRecords] = rows
  const headers = (rawHeaders ?? []).map((header) => String(header).trim()).filter(Boolean)
  const records = rawRecords
    .filter((row) => row.some((cell) => String(cell).trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '').trim()])))

  return { headers, records }
}

export default function SettlementImportPage() {
  const tenant = useTenantConfig()
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState('')
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<Record<ImportField, string>>(inferMapping([]))
  const [createMissingEnrollment, setCreateMissingEnrollment] = useState(true)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/courses?activeOnly=1', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? '강좌 목록을 불러오지 못했습니다.')
        }
        const nextCourses = (payload?.courses ?? []) as Course[]
        setCourses(nextCourses)
        setCourseId((current) => current || String(nextCourses[0]?.id ?? ''))
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '강좌 목록을 불러오지 못했습니다.')
      })
  }, [])

  const importRows = useMemo(() => sheet ? toImportRows(sheet, mapping) : [], [mapping, sheet])
  const missingRequired = REQUIRED_FIELDS.filter((field) => !mapping[field])

  async function handleFile(file: File) {
    setLoading(true)
    setError('')
    setMessage('')
    setResult(null)
    try {
      const parsed = await parseWorkbook(file)
      setSheet(parsed)
      setMapping(inferMapping(parsed.headers))
      setMessage(`${file.name}에서 ${parsed.records.length.toLocaleString('ko-KR')}행을 읽었습니다.`)
    } catch (reason) {
      setSheet(null)
      setError(reason instanceof Error ? reason.message : '파일을 읽지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function runImport(dryRun: boolean) {
    if (!courseId) {
      setError('강좌를 선택해 주세요.')
      return
    }

    if (!sheet || importRows.length === 0) {
      setError('업로드된 행이 없습니다.')
      return
    }

    if (missingRequired.length > 0) {
      setError(`필수 매핑을 선택해 주세요: ${missingRequired.map((field) => FIELD_LABEL[field]).join(', ')}`)
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/payments/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: Number(courseId),
        rows: importRows,
        dryRun,
        createMissingEnrollment,
      }),
    })
    const payload = await response.json().catch(() => null)
    setLoading(false)

    if (!response.ok) {
      setError(payload?.error ?? '가져오기를 처리하지 못했습니다.')
      return
    }

    setResult(payload as ImportResult)
    setMessage(dryRun
      ? '미리보기를 생성했습니다. 문제가 없으면 실제 적용을 실행하세요.'
      : `${payload?.createdPaymentCount ?? 0}건의 결제 기록을 생성했습니다.`)
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[8px] bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Import</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#1d1d1f]">엑셀 수납 가져오기</h1>
            <p className="mt-2 text-sm text-slate-500">기존 운영 엑셀 또는 CSV를 읽어 수강생과 결제 기록을 한 번에 반영합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadPaymentImportTemplate()}
              className="inline-flex items-center gap-2 rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              <Download className="h-4 w-4" />
              양식 다운로드
            </button>
            <Link
              href={withTenantPrefix('/dashboard/settlements', tenant.type)}
              className="rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              정산으로 돌아가기
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr,260px]">
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center hover:bg-slate-100">
            <Upload className="h-7 w-7 text-slate-400" />
            <span className="mt-2 text-sm font-semibold text-slate-700">{loading ? '처리 중...' : 'xlsx, xls, csv 파일 선택'}</span>
            <span className="mt-1 text-xs text-slate-400">첫 번째 시트를 기준으로 헤더를 읽습니다.</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv"
              className="hidden"
              disabled={loading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void handleFile(file)
                }
                event.target.value = ''
              }}
            />
          </label>

          <div className="rounded-[8px] bg-slate-50 p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">대상 강좌</span>
              <select
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              >
                <option value="">강좌 선택</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </label>
            <label className="mt-4 flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={createMissingEnrollment}
                onChange={(event) => setCreateMissingEnrollment(event.target.checked)}
                className="mt-0.5"
              />
              <span>매칭되지 않은 학생은 신규 수강생으로 생성합니다.</span>
            </label>
          </div>
        </div>
      </section>

      {(message || error) ? (
        <div>
          {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
        </div>
      ) : null}

      {sheet ? (
        <section className="rounded-[8px] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#1d1d1f]">헤더 매핑</h2>
              <p className="mt-1 text-xs text-slate-500">{sheet.records.length.toLocaleString('ko-KR')}행 · 필수 항목은 이름, 연락처, 금액, 결제일, 결제방법입니다.</p>
            </div>
            <FileSpreadsheet className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ALL_FIELDS.map((field) => (
              <label key={field} className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-500">
                  {FIELD_LABEL[field]} {REQUIRED_FIELDS.includes(field) ? '*' : ''}
                </span>
                <select
                  value={mapping[field]}
                  onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
                  className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">선택 안 함</option>
                  {sheet.headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void runImport(true)}
              disabled={loading}
              className="rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Dry run
            </button>
            <button
              type="button"
              onClick={() => void runImport(false)}
              disabled={loading || !result || result.errorCount > 0 || result.duplicateCount > 0}
              className="rounded-[8px] bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              실제 적용
            </button>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="rounded-[8px] bg-white shadow-sm">
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 xl:grid-cols-5">
            {[
              { label: '매칭', value: `${result.matchedCount}명`, className: 'text-emerald-700' },
              { label: '신규', value: `${result.createCount}명`, className: 'text-blue-700' },
              { label: '중복', value: `${result.duplicateCount}건`, className: 'text-amber-700' },
              { label: '오류', value: `${result.errorCount}건`, className: 'text-red-700' },
              { label: '생성 결제', value: `${result.createdPaymentCount}건`, className: 'text-[#1d1d1f]' },
            ].map((card) => (
              <article key={card.label} className="rounded-[8px] bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-400">{card.label}</p>
                <p className={`mt-1 text-lg font-bold ${card.className}`}>{card.value}</p>
              </article>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                  <th className="px-5 py-3">행</th>
                  <th className="px-3 py-3">이름</th>
                  <th className="px-3 py-3">연락처</th>
                  <th className="px-3 py-3">응시번호</th>
                  <th className="px-3 py-3 text-right">금액</th>
                  <th className="px-3 py-3">결제일</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="px-5 py-3">메시지</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {result.rows.slice(0, 300).map((row) => (
                  <tr key={row.rowNumber} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 text-slate-500">{row.rowNumber}</td>
                    <td className="px-3 py-3 font-semibold text-[#1d1d1f]">{row.name || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{row.phone || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{row.examNumber || '-'}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatWon(row.amount)}</td>
                    <td className="px-3 py-3 text-slate-500">{row.paidAt}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${getStatusClass(row.status)}`}>
                        {row.status === 'matched' ? '매칭' : row.status === 'create' ? '신규' : row.status === 'duplicate' ? '중복' : '오류'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length > 300 ? (
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">화면에는 처음 300행만 표시됩니다.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
