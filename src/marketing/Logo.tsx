import { BRAND } from "./brand";

/** The wordmark is live text in the display face (Adobe Fonts kit), so there is no logo image to keep in step with the name. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`ip-brandmark ${className}`.trim()} aria-label={BRAND}>
      <span aria-hidden="true">Learn</span>
      <span aria-hidden="true" className="ip-brandmark-accent">Works</span>
    </span>
  );
}
