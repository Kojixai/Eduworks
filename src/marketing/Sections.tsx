import type { ReactNode } from "react";
import { accessLength } from "@/practice/config";
import { PATHS, PUBLISHER } from "./brand";
import type { BookSection } from "./books";
import { faqEntries } from "./faq";
import { person } from "./people";

const fmt = (n: number) => n.toLocaleString("en-GB");

/** A big heading that slides up when it scrolls into view. Lines are separate blocks so they can break where we choose. */
function Heading({ id, className, lines }: { id?: string; className: string; lines: string[] }) {
  return (
    <div className="ip-overflow-hidden" data-reveal>
      <h2 className={className} id={id}>
        {lines.map((l) => (<span className="ip-line" key={l}>{l}</span>))}
      </h2>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="ip-chevron">
      <path d={dir === "left" ? "M16 4L7 13L16 22" : "M10 4L19 13L10 22"} stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Arrows({ label, green }: { label: string; green?: boolean }) {
  const cls = `ip-carousel-arrow${green ? " ip-is-green" : ""}`;
  return (
    <div className="ip-carousel-controls">
      <button type="button" className={cls} data-prev aria-label={`Previous ${label}`} aria-disabled="true"><Chevron dir="left" /></button>
      <button type="button" className={cls} data-next aria-label={`Next ${label}`}><Chevron dir="right" /></button>
    </div>
  );
}

/** "Enter your book code" and "Log in", always side by side. */
function CtaPair({ tone = "ip-two", onDark = false }: { tone?: string; onDark?: boolean }) {
  return (
    <div className="ip-cta-pair">
      <div className="ip-btn-wrapper">
        <a className={`ip-primary-button ${tone}`} href={PATHS.enterCode}>
          <span className="ip-button-hover-bg" aria-hidden="true" />
          <span className="ip-button-content"><span className="ip-btn-label ip-black">Enter your book code</span></span>
        </a>
      </div>
      <div className="ip-btn-wrapper">
        <a className={`ip-primary-button ip-outline${onDark ? " ip-on-dark" : ""}`} href={PATHS.login}>
          <span className="ip-button-content"><span className="ip-btn-label">Log in</span></span>
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Hero */

type Shape = "plus" | "minus" | "times" | "divide" | "circle" | "square" | "triangle" | "equals";
/** A fixed, shuffled order: no shape sits next to the same shape, including where the strip wraps round. */
const SHAPE_ORDER: Shape[] = ["plus", "circle", "divide", "triangle", "equals", "square", "times", "minus", "divide", "plus", "triangle", "circle", "minus", "times", "square", "equals"];
const SHAPES: { shape: Shape; fill: string }[] = SHAPE_ORDER.map((shape) => ({ shape, fill: "var(--ink)" }));

const PLUS = "M83 40H147V100H207V164H147V224H83V164H23V100H83Z";

/** The shapes themselves are the maths symbols: a plus that is a plus, a triangle that is a triangle. Drawn here, no pictures. */
function SymbolShape({ shape, fill }: { shape: Shape; fill: string }) {
  const k = { fill, stroke: "var(--ink)", strokeWidth: 5, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 230 282" width="230" height="282" aria-hidden="true" focusable="false">
      <g transform="translate(0 9)">
        {shape === "plus" && <path d={PLUS} {...k} />}
        {shape === "times" && <path d={PLUS} transform="rotate(45 115 132)" {...k} />}
        {shape === "minus" && <rect x="15" y="100" width="200" height="64" rx="32" {...k} />}
        {shape === "equals" && <><rect x="15" y="66" width="200" height="60" rx="30" {...k} /><rect x="15" y="156" width="200" height="60" rx="30" {...k} /></>}
        {shape === "divide" && <><rect x="15" y="106" width="200" height="56" rx="28" {...k} /><circle cx="115" cy="50" r="32" {...k} /><circle cx="115" cy="218" r="32" {...k} /></>}
        {shape === "circle" && <circle cx="115" cy="132" r="100" {...k} />}
        {shape === "square" && <rect x="22" y="39" width="186" height="186" rx="26" {...k} />}
        {shape === "triangle" && <path d="M115 32L214 224H16Z" {...k} />}
      </g>
    </svg>
  );
}

function StripList() {
  return (
    <ul className="ip-ticker-list ip-ticker-flex ip-list-unstyled">
      {SHAPES.map((t, i) => (
        <li className="ip-ticker-item" key={i}>
          <div className="ip-ticker-image-wrap"><SymbolShape {...t} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Hero() {
  return (
    <section className="ip-banner-area" aria-labelledby="hero-title">
      <div className="ip-container">
        <div className="ip-banner-inner">
          <div className="ip-banner-content">
            <h1 className="ip-banner-title" id="hero-title">
              <span className="ip-banner-line">Free Online Practice</span>
              <span className="ip-banner-line">That Comes With Your <span className="ip-text-span">Book</span></span>
            </h1>
            <p className="ip-banner-paragraph">
              Type the code from inside your {PUBLISHER} book to unlock its online practice for {accessLength()} from the day you enter it.
            </p>
          </div>
          <div className="ip-banner-button">
            <CtaPair />
          </div>
        </div>
      </div>
      <div className="ip-ticker" aria-hidden="true">
        <div className="ip-ticker-track">
          <StripList />
          <StripList />
        </div>
      </div>
      <a className="ip-scroll-hint" href="#method" aria-label="Scroll down">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </a>
    </section>
  );
}

/* ------------------------------------------------------------- Statement */

type Part = string | { star: "one" | "two" | "three" };
const STATEMENT: Part[] = [
  "Short practice, little and", { star: "one" }, "often, marked straight away, then another look",
  { star: "two" }, "a few days later. That is the method behind every topic", { star: "three" },
];

export function Statement() {
  let key = 0;
  return (
    <section id="method" className="ip-growth-mindset-area" aria-label="How the practice works">
      <div className="ip-container">
        <div className="ip-content">
          <a className="ip-down-arrow" href="#how" aria-label="Go to how it works">
            <svg viewBox="0 0 70 70" fill="none" aria-hidden="true">
              <path d="M35 8V60M17 42L35 60L53 42" stroke="#14213d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="ip-button-hover-bg ip-white" aria-hidden="true" />
          </a>
          <p className="ip-statement" data-statement>
            {STATEMENT.flatMap((p) =>
              typeof p === "string"
                ? p.split(" ").map((w) => (<span key={key++}><span className="ip-w">{w}</span>{" "}</span>))
                : [<span key={key++}><span className={`ip-w ip-statement-star-${p.star}`} aria-hidden="true" />{" "}</span>],
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ How it works */

export function HowItWorks() {
  const steps = [
    { t: "Find your code", p: `Turn to the page just inside the front cover of your ${PUBLISHER} book. The code is printed there.` },
    { t: "Create your account", p: "An adult signs up once, then adds a profile for each child with a first name and year group. Children never need an email address." },
    { t: "Start practising", p: `Type the code to unlock that book for ${accessLength()} from the day you enter it. Pick a topic and begin.` },
  ];
  return (
    <section className="ip-how-area" id="how" aria-labelledby="how-title">
      <div className="ip-container">
        <div className="ip-section-head">
          <div className="ip-section-head-text">
            <Heading id="how-title" className="ip-section-title" lines={["How it works"]} />
            <p className="ip-section-paragraph">3 steps, and your book is online.</p>
          </div>
        </div>
        <ol className="ip-steps">
          {steps.map((s, i) => (
            <li className="ip-step" key={s.t}>
              <span className="ip-step-num" aria-hidden="true">{i + 1}</span>
              <h3 className="ip-step-title"><span className="ip-visually-hidden">Step {i + 1}: </span>{s.t}</h3>
              <p className="ip-step-text">{s.p}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Books */

const BTN = ["", "ip-tone-teal", "ip-tone-pink", "ip-tone-lime"];
const TONES = ["--c-amber", "--c-sky", "--c-pink", "--c-lime", "--c-teal", "--c-pink", "--c-amber", "--c-sky"];
/** How much of each cut-out shows: width as a share of the card and how far it is pulled down (so people rise from the bottom edge). */
const FIT: Record<string, { w: number; b: number }> = {
  y3maths: { w: 76, b: -34 }, y3reading: { w: 64, b: -6 }, ks2reading10: { w: 98, b: 0 },
  ks3english: { w: 64, b: -2 }, y8maths: { w: 60, b: -4 }, gcse_englang: { w: 70, b: -4 },
};

export function Books({ data }: { data: BookSection }) {
  const { books } = data;
  return (
    <section className="ip-get-course-area" id="books" aria-labelledby="books-title" data-carousel>
      <div className="ip-container">
        <div className="ip-section-head">
          <div className="ip-section-head-text">
            <Heading id="books-title" className="ip-section-title" lines={["Choose your book"]} />
            <p className="ip-section-paragraph">
              {books.length > 0
                ? `${books.length} books, ${fmt(data.topics)} topics and ${fmt(data.questions)} questions between them. Each book opens with the code printed inside its front cover.`
                : "Each book opens with the code printed inside its front cover."}
            </p>
          </div>
          {books.length > 1 && <Arrows label="books" />}
        </div>
      </div>
      {books.length > 0 ? (
        <div className="ip-carousel-bleed">
          <div className="ip-carousel-track" data-track role="region" aria-label="Books, scroll sideways" tabIndex={0}>
            <ul className="ip-carousel-list">
              {books.map((b, i) => (
                <li className="ip-speaker-slide" key={b.id}>
                  {(() => {
                    const who = b.isPhoto ? null : person(b.id);
                    const fit = FIT[b.id] ?? { w: 70, b: 0 };
                    return (
                      <div className="ip-speaker-image ip-has-person" style={{ background: `var(${TONES[i % TONES.length]})` }}>
                        {who ? (
                          <img className="ip-person" src={who.file} width={who.width} height={who.height} alt={who.alt} loading={i < 3 ? "eager" : "lazy"} style={{ width: `${fit.w}%`, bottom: `${fit.b}%` }} />
                        ) : (
                          <img className="ip-cover-art" src={b.image} width={420} height={540} alt="" loading={i < 3 ? "eager" : "lazy"} />
                        )}
                      </div>
                    );
                  })()}
                  <span className="ip-card-place ip-card-pill"><span className="ip-card-pill-text">{b.pill}</span></span>
                  <div className="ip-speaker-info">
                    <h3 className="ip-speaker-name">{b.title}</h3>
                    <p className="ip-body-display ip-large">{fmt(b.topics)} topics, {fmt(b.questions)} questions</p>
                    <a className={`ip-primary-button ip-book-card-btn ${BTN[i % BTN.length]}`} href={`${PATHS.books}/${b.id}`}>
                      <span className="ip-button-content">
                        <span className="ip-btn-label ip-black">See the topics<span className="ip-visually-hidden"> in {b.title}</span></span>
                      </span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="ip-container">
          <div className="ip-btn-wrapper">
            <a className="ip-primary-button ip-two" href={PATHS.books}>
              <span className="ip-button-hover-bg" aria-hidden="true" />
              <span className="ip-button-content"><span className="ip-btn-label">See all the books</span></span>
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ Who it is for */

const WHO = [
  { pill: "Ages 5 to 11", t: "Primary school students", p: "Key Stages 1 and 2. Short practice that matches the page of the book they are on, with their own profile inside a parent\u2019s account.", slot: "who-primary", tone: "ip-tone-amber" },
  { pill: "Ages 11 to 16", t: "Secondary school students", p: "Key Stages 3 and 4, including GCSE. Students aged 13 and over can have their own account.", slot: "who-secondary", tone: "ip-tone-teal" },
  { pill: "Adults", t: "Parents and guardians", p: "Set up one account, add a profile for each child and follow their progress on the dashboard.", slot: "who-parent", tone: "ip-tone-pink" },
];

export function WhoFor() {
  return (
    <section className="ip-who-area" aria-labelledby="who-title">
      <div className="ip-container">
        <div className="ip-section-head">
          <div className="ip-section-head-text">
            <Heading id="who-title" className="ip-section-title" lines={["Who it is for"]} />
          </div>
        </div>
        <ul className="ip-who-grid">
          {WHO.map((w) => {
            const pp = person(w.slot);
            return (
              <li className="ip-who-item" key={w.t}>
                <div className={`ip-who-image ${w.tone}`}>
                  {pp && <img className="ip-person" src={pp.file} width={pp.width} height={pp.height} alt={pp.alt} loading="lazy" />}
                </div>
                <div className="ip-who-info">
                  <span className="ip-card-place"><span className="ip-card-pill-text">{w.pill}</span></span>
                  <h3 className="ip-card-name">{w.t}</h3>
                  <p className="ip-body-display">{w.p}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------ What every topic gives you */

function TopicIcon({ kind }: { kind: number }) {
  const fills = ["var(--c-amber)", "var(--c-pink)", "var(--c-lime)", "var(--c-teal)"];
  const k = { stroke: "var(--ink)", strokeWidth: 3.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="39" fill={fills[kind]} stroke="var(--ink)" strokeWidth="1.5" />
      {kind === 0 && <path d="M40 22V58M22 40H58" {...k} />}
      {kind === 1 && <><circle cx="27" cy="31" r="8" fill="var(--ink)" /><rect x="42" y="23" width="16" height="16" rx="2" fill="var(--ink)" /><path d="M40 62L28 44H52Z" fill="var(--ink)" /></>}
      {kind === 2 && <path d="M23 42L35 54L58 27" {...k} strokeWidth={4.4} />}
      {kind === 3 && <><path d="M55 33A17 17 0 1 0 57 45" {...k} /><path d="M56 21V34H43" {...k} /></>}
    </svg>
  );
}

const GIVES = [
  { t: "New questions on every topic", s: "Every page of your book has its own practice online." },
  { t: "All kinds of questions", s: "Pick the answer, fill the gap, put things in order, match pairs. With diagrams and reading texts." },
  { t: "Marked straight away", s: "A short explanation after each answer, so mistakes turn into learning." },
  { t: "Practice that comes back", s: "Tricky topics return a few days later, so they stick." },
];

export function TopicGives() {
  return (
    <section className="ip-topic-area" aria-labelledby="gives-title">
      <div className="ip-container">
        <div className="ip-row">
          <div className="ip-col ip-half">
            <Heading id="gives-title" className="ip-section-title" lines={["What every topic", "gives you"]} />
            <p className="ip-section-paragraph ip-mb-50" style={{ marginTop: 28 }}>
              Every page of your book has its own topic online. This is what each one has inside.
            </p>
            <CtaPair tone="ip-white" />
          </div>
          <div className="ip-col ip-half">
            <div className="ip-topic-row-wrap">
              <ul className="ip-topic-list">
                {GIVES.map((g, i) => (
                  <li className="ip-topic-row" key={g.t}>
                    <div className="ip-topic-content-wrap">
                      <div className="ip-topic-thumb"><TopicIcon kind={i} /></div>
                      <div className="ip-topic-content">
                        <h3 className="ip-topic-title">{g.t}</h3>
                        <p className="ip-topic-cat">{g.s}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- FAQ */

export function Faq() {
  const items = faqEntries();
  return (
    <section className="ip-faq-area" id="faq" aria-labelledby="faq-title">
      <div className="ip-container">
        <div className="ip-row">
          <div className="ip-col" style={{ textAlign: "center" }}>
            <Heading id="faq-title" className="ip-section-title ip-center" lines={["Questions", "you might have"]} />
            <div className="ip-section-padding" />
          </div>
        </div>
        <div className="ip-row">
          <div className="ip-col">
            <div className="ip-faq-item-wrap">
              <ul className="ip-faq-list ip-faq-two">
                {items.map((f, i) => (
                  <li className="ip-faq-item" key={f.q}>
                    <h3 className="ip-h3">
                      <button type="button" className="ip-faq-question" aria-expanded="false" aria-controls={`faq-a${i}`} id={`faq-q${i}`}>
                        <span>{f.q}</span>
                        <span className="ip-p-m-wrap" aria-hidden="true"><span className="ip-minus" /><span className="ip-plus" /></span>
                      </button>
                    </h3>
                    <div className="ip-faq-answer" id={`faq-a${i}`} role="region" aria-labelledby={`faq-q${i}`}>
                      <div className="ip-faq-answer-inner"><p className="ip-lead-text">{f.a as ReactNode}</p></div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- CTA */

export function Cta() {
  return (
    <section className="ip-call-to-action-area" aria-labelledby="cta-title">
      <div className="ip-container">
        <div className="ip-row">
          <div className="ip-col">
            <Heading id="cta-title" className="ip-section-title ip-center" lines={["Got your book?", "Enter your code"]} />
            <p className="ip-section-paragraph ip-center ip-cta-paragraph" style={{ marginTop: 28 }}>
              The code is on a page inside the front cover. Type it in to unlock that book&rsquo;s online practice for {accessLength()} from the day you enter it.
            </p>
            <div className="ip-cta-actions">
              <CtaPair tone="ip-white" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
