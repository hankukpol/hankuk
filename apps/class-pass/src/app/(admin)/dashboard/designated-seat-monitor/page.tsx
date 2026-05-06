export default function DesignatedSeatMonitorPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-extrabold text-gray-900">지정좌석 QR 모니터</h1>
      <div className="mt-6 rounded-[8px] bg-white p-6 shadow-sm">
        <p className="text-sm leading-6 text-gray-600">
          기존 토큰 기반 멀티 모니터는 보안 정책 변경으로 종료되었습니다.
          이제 강의실 PC는 강좌별 고정 URL을 북마크하고, 각 브라우저를 표시기기로 등록해야 QR을 볼 수 있습니다.
        </p>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          4대 PC에 같은 강좌 URL을 열어두면 등록된 기기에서만 동일한 QR이 자동으로 표시됩니다.
          설정은 각 강좌의 지정좌석 관리 화면에서 진행해 주세요.
        </p>
      </div>
    </div>
  )
}
