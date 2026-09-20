import type { ZTagStyle } from "./types/users";
import {
  getCuratedTagsPrompt,
  getTagStylePrompt,
  getPotentialRelevantTagsPrompt,
} from "./utils/tag";

/**
 * Remove duplicate whitespaces to avoid tokenization issues
 */
function preprocessContent(content: string) {
  return content.replace(/(\s){10,}/g, "$1");
}

export function buildImagePrompt(
  lang: string,
  customPrompts: string[],
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  potentialRelevantTags?: string[],
) {
  const tagStyleInstruction = getTagStylePrompt(tagStyle);
  const curatedInstruction = getCuratedTagsPrompt(curatedTags);
  const potentialRelevantTagsInstruction = getPotentialRelevantTagsPrompt(
    potentialRelevantTags,
  );

  return `
You are an expert whose responsibility is to help with automatic text tagging for a read-it-later/bookmarking app.
Analyze the attached image and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Prefer existing candidate tags when they describe the same concept. Do not invent a synonym for an existing tag.
- Create a new tag only when it describes a durable, specific concept that is central to the image and no existing tag fits.
- Tags should help retrieve this bookmark later, not merely describe its format, source, mood, or generic existence.
- Do not emit tags such as "image", "photo", "screenshot", "article", "content", or "web" unless the concept is genuinely central to the subject.
- The tags must be in ${lang}.
- Aim for 5-10 tags, but return fewer when only fewer tags are useful.
- Return the most relevant tags first. Never emit duplicate tags or hashtag prefixes.
- If there are no good tags, don't emit any.
${curatedInstruction}
${potentialRelevantTagsInstruction}
${tagStyleInstruction}
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
You must respond in valid JSON with the key "tags" and the value is list of tags. Don't wrap the response in a markdown code.`;
}

/**
 * Construct tagging prompt for text content
 */
export function constructTextTaggingPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  potentialRelevantTags?: string[],
): string {
  const tagStyleInstruction = getTagStylePrompt(tagStyle);
  const curatedInstruction = getCuratedTagsPrompt(curatedTags);
  const potentialRelevantTagsInstruction = getPotentialRelevantTagsPrompt(
    potentialRelevantTags,
  );

  return `
You are an expert whose responsibility is to help with automatic tagging for a read-it-later/bookmarking app.
Analyze the TEXT_CONTENT below and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Prefer existing candidate tags when they describe the same concept. Do not invent a synonym for an existing tag.
- Create a new tag only when it describes a durable, specific concept that is central to the content and no existing tag fits.
- Tags should help retrieve this bookmark later, not merely describe its format, source, mood, or generic existence.
- Do not emit tags such as "article", "content", "web", "reading", or a publisher/domain unless the concept is genuinely central to the content.
- The tags must be in ${lang}.
- Do NOT generate tags related to:
    - An error page (404, 403, blocked, not found, dns errors)
    - Boilerplate content (cookie consent, login walls, GDPR notices)
- Aim for 3-6 tags, but return fewer when only fewer tags are useful.
- Return the most relevant tags first. Never emit duplicate tags or hashtag prefixes.
- If there are no good tags, leave the array empty.
${curatedInstruction}
${potentialRelevantTagsInstruction}
${tagStyleInstruction}
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}

<TEXT_CONTENT>
${content}
</TEXT_CONTENT>
You must respond in JSON with the key "tags" and the value is an array of string tags.`;
}

/**
 * Construct summary prompt
 */
export function constructSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return `
Summarize the following content responding ONLY with the summary. You MUST follow the following rules:
- Summary must contain exactly two paragraphs separated by one blank line.
- Each paragraph should contain two or three concise sentences.
- The first paragraph should explain the main idea and scope. The second should capture the most useful details, implications, or practical meaning.
- Do not include a title, headings, bullets, labels, markdown, or commentary.
- The summary must be in ${lang}.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
    ${content}`;
}

/**
 * Keep stored summaries in the two-paragraph shape requested by the prompt.
 * Models occasionally return extra paragraph breaks or a single paragraph,
 * so this performs a conservative cleanup without inventing content.
 */
export function normalizeSummary(summary: string): string {
  const paragraphs = summary
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (paragraphs.length >= 2) {
    return [paragraphs[0], paragraphs.slice(1).join(" ")].join("\n\n");
  }

  const onlyParagraph = paragraphs[0] ?? "";
  const sentences = onlyParagraph.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= 2) {
    const splitAt = Math.ceil(sentences.length / 2);
    return [
      sentences.slice(0, splitAt).join(" "),
      sentences.slice(splitAt).join(" "),
    ].join("\n\n");
  }

  const words = onlyParagraph.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const splitAt = Math.ceil(words.length / 2);
    return [
      words.slice(0, splitAt).join(" "),
      words.slice(splitAt).join(" "),
    ].join("\n\n");
  }

  return onlyParagraph;
}

/**
 * Build text tagging prompt without truncation (for previews/UI)
 */
export function buildTextPromptUntruncated(
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
): string {
  return constructTextTaggingPrompt(
    lang,
    customPrompts,
    preprocessContent(content),
    tagStyle,
    curatedTags,
  );
}

/**
 * Build summary prompt without truncation (for previews/UI)
 */
export function buildSummaryPromptUntruncated(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return constructSummaryPrompt(
    lang,
    customPrompts,
    preprocessContent(content),
  );
}

/**
 * Build OCR prompt for extracting text from images using LLM
 */
export function buildOCRPrompt(): string {
  return `You are an OCR (Optical Character Recognition) expert. Your task is to extract ALL text from this image.

Rules:
- Extract every piece of text visible in the image, including titles, body text, captions, labels, watermarks, and any other textual content.
- Preserve the original structure and formatting as much as possible (e.g., paragraphs, lists, headings).
- If text appears in multiple columns, read from left to right, top to bottom.
- If text is partially obscured or unclear, make your best attempt and indicate uncertainty with [unclear] if needed.
- Do not add any commentary, explanations, or descriptions of non-text elements.
- If there is no text in the image, respond with an empty string.
- Output ONLY the extracted text, nothing else.`;
}
