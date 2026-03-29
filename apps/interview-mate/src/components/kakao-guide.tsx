import { MessageCircleMore } from "lucide-react";

export function KakaoGuide() {
  return (
    <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-amber-600">
          <MessageCircleMore className="h-5 w-5" />
        </span>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            조 방은 임시 소통 공간입니다.
          </p>
          <p className="text-sm leading-6 text-amber-800">
            조원 확인과 간단한 일정 조율 후 카카오톡 단체방으로 이동할 수 있도록
            안내 배너를 배치합니다.
          </p>
          <button className="inline-flex items-center rounded-[10px] border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900">
            카카오톡 방 안내 보기
          </button>
        </div>
      </div>
    </div>
  );
}
