import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingDemo } from "../content/landing";

interface DemoGalleryProps {
  demos: readonly LandingDemo[];
  pendingLabel: string;
  placeholderAltPrefix: string;
}

interface DemoCardProps {
  demo: LandingDemo;
  pendingLabel: string;
  placeholderAltPrefix: string;
  active: boolean;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
}

export function DemoGallery({
  demos,
  pendingLabel,
  placeholderAltPrefix,
}: DemoGalleryProps) {
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const activate = useCallback((id: string) => setActiveDemoId(id), []);
  const deactivate = useCallback((id: string) => {
    setActiveDemoId((activeId) => (activeId === id ? null : activeId));
  }, []);

  return (
    <div className="demo-grid">
      {demos.map((demo) => (
        <DemoCard
          key={demo.id}
          demo={demo}
          pendingLabel={pendingLabel}
          placeholderAltPrefix={placeholderAltPrefix}
          active={activeDemoId === demo.id}
          onActivate={activate}
          onDeactivate={deactivate}
        />
      ))}
    </div>
  );
}

function DemoCard({
  demo,
  pendingLabel,
  placeholderAltPrefix,
  active,
  onActivate,
  onDeactivate,
}: DemoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (active || !video) return;

    video.pause();
    setIsPlaying(false);
  }, [active]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => !entry.isIntersecting)) {
          video.pause();
          onDeactivate(demo.id);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [demo.id, onDeactivate]);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (!video.paused) {
      video.pause();
      return;
    }

    setPlaybackError(false);
    onActivate(demo.id);

    try {
      await video.play();
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
      onDeactivate(demo.id);
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPlaybackError(true);
    }
  };

  return (
    <article className="demo-card" data-demo-card={demo.id}>
      {demo.status === "ready" ? (
        <div className="demo-player">
          <video
            ref={videoRef}
            className="demo-player__video"
            src={demo.video}
            poster={demo.poster}
            muted
            playsInline
            preload="metadata"
            aria-label={`${demo.title} demo video`}
            aria-describedby={`${demo.id}-caption`}
            onPlay={() => setIsPlaying(true)}
            onPause={() => {
              setIsPlaying(false);
              onDeactivate(demo.id);
            }}
            onEnded={() => {
              setIsPlaying(false);
              onDeactivate(demo.id);
            }}
          />
          <button
            className="demo-player__toggle"
            type="button"
            aria-label={`${isPlaying ? "Pause" : "Play"} ${demo.title} demo`}
            aria-pressed={isPlaying}
            onClick={togglePlayback}
          >
            <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
            <span>{isPlaying ? "Pause" : "Play"}</span>
          </button>
          {playbackError && (
            <p className="demo-player__error" role="status">
              This clip could not start. Please try again.
            </p>
          )}
        </div>
      ) : (
        <img
          className="demo-card__poster"
          src={demo.poster}
          alt={`${placeholderAltPrefix} ${demo.title}`}
          width="1120"
          height="720"
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="demo-card__copy">
        {demo.status === "pending" && (
          <p className="demo-card__status">{pendingLabel}</p>
        )}
        <h3>{demo.title}</h3>
        <p>{demo.description}</p>
        <p id={`${demo.id}-caption`}>{demo.caption}</p>
      </div>
    </article>
  );
}
