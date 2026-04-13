'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import type { Course, Enrollment } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'

type MatchResult = {
  fileName: string
  file: File
  examNumber: string
  enrollment: Enrollment | null
  preview: string
}

export default function BulkPhotoUploadPage() {
  const params = useParams<{ id: string }>()
  const tenant = useTenantConfig()
  const courseId = Number(params.id)
  const dropRef = useRef<HTMLDivElement>(null)

  const [course, setCourse] = useState<Course | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/courses/${courseId}`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`/api/enrollments?courseId=${courseId}`, { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([cp, ep]) => {
        setCourse(cp.course as Course)
        setEnrollments((ep.enrollments ?? []) as Enrollment[])
      })
      .catch(() => setError('데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [courseId])

  const enrollmentByExam = useMemo(() => {
    const map = new Map<string, Enrollment>()
    for (const e of enrollments) {
      if (e.exam_number) map.set(e.exam_number.trim(), e)
    }
    return map
  }, [enrollments])

  const processFiles = useCallback((files: FileList | File[]) => {
    const results: MatchResult[] = []
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'))

    for (const file of fileArray) {
      const baseName = file.name.replace(/\.[^.]+$/, '').trim()
      const enrollment = enrollmentByExam.get(baseName) ?? null

      results.push({
        fileName: file.name,
        file,
        examNumber: baseName,
        enrollment,
        preview: URL.createObjectURL(file),
      })
    }

    results.sort((a, b) => {
      if (a.enrollment && !b.enrollment) return -1
      if (!a.enrollment && b.enrollment) return 1
      return a.examNumber.localeCompare(b.examNumber, 'ko-KR', { numeric: true })
    })

    setMatches(results)
    setError('')
    setMessage('')
  }, [enrollmentByExam])

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) processFiles(event.target.files)
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragOver(false)
    if (event.dataTransfer.files.length) processFiles(event.dataTransfer.files)
  }

  async function handleUpload() {
    const matched = matches.filter((m) => m.enrollment)
    if (matched.length === 0) { setError('매칭된 사진이 없습니다.'); return }

    setUploading(true)
    setProgress({ done: 0, total: matched.length })
    setError('')
    let successCount = 0

    for (const m of matched) {
      const formData = new FormData()
      formData.append('photo', m.file)
      const r = await fetch(`/api/enrollments/${m.enrollment!.id}/photo`, { method: 'POST', body: formData })
      if (r.ok) successCount++
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }

    setUploading(false)
    setMessage(`${successCount}/${matched.length}건 업로드 완료`)
    setMatches([])
  }

  const matchedCount = matches.filter((m) => m.enrollment).length
  const unmatchedCount = matches.length - matchedCount

  if (loading) return <p className="py-12 text-center text-sm text-gray-400">불러오는 중...</p>
  if (!course) return <p className="py-12 text-center text-sm text-red-500">{error || '강좌를 찾을 수 없습니다.'}</p>

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={withTenantPrefix(`/dashboard/courses/${courseId}/students`, tenant.type)}
          className="text-xs font-medium text-gray-400 hover:underline"
        >
          ← 수강생 관리
        </Link>
        <h2 className="mt-1 text-xl font-extrabold text-gray-900">사진 일괄 업로드</h2>
        <p className="mt-1 text-sm text-gray-400">
          파일명을 수험번호로 맞춰주세요. 예: <span className="font-semibold text-gray-600">26809.jpg</span>
        </p>
      </div>

      {/* Drop zone */}
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
        }`}
      >
        <p className="text-sm font-semibold text-gray-700">사진 파일을 드래그하거나 클릭하여 선택</p>
        <p className="mt-1 text-xs text-gray-400">JPEG, PNG, WebP · 2MB 이하 · 파일명 = 수험번호</p>
        <label className="mt-4 cursor-pointer rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          파일 선택
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}

      {/* Match preview */}
      {matches.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">
              매칭 결과
              <span className="ml-2 text-xs font-normal text-gray-400">
                매칭 {matchedCount}건 · 미매칭 {unmatchedCount}건
              </span>
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMatches([])}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                초기화
              </button>
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={uploading || matchedCount === 0}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50 hover:bg-blue-700"
              >
                {uploading ? `업로드 중 (${progress.done}/${progress.total})` : `매칭된 ${matchedCount}건 업로드`}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {matches.map((m) => (
              <div
                key={m.fileName}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                  m.enrollment ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'
                }`}
              >
                <img src={m.preview} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{m.fileName}</p>
                  <p className="text-xs text-gray-500">수험번호: {m.examNumber}</p>
                </div>
                {m.enrollment ? (
                  <span className="shrink-0 text-xs font-semibold text-emerald-700">
                    → {m.enrollment.name} ✓
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-semibold text-red-500">매칭 실패 ✗</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
