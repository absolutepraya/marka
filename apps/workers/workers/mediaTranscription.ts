import fs from "fs";
import os from "os";
import path from "path";
import { execa } from "execa";

import { readAsset } from "@karakeep/shared/assetdb";
import { AzureSpeechTranscriptionClient } from "@karakeep/shared/azureSpeech";
import type { TranscriptionClient } from "@karakeep/shared/azureSpeech";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import {
  getProxyAgent,
  resolveValidatedRedirectUrl,
  selectRunProxies,
} from "network";

const TRANSCRIPTION_TMP_FOLDER = path.join(os.tmpdir(), "marka-transcription");
const MAX_TRANSCRIPTION_CHUNKS = 512;

function maxTranscriptionDurationSeconds() {
  return MAX_TRANSCRIPTION_CHUNKS * serverConfig.transcription.chunkSeconds;
}

function safeUrlForLog(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

export interface MediaTranscriptionResult {
  text: string;
  language?: string;
}

function extensionForSource(
  fileName: string | null | undefined,
  contentType: string,
) {
  const extension = fileName ? path.extname(fileName) : "";
  if (extension) {
    return extension;
  }

  const typeExtension = contentType.split("/")[1]?.split(";")[0];
  return typeExtension ? `.${typeExtension}` : ".bin";
}

async function transcribeAudioChunks(
  inputPath: string,
  sourceName: string,
  abortSignal: AbortSignal,
  transcriptionClient: TranscriptionClient,
): Promise<MediaTranscriptionResult> {
  const chunkDirectory = await fs.promises.mkdtemp(
    path.join(TRANSCRIPTION_TMP_FOLDER, "chunks-"),
  );

  try {
    const durationResult = await execa(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ],
      { cancelSignal: abortSignal },
    );
    const durationSeconds = Number(durationResult.stdout.trim());
    const maxDurationSeconds = maxTranscriptionDurationSeconds();
    if (!Number.isFinite(durationSeconds)) {
      throw new Error(`Could not determine the duration of ${sourceName}`);
    }
    if (durationSeconds > maxDurationSeconds) {
      throw new Error(
        `Media ${sourceName} is too long to transcribe; maximum duration is ${maxDurationSeconds} seconds`,
      );
    }

    const outputTemplate = path.join(chunkDirectory, "chunk-%05d.mp3");
    await execa(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "segment",
        "-segment_time",
        String(serverConfig.transcription.chunkSeconds),
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        outputTemplate,
      ],
      { cancelSignal: abortSignal },
    );

    const chunkFiles = (await fs.promises.readdir(chunkDirectory))
      .filter((fileName) => fileName.endsWith(".mp3"))
      .sort();

    if (chunkFiles.length === 0) {
      throw new Error(`ffmpeg produced no audio chunks for ${sourceName}`);
    }
    if (chunkFiles.length > MAX_TRANSCRIPTION_CHUNKS) {
      throw new Error(
        `Media ${sourceName} produced too many transcription chunks; maximum is ${MAX_TRANSCRIPTION_CHUNKS}`,
      );
    }

    const transcripts: string[] = [];
    let language: string | undefined;
    for (const chunkFile of chunkFiles) {
      abortSignal.throwIfAborted();
      const chunkPath = path.join(chunkDirectory, chunkFile);
      const chunk = await fs.promises.readFile(chunkPath);
      const response = await transcriptionClient.transcribeAudio(
        chunk,
        chunkFile,
        "audio/mpeg",
        abortSignal,
      );
      const text = response.text.trim();
      if (text) {
        transcripts.push(text);
      }
      language ??= response.language;
    }

    const text = transcripts.join("\n\n").trim();
    if (!text) {
      throw new Error(
        `Transcription returned no readable text for ${sourceName}`,
      );
    }

    return { text, language };
  } finally {
    await fs.promises.rm(chunkDirectory, { recursive: true, force: true });
  }
}

function buildTranscriptionClient(): TranscriptionClient | null {
  return AzureSpeechTranscriptionClient.fromConfig();
}

