import type { Text } from "@/practice/types";

export function TextPanel({ text, headingLevel = 3 }: { text: Text; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={`text-panel${isLongLined(text) ? " text-wide" : ""}`} aria-label={`Text: ${text.title}`}>
      <H>{text.title}</H>
      {text.author && <p className="muted small" style={{ margin: 0 }}>{text.author}</p>}
      <ol className={`text-lines${text.kind === "poem" || text.kind === "playscript" ? " poem" : ""}`}>
        {text.lines.map((l, i) => (
          <li key={i}>
            <span className="ln" aria-label={`Line ${i + 1}`}>{(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}</span>
            <span className="tx">{l || " "}</span>
          </li>
        ))}
      </ol>
      {text.glossary && text.glossary.length > 0 && (
        <dl className="glossary">
          {text.glossary.map(([w, m]) => (
            <div key={w}>
              <dt>{w}</dt>: <dd>{m}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="source">{text.source}</p>
    </section>
  );
}

/** Prose or non-fiction whose printed lines are long (a quarter or more over 72 characters) gets the wider panel. */
function isLongLined(text: Text): boolean {
  if (text.kind !== "prose" && text.kind !== "nonfiction") return false;
  return text.lines.filter((l) => l.length > 72).length * 4 >= text.lines.length;
}
