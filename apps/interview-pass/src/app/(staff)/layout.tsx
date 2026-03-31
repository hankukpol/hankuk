// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LayoutChildren = any

export default function StaffLayout({ children }: { children: LayoutChildren }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
