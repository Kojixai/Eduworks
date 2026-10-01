import { PATHS } from "./brand";
import { Logo } from "./Logo";

const MENU = [
  { href: "#books", label: "Books" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="ip-main-nav">
      <div className="ip-container">
        <div className="ip-main-nav-inner">
          <a href="/" className="ip-logo-wrapper">
            <Logo />
          </a>

          <button type="button" className="ip-nav-toggle-btn" aria-expanded="false" aria-controls="site-menu" aria-label="Menu" data-menu-toggle>
            <span className="ip-menu-line" />
            <span className="ip-menu-line ip-two" />
          </button>

          <div className="ip-nav-right-content">
            <div className="ip-btn-wrapper">
              <a className="ip-primary-button" href={loggedIn ? PATHS.dashboard : PATHS.login}>
                <span className="ip-button-hover-bg" aria-hidden="true" />
                <span className="ip-button-content">
                  <img className="ip-media-main" src="/site/book-icon.svg" width={24} height={24} alt="" />
                  <span className="ip-btn-label">{loggedIn ? "Open dashboard" : "Log in"}</span>
                </span>
              </a>
            </div>
          </div>

          <nav id="site-menu" className="ip-nav-wrapper" aria-label="Main menu">
            <div className="ip-nav-items">
              <ul>
                {MENU.map((m) => (
                  <li key={m.href}><a className="ip-nav-link" href={m.href}>{m.label}</a></li>
                ))}
                <li><a className="ip-nav-link" href={PATHS.enterCode}>Enter your book code</a></li>
                <li>
                  <a className="ip-nav-link ip-btn" href={loggedIn ? PATHS.dashboard : PATHS.login}>{loggedIn ? "Dashboard" : "Log in"}</a>
                </li>
              </ul>
            </div>
            <div className="ip-nav-gradient-bg" />
            <div className="ip-bg-noise" />
            <button type="button" className="ip-close-btn-wrapper" data-menu-close>
              <span className="ip-close-btn-text">Close</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
