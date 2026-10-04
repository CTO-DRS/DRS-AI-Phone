/**
 * UTF-8 decoding helper for Hermes.
 *
 * React Native's Hermes engine does not ship the `TextDecoder` global, so
 * this is a hand-rolled UTF-8 byte loop. Handles 1–4 byte sequences;
 * invalid continuation bytes emit U+FFFD (replacement character) rather
 * than throwing, matching the WHATWG decoder's "replacement" error mode.
 */
export declare function decodeUtf8(bytes: Uint8Array): string;
//# sourceMappingURL=utf8.d.ts.map
