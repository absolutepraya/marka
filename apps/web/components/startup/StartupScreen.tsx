import React from "react";
import Image from "next/image";
import { MARKA } from "@/lib/brand";

import { startupScript } from "./startup-script";

export default function StartupScreen() {
  return (
    <>
      <style>{`
        .marka-startup { display: none; }
        @media (max-width: 767px), (hover: none) and (pointer: coarse) {
          .marka-startup {
            position: fixed; inset: 0; z-index: 9999;
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; gap: 28px; min-height: 100svh;
            padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
            background: #f5f7fa; color: #172235;
            font-family: system-ui, sans-serif; text-align: center;
          }
          .marka-startup-logo { width: 170px; height: 45px; object-fit: contain; }
          .marka-startup-dark { display: none; }
          .marka-startup-indicator {
            width: 22px; height: 22px; border: 2px solid currentColor;
            border-right-color: transparent; border-bottom-color: transparent;
            border-radius: 50%; opacity: .55; animation: marka-startup-spin .9s linear infinite;
          }
          .marka-startup-status { display: flex; flex-direction: column; align-items: center; gap: 14px; font-size: 13px; }
          .marka-startup-status p { margin: 0; opacity: .65; }
          .marka-startup-recovery { display: none; max-width: 280px; font-size: 14px; line-height: 1.6; }
          .marka-startup-recovery button { display: inline-block; margin-top: 16px; padding: 10px 24px; border: 1px solid currentColor; border-radius: 10px; color: inherit; background: transparent; font: inherit; cursor: pointer; }
          .marka-startup-offline { display: none; }
          html[data-startup-recovery] .marka-startup-status { display: none; }
          html[data-startup-recovery] .marka-startup-recovery { display: block; }
          html[data-startup-recovery="offline"] .marka-startup-slow { display: none; }
          html[data-startup-recovery="offline"] .marka-startup-offline { display: block; }
          html[data-startup-theme="dark"] .marka-startup { background: #121a27; color: #f5f7fa; color-scheme: dark; }
          html[data-startup-theme="dark"] .marka-startup-light { display: none; }
          html[data-startup-theme="dark"] .marka-startup-dark { display: block; }
          @media (prefers-color-scheme: dark) {
            html:not([data-startup-theme="light"]) .marka-startup { background: #121a27; color: #f5f7fa; color-scheme: dark; }
            html:not([data-startup-theme="light"]) .marka-startup-light { display: none; }
            html:not([data-startup-theme="light"]) .marka-startup-dark { display: block; }
          }
          @media (prefers-reduced-motion: reduce) {
            .marka-startup-indicator { animation: none; }
          }
        }
        html[data-startup-ready="true"] .marka-startup { display: none; }
        @keyframes marka-startup-spin { to { transform: rotate(360deg); } }
      `}</style>
      <section className="marka-startup" aria-label="Starting Marka">
        <Image
          className="marka-startup-logo marka-startup-light"
          src={MARKA.wordmark.navy}
          alt="Marka"
          width={170}
          height={45}
          unoptimized
          loading="eager"
          fetchPriority="high"
        />
        <Image
          className="marka-startup-logo marka-startup-dark"
          src={MARKA.wordmark.white}
          alt="Marka"
          width={170}
          height={45}
          unoptimized
          loading="eager"
          fetchPriority="high"
        />
        <div className="marka-startup-status" role="status" aria-live="polite">
          <span className="marka-startup-indicator" aria-hidden="true" />
          <p>Loading your library</p>
        </div>
        <div
          className="marka-startup-recovery"
          role="status"
          aria-live="polite"
        >
          <p className="marka-startup-slow">
            This is taking longer than usual. You can wait a little longer or
            try again.
          </p>
          <p className="marka-startup-offline">
            You appear to be offline. Check your connection and try again.
          </p>
          <button type="button" id="marka-startup-retry">
            Try again
          </button>
        </div>
        <noscript>
          <style>{`.marka-startup-status, .marka-startup-recovery { display: none !important; }`}</style>
          <p>Enable JavaScript to open Marka, then reload this page.</p>
        </noscript>
      </section>
      <script dangerouslySetInnerHTML={{ __html: startupScript }} />
    </>
  );
}
