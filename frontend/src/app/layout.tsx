import type { Metadata } from "next";
import { Inter, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
import { BettingProvider } from "@/components/betting/BettingContext";
import { GlobalSlip } from "@/components/betting/GlobalSlip";
import { AuthProvider } from "@/lib/auth";
import { OddsFormatProvider } from "@/lib/odds-format";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://neverindoubt.app"),
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
  twitter: {
    card: "summary_large_image",
    title: "Never In Doubt",
    description: "AI sports betting tips, live boards, and branded match intelligence.",
    images: ["/never-in-doubt-logo.png"],
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}>
        <ThemeProvider>
          <OddsFormatProvider>
            <AuthProvider>
              <BettingProvider>
                <ToastProvider>{children}</ToastProvider>
                <GlobalSlip />
              </BettingProvider>
            </AuthProvider>
          </OddsFormatProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
