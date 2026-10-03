/**
 * Unified Asset Loader for Neural TTS Engines
 *
 * Loads bundled assets (models, vocab, voices, etc.) from:
 * - Local file:// URLs (app bundle)
 * - Remote https:// URLs (HuggingFace, CDN)
 *
 * Uses React Native FS for local files and fetch for remote resources.
 */
/**
 * Load asset as JSON from local file or remote URL
 *
 * @param path - file:// or https:// URL
 * @returns Parsed JSON object
 * @throws Error if path scheme is unsupported or file not found
 */
export declare function loadAssetAsJSON<T = unknown>(path: string): Promise<T>;
/**
 * Load asset as text from local file or remote URL
 *
 * @param path - file:// or https:// URL
 * @returns File contents as string
 * @throws Error if path scheme is unsupported or file not found
 */
export declare function loadAssetAsText(path: string): Promise<string>;
/**
 * Load asset as ArrayBuffer from local file or remote URL
 *
 * @param path - file:// or https:// URL
 * @returns File contents as ArrayBuffer
 * @throws Error if path scheme is unsupported or file not found
 */
export declare function loadAssetAsArrayBuffer(path: string): Promise<ArrayBuffer>;
/**
 * Convert base64 string to ArrayBuffer
 */
export declare function base64ToArrayBuffer(base64: string): ArrayBuffer;
/**
 * Convert ArrayBuffer to base64 string
 */
export declare function arrayBufferToBase64(buffer: ArrayBuffer): string;
//# sourceMappingURL=AssetLoader.d.ts.map