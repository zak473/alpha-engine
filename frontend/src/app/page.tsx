import "./landing.css";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { StatsWall } from "@/components/landing/stats-wall";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SportsGrid } from "@/components/landing/sports-grid";
import { FeaturesMosaic } from "@/components/landing/features-mosaic";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

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
