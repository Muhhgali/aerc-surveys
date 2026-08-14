import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Астана-ЕРЦ — Опросы",
  description: "Электронное голосование собственников недвижимости",
  applicationName: "Астана-ЕРЦ — Опросы",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ЕРЦ Опросы",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B4EA2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
