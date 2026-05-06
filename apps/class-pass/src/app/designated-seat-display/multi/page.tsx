export default function MultiDisplayDeprecatedPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-center text-white">
      <main className="max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">Designated Seat</p>
        <h1 className="mt-4 text-3xl font-black">멀티 QR 표시 화면은 종료되었습니다.</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          지정좌석 QR은 이제 강좌별 고정 URL과 등록된 표시기기 쿠키로만 표시됩니다.
          강의실 PC마다 관리자 화면의 고정 URL을 북마크하고, 각 브라우저를 표시기기로 등록해 주세요.
        </p>
      </main>
    </div>
  )
}
