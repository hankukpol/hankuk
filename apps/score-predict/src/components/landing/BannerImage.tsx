import { getImageProps } from "next/image";
import type { PublicBannerItem } from "@/lib/banners";
import { sanitizeBannerHtml } from "@/lib/sanitize-banner-html";

interface BannerImageProps {
  banner: PublicBannerItem;
  className?: string;
  fullWidth?: boolean;
}

function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function joinClassNames(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const POLICE_PRE_REGISTRATION_EVENT_ALT = "경찰 합격예측 풀서비스 사전예약 이벤트";
const POLICE_PRE_REGISTRATION_HOTSPOTS = [
  { left: 48.4375, top: 9.5456 },
  { left: 41.1458, top: 51.7612 },
  { left: 41.1458, top: 62.93 },
] as const;
const POLICE_PRE_REGISTRATION_HOTSPOT_SIZE = { width: 17.7084, height: 0.8381 } as const;
const POLICE_PRE_REGISTRATION_DESKTOP_SIZE = { width: 1920, height: 7637 } as const;
const POLICE_PRE_REGISTRATION_MOBILE_SIZE = { width: 768, height: 3887 } as const;
function extractFirstImageSource(htmlContent: string): string | null {
  return htmlContent.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] ?? null;
}

function shouldSkipLoopbackOptimization(imageUrl: string): boolean {
  try {
    const hostname = new URL(imageUrl).hostname;
    const isLoopback = hostname === "127.0.0.1" || hostname === "localhost";
    return (
      isLoopback && process.env.SCORE_PREDICT_ALLOW_LOCAL_IMAGE_OPTIMIZATION !== "true"
    );
  } catch {
    return false;
  }
}

