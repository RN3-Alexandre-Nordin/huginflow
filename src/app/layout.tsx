import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  PLATFORM_META_DESCRIPTION,
  PLATFORM_META_TITLE,
  PLATFORM_NAME,
} from "@/lib/branding/platform";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: PLATFORM_META_TITLE,
  description: PLATFORM_META_DESCRIPTION,
  applicationName: PLATFORM_NAME,
  ...(process.env.NEXT_PUBLIC_APP_URL
    ? { metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL) }
    : {}),
  openGraph: {
    title: PLATFORM_META_TITLE,
    description: PLATFORM_META_DESCRIPTION,
    siteName: PLATFORM_NAME,
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/logo-principal.png", alt: PLATFORM_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: PLATFORM_META_TITLE,
    description: PLATFORM_META_DESCRIPTION,
    images: ["/logo-principal.png"],
  },
  other: {
    "theme-color": "#0A0A0A",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
