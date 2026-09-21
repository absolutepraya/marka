import serverConfig from "./config";

export interface TranscriptionResponse {
  text: string;
  language?: string;
}

export interface TranscriptionClient {
  transcribeAudio(
    audio: Buffer,
    fileName: string,
    contentType: string,
    abortSignal?: AbortSignal,
  ): Promise<TranscriptionResponse>;
}

export interface AzureSpeechTranscriptionConfig {
  endpoint: string;
  key: string;
  model: string;
  apiVersion: string;
  locales?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function textFromItem(value: unknown): string | null {
  const item = asRecord(value);
  return typeof item?.text === "string" && item.text.trim()
    ? item.text.trim()
    : null;
}

function textsFromField(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return Array.isArray(value)
    ? value.map(textFromItem).filter((text): text is string => text !== null)
    : [];
}

function languageFromResponse(
  response: Record<string, unknown>,
  phrases: unknown[],
) {
  for (const key of ["locale", "language", "detectedLanguage"]) {
    if (typeof response[key] === "string" && response[key]) {
      return response[key];
    }
  }

  for (const phrase of phrases) {
    const phraseRecord = asRecord(phrase);
    if (typeof phraseRecord?.locale === "string" && phraseRecord.locale) {
      return phraseRecord.locale;
    }
  }

  return undefined;
}

export function parseAzureSpeechResponse(
  response: unknown,
): TranscriptionResponse {
  const record = asRecord(response);
  if (!record) {
    throw new Error("Azure Speech returned an invalid response");
  }

  const combinedPhrases = textsFromField(record, "combinedPhrases");
  const phrases = textsFromField(record, "phrases");
  const directText =
    typeof record.text === "string" ? record.text.trim() : undefined;
  const text = (
    combinedPhrases.join(" ") ||
    phrases.join(" ") ||
    directText
  )?.trim();

  if (!text) {
    throw new Error("Azure Speech returned no readable transcript text");
  }

  const rawPhrases = Array.isArray(record.phrases) ? record.phrases : [];
  return {
    text,
    language: languageFromResponse(record, rawPhrases),
  };
}

export function buildAzureSpeechDefinition(
  config: Pick<AzureSpeechTranscriptionConfig, "model" | "locales">,
) {
  return {
    ...(config.locales && config.locales.length > 0
      ? { locales: config.locales }
      : {}),
    enhancedMode: {
      enabled: true,
      model: config.model,
      modelOptions: {
        transcribeStyle: "verbatim",
        timestamps: "none",
      },
    },
    profanityFilterMode: "None",
    diarization: {
      enabled: false,
    },
  };
}

function errorMessage(response: unknown) {
  const record = asRecord(response);
  const nestedError = asRecord(record?.error);
  for (const candidate of [
    nestedError?.message,
    record?.message,
    nestedError?.code,
    record?.code,
  ]) {
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
  }
  return undefined;
}

export class AzureSpeechTranscriptionClient implements TranscriptionClient {
  constructor(
    private readonly config: AzureSpeechTranscriptionConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  static fromConfig() {
    const config = serverConfig.transcription.azureSpeech;
    if (!config.endpoint || !config.key) {
      return null;
    }

    return new AzureSpeechTranscriptionClient({
      endpoint: config.endpoint,
      key: config.key,
      model: config.model,
      apiVersion: config.apiVersion,
      locales: config.locales,
    });
  }

  async transcribeAudio(
    audio: Buffer,
    fileName: string,
    contentType: string,
    abortSignal?: AbortSignal,
  ): Promise<TranscriptionResponse> {
    const form = new FormData();
    const audioBuffer = new ArrayBuffer(audio.byteLength);
    new Uint8Array(audioBuffer).set(audio);
    form.append(
      "audio",
      new Blob([audioBuffer], { type: contentType }),
      fileName,
    );
    form.append(
      "definition",
      new Blob([JSON.stringify(buildAzureSpeechDefinition(this.config))], {
        type: "application/json",
      }),
    );

    const timeoutSignal = AbortSignal.timeout(
      serverConfig.inference.fetchTimeoutSec * 1000,
    );
    const signal = abortSignal
      ? AbortSignal.any([abortSignal, timeoutSignal])
      : timeoutSignal;
    const endpoint = this.config.endpoint.replace(/\/+$/, "");
    const url = `${endpoint}/speechtotext/transcriptions:transcribe?api-version=${encodeURIComponent(this.config.apiVersion)}`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.config.key,
      },
      body: form,
      signal,
    });
    const body = await response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      const detail = errorMessage(parsed);
      throw new Error(
        `Azure Speech transcription failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }

    return parseAzureSpeechResponse(parsed);
  }
}
