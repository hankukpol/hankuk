declare global {
  interface Window {
    Kakao?: {
      isInitialized?: () => boolean;
      init?: (key: string) => void;
      Link?: {
        sendDefault: (payload: Record<string, unknown>) => void;
      };
    };
  }
}

let kakaoLoadingPromise: Promise<void> | null = null;

export async function ensureKakaoSdk(): Promise<void> {
  if (typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) {
    throw new Error("카카오 JS 키가 설정되지 않았습니다.");
  }

  if (window.Kakao?.isInitialized?.()) {
    return;
  }

  if (!kakaoLoadingPromise) {
    kakaoLoadingPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-sdk="true"]');
      if (existing) {
        existing.addEventListener("load", () => {
          if (window.Kakao && !window.Kakao.isInitialized?.()) {
            window.Kakao.init?.(key);
          }
          resolve();
        });
        existing.addEventListener("error", () => reject(new Error("카카오 SDK 로드에 실패했습니다.")));
        return;
      }

      const script = document.createElement("script");
      script.src = "https://developers.kakao.com/sdk/js/kakao.min.js";
      script.async = true;
      script.dataset.kakaoSdk = "true";
      script.onload = () => {
        if (window.Kakao && !window.Kakao.isInitialized?.()) {
          window.Kakao.init?.(key);
        }
        resolve();
      };
      script.onerror = () => reject(new Error("카카오 SDK 로드에 실패했습니다."));
      document.head.appendChild(script);
    });
  }

  await kakaoLoadingPromise;
}

export async function shareToKakao(options: {
  title: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
}) {
  await ensureKakaoSdk();
  if (!window.Kakao?.Link?.sendDefault) {
    throw new Error("카카오 공유 기능을 사용할 수 없습니다.");
  }

  window.Kakao.Link.sendDefault({
    objectType: "feed",
    content: {
      title: options.title,
      description: options.description,
      imageUrl: options.imageUrl,
      link: {
        mobileWebUrl: options.linkUrl,
        webUrl: options.linkUrl,
      },
    },
    buttons: [
      {
        title: "결과 확인",
        link: {
          mobileWebUrl: options.linkUrl,
          webUrl: options.linkUrl,
        },
      },
    ],
  });
}

