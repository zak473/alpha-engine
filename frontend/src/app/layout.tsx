import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { BettingProvider } from "@/components/betting/BettingContext";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Alpha Engine",
  description: "Institutional AI Sports Prediction Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthProvider>
          <BettingProvider>
            <ToastProvider>{children}</ToastProvider>
          </BettingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
