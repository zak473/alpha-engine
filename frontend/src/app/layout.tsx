import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { BettingProvider } from "@/components/betting/BettingContext";
import { AuthProvider } from "@/lib/auth";
import { OddsFormatProvider } from "@/lib/odds-format";

export const metadata: Metadata = {
  title: {
    default: "Never In Doubt",
    template: "%s | Never In Doubt",
  },
  description: "Never In Doubt is an AI-powered sports betting platform for sharper tips, live markets, and confident match analysis.",
  icons: {
    icon: "/never-in-doubt-logo.png",
    shortcut: "/never-in-doubt-logo.png",
    apple: "/never-in-doubt-logo.png",
  },
  openGraph: {
    title: "Never In Doubt",
    description: "AI sports betting tips, live boards, and branded match intelligence.",
    images: ["/never-in-doubt-logo.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OddsFormatProvider>
          <AuthProvider>
            <BettingProvider>
              <ToastProvider>{children}</ToastProvider>
            </BettingProvider>
          </AuthProvider>
        </OddsFormatProvider>
      </body>
    </html>
  );
}
