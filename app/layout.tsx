import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Tom's Training Hub",
  description: "AI-powered training, running, and fueling log for marathon prep.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Training Hub",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-gray-100 font-sans">
        <div className="mx-auto flex min-h-screen max-w-lg flex-col">
          <main className="flex-1 pb-24 pt-4">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
