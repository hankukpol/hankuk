export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-gray-200 border-t-[var(--division-color)] rounded-full animate-spin" />
        <p className="text-sm text-gray-500">로딩 중...</p>
      </div>
    </div>
  );
}
