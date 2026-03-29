import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-8 text-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">면접 스터디 조 편성</h1>
          <p className="mt-2 text-sm text-gray-500">
            편성할 시험 유형을 선택하세요.
          </p>
        </div>

        <div className="flex gap-6">
          <Link
            href="/police"
            className="group flex h-48 w-48 flex-col items-center justify-center rounded-lg border-2 border-blue-200 transition-all hover:border-blue-500 hover:bg-blue-50"
          >
            <span className="mb-3 text-4xl">🚓</span>
            <span className="text-lg font-semibold text-gray-700 group-hover:text-blue-600">
              경찰
            </span>
            <span className="mt-1 text-xs text-gray-400">
              일반 · 101경비단 · 경행 등
            </span>
          </Link>

          <Link
            href="/fire"
            className="group flex h-48 w-48 flex-col items-center justify-center rounded-lg border-2 border-red-200 transition-all hover:border-red-500 hover:bg-red-50"
          >
            <span className="mb-3 text-4xl">🚒</span>
            <span className="text-lg font-semibold text-gray-700 group-hover:text-red-600">
              소방
            </span>
            <span className="mt-1 text-xs text-gray-400">
              일반 · 구급 · 구조 등
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
