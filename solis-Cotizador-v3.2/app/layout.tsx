import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOLIS Cotizador PWA",
  description: "Cotizador técnico y comercial de SOLIS Ingeniería y Servicios SpA.",
  manifest: "/manifest.webmanifest",
  applicationName: "SOLIS Cotizador",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SOLIS Cotizador" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
