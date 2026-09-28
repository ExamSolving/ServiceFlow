import Link from "next/link";
import { ArrowUpRight, Layers2, LockKeyhole } from "lucide-react";
import { AuthBrandPanel } from "./auth-brand-panel";
import "./auth.css";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="sf-auth">
      <a href="#auth-content" className="sf-skip">
        Skip to form
      </a>
      <aside className="sf-story">
        <AuthBrandPanel />
      </aside>
      <section className="sf-form-side" aria-label="Your ServiceFlow account">
        <header className="sf-topbar">
          <Link
            href="/login"
            className="sf-logo sf-mobile-logo"
            aria-label="ServiceFlow sign in"
          >
            <span className="sf-logo-mark">
              <Layers2 size={21} aria-hidden="true" />
            </span>
            ServiceFlow<span className="sf-logo-dot">.</span>
          </Link>
          <span className="sf-topbar-label">YOUR WORK, IN GOOD ORDER.</span>
          <span className="sf-security">
            <LockKeyhole size={13} aria-hidden="true" /> Secure workspace
          </span>
        </header>
        <div className="sf-form-container" id="auth-content" tabIndex={-1}>
          <div className="sf-form-content">{children}</div>
        </div>
        <footer className="sf-form-footer">
          <span>© {new Date().getFullYear()} ServiceFlow</span>
          <span>
            Built for the work that matters{" "}
            <ArrowUpRight size={13} aria-hidden="true" />
          </span>
        </footer>
      </section>
    </main>
  );
}
