import { MessageCircleMore } from "lucide-react";

type KakaoGuideProps = {
  actionLabel?: string;
  onAction?: () => void;
};

export function KakaoGuide({
  actionLabel = "초대 정보 보기",
  onAction,
}: KakaoGuideProps) {
  return (
    <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-amber-600">
          <MessageCircleMore className="h-5 w-5" />
        </span>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            이 방은 카카오톡 이동 전 임시 소통 공간입니다.
          </p>
          <p className="text-sm leading-6 text-amber-800">
            조원 확인, 초대 코드 공유, 간단한 인사까지만 빠르게 마친 뒤
            카카오톡 단체방으로 이동하는 흐름을 기준으로 사용해 주세요.
          </p>
          {onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center rounded-[10px] border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
