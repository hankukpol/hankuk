export default function StudentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto w-full max-w-none md:max-w-[768px]">
        {children}
      </div>
    </main>
  )
}
