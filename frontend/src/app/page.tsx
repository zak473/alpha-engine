'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import './landing.css';

export default function LandingPage() {
  useEffect(() => {
    const nav = document.getElementById('nav');
    if (!nav) return;

    // Nav solid on scroll
    const onScroll = () => nav.classList.toggle('solid', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Mobile nav
    const burger = document.getElementById('burger') as HTMLButtonElement | null;
    const navLinks = document.getElementById('navLinks');
    if (burger && navLinks) {
      const burgerClick = () => {
        const open = navLinks.classList.toggle('open');
        burger.classList.toggle('open', open);
        document.body.style.overflow = open ? 'hidden' : '';
      };
      burger.addEventListener('click', burgerClick);
      navLinks.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          navLinks.classList.remove('open');
          burger.classList.remove('open');
          document.body.style.overflow = '';
        });
      });
    }

    // Scroll reveal
    const reveals = document.querySelectorAll('.nid-landing .reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    reveals.forEach(el => io.observe(el));

    // Stat counter
    const counts = document.querySelectorAll('.nid-landing .count');
    const statsEl = document.getElementById('stats');
    function runCounters() {
      counts.forEach(el => {
        const target = parseInt((el as HTMLElement).dataset.target ?? '0', 10);
        if (!target) return;
        const dur = 1600;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / dur, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(ease * target).toString();
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }
    if (statsEl) {
      const so = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { runCounters(); so.disconnect(); }
      }, { threshold: 0.4 });
      so.observe(statsEl);
    }

    // FAQ accordion
    document.querySelectorAll('.nid-landing .faq-item').forEach(item => {
      item.querySelector('.faq-q')?.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.nid-landing .faq-item').forEach(i => {
          i.classList.remove('open');
          i.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('open');
          item.querySelector('.faq-q')?.setAttribute('aria-expanded', 'true');
        }
      });
    });

    // Smooth scroll
    document.querySelectorAll('.nid-landing a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (!href || href === '#') return;
        const t = document.querySelector(href);
        if (t) {
          e.preventDefault();
          window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 76, behavior: 'smooth' });
        }
      });
    });

    // Live match ticker
    const liveEl = document.querySelector('.nid-landing .pred-row__time.live');
    let min = 67;
    let ticker: ReturnType<typeof setInterval> | undefined;
    if (liveEl) {
      ticker = setInterval(() => {
        if (min < 90) { min++; liveEl.textContent = `LIVE · ${min}'`; }
        else { liveEl.textContent = 'FT'; (liveEl as HTMLElement).style.color = 'var(--text-mute)'; }
      }, 12000);
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (ticker) clearInterval(ticker);
      io.disconnect();
    };
  }, []);

  return (
    <div className="nid-landing">

      {/* ── NAVIGATION ── */}
      <header className="nav" id="nav">
        <div className="nav__inner">
          <a href="#" className="nav__logo">
            <div className="nav__logo-img" role="img" aria-label="Never In Doubt"></div>
          </a>
          <nav className="nav__links" id="navLinks">
            <a href="#predictions">Live Predictions</a>
            <a href="#track">Performance Tracking</a>
            <a href="#features">About AI</a>
            <Link href="/login">Sign In</Link>
          </nav>
          <Link href="/pricing" className="btn-cta">Get started</Link>
          <button className="nav__burger" id="burger" aria-label="Menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hero" id="hero">
        <div className="hero__bg">
          <div className="hero__player" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=2560&q=80')" }}></div>
          <div className="hero__overlay"></div>
        </div>

        <div className="hero__waves" aria-hidden="true">
          <svg className="waves-svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <path className="wave wave-1" d="M-200,450 C0,200 200,700 400,450 S800,200 1000,450 S1400,700 1640,450" fill="none" stroke="#00FF41" strokeWidth="2.5" opacity="0.9" />
            <path className="wave wave-2" d="M-200,490 C0,240 200,740 400,490 S800,240 1000,490 S1400,740 1640,490" fill="none" stroke="#00FF41" strokeWidth="1.5" opacity="0.55" />
            <path className="wave wave-3" d="M-200,410 C0,160 200,660 400,410 S800,160 1000,410 S1400,660 1640,410" fill="none" stroke="#00FF41" strokeWidth="1" opacity="0.35" />
            <path className="wave wave-4" d="M-200,540 C0,290 200,790 400,540 S800,290 1000,540 S1400,790 1640,540" fill="none" stroke="#00FF41" strokeWidth="0.8" opacity="0.2" />
            <path className="wave wave-5" d="M-200,380 C50,130 250,630 450,380 S850,130 1050,380 S1450,630 1690,380" fill="none" stroke="#00FF41" strokeWidth="0.6" opacity="0.15" />
          </svg>
        </div>

        <div className="hero__content">
          <div className="hero__text">
            <p className="hero__eyebrow">DOMINATE EVERY BET. NEVER IN DOUBT.</p>
            <h1 className="hero__headline">
              <span className="h-white">STOP<br />GUESSING.</span>
              <span className="h-green">START<br />WINNING.</span>
            </h1>
            <p className="hero__sub">Never In Doubt combines machine-learning predictions, live market odds, and a personal AI advisor across 6 sports — so every bet you place is backed by data.</p>
            <div className="hero__ctas">
              <Link href="/pricing" className="btn-cta btn-cta--large">Start today — £24.99/mo</Link>
              <a href="#predictions" className="btn-ghost btn-ghost--large">See today&apos;s edges</a>
            </div>
            <p className="hero__micro">Cancel any time · No hidden fees</p>
          </div>

          <div className="hero__card-wrap">
            <div className="pred-card">
              <div className="pred-card__head">
                <span className="pred-card__label">TODAY&apos;S TOP EDGES</span>
                <span className="pred-card__badge">3 live</span>
              </div>
              <div className="pred-row">
                <span className="dot dot--green"></span>
                <div className="pred-row__info">
                  <span className="pred-row__league">Premier League</span>
                  <span className="pred-row__match">Arsenal vs Man City</span>
                </div>
                <span className="pred-row__edge">+4.2%</span>
                <span className="pred-row__time live">LIVE · 67&apos;</span>
              </div>
              <div className="pred-row">
                <span className="dot dot--orange"></span>
                <div className="pred-row__info">
                  <span className="pred-row__league">NBA</span>
                  <span className="pred-row__match">Lakers vs Celtics</span>
                </div>
                <span className="pred-row__edge">+2.8%</span>
                <span className="pred-row__time">Tonight 21:30</span>
              </div>
              <div className="pred-row">
                <span className="dot dot--yellow"></span>
                <div className="pred-row__info">
                  <span className="pred-row__league">ATP</span>
                  <span className="pred-row__match">Djokovic vs Alcaraz</span>
                </div>
                <span className="pred-row__edge">+3.5%</span>
                <span className="pred-row__time">Tomorrow</span>
              </div>
              <div className="pred-card__chart">
                <svg viewBox="0 0 220 48" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#AAFF00" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#00FF41" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <polyline points="0,42 30,36 60,28 90,32 120,18 150,12 180,6 220,2" fill="none" stroke="url(#g1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="trend-arrow">↑</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <div className="stats-strip" id="stats">
        <div className="stats-strip__inner">
          <div className="stat">
            <div className="stat__num"><span className="count" data-target="60">0</span>%+</div>
            <div className="stat__lbl">Model Accuracy at High Confidence</div>
          </div>
          <div className="stat-sep"></div>
          <div className="stat">
            <div className="stat__num"><span className="count" data-target="10">0</span>k+</div>
            <div className="stat__lbl">Matches Analysed &amp; Growing Daily</div>
          </div>
          <div className="stat-sep"></div>
          <div className="stat">
            <div className="stat__num"><span className="count" data-target="6">0</span></div>
            <div className="stat__lbl">Sports Covered Across All Markets</div>
          </div>
          <div className="stat-sep"></div>
          <div className="stat">
            <div className="stat__num stat__num--green">Live</div>
            <div className="stat__lbl">Odds Feed with Real-Time Updates</div>
          </div>
        </div>
      </div>

      {/* ── SPORT PANELS ── */}
      <section className="sport-panels" id="predictions">
        <div className="sport-panels__header">
          <h2 className="section-title">LIVE EDGE<br /><span className="green">PREDICTIONS</span></h2>
          <p className="section-sub">One platform. Six sports. Constantly updated opportunities across every major market.</p>
        </div>
        <div className="sport-panels__grid">

          <div className="sp sp--soccer">
            <div className="sp__img" style={{ backgroundImage: "url('https://sspark.genspark.ai/cfimages?u1=PABb8LYg7HoPapWzzVYn3rae%2BsrSq750Ns4P3Ijcr6NPntIWczCBonnatoOo69sdnQcYMvDHobSweLaDaQCSsk0TJv%2F4Rclz3xpMDr4YW8kFUX%2FI3qgf7wUvNCo2xmPwMRqlfdN8K%2BgDi0l%2BXSgzEGvijhvLf0dqYtoOW2fRYyYrd6%2F%2BiNhjWhhrJN%2FqtTUdCFY%3D&u2=PU0eM1TlW8AwoaVM&width=2560')" }}></div>
            <div className="sp__overlay"></div>
            <div className="sp__chart" aria-hidden="true">
              <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="sg1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#AAFF00" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#00FF41" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <polyline points="0,100 50,80 100,90 150,55 200,40 250,50 300,20 350,8 400,4" fill="none" stroke="url(#sg1)" strokeWidth="2.5" />
              </svg>
            </div>
            <div className="sp__content">
              <span className="sp__name">SOCCER</span>
              <Link href="/pricing" className="btn-sport">Explore Edges</Link>
            </div>
          </div>

          <div className="sp sp--basketball">
            <div className="sp__img" style={{ backgroundImage: "url('https://sspark.genspark.ai/cfimages?u1=Vl1na%2BHlRS0o9R9pXUDIwhlTlbAp9x%2FDhHiNNNHt8XTGM90r68sm7wfRIFP2D2%2FutWLweGVxzzQnDvKJvkq%2FIlFkMlayf79XrnuHznETtcaP2FLLH9YWAWmGG4mZHRoLIy1s73CfGZrjM46kKOJqXStcthx5xlO3woG4d5139fkLktbt&u2=sLZgXwFzGRHXpasn&width=2560')" }}></div>
            <div className="sp__overlay"></div>
            <div className="sp__chart sp__chart--bars" aria-hidden="true">
              <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
                <rect x="20" y="80" width="28" height="40" fill="#00FF41" opacity="0.35" />
                <rect x="70" y="60" width="28" height="60" fill="#00FF41" opacity="0.4" />
                <rect x="120" y="40" width="28" height="80" fill="#00FF41" opacity="0.5" />
                <rect x="170" y="50" width="28" height="70" fill="#00FF41" opacity="0.5" />
                <rect x="220" y="25" width="28" height="95" fill="#00FF41" opacity="0.6" />
                <rect x="270" y="35" width="28" height="85" fill="#00FF41" opacity="0.65" />
                <rect x="320" y="10" width="28" height="110" fill="#00FF41" opacity="0.8" />
              </svg>
            </div>
            <div className="sp__content">
              <span className="sp__name">BASKETBALL</span>
              <Link href="/pricing" className="btn-sport">Explore Edges</Link>
            </div>
          </div>

          <div className="sp sp--tennis">
            <div className="sp__img" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80')" }}></div>
            <div className="sp__overlay"></div>
            <div className="sp__content">
              <span className="sp__name">TENNIS</span>
              <Link href="/pricing" className="btn-sport">Explore</Link>
            </div>
          </div>
          <div className="sp sp--baseball">
            <div className="sp__img" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1566577739112-5180d4bf9390?auto=format&fit=crop&w=1200&q=80')" }}></div>
            <div className="sp__overlay"></div>
            <div className="sp__content">
              <span className="sp__name">BASEBALL</span>
              <Link href="/pricing" className="btn-sport">Explore</Link>
            </div>
          </div>
          <div className="sp sp--hockey">
            <div className="sp__img" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1515703407324-5f753afd8be8?auto=format&fit=crop&w=1200&q=80')" }}></div>
            <div className="sp__overlay"></div>
            <div className="sp__content">
              <span className="sp__name">HOCKEY</span>
              <Link href="/pricing" className="btn-sport">Explore</Link>
            </div>
          </div>
          <div className="sp sp--esports">
            <div className="sp__img" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80')" }}></div>
            <div className="sp__overlay"></div>
            <div className="sp__content">
              <span className="sp__name">ESPORTS</span>
              <Link href="/pricing" className="btn-sport">Explore</Link>
            </div>
          </div>

        </div>
      </section>

      {/* ── TRACK YOUR DOMINANCE ── */}
      <section className="track" id="track">
        <div className="track__inner">
          <div className="track__left">
            <div className="section-label">HOW IT WORKS</div>
            <h2 className="section-title">TRACK YOUR<br /><span className="green">DOMINANCE</span></h2>
            <p className="section-sub">A sharper process for finding value, reading the market, and tracking what actually works.</p>
            <div className="steps">
              <div className="step reveal">
                <div className="step__num">01</div>
                <div className="step__body">
                  <h3>Browse Today&apos;s Matches</h3>
                  <p>See every fixture across 6 sports, ranked by model confidence and edge size, so the best opportunities rise to the top.</p>
                </div>
              </div>
              <div className="step reveal">
                <div className="step__num">02</div>
                <div className="step__body">
                  <h3>Read the AI Edge</h3>
                  <p>Our models calculate fair probability for every outcome. When the market price creates value, you&apos;ll see the edge clearly — in plain English.</p>
                </div>
              </div>
              <div className="step reveal">
                <div className="step__num">03</div>
                <div className="step__body">
                  <h3>Track and Improve</h3>
                  <p>Log your picks, monitor ROI, and review performance over time so every decision gets smarter.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="track__right">
            <div className="dash">
              <div className="dash__bar">
                <span className="dash__dot r"></span>
                <span className="dash__dot y"></span>
                <span className="dash__dot g"></span>
                <span className="dash__url">neverindoubt.co.uk/dashboard</span>
              </div>
              <div className="dash__body">
                <div className="dash__header">
                  <span className="dash__title">Analytics Dashboard</span>
                  <span className="dash__dropdown">All Sports ▾</span>
                </div>
                <div className="dash__table">
                  <div className="dash__th">
                    <span></span>
                    <span>Match</span>
                    <span>League</span>
                    <span>Edge</span>
                    <span>Status</span>
                  </div>
                  <div className="dash__tr">
                    <span className="dot dot--green"></span>
                    <span className="fw6">Arsenal vs Man City</span>
                    <span className="muted">Premier League</span>
                    <span className="edge-pos">+4.2%</span>
                    <span className="tag-live">LIVE</span>
                  </div>
                  <div className="dash__tr">
                    <span className="dot dot--orange"></span>
                    <span className="fw6">Lakers vs Celtics</span>
                    <span className="muted">NBA</span>
                    <span className="edge-pos">+2.8%</span>
                    <span className="tag-soon">TONIGHT</span>
                  </div>
                  <div className="dash__tr">
                    <span className="dot dot--yellow"></span>
                    <span className="fw6">Djokovic vs Alcaraz</span>
                    <span className="muted">ATP</span>
                    <span className="edge-pos">+3.5%</span>
                    <span className="tag-soon">TOMORROW</span>
                  </div>
                  <div className="dash__tr">
                    <span className="dot dot--blue"></span>
                    <span className="fw6">Panthers vs Rangers</span>
                    <span className="muted">NHL</span>
                    <span className="edge-pos">+1.9%</span>
                    <span className="tag-soon">FRI</span>
                  </div>
                </div>
                <div className="dash__stats">
                  <div className="ds"><div className="ds__n">60%+</div><div className="ds__l">Model Accuracy</div></div>
                  <div className="ds"><div className="ds__n">10k+</div><div className="ds__l">Matches Analyzed</div></div>
                  <div className="ds"><div className="ds__n">6</div><div className="ds__l">Sports Covered</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="features" id="features">
        <div className="features__inner">
          <div className="features__head">
            <div className="section-label">PLATFORM CAPABILITIES</div>
            <h2 className="section-title">EVERYTHING YOU NEED<br /><span className="green">TO BET SHARPER</span></h2>
            <p className="section-sub">Built for bettors who want structure, signal, and a repeatable edge — not guesswork.</p>
          </div>
          <div className="features__grid">

            <div className="feat reveal">
              <div className="feat__tag">CORE</div>
              <div className="feat__icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="12" stroke="#00FF41" strokeWidth="1.5" />
                  <path d="M7 18 L11 12 L15 16 L19 8 L22 12" stroke="#00FF41" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="feat__title">ML Predictions</h3>
              <p className="feat__desc">Models trained on years of historical data produce calibrated win probabilities — not gut-feel picks.</p>
            </div>

            <div className="feat reveal">
              <div className="feat__tag">LIVE</div>
              <div className="feat__icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="3" y="7" width="22" height="14" rx="2" stroke="#00FF41" strokeWidth="1.5" />
                  <circle cx="14" cy="18" r="1.5" fill="#00FF41" />
                  <line x1="3" y1="11" x2="25" y2="11" stroke="#00FF41" strokeWidth="1" />
                </svg>
              </div>
              <h3 className="feat__title">Live Odds Feed</h3>
              <p className="feat__desc">Real-time market odds updated continuously. Your edge is highlighted the instant it appears.</p>
            </div>

            <div className="feat reveal">
              <div className="feat__tag">AI</div>
              <div className="feat__icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M5 21 C5 16 9 12 14 12 C19 12 23 16 23 21" stroke="#00FF41" strokeWidth="1.5" fill="none" />
                  <circle cx="14" cy="8" r="4" stroke="#00FF41" strokeWidth="1.5" />
                </svg>
              </div>
              <h3 className="feat__title">AI Advisor</h3>
              <p className="feat__desc">Ask anything about a match, market, or strategy. Your personal analyst, available 24/7.</p>
            </div>

            <div className="feat reveal">
              <div className="feat__tag">ANALYTICS</div>
              <div className="feat__icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M5 23 L9 16 L13 20 L17 10 L21 14 L25 5" stroke="#00FF41" strokeWidth="2" fill="none" strokeLinecap="round" />
                  <circle cx="25" cy="5" r="2" fill="#00FF41" />
                </svg>
              </div>
              <h3 className="feat__title">ROI Tracking</h3>
              <p className="feat__desc">Full P&amp;L history with win rate, Sharpe ratio, drawdown, and Kelly-staked returns.</p>
            </div>

            <div className="feat reveal">
              <div className="feat__tag">CORE</div>
              <div className="feat__icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <polygon points="14,3 17,10 25,11 19,17 21,25 14,21 7,25 9,17 3,11 11,10" stroke="#00FF41" strokeWidth="1.5" fill="none" />
                </svg>
              </div>
              <h3 className="feat__title">Edge Scoring</h3>
              <p className="feat__desc">Every match card shows the gap between our fair odds and the bookmaker line. Back value, not noise.</p>
            </div>

            <div className="feat reveal">
              <div className="feat__tag">SOCIAL</div>
              <div className="feat__icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="11" stroke="#00FF41" strokeWidth="1.5" />
                  <path d="M14 7 L14 14 L20 14" stroke="#00FF41" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="feat__title">Challenges</h3>
              <p className="feat__desc">Compete in weekly prediction challenges, follow the sharpest tipsters, and climb the leaderboard.</p>
            </div>

          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="pricing" id="pricing">
        <div className="pricing__inner">
          <div className="section-label">SIMPLE PRICING</div>
          <h2 className="section-title">ONE PLAN.<br /><span className="green">EVERYTHING INCLUDED.</span></h2>
          <p className="section-sub">Full access to every feature — predictions, AI advisor, analytics, challenges, and live odds.</p>
          <div className="pricing__grid pricing__grid--single">

            <div className="plan plan--featured reveal">
              <div className="plan__popular">FULL ACCESS</div>
              <div className="plan__tier">PRO</div>
              <div className="plan__price">£<span>24</span><span style={{ fontSize: '2rem' }}>.99</span></div>
              <div className="plan__period">/ month</div>
              <p className="plan__tagline">Everything you need to find edge, track performance, and bet smarter across 6 sports.</p>
              <ul className="plan__feats">
                <li><span className="chk">✓</span>AI predictions across all 6 sports</li>
                <li><span className="chk">✓</span>150 AI advisor messages / month</li>
                <li><span className="chk">✓</span>Live odds feed &amp; edge scoring</li>
                <li><span className="chk">✓</span>Pick tracker with full ROI analytics</li>
                <li><span className="chk">✓</span>Challenge leagues &amp; leaderboards</li>
                <li><span className="chk">✓</span>Priority support</li>
              </ul>
              <Link href="/pricing" className="plan__btn plan__btn--green">Subscribe now</Link>
            </div>

          </div>
          <p className="pricing__notes">Billed monthly &nbsp;·&nbsp; Cancel anytime &nbsp;·&nbsp; Real ML models, not tips</p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="faq" id="faq">
        <div className="faq__inner">
          <div className="faq__left">
            <div className="section-label">FAQ</div>
            <h2 className="section-title">QUESTIONS,<br /><span className="green">ANSWERED</span></h2>
          </div>
          <div className="faq__right">
            <div className="faq-list" id="faqList">
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">
                  <span>How accurate are the models?</span><span className="faq-icon">+</span>
                </button>
                <div className="faq-a"><p>Our models achieve 60%+ accuracy at high-confidence thresholds, trained on years of historical data and market context. We show you where the edge appears so you can make more informed decisions.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">
                  <span>Which sports are covered?</span><span className="faq-icon">+</span>
                </button>
                <div className="faq-a"><p>Never In Doubt currently covers Soccer, Basketball, Tennis, Baseball, Hockey, and Esports across all major markets and leagues.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">
                  <span>How much does it cost?</span><span className="faq-icon">+</span>
                </button>
                <div className="faq-a"><p>£24.99 per month, billed monthly. One plan, full access to everything — no tiers, no hidden fees.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">
                  <span>What&apos;s included in the subscription?</span><span className="faq-icon">+</span>
                </button>
                <div className="faq-a"><p>Everything — AI predictions across all 6 sports, 150 AI advisor messages per month, live odds feed, pick tracking, full ROI analytics, challenge leagues, and priority support.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">
                  <span>Can I track ROI and performance?</span><span className="faq-icon">+</span>
                </button>
                <div className="faq-a"><p>Yes. All plans include pick tracking and ROI analytics. Track P&amp;L, win rate, and bankroll performance over time to understand exactly what&apos;s working.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="final-cta" id="cta">
        <div className="final-cta__waves" aria-hidden="true">
          <svg viewBox="0 0 1440 400" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M-200,200 C100,50 300,350 600,200 S1100,50 1440,200" fill="none" stroke="#00FF41" strokeWidth="2" opacity="0.4" />
            <path d="M-200,240 C100,90 300,390 600,240 S1100,90 1440,240" fill="none" stroke="#00FF41" strokeWidth="1" opacity="0.2" />
          </svg>
        </div>
        <div className="final-cta__glow"></div>
        <div className="final-cta__content">
          <p className="cta-eye">READY TO FIND YOUR EDGE?</p>
          <h2 className="cta-hl">
            <span className="h-white">NEVER GUESS.</span>
            <span className="h-green">ALWAYS WIN.</span>
          </h2>
          <p className="cta-body">Start every bet with the confidence of a professional analyst — powered by machine-learning predictions, live market odds, and AI-driven insight.</p>
          <div className="cta-btns">
            <Link href="/pricing" className="btn-cta btn-cta--large">Subscribe — £24.99/mo</Link>
            <a href="#predictions" className="btn-ghost btn-ghost--large">See today&apos;s edges</a>
          </div>
          <p className="cta-micro">Cancel any time · No hidden fees</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer__top">
          <div className="footer__brand">
            <a href="#" className="nav__logo">
              <div className="nav__logo-img footer-logo" role="img" aria-label="Never In Doubt"></div>
            </a>
            <p className="footer__tagline">AI-powered sports intelligence for smarter betting decisions.</p>
          </div>
          <nav className="footer__nav">
            <a href="#predictions">How it Works</a>
            <a href="#predictions">Sports</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <Link href="/login">Sign In</Link>
          </nav>
        </div>
        <div className="footer__bottom">
          <span>© 2025 Never In Doubt. All rights reserved.</span>
          <span>Bet with discipline. Use data responsibly. 18+</span>
        </div>
      </footer>

    </div>
  );
}
