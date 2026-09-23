import { describe, expect, it } from "vitest";
import { landing } from "./landing";

describe("landing content contract", () => {
  it("explains Marka as a self-hosted library beyond browser bookmarks", () => {
    expect(landing.hero.title).toBe("Everything you want to come back to.");
    expect(landing.hero.description).toMatch(/self-hosted, searchable home/i);
    expect(landing.hero.description).toMatch(/not just bookmarks/i);
  });

  it("covers the seven approved kinds of saved material", () => {
    expect(landing.sourceCards.map(({ id }) => id)).toEqual([
      "movies",
      "wishlist",
      "places",
      "career",
      "engineering",
      "ui-reference",
      "course-material",
    ]);
  });

  it("keeps all public media references local and pending recordings explicit", () => {
    const paths = [
      landing.preview.image,
      ...landing.sourceCards.map(({ image }) => image),
      ...landing.demos.desktop.flatMap(({ video, poster }) => [video, poster]),
      landing.demos.mobile.video,
      landing.demos.mobile.poster,
    ];

    expect(paths.every((path) => path.startsWith("/"))).toBe(true);
    expect(landing.preview.status).toBe("pending");
    expect(landing.preview.illustrationCaption).toMatch(
      /not product screen captures/i,
    );
    expect(
      landing.demos.desktop.every(({ status }) => status === "pending"),
    ).toBe(true);
    expect(landing.demos.mobile.status).toBe("pending");
  });

  it("provides three focused desktop demos and a separate mobile demo", () => {
    expect(landing.demos.desktop.map(({ id }) => id)).toEqual([
      "save-from-anywhere",
      "keep-the-context",
      "rediscover-it",
    ]);
    expect(landing.demos.mobile.id).toBe("mobile-library");
  });

  it("uses the approved primary and account destinations", () => {
    expect(landing.primaryCta).toEqual({
      label: "See Marka in action",
      href: "#demos",
    });
    expect(landing.secondaryCta.href).toBe("https://marka.abhipraya.dev/");
  });

  it("does not promise an operated cloud service or native app", () => {
    const publicCopy = JSON.stringify(landing).toLowerCase();

    expect(publicCopy).not.toMatch(
      /hosted cloud|native app|app store|ai-powered/,
    );
  });
});
