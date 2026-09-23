UPDATE bookmarkTranscripts
SET provider = 'azure-speech'
WHERE provider = 'azure-whisper';
--> statement-breakpoint
UPDATE bookmarkTranscripts
SET selectedTrackId = 'azure-speech'
WHERE selectedTrackId = 'azure-whisper';
