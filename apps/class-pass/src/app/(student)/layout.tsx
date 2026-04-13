export default function StudentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="student-shell">
      <div className="student-frame">
        {children}
      </div>
    </main>
  )
}
