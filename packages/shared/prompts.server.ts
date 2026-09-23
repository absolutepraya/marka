import type { Tiktoken } from "js-tiktoken";

import type { ZTagStyle } from "./types/users";
import { constructSummaryPrompt, constructTextTaggingPrompt } from "./prompts";

type EncodingName = "o200k_base" | "cl100k_base";

const encodings = new Map<EncodingName, Tiktoken>();

/**
 * Lazy load the encoding to avoid loading the tiktoken data into memory
 * until it's actually needed
 */
async function getEncodingInstance(
  encodingName: EncodingName = "o200k_base",
): Promise<Tiktoken> {
  const cached = encodings.get(encodingName);
  if (cached) {
    return cached;
  }

  // Dynamic import to lazy load the tiktoken module
  const { getEncoding } = await import("js-tiktoken");
  const loaded = getEncoding(encodingName);
  encodings.set(encodingName, loaded);
  return loaded;
}

async function calculateNumTokens(text: string): Promise<number> {
  const enc = await getEncodingInstance();
  return enc.encode(text).length;
}

export async function truncateTextToTokenBudget(
  content: string,
  length: number,
  encodingName: EncodingName = "o200k_base",
): Promise<string> {
  if (length <= 0) {
    return "";
  }
  const enc = await getEncodingInstance(encodingName);
  const tokens = enc.encode(content);
  if (tokens.length <= length) {
    return content;
  }
  const truncatedTokens = tokens.slice(0, length);
  return enc.decode(truncatedTokens);
}

/**
 * Remove duplicate whitespaces to avoid tokenization issues
 */
function preprocessContent(content: string) {
  return content.replace(/(\s){10,}/g, "$1");
}

export async function buildTextPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  contextLength: number,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  potentialRelevantTags?: string[],
): Promise<string> {
  content = preprocessContent(content);
  const promptTemplate = constructTextTaggingPrompt(
    lang,
    customPrompts,
    "",
    tagStyle,
    curatedTags,
    potentialRelevantTags,
  );
  const promptSize = await calculateNumTokens(promptTemplate);
  const available = Math.max(0, contextLength - promptSize);
  const truncatedContent =
    available === 0 ? "" : await truncateTextToTokenBudget(content, available);
  return constructTextTaggingPrompt(
    lang,
    customPrompts,
    truncatedContent,
    tagStyle,
    curatedTags,
    potentialRelevantTags,
  );
}

export async function buildSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  contextLength: number,
): Promise<string> {
  content = preprocessContent(content);
  const promptTemplate = constructSummaryPrompt(lang, customPrompts, "");
  const promptSize = await calculateNumTokens(promptTemplate);
  const available = Math.max(0, contextLength - promptSize);
  const truncatedContent =
    available === 0 ? "" : await truncateTextToTokenBudget(content, available);
  return constructSummaryPrompt(lang, customPrompts, truncatedContent);
}
