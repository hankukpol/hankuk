import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Interview Mate",
    short_name: "Interview Mate",
    description:
      "Mock interview reservations, study-group coordination, and admin operations.",
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
