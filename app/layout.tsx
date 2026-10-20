import { MobileViewport } from "@/components/mobile-viewport";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export const metadata: Metadata = {
  title: "SOLIS Cotizador PWA",
  description: "Cotizador técnico y comercial de SOLIS Ingeniería y Servicios SpA.",
  manifest: "/manifest.webmanifest",
  applicationName: "SOLIS Cotizador",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SOLIS Cotizador" },
  icons: {
    icon: "/solis-logo.png",
    shortcut: "/solis-logo.png",
    apple: "/solis-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased"><MobileViewport />{children}</body>
    </html>
  );
}
