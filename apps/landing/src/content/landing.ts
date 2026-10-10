export type LocalAssetPath = `/${string}`;
export type AssetStatus = "pending" | "ready";

export interface LandingSourceCard {
  id: string;
  title: string;
  sourceLabel: string;
  description: string;
  image: LocalAssetPath;
  alt: string;
}

export interface LandingDemo {
  id: string;
  title: string;
  description: string;
  caption: string;
  video: LocalAssetPath;
  poster: LocalAssetPath;
  targetDuration: string;
  status: AssetStatus;
}

export interface LandingMobileDemo {
  id: string;
  title: string;
  description: string;
  video: LocalAssetPath;
  poster: LocalAssetPath;
  targetDuration: string;
  status: AssetStatus;
  illustrationAlt: string;
}

export const landing = {
  metadata: {
    title: "Marka | Everything you want to come back to",
    description:
      "A self-hosted personal library for links, places, articles, images, notes, and files worth revisiting.",
    socialImage: "/brand/marka/marka-social.png" as LocalAssetPath,
    socialImageAlt: "Marka, a home for the things you want to come back to",
  },
  navigation: {
    logoAlt: "Marka home",
    ariaLabel: "Main navigation",
    ctaLabel: "See Marka in action",
    ctaHref: "#demos",
  },
  hero: {
    eyebrow: "YOUR PERSONAL LIBRARY",
    title: "Everything you want to come back to.",
    description:
      "Not just bookmarks: a self-hosted, searchable home for your links, places, ideas, images, and files.",
    supportingNote:
      "Movie watchlists, places to go, useful reads, and course files can all live together.",
  },
  primaryCta: {
    label: "See Marka in action",
    href: "#demos",
  },
  secondaryCta: {
    label: "Create an account",
    href: "https://marka.abhipraya.dev/",
  },
  preview: {
    title: "A home for everything worth coming back to",
    image: "/marketing/previews/marka-desktop-library.webp" as LocalAssetPath,
    alt: "A full Marka library with saved items, previews, tags, and reading context",
    illustrationAlt:
      "Original illustrations of a movie watchlist, an e-commerce wishlist, and saved places",
    illustrationCaption:
      "Original illustrations of the kinds of content you can keep together in Marka, not product screen captures.",
    status: "pending" as AssetStatus,
    caption: "A sample of the things that can live together in Marka.",
  },
  sourceLibrary: {
    eyebrow: "A LIBRARY, NOT A LINK LIST",
    title: "Scattered saves, together again.",
    description:
      "A watchlist, a place for later, an article, a design detail or lecture slides. Marka keeps titles, previews and tags together, with readable content and summaries when available.",
    note: "These are examples of things people save, not live integrations or endorsements.",
    regionLabel: "From scattered saves to Marka",
  },
  sourceCards: [
    {
      id: "movies",
      title: "Movie watchlists",
      sourceLabel: "IMDb watchlist example",
      description: "Films to watch when the evening is right.",
      image: "/marketing/source-cards/movies.webp",
      alt: "Illustrated movie watchlist with a saved film and five items",
    },
    {
      id: "wishlist",
      title: "E-commerce wishlists",
      sourceLabel: "Tokopedia wishlist example",
      description: "Useful finds and things to compare later.",
      image: "/marketing/source-cards/wishlist.webp",
      alt: "Illustrated wishlist of home objects in three product cards",
    },
    {
      id: "places",
      title: "Places and stays",
      sourceLabel: "TikTok places and hotels example",
      description: "A stay or spot worth finding on a map again.",
      image: "/marketing/source-cards/places.webp",
      alt: "Illustrated saved destination with a map pin",
    },
    {
      id: "career",
      title: "Career tips",
      sourceLabel: "Instagram post example",
      description: "Advice that still helps after the feed moves on.",
      image: "/marketing/source-cards/career.webp",
      alt: "Illustrated career note with an invented quotation",
    },
    {
      id: "engineering",
      title: "Engineering articles",
      sourceLabel: "Technical reading example",
      description: "A useful explanation for the next deep dive.",
      image: "/marketing/source-cards/engineering.webp",
      alt: "Illustrated engineering article with a dark reading pane",
    },
    {
      id: "ui-reference",
      title: "UI references",
      sourceLabel: "Design reference example",
      description: "An interface detail worth keeping in view.",
      image: "/marketing/source-cards/ui-reference.webp",
      alt: "Illustrated interface wireframe with a highlighted layout detail",
    },
    {
      id: "course-material",
      title: "Course material",
      sourceLabel: "PDF and presentation example",
      description: "Lecture slides and files alongside saved links.",
      image: "/marketing/source-cards/course-material.webp",
      alt: "Illustrated course PDF and lecture slide",
    },
  ] satisfies LandingSourceCard[],
  demos: {
    eyebrow: "THREE QUICK LOOKS",
    title: "See how it fits into your day.",
    pendingLabel: "Recording pending review",
    placeholderAltPrefix: "Illustration placeholder for",
    desktop: [
      {
        id: "save-from-anywhere",
        title: "Save from anywhere",
        description: "Bring a useful link or file into your library.",
        caption: "One quick save gives it a place to come back to.",
        video: "/marketing/demos/save-from-anywhere.mp4",
        poster: "/marketing/posters/save-from-anywhere.webp",
        targetDuration: "8 to 18 seconds",
        status: "pending",
      },
      {
        id: "keep-the-context",
        title: "Keep the context",
        description: "See the preview, title, tags, and readable content.",
        caption: "The useful details stay close to what you saved.",
        video: "/marketing/demos/keep-the-context.mp4",
        poster: "/marketing/posters/keep-the-context.webp",
        targetDuration: "8 to 18 seconds",
        status: "pending",
      },
      {
        id: "rediscover-it",
        title: "Rediscover it",
        description: "Return to an item through browsing or search.",
        caption: "Find the thing you remembered saving.",
        video: "/marketing/demos/rediscover-it.mp4",
        poster: "/marketing/posters/rediscover-it.webp",
        targetDuration: "8 to 18 seconds",
        status: "pending",
      },
    ] satisfies LandingDemo[],
    mobile: {
      illustrationAlt:
        "Illustrative mobile library poster, not a Marka screen capture",
      id: "mobile-library",
      title: "Your library, wherever you are.",
      description:
        "Open the same personal library from a phone-sized view when you want to look something up.",
      video: "/marketing/demos/mobile-library.mp4" as LocalAssetPath,
      poster: "/marketing/posters/mobile-library.webp" as LocalAssetPath,
      targetDuration: "8 to 15 seconds",
      status: "pending" as AssetStatus,
    } satisfies LandingMobileDemo,
  },
  ownership: {
    eyebrow: "YOUR LIBRARY, YOUR SERVER",
    title: "Keep what matters within reach.",
    description:
      "Marka is self-hosted, so you choose where your personal library runs. Bring the things you want to revisit into one searchable place.",
  },
  footer: {
    navigationLabel: "Footer navigation",
    description:
      "A self-hosted personal library for things worth coming back to.",
    githubLabel: "Marka on GitHub",
    githubHref: "https://github.com/absolutepraya/marka",
    accountLabel: "Open Marka",
    accountHref: "https://marka.abhipraya.dev/",
    notice: "Examples show types of saved content, not live integrations.",
  },
} as const;
