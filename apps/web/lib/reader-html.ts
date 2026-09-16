import DOMPurify from "dompurify";

const READER_ALLOWED_TAGS = [
  "a",
  "abbr",
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "del",
  "details",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const READER_ALLOWED_ATTR = [
  "alt",
  "aria-hidden",
  "aria-label",
  "class",
  "colspan",
  "height",
  "href",
  "id",
  "lang",
  "loading",
  "rel",
  "role",
  "rowspan",
  "scope",
  "src",
  "target",
  "title",
  "width",
];

const SAFE_URI_REGEXP =
  /^(?:(?:https?|mailto):|#|\/(?!\/)|\.{1,2}\/|[^:/?#]+(?:[/?#]|$))/i;

function isSafeUrl(value: string, kind: "href" | "src"): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (kind === "href" && trimmed.startsWith("#")) return true;
  if (!SAFE_URI_REGEXP.test(trimmed)) return false;

  try {
    const protocol = new URL(trimmed, "https://reader.invalid/").protocol;
    return kind === "href"
      ? protocol === "http:" || protocol === "https:" || protocol === "mailto:"
      : protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function resolveReaderUrl(
  value: string,
  baseUrl: string | undefined,
  kind: "href" | "src",
): string | null {
  const trimmed = value.trim();
  if (!isSafeUrl(trimmed, kind)) return null;
  if (!baseUrl || trimmed.startsWith("#")) return trimmed;

  try {
    const resolved = new URL(trimmed, baseUrl);
    return isSafeUrl(resolved.href, kind) ? resolved.href : null;
  } catch {
    return null;
  }
}

/**
 * Sanitizes cached HTML immediately before Reader View injects it into the DOM.
 * Relative resources are resolved against the original bookmark URL so they do
 * not accidentally resolve against the Marka application origin.
 */
export function sanitizeReaderHtml(html: string, baseUrl?: string): string {
  if (typeof window === "undefined") return html;

  const purified = DOMPurify(window).sanitize(html, {
    ALLOWED_ATTR: READER_ALLOWED_ATTR,
    ALLOWED_TAGS: READER_ALLOWED_TAGS,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["style", "srcdoc"],
    FORBID_TAGS: [
      "embed",
      "form",
      "iframe",
      "input",
      "link",
      "meta",
      "noscript",
      "object",
      "script",
      "select",
      "style",
      "svg",
      "template",
      "textarea",
      "video",
    ],
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
  });

  const template = document.createElement("template");
  template.innerHTML = purified;

  template.content
    .querySelectorAll<HTMLElement>("a[href], img[src]")
    .forEach((element) => {
      const kind = element.tagName === "IMG" ? "src" : "href";
      const attribute = element.getAttribute(kind);
      if (!attribute) return;

      const resolved = resolveReaderUrl(attribute, baseUrl, kind);
      if (!resolved) {
        element.removeAttribute(kind);
        return;
      }

      element.setAttribute(kind, resolved);
      if (kind === "href" && element.getAttribute("target") === "_blank") {
        element.setAttribute("rel", "noreferrer noopener");
      }
    });

  return template.innerHTML;
}
