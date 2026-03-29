import type { PublicEventItem } from "@/lib/events";

interface EventCardProps {
  event: PublicEventItem;
  fullWidth?: boolean;
}

function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export default function EventCard({ event, fullWidth = false }: EventCardProps) {
  const safeLinkUrl = event.linkUrl && !event.linkUrl.startsWith("//") ? event.linkUrl : null;
  const hasLink = Boolean(safeLinkUrl);
  const linkText = event.linkText?.trim() || "View details";
  const external = safeLinkUrl ? isExternalUrl(safeLinkUrl) : false;

  return (
    <section
      className={`relative overflow-hidden py-6 sm:py-8 ${fullWidth ? "w-full" : "border border-slate-200 px-5 sm:px-7 shadow-sm"
        }`}
      style={{ backgroundColor: event.bgColor || "#ffffff" }}
    >
      {fullWidth && !event.bgColor && <div className="absolute inset-0 bg-white" />}
      <div className={`relative z-10 mx-auto w-full flex flex-col ${fullWidth ? "max-w-[1200px] px-4" : ""}`}>
        <div className="grid gap-5 md:grid-cols-[minmax(220px,360px)_1fr] md:items-center">
          {event.imageUrl ? (
            <div className="overflow-hidden border border-black/10 bg-white/80 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.imageUrl} alt={event.title} className="h-auto w-full object-cover" />
            </div>
          ) : null}

          <div className="space-y-3">
            <h3 className="text-xl font-black leading-tight text-slate-900">{event.title}</h3>
            {event.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{event.description}</p>
            ) : null}
            {hasLink ? (
              <a
                href={safeLinkUrl as string}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer noopener" : undefined}
                className="inline-flex bg-black px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                {linkText}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
