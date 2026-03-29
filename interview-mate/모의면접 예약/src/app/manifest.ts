import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "한국경찰학원 모의면접",
    short_name: "모의면접",
    description: "모의면접 예약과 조 편성 운영을 위한 웹 앱입니다.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#1b4fbb",
    icons: [
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}
