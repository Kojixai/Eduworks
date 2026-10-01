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

function Arrows({ label, green }: { label: string; green?: boolean }) {
  const cls = `ip-carousel-arrow${green ? " ip-is-green" : ""}`;
  return (
    <div className="ip-carousel-controls">
      <button type="button" className={cls} data-prev aria-label={`Previous ${label}`} aria-disabled="true">
        <img src="/site/images/arrow-left.svg" width={52} height={28} alt="" className="ip-slide-arrow" />
      </button>
      <button type="button" className={cls} data-next aria-label={`Next ${label}`}>
        <img src="/site/images/arrow-right.svg" width={52} height={28} alt="" className="ip-slide-arrow" />
      </button>
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
const SHAPES: { shape: Shape; fill: string }[] = [
  { shape: "plus", fill: "var(--c-pink)" }, { shape: "minus", fill: "var(--c-amber)" }, { shape: "times", fill: "var(--c-sky)" },
  { shape: "divide", fill: "var(--c-lime)" }, { shape: "circle", fill: "var(--c-teal)" }, { shape: "square", fill: "var(--c-pink)" },
  { shape: "triangle", fill: "var(--c-amber)" }, { shape: "equals", fill: "var(--c-sky)" },
];

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
    <section className="ip-growth-mindset-area" aria-label="How the practice works">
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
const TONES = ["--c-amber", "--c-sky", "--c-pink", "--c-lime", "--c-teal", "--c-pink"];

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
                    return who ? (
                      <div className="ip-speaker-image ip-has-person" style={{ background: `var(${TONES[i % TONES.length]})` }}>
                        <span className="ip-person-disc" aria-hidden="true" />
                        <img className="ip-person" src={who.file} width={who.width} height={who.height} alt={who.alt} loading={i < 3 ? "eager" : "lazy"} />
                      </div>
                    ) : (
                      <div className="ip-speaker-image">
                        <img className="ip-slider-image" src={b.image} width={420} height={540} alt="" loading={i < 3 ? "eager" : "lazy"} />
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
  { pill: "Adults", t: "Parents and guardians", p: "Create 1 account, add a profile for each child and follow their progress on the dashboard.", slot: "who-parent", tone: "" },
  { pill: "Adults", t: "Teachers", p: "A teacher can hold the account too, with a simple profile for each child.", slot: "who-teacher", tone: "ip-tone-lime" },
  { pill: "Aged 13+", t: "Students aged 13 and over", p: "Can have their own account for the KS3 and GCSE books.", slot: "who-student", tone: "ip-tone-teal" },
  { pill: "KS1 to KS4", t: "Key Stages 1 to 4", p: "Free curriculum practice for every Key Stage, once you are logged in.", slot: "who-years", tone: "ip-tone-amber" },
];

export function WhoFor() {
  return (
    <section className="ip-who-area" aria-labelledby="who-title" data-carousel>
      <div className="ip-container">
        <div className="ip-section-head">
          <div className="ip-section-head-text">
            <Heading id="who-title" className="ip-section-title" lines={["Who it is for"]} />
          </div>
          <Arrows label="cards" />
        </div>
      </div>
      <div className="ip-carousel-bleed">
        <div className="ip-carousel-track" data-track role="region" aria-label="Who it is for, scroll sideways" tabIndex={0}>
          <ul className="ip-carousel-list">
            {WHO.map((w) => (
              <li className="ip-who-item" key={w.t}>
                <div className={`ip-who-image ${w.tone}`}>
                  {(() => { const pp = person(w.slot); return pp ? <img className="ip-person" src={pp.file} width={pp.width} height={pp.height} alt={pp.alt} loading="lazy" /> : null; })()}
                </div>
                <div className="ip-who-info">
                  <span className="ip-card-place"><span className="ip-card-pill-text">{w.pill}</span></span>
                  <h3 className="ip-card-name">{w.t}</h3>
                  <p className="ip-body-display">{w.p}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------ What every topic gives you */

function TopicIcon({ kind }: { kind: number }) {
  const fills = ["#ffb627", "#ff8fab", "#c4e538", "#19c3b1", "#a8d1ff"];
  const label = ["10", "9", "", "80%", "1 3 7"][kind];
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="39" fill={fills[kind]} stroke="#14213d" strokeWidth="1.5" />
      {kind === 2 ? (
        <path d="M45 14L24 44H39L35 66L56 36H41Z" fill="#14213d" />
      ) : (
        <text x="40" y="40" textAnchor="middle" dominantBaseline="central" fontFamily="gloock, Georgia, serif" fontSize={label.length > 3 ? 21 : label.length > 2 ? 26 : 34} fill="#14213d">{label}</text>
      )}
    </svg>
  );
}

const GIVES = [
  { t: "10 new questions on every topic", s: "1 topic for each page of your book", tag: "10 questions" },
  { t: "9 question types, with diagrams", s: "And reading texts with line numbers", tag: "9 types" },
  { t: "Instant marking", s: "With a short worked explanation after each answer", tag: "Instant" },
  { t: "Secure topics", s: "80% or more on 2 different days", tag: "2 days" },
  { t: "Another go at the right time", s: "Topics come back after 1, 3 and 7 days", tag: "1, 3, 7 days" },
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
                    <div className="ip-topic-button"><div className="ip-tag-text">{g.tag}</div></div>
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
