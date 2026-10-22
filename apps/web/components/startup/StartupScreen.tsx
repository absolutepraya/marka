import React from "react";
import {
  MARKA_STACK_CSS,
  MarkaStackMark,
  MarkaStackText,
} from "@/components/loading-ui/marka-stack";
import en from "@/lib/i18n/locales/en/translation.json";

import { startupScript } from "./startup-script";

export default function StartupScreen({
  messages = en.startup,
}: {
  messages?: typeof en.startup;
}) {
  return (
    <>
      <style>{`
        .marka-startup { display: none; }
        @media (max-width: 767px), (hover: none) and (pointer: coarse) {
          .marka-startup {
            position: fixed; inset: 0; z-index: 9999;
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; gap: 32px; min-height: 100svh;
            padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
            background: #f5f7fa; color: #172235;
            font-family: system-ui, sans-serif; text-align: center;
          }
          .marka-startup-brand {
            display: flex; flex-direction: column; align-items: center; gap: 18px;
            color: #041c47;
          }
          .marka-startup-brand .marka-stack { width: 74px; height: 92px; }
          .marka-startup-brand .marka-stack-text { width: 119px; height: 30px; }
          .marka-startup-status { position: absolute; font-size: 15px; }
          .marka-startup-status p { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
          .marka-startup-recovery { display: none; max-width: 280px; font-size: 14px; line-height: 1.6; }
          .marka-startup-recovery button { display: inline-block; margin-top: 16px; padding: 10px 24px; border: 1px solid currentColor; border-radius: 10px; color: inherit; background: transparent; font: inherit; cursor: pointer; }
          html[data-startup-recovery] .marka-startup-brand * { animation: none !important; }
          html[data-startup-recovery] .marka-startup-status { position: static; max-width: 280px; font-size: 14px; line-height: 1.6; }
          html[data-startup-recovery] .marka-startup-status p { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip-path: none; white-space: normal; }
          html[data-startup-recovery] .marka-startup-recovery { display: block; }
          html[data-startup-theme="dark"] .marka-startup { background: #121a27; color: #f5f7fa; color-scheme: dark; }
          html[data-startup-theme="dark"] .marka-startup-brand { color: #f5f7fa; }
          @media (prefers-color-scheme: dark) {
            html:not([data-startup-theme="light"]) .marka-startup { background: #121a27; color: #f5f7fa; color-scheme: dark; }
            html:not([data-startup-theme="light"]) .marka-startup-brand { color: #f5f7fa; }
          }
          /* Dissolve into the ready app while the lockup drifts forward. */
          html[data-startup-ready="true"] .marka-startup {
            pointer-events: none;
            animation: marka-startup-exit 320ms ease-out forwards;
          }
          html[data-startup-ready="true"] .marka-startup-brand {
            animation: marka-startup-brand-exit 320ms cubic-bezier(0.4, 0, 1, 1) forwards;
          }
        }
        @keyframes marka-startup-exit { to { opacity: 0; visibility: hidden; } }
        @keyframes marka-startup-brand-exit { to { transform: scale(1.06); } }
        ${MARKA_STACK_CSS}
      `}</style>
      <section className="marka-startup" aria-label={messages.label}>
        <div className="marka-startup-brand" aria-hidden="true">
          <MarkaStackMark motion="enter loop" />
          <MarkaStackText />
        </div>
        <div
          className="marka-startup-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p
            id="marka-startup-message"
            data-slow={messages.slow}
            data-offline={messages.offline}
            suppressHydrationWarning
          >
            {messages.loading}
          </p>
        </div>
        <div className="marka-startup-recovery">
          <button type="button" id="marka-startup-retry">
            {messages.retry}
          </button>
        </div>
        <noscript>
          <style>{`.marka-startup-status, .marka-startup-recovery { display: none !important; }`}</style>
          <p>{messages.noScript}</p>
        </noscript>
      </section>
      <script dangerouslySetInnerHTML={{ __html: startupScript }} />
    </>
  );
}
