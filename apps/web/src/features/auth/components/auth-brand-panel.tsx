import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Circle,
  Layers2,
  MoreHorizontal,
  Wrench,
} from "lucide-react";

export function AuthBrandPanel() {
  return (
    <div className="sf-brand-panel">
      <Link href="/login" className="sf-logo" aria-label="ServiceFlow sign in">
        <span className="sf-logo-mark">
          <Layers2 size={23} aria-hidden="true" />
        </span>
        ServiceFlow<span className="sf-logo-dot">.</span>
      </Link>
      <div className="sf-story-content">
        <div className="sf-eyebrow sf-story-eyebrow">
          <span /> THE FIELD SERVICE WORKSPACE
        </div>
        <h2>
          Great service.
          <br />
          <span>Less busywork.</span>
        </h2>
        <p className="sf-story-description">
          Bring your people, jobs, and customers together.
          <br className="sf-wide-break" /> Make room for your best work.
        </p>
        <div
          className="sf-product-preview"
          aria-label="Illustrative service workflow preview"
        >
          <div className="sf-preview-top">
            <span>
              <span className="sf-live-dot" /> A well-organized workday
            </span>
            <MoreHorizontal size={18} aria-hidden="true" />
          </div>
          <div className="sf-preview-heading">
            <div>
              <small>WORKSPACE PREVIEW</small>
              <h3>Everything in its place.</h3>
            </div>
            <span className="sf-preview-icon">
              <ArrowUpRight size={20} aria-hidden="true" />
            </span>
          </div>
          <div className="sf-job-card">
            <div className="sf-job-icon">
              <Wrench size={19} aria-hidden="true" />
            </div>
            <div>
              <strong>Equipment maintenance</strong>
              <span>On-site service · Scheduled</span>
            </div>
            <span className="sf-job-tag">Today</span>
          </div>
          <div className="sf-workflow">
            <div>
              <span className="sf-step-done">
                <Check size={13} aria-hidden="true" />
              </span>
              <strong>Request received</strong>
              <small>Details in one place</small>
            </div>
            <div>
              <span className="sf-step-done">
                <Check size={13} aria-hidden="true" />
              </span>
              <strong>Team assigned</strong>
              <small>Everyone in the loop</small>
            </div>
            <div>
              <span className="sf-step-next">
                <Circle size={10} aria-hidden="true" />
              </span>
              <strong>Ready to go</strong>
              <small>A clear next step</small>
            </div>
          </div>
          <div className="sf-preview-bottom">
            <span className="sf-avatar-stack">
              <i>JD</i>
              <i>AK</i>
              <i>MS</i>
            </span>
            <span>One team. One shared view.</span>
          </div>
        </div>
        <div className="sf-capabilities">
          <span>Plan the work</span>
          <i />
          <span>Connect your team</span>
          <i />
          <span>Keep moving</span>
        </div>
      </div>
      <div className="sf-brand-footer">
        <span>Less friction. More flow.</span>
        <span>ServiceFlow / 01</span>
      </div>
    </div>
  );
}
