import { useEffect, useRef, useState } from "react";
import type { LandingMobileDemo } from "../content/landing";

type MotionPreference = "unknown" | "allowed" | "reduced";

interface MobileLibraryDemoProps {
  demo: LandingMobileDemo;
}

export function MobileLibraryDemo({ demo }: MobileLibraryDemoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motionPreference, setMotionPreference] =
    useState<MotionPreference>("unknown");
  const [playbackFailed, setPlaybackFailed] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updatePreference = (reduce: boolean) => {
      setMotionPreference(reduce ? "reduced" : "allowed");
      if (reduce) videoRef.current?.pause();
    };

    updatePreference(preference?.matches ?? false);

    const onPreferenceChange = (event: MediaQueryListEvent) => {
      updatePreference(event.matches);
    };

    preference?.addEventListener?.("change", onPreferenceChange);
    return () => {
      preference?.removeEventListener?.("change", onPreferenceChange);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (
      demo.status !== "ready" ||
      motionPreference !== "allowed" ||
      playbackFailed ||
      !video ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void video.play().catch(() => setPlaybackFailed(true));
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(video);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [demo.status, motionPreference, playbackFailed]);

  const canPlay =
    demo.status === "ready" &&
    motionPreference === "allowed" &&
    !playbackFailed &&
    typeof IntersectionObserver !== "undefined";

  return (
    <div
      className={`mobile-library__visual ${canPlay ? "mobile-library__visual--video" : "mobile-library__visual--poster"}`}
      data-mobile-demo={demo.id}
      data-mobile-demo-status={demo.status}
    >
      {canPlay ? (
        <video
          ref={videoRef}
          className="mobile-library__media"
          src={demo.video}
          poster={demo.poster}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={`${demo.title}, silent mobile library preview`}
        />
      ) : (
        <img
          className="mobile-library__media"
          src={demo.poster}
          alt={demo.illustrationAlt}
          width="1120"
          height="720"
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
}