function hasPreRegistrationTrigger(htmlContent: string | null): boolean {
  return Boolean(htmlContent && /href=["']#pre-registration["']/i.test(htmlContent));
}

function stripPreRegistrationEditorMarker(htmlContent: string): string {
  return htmlContent.replace(
    /<a\s+href=["']#pre-registration["']>\s*응시번호 사전등록\s*<\/a>/gi,
    "",
  );
}

function ResponsivePolicePreRegistrationBanner({
  desktopImageUrl,
  mobileImageUrl,
  altText,
}: {
  desktopImageUrl: string;
  mobileImageUrl: string;
  altText: string;
}) {
  const desktop = getImageProps({
    src: desktopImageUrl,
    alt: altText,
    width: POLICE_PRE_REGISTRATION_DESKTOP_SIZE.width,
    height: POLICE_PRE_REGISTRATION_DESKTOP_SIZE.height,
    sizes: "100vw",
    quality: 82,
    priority: true,
    unoptimized: shouldSkipLoopbackOptimization(desktopImageUrl),
  }).props;
  const mobile = getImageProps({
    src: mobileImageUrl,
    alt: altText,
    width: POLICE_PRE_REGISTRATION_MOBILE_SIZE.width,
    height: POLICE_PRE_REGISTRATION_MOBILE_SIZE.height,
    sizes: "100vw",
    quality: 82,
    priority: true,
    unoptimized: shouldSkipLoopbackOptimization(mobileImageUrl),
  }).props;

  return (
    <>
      <link
        rel="preload"
        as="image"
        href={mobile.src}
        imageSrcSet={mobile.srcSet}
        imageSizes={mobile.sizes}
        media="(max-width: 768px)"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href={desktop.src}
        imageSrcSet={desktop.srcSet}
        imageSizes={desktop.sizes}
        media="(min-width: 769px)"
        fetchPriority="high"
      />
      <div className="flex w-full justify-center overflow-hidden">
        <div className="relative w-full max-w-[1920px]">
        <picture>
          <source
            media="(max-width: 768px)"
            srcSet={mobile.srcSet}
            sizes={mobile.sizes}
            width={POLICE_PRE_REGISTRATION_MOBILE_SIZE.width}
            height={POLICE_PRE_REGISTRATION_MOBILE_SIZE.height}
          />
          <img
            {...desktop}
            alt={altText}
            fetchPriority="high"
            className="block h-auto w-full bg-white object-cover"
          />
        </picture>
          <div className="hidden min-[769px]:contents">
          {POLICE_PRE_REGISTRATION_HOTSPOTS.map((hotspot, index) => (
            <button
              key={`${hotspot.left}-${hotspot.top}`}
              type="button"
              data-pre-registration-modal="true"
              aria-label={`응시번호 사전등록 열기 ${index + 1}`}
              className="absolute z-10 block cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-service-500 focus-visible:ring-offset-2"
              style={{
                left: `${hotspot.left}%`,
                top: `${hotspot.top}%`,
                width: `${POLICE_PRE_REGISTRATION_HOTSPOT_SIZE.width}%`,
                height: `${POLICE_PRE_REGISTRATION_HOTSPOT_SIZE.height}%`,
              }}
            >
              <span className="sr-only">응시번호 사전등록</span>
            </button>
          ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** 모바일 전용 이미지 (768px 이하에서 표시) */
function MobileImage({
  banner,
  safeLinkUrl,
  className,
}: {
  banner: PublicBannerItem;
  safeLinkUrl: string | null;
  className?: string;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={banner.mobileImageUrl!}
      alt={banner.altText || "배너 이미지"}
      className={joinClassNames("block h-auto w-full object-cover bg-white", className)}
    />
  );

  if (!safeLinkUrl) return img;

  const external = isExternalUrl(safeLinkUrl);
  return (
    <a
      href={safeLinkUrl}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
      className="block"
    >
      {img}
    </a>
  );
}

export default function BannerImage({ banner, className, fullWidth = false }: BannerImageProps) {
  const safeHtmlContent = banner.htmlContent ? sanitizeBannerHtml(banner.htmlContent) : null;
  const opensPreRegistration = hasPreRegistrationTrigger(safeHtmlContent);
  const desktopHtmlContent = safeHtmlContent
    ? stripPreRegistrationEditorMarker(safeHtmlContent)
    : null;
  const hasMobileImage = !!banner.mobileImageUrl;
  const safeLinkUrl = banner.linkUrl && !banner.linkUrl.startsWith("//") ? banner.linkUrl : null;
  const usesPolicePreRegistrationHotspot = Boolean(
    opensPreRegistration && safeHtmlContent?.includes(`alt="${POLICE_PRE_REGISTRATION_EVENT_ALT}"`),
  );
  const policePreRegistrationDesktopImage = usesPolicePreRegistrationHotspot
    ? extractFirstImageSource(desktopHtmlContent ?? "")
    : null;

  if (policePreRegistrationDesktopImage && banner.mobileImageUrl) {
    return (
      <ResponsivePolicePreRegistrationBanner
        desktopImageUrl={policePreRegistrationDesktopImage}
        mobileImageUrl={banner.mobileImageUrl}
        altText={banner.altText || POLICE_PRE_REGISTRATION_EVENT_ALT}
      />
    );
  }

  const renderDesktopContent = () => {
    if (desktopHtmlContent) {
      return (
        <div className={fullWidth ? "flex w-full justify-center overflow-hidden" : "block"}>
          <div className={fullWidth ? "relative w-full max-w-[1920px]" : "relative"}>
            <div className="block w-full" dangerouslySetInnerHTML={{ __html: desktopHtmlContent }} />
            {usesPolicePreRegistrationHotspot
              ? POLICE_PRE_REGISTRATION_HOTSPOTS.map((hotspot, index) => (
                  <button
                    key={`${hotspot.left}-${hotspot.top}`}
                    type="button"
                    data-pre-registration-modal="true"
                    aria-label={`응시번호 사전등록 열기 ${index + 1}`}
                    className="absolute z-10 block cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-service-500 focus-visible:ring-offset-2"
                    style={{
                      left: `${hotspot.left}%`,
                      top: `${hotspot.top}%`,
                      width: `${POLICE_PRE_REGISTRATION_HOTSPOT_SIZE.width}%`,
                      height: `${POLICE_PRE_REGISTRATION_HOTSPOT_SIZE.height}%`,
                    }}
                  >
                    <span className="sr-only">응시번호 사전등록</span>
                  </button>
                ))
              : null}
          </div>
        </div>
      );
    }

    if (!banner.imageUrl) return null;

    if (fullWidth) {
      return <FullWidthImage banner={banner} safeLinkUrl={safeLinkUrl} className={className} />;
    }

    const image = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={banner.imageUrl}
        alt={banner.altText || "배너 이미지"}
        className={joinClassNames("block h-auto w-full border border-slate-200 object-cover bg-white", className)}
      />
    );

    if (!safeLinkUrl) return image;

    const external = isExternalUrl(safeLinkUrl);
    return (
      <a
        href={safeLinkUrl}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
        className="block"
      >
        {image}
      </a>
    );
  };

  // 모바일 이미지가 있으면 fullWidth 여부와 무관하게 모바일/PC 분기 렌더링
  if (hasMobileImage) {
    return (
      <>
        {/* 모바일: 768px 이하 */}
        <div className="block min-[769px]:hidden">
          <MobileImage banner={banner} safeLinkUrl={safeLinkUrl} className={className} />
        </div>
        {/* PC: 769px 이상 */}
        <div className="hidden min-[769px]:block">
          {renderDesktopContent()}
        </div>
      </>
    );
  }

  return renderDesktopContent();
}

/** fullWidth PC 이미지 — 히어로 확대 문제 수정: w-full max-w-[1920px] */
function FullWidthImage({
  banner,
  safeLinkUrl,
  className,
}: {
  banner: PublicBannerItem;
  safeLinkUrl: string | null;
  className?: string;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={banner.imageUrl!}
      alt={banner.altText || "배너 이미지"}
      className={joinClassNames("block h-auto w-full max-w-[1920px] object-cover object-center bg-white", className)}
    />
  );

  const wrapper = (children: React.ReactNode) => (
    <div className="flex w-full justify-center overflow-hidden">{children}</div>
  );

  if (!safeLinkUrl) return wrapper(img);

  const external = isExternalUrl(safeLinkUrl);
  return wrapper(
    <a
      href={safeLinkUrl}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
      className="flex w-full justify-center"
    >
      {img}
    </a>
  );
}
