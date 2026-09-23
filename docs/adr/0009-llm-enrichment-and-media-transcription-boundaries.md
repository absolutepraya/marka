# LLM enrichment and media transcription boundaries

Status: accepted

Marka uses LLM enrichment to produce a soft, reusable tag vocabulary and one two-paragraph canonical summary per bookmark. Existing canonical tags are preferred, new tags are created only for durable concepts that do not fit the vocabulary, human tags are never removed by re-tagging, and manually owned summaries are never overwritten. Summary language is independently selectable and defaults to the user's AI language preference, then the server-configured inference language (`INFERENCE_LANG`, default `english`).

YouTube caption ingestion continues to use `yt-dlp`, with no Cobalt dependency. Caption transcripts are preferred when available; Azure Speech Fast Transcription with MAI-Transcribe-2 is the only fallback for missing YouTube captions and the only transcription path for uploaded audio and video. Source transcripts and user-editable working transcripts remain separate, and the working transcript feeds the bookmark's single canonical summary. LLM OCR uses the configured vision model with Tesseract fallback. Semantic embeddings use the configured text embedding model, defaulting to `text-embedding-3-small`, and must be fully regenerated when the model or vector dimensions change.

## Considered options

- A strict curated-tag-only policy was rejected because the personal taxonomy should be able to grow when an important concept has no existing tag.
- Cobalt was rejected for transcript and video acquisition because Marka already has a `yt-dlp` worker that preserves caption artifacts and downloads link videos.
- A transcript-specific summary was rejected because the product already defines one canonical bookmark summary.
- Splitting embeddings across small and large models was rejected because vectors in one index must share a dimension and semantic space.
