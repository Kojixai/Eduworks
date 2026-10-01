import { BRAND_SUB, BRAND_WORD } from "./brand";

/** The wordmark is live text in the display font (Adobe Fonts kit), so there is no logo image to keep in step with the name. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`ip-brandmark ${className}`.trim()} aria-label={`${BRAND_WORD} ${BRAND_SUB}`}>
      <span aria-hidden="true">Ink<span className="ip-brandmark-accent">w</span>orks</span>
      <span aria-hidden="true" className="ip-brandmark-sub">{BRAND_SUB}</span>
    </span>
  );
}
