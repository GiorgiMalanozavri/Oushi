import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { NavigationProgress } from "@/components/navigation-progress";
import { ToastProvider } from "@/components/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "Oushi — An inbox that won't let you forget.",
    template: "%s · Oushi",
  },
  description: "Oushi reads your email, remembers what matters across every thread, and writes replies that sound like you.",
  manifest: "/manifest.json",
  applicationName: "Oushi",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Oushi",
  },
  openGraph: {
    type: "website",
    title: "Oushi — An inbox that won't let you forget.",
    description: "Oushi reads your email, remembers what matters across every thread, and writes replies that sound like you.",
    siteName: "Oushi",
    images: [
      {
        url: "/logo/app-icon-1024.svg",
        width: 1024,
        height: 1024,
        alt: "Oushi",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Oushi",
    description: "An inbox that won't let you forget.",
    images: ["/logo/app-icon-1024.svg"],
  },
};

export const viewport = {
  themeColor: "#FAF6EB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <NavigationProgress />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
