import React, { useId } from "react";

import { cn } from "@/lib/utils";

import {
  MARKA_MARK_BACK_PATH,
  MARKA_MARK_FRONT_PATH,
  MARKA_MARK_GAP_PATH,
  MARKA_MARK_VIEWBOX,
  MARKA_TEXT_PATH,
  MARKA_TEXT_VIEWBOX,
} from "./marka-mark-paths";

/**
 * Motion for the stacked Marka mark. Both cards pivot on their bottom-left
 * corners in viewBox units, so the front card and the gap it cuts into the
 * rear card always move together.
 *
 * - `enter`: the front card rises in, then the rear card slides out from
 *   behind it and the wordmark settles below.
 * - `loop`: the cards fan apart and settle again while work is pending, and a
 *   soft sheen passes over the wordmark.
 */
export const MARKA_STACK_CSS = `
.marka-stack { overflow: visible; }
.marka-stack-card { transform-box: view-box; }
.marka-stack-back { transform-origin: 0px 697px; }
.marka-stack-front { transform-origin: 128px 871px; }
@media (prefers-reduced-motion: no-preference) {
  /* Wait briefly so fast in-app loads never flash a loader. */
  .marka-stack-loader { animation: marka-stack-fade-in 240ms ease-out 150ms both; }
  .marka-stack[data-motion~="enter"] .marka-stack-front {
    animation:
      marka-stack-front-enter 620ms cubic-bezier(0.16, 1, 0.3, 1) both,
      marka-stack-fade-in 180ms ease-out both;
  }
  .marka-stack[data-motion~="enter"] .marka-stack-back {
    animation:
      marka-stack-back-enter 760ms cubic-bezier(0.34, 1.24, 0.64, 1) 160ms both,
      marka-stack-fade-in 180ms ease-out 160ms both;
  }
  .marka-stack[data-motion~="enter"] + .marka-stack-text {
    animation: marka-stack-text-enter 560ms cubic-bezier(0.16, 1, 0.3, 1) 380ms both;
  }
  .marka-stack[data-motion="loop"] .marka-stack-front {
    animation: marka-stack-front-fan 2.4s cubic-bezier(0.45, 0, 0.2, 1) infinite;
  }
  .marka-stack[data-motion="loop"] .marka-stack-back {
    animation: marka-stack-back-fan 2.4s cubic-bezier(0.45, 0, 0.2, 1) infinite;
  }
  .marka-stack[data-motion="enter loop"] .marka-stack-front {
    animation:
      marka-stack-front-enter 620ms cubic-bezier(0.16, 1, 0.3, 1) both,
      marka-stack-fade-in 180ms ease-out both,
      marka-stack-front-fan 2.4s cubic-bezier(0.45, 0, 0.2, 1) 1.1s infinite;
  }
  .marka-stack[data-motion="enter loop"] .marka-stack-back {
    animation:
      marka-stack-back-enter 760ms cubic-bezier(0.34, 1.24, 0.64, 1) 160ms both,
      marka-stack-fade-in 180ms ease-out 160ms both,
      marka-stack-back-fan 2.4s cubic-bezier(0.45, 0, 0.2, 1) 1.1s infinite;
  }
  .marka-stack[data-motion="enter loop"] + .marka-stack-text {
    -webkit-mask-image: linear-gradient(100deg, #000 40%, rgb(0 0 0 / 0.45) 50%, #000 60%);
    mask-image: linear-gradient(100deg, #000 40%, rgb(0 0 0 / 0.45) 50%, #000 60%);
    -webkit-mask-size: 300% 100%;
    mask-size: 300% 100%;
    -webkit-mask-position: 100% 0;
    mask-position: 100% 0;
    animation:
      marka-stack-text-enter 560ms cubic-bezier(0.16, 1, 0.3, 1) 380ms both,
      marka-stack-sheen 2.4s cubic-bezier(0.45, 0, 0.2, 1) 1.1s infinite;
  }
}
@keyframes marka-stack-front-enter {
  from { transform: translate(0px, 64px) scale(0.9); }
}
@keyframes marka-stack-back-enter {
  from { transform: translate(120px, 130px) rotate(5deg); }
}
@keyframes marka-stack-text-enter {
  from { opacity: 0; transform: translateY(10px); filter: blur(6px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes marka-stack-front-fan {
  0%, 100% { transform: none; }
  38%, 58% { transform: translate(22px, -30px) rotate(3deg); }
}
@keyframes marka-stack-back-fan {
  0%, 100% { transform: none; }
  38%, 58% { transform: translate(-18px, 10px) rotate(-3deg); }
}
@keyframes marka-stack-sheen {
  0%, 20% { -webkit-mask-position: 100% 0; mask-position: 100% 0; }
  80%, 100% { -webkit-mask-position: 0% 0; mask-position: 0% 0; }
}
@keyframes marka-stack-fade-in {
  from { opacity: 0; }
}
`;

type MarkaStackMotion = "none" | "enter" | "loop" | "enter loop";

/** The two-card Marka mark, drawn in `currentColor`. */
export function MarkaStackMark({
  motion = "none",
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "viewBox"> & {
  motion?: MarkaStackMotion;
}) {
  const maskId = `${useId().replace(/:/g, "")}-marka-stack-gap`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MARKA_MARK_VIEWBOX}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      data-motion={motion}
      className={cn("marka-stack", className)}
      {...props}
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x="-400"
        y="-400"
        width="1500"
        height="1700"
      >
        <rect x="-400" y="-400" width="1500" height="1700" fill="white" />
        <path
          className="marka-stack-card marka-stack-front"
          d={MARKA_MARK_GAP_PATH}
          fill="black"
        />
      </mask>
      <path
        className="marka-stack-card marka-stack-back"
        d={MARKA_MARK_BACK_PATH}
        mask={`url(#${maskId})`}
      />
      <path
        className="marka-stack-card marka-stack-front"
        d={MARKA_MARK_FRONT_PATH}
      />
    </svg>
  );
}

/** The lowercase "marka" wordmark text without the mark. */
export function MarkaStackText({
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "viewBox">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MARKA_TEXT_VIEWBOX}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn("marka-stack-text", className)}
      {...props}
    >
      <path d={MARKA_TEXT_PATH} fillRule="evenodd" />
    </svg>
  );
}

/** Page-level loading state for surfaces without a content skeleton. */
export function MarkaStackLoader({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("marka-stack-loader flex size-full", className)}
    >
      <style>{MARKA_STACK_CSS}</style>
      <MarkaStackMark motion="loop" className="m-auto h-10 w-auto" />
    </div>
  );
}
