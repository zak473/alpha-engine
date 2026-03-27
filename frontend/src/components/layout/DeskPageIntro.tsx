import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";

interface IntroMetric {
  label: string;
  value: string;
  tone?: "accent" | "positive" | "warning" | "neutral";
}

interface DeskPageIntroProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics?: IntroMetric[];
  primaryCta?: {
    label: string;
    href: string;
  };
  secondaryCta?: {
    label: string;
    href: string;
  };
}

function toneClass(tone?: IntroMetric["tone"]) {
  switch (tone) {
    case "positive":
      return "intro-metric intro-metric--positive";
    case "warning":
      return "intro-metric intro-metric--warning";
    case "neutral":
      return "intro-metric intro-metric--neutral";
    default:
      return "intro-metric intro-metric--accent";
  }
}

export function DeskPageIntro({ eyebrow, title, subtitle, metrics, primaryCta, secondaryCta }: DeskPageIntroProps) {
  return (
    <section className="sportsbook-card desk-intro overflow-hidden">
      <div className="desk-intro__head">
        <div className="desk-intro__copy">
          <div className="desk-intro__eyebrow-row">
            <div className="desk-intro__eyebrow">{eyebrow}</div>
            <span className="desk-intro__chip desk-intro__chip--live">
              <Activity size={12} /> Live workspace
            </span>
          </div>

          <div className="desk-intro__title-row">
            <h1 className="desk-intro__title">{title}</h1>
            <p className="desk-intro__subtitle">{subtitle}</p>
          </div>
        </div>
      </div>

      {(metrics?.length || primaryCta || secondaryCta) ? (
        <div className="desk-intro__body">
          {metrics?.length ? (
            <div className="desk-intro__metrics">
              {metrics.map((metric) => (
                <div key={`${metric.label}-${metric.value}`} className={toneClass(metric.tone)}>
                  <div className="intro-metric__label">{metric.label}</div>
                  <div className="intro-metric__value">{metric.value}</div>
                </div>
              ))}
            </div>
          ) : <div className="flex-1" />}

          {(primaryCta || secondaryCta) ? (
            <div className="desk-intro__actions">
              {secondaryCta ? (
                <Link href={secondaryCta.href} className="ui-button-secondary">
                  {secondaryCta.label}
                </Link>
              ) : null}
              {primaryCta ? (
                <Link href={primaryCta.href} className="ui-button-primary">
                  {primaryCta.label} <ArrowRight size={14} />
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
