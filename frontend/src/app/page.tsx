import "./landing.css";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Footer } from "@/components/landing/footer";

// Below-the-fold sections: lazy-loaded with ssr:false so framer-motion
// is excluded from the initial server bundle for the landing page.
const StatsWall = dynamic(
  () => import("@/components/landing/stats-wall").then((m) => ({ default: m.StatsWall })),
  { ssr: false }
);
const HowItWorks = dynamic(
  () => import("@/components/landing/how-it-works").then((m) => ({ default: m.HowItWorks })),
  { ssr: false }
);
const FeaturesMosaic = dynamic(
  () => import("@/components/landing/features-mosaic").then((m) => ({ default: m.FeaturesMosaic })),
  { ssr: false }
);
const SportsGrid = dynamic(
  () => import("@/components/landing/sports-grid").then((m) => ({ default: m.SportsGrid })),
  { ssr: false }
);
const Pricing = dynamic(
  () => import("@/components/landing/pricing").then((m) => ({ default: m.Pricing })),
  { ssr: false }
);
const Faq = dynamic(
  () => import("@/components/landing/faq").then((m) => ({ default: m.Faq })),
  { ssr: false }
);
const FinalCta = dynamic(
  () => import("@/components/landing/final-cta").then((m) => ({ default: m.FinalCta })),
  { ssr: false }
);

export default function HomePage() {
  return (
    <main className="page-shell nid-landing">
      <Navbar />
      <Hero />
      <StatsWall />
      <HowItWorks />
      <FeaturesMosaic />
      <SportsGrid />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
