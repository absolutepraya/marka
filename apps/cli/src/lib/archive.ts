// All archive members are checked before any restore writes. Keep export and
// restore bounds identical so a complete export is accepted by the reader.
export const MAX_ARCHIVE_MEMBER_BYTES = 256 * 1024 * 1024;
