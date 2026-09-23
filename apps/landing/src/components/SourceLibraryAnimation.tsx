import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LandingSourceCard } from "../content/landing";

type AnimationState = "static" | "waiting" | "entering" | "settled" | "reduced";

interface SourceLibraryAnimationProps {
  cards: readonly LandingSourceCard[];
  label: string;
}

const directions = ["left", "up", "right", "down", "left", "up", "right"];

export function SourceLibraryAnimation({
  cards,
  label,
}: SourceLibraryAnimationProps) {
  const region = useRef<HTMLDivElement>(null);
  const [animationState, setAnimationState] =
    useState<AnimationState>("static");

  useEffect(() => {
    const target = region.current;
    if (!target) return;

    let settleTimer: number | undefined;
    const motionPreference = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );

    if (motionPreference?.matches) {
      setAnimationState("reduced");
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setAnimationState("static");
      return;
    }

    setAnimationState("waiting");

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setAnimationState("entering");
          settleTimer = window.setTimeout(
            () => setAnimationState("settled"),
            760,
          );
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(target);

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        if (settleTimer !== undefined) window.clearTimeout(settleTimer);
        setAnimationState("reduced");
        observer.disconnect();
      }
    };

    motionPreference?.addEventListener?.("change", onMotionPreferenceChange);

    return () => {
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      observer.disconnect();
      motionPreference?.removeEventListener?.(
        "change",
        onMotionPreferenceChange,
      );
    };
  }, []);

  return (
    <div
      ref={region}
      className="source-library__grid"
      role="region"
      aria-label={label}
      data-animation-state={animationState}
    >
      {cards.map((card, index) => (
        <article
          className="source-card"
          data-source-card={card.id}
          data-entry-direction={directions[index % directions.length]}
          style={{ "--source-card-index": index } as CSSProperties}
          key={card.id}
        >
          <img
            src={card.image}
            alt={card.alt}
            width="1120"
            height="720"
            loading="lazy"
            decoding="async"
          />
          <div className="source-card__copy">
            <p className="source-card__source">{card.sourceLabel}</p>
            <h3>{card.title}</h3>
            <p>{card.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
