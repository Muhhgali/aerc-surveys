import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Астана-ЕРЦ — Опросы",
    short_name: "ЕРЦ Опросы",
    description: "Электронное голосование собственников недвижимости",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F7FB",
    theme_color: "#0B4EA2",
    orientation: "portrait",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
