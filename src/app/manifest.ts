import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PostPilot",
    short_name: "PostPilot",
    description: "Votre community manager assisté par l'IA.",
    start_url: "/app",
    display: "standalone",
    background_color: "#fbfbf8",
    theme_color: "#1f4fd8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
