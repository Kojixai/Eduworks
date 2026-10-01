import { SUPPORT_EMAIL } from "@/practice/config";
import { PATHS, PUBLISHER, TAGLINE } from "./brand";
import { Logo } from "./Logo";

const link = (href: string, label: string) => (
  <li className="ip-list-item" key={href}><a href={href}>{label}</a></li>
);

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="ip-footer-area">
      <div className="ip-container">
        <div className="ip-footer-columns">
          <div className="ip-footer-about">
            <a href="/" className="ip-footer-logo-link ip-footer-logo">
              <Logo />
            </a>
            <p className="ip-footer-paragraph">{TAGLINE}. No adverts, no chat, no trackers.</p>
          </div>
          <nav className="ip-footer-nav" aria-label="Explore">
            <h2>Explore</h2>
            <ul className="ip-footer-menu-list ip-list-unstyled">
              {link("#books", "Books")}
              {link("#how", "How it works")}
              {link("#faq", "FAQ")}
            </ul>
          </nav>
          <nav className="ip-footer-nav" aria-label="Legal">
            <h2>Legal</h2>
            <ul className="ip-footer-menu-list ip-list-unstyled">
              {link(PATHS.privacy, "Privacy")}
              {link(PATHS.terms, "Terms")}
              {link(PATHS.credits, "Credits")}
            </ul>
          </nav>
          <div className="ip-footer-nav">
            <h2>Your account</h2>
            <a href={PATHS.login} className="ip-footer-link-alt">Log in</a>
            <a href={PATHS.enterCode} className="ip-footer-link-alt">Enter book code</a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="ip-footer-link-alt ip-underline">{SUPPORT_EMAIL}</a>
          </div>
        </div>
        <div className="ip-copyrigh-content">
          <div className="ip-copyright-text">Copyright &copy; {year} {PUBLISHER}. All rights reserved.</div>
          <div className="ip-copyright-menu">
            <a href="#top" className="ip-footer-menu-link">Back to top</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
