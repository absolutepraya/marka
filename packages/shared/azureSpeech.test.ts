import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NO_COLOR = "false";
});

import {
  AzureSpeechTranscriptionClient,
  buildAzureSpeechDefinition,
  parseAzureSpeechResponse,
} from "./azureSpeech";

describe("Azure Speech transcription", () => {
  it("builds a multilingual MAI-Transcribe-2 definition by default", () => {
    expect(buildAzureSpeechDefinition({ model: "MAI-Transcribe-2" })).toEqual({
      enhancedMode: {
        enabled: true,
        model: "MAI-Transcribe-2",
        modelOptions: {
          transcribeStyle: "verbatim",
          timestamps: "none",
        },
      },
      profanityFilterMode: "None",
      diarization: { enabled: false },
    });
  });

  it("parses combined phrases and their detected locale", () => {
    expect(
      parseAzureSpeechResponse({
        locale: "id-ID",
        combinedPhrases: [{ text: "Halo dunia." }],
      }),
    ).toEqual({ text: "Halo dunia.", language: "id-ID" });
  });

  it("posts multipart audio and the explicit model definition", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("POST");
        const headers = init?.headers;
        expect(headers).toBeDefined();
        if (!headers) {
          throw new Error("Missing request headers");
        }
        expect(
          (headers as Record<string, string>)["Ocp-Apim-Subscription-Key"],
        ).toBe("test-key");

        const form = init?.body as FormData;
        const definition = form.get("definition");
        expect(definition).toBeInstanceOf(Blob);
        expect(JSON.parse(await (definition as Blob).text())).toMatchObject({
          enhancedMode: {
            enabled: true,
            model: "MAI-Transcribe-2",
          },
        });
        expect(form.get("audio")).toBeInstanceOf(File);

        return new Response(
          JSON.stringify({
            locale: "en-US",
            combinedPhrases: [{ text: "This is a test." }],
          }),
          { status: 200 },
        );
      },
    );

    const client = new AzureSpeechTranscriptionClient(
      {
        endpoint: "https://speech.example.com/",
        key: "test-key",
        model: "MAI-Transcribe-2",
        apiVersion: "2025-10-15",
      },
      fetchMock as typeof fetch,
    );

    await expect(
      client.transcribeAudio(Buffer.from("audio"), "chunk.mp3", "audio/mpeg"),
    ).resolves.toEqual({ text: "This is a test.", language: "en-US" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://speech.example.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces provider errors without exposing credentials", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "bad audio" } }), {
          status: 400,
        }),
    );
    const client = new AzureSpeechTranscriptionClient(
      {
        endpoint: "https://speech.example.com",
        key: "secret-key",
        model: "MAI-Transcribe-2",
        apiVersion: "2025-10-15",
      },
      fetchMock as typeof fetch,
    );

    await expect(
      client.transcribeAudio(Buffer.from("audio"), "chunk.mp3", "audio/mpeg"),
    ).rejects.toThrow(
      "Azure Speech transcription failed with HTTP 400: bad audio",
    );
  });
});