async function transcribeBuffer(
  buffer: Buffer,
  fileName: string | null | undefined,
  contentType: string,
  abortSignal: AbortSignal,
): Promise<MediaTranscriptionResult> {
  const transcriptionClient = buildTranscriptionClient();
  if (!transcriptionClient) {
    throw new Error(
      "Audio transcription requires Azure Speech configured for MAI-Transcribe-2",
    );
  }

  await fs.promises.mkdir(TRANSCRIPTION_TMP_FOLDER, { recursive: true });
  const directory = await fs.promises.mkdtemp(
    path.join(TRANSCRIPTION_TMP_FOLDER, "source-"),
  );
  const sourceName =
    fileName || `source${extensionForSource(fileName, contentType)}`;
  const inputPath = path.join(
    directory,
    `input${extensionForSource(sourceName, contentType)}`,
  );

  try {
    await fs.promises.writeFile(inputPath, buffer);
    return await transcribeAudioChunks(
      inputPath,
      sourceName,
      abortSignal,
      transcriptionClient,
    );
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

export async function transcribeAsset(params: {
  userId: string;
  assetId: string;
  fileName?: string | null;
  contentType?: string | null;
  abortSignal: AbortSignal;
}): Promise<MediaTranscriptionResult> {
  const { asset, metadata } = await readAsset({
    userId: params.userId,
    assetId: params.assetId,
  });
  const contentType = params.contentType ?? metadata.contentType;
  if (!contentType) {
    throw new Error(`Asset ${params.assetId} has no content type`);
  }

  return transcribeBuffer(
    asset,
    params.fileName ?? metadata.fileName,
    contentType,
    params.abortSignal,
  );
}

export async function transcribeRemoteUrl(
  url: string,
  abortSignal: AbortSignal,
): Promise<MediaTranscriptionResult> {
  const transcriptionClient = buildTranscriptionClient();
  if (!transcriptionClient) {
    throw new Error(
      "Audio transcription requires Azure Speech configured for MAI-Transcribe-2",
    );
  }

  const runProxy = selectRunProxies();
  const resolvedUrl = await resolveValidatedRedirectUrl(
    url,
    { signal: abortSignal },
    runProxy,
  );
  const proxy = getProxyAgent(resolvedUrl.toString(), runProxy);

  await fs.promises.mkdir(TRANSCRIPTION_TMP_FOLDER, { recursive: true });
  const directory = await fs.promises.mkdtemp(
    path.join(TRANSCRIPTION_TMP_FOLDER, "remote-"),
  );
  const outputTemplate = path.join(directory, "source.%(ext)s");

  try {
    await execa(
      "yt-dlp",
      [
        ...serverConfig.crawler.ytDlpArguments,
        ...(serverConfig.crawler.maxVideoDownloadSize > 0
          ? ["--max-filesize", `${serverConfig.crawler.maxVideoDownloadSize}M`]
          : []),
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "64K",
        "--no-playlist",
        "--match-filter",
        `duration <= ${maxTranscriptionDurationSeconds()}`,
        "--output",
        outputTemplate,
        ...(proxy ? ["--proxy", proxy.proxy.toString()] : []),
        resolvedUrl.toString(),
      ],
      { cancelSignal: abortSignal },
    );

    const sourceFile = (await fs.promises.readdir(directory))
      .filter(
        (fileName) =>
          fileName.startsWith("source.") && !fileName.endsWith(".part"),
      )
      .sort()[0];
    if (!sourceFile) {
      throw new Error("yt-dlp produced no audio file for transcription");
    }
    if (serverConfig.crawler.maxVideoDownloadSize > 0) {
      const sourceStats = await fs.promises.stat(
        path.join(directory, sourceFile),
      );
      const maxBytes = serverConfig.crawler.maxVideoDownloadSize * 1024 * 1024;
      if (sourceStats.size > maxBytes) {
        throw new Error(
          `Downloaded media exceeds the ${serverConfig.crawler.maxVideoDownloadSize} MB transcription limit`,
        );
      }
    }

    logger.debug(
      `[transcription] Downloaded remote media for ${safeUrlForLog(url)}`,
    );
    return await transcribeAudioChunks(
      path.join(directory, sourceFile),
      sourceFile,
      abortSignal,
      transcriptionClient,
    );
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}
