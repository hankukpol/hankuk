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
  const hasMobileImage = !!banner.mobileImageUrl;
  const safeLinkUrl = banner.linkUrl && !banner.linkUrl.startsWith("//") ? banner.linkUrl : null;

  const renderDesktopContent = () => {
    if (safeHtmlContent) {
      return (
        <div
          className={fullWidth ? "flex w-full justify-center overflow-hidden" : "block"}
          dangerouslySetInnerHTML={{ __html: safeHtmlContent }}
        />
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
