/**
 * Text Chunker Utility for Neural TTS Engines
 *
 * Splits text into manageable chunks for sentence-level TTS processing.
 * Respects sentence boundaries to ensure natural speech output.
 *
 * Shared between Kokoro and Supertonic engines.
 */
/**
 * Represents a chunk of text with position information in the original text
 */
export interface TextChunk {
  /** The text content of the chunk */
  text: string;
  /** Start position in the original text */
  startIndex: number;
  /** End position in the original text */
  endIndex: number;
}
/**
 * Text chunking utility for splitting long text into manageable pieces
 */
export declare class TextChunker {
  /**
   * Split text into chunks by sentences, respecting max size.
   * Sentences are grouped together until the max chunk size is reached.
   *
   * The algorithm:
   * 1. Split on sentence-ending punctuation (. ! ?) followed by whitespace
   * 2. Group sentences into chunks that fit within maxChunkSize
   * 3. Return chunks with their original text positions for highlighting
   *
   * @example
   * const chunks = TextChunker.chunkBySentences("Hello world. How are you?", 100);
   * // Returns: [{ text: "Hello world. How are you?", startIndex: 0, endIndex: 25 }]
   *
   * @param text - Input text to split
   * @param maxChunkSize - Maximum characters per chunk (default: 400)
   * @returns Array of text chunks with position information
   */
  static chunkBySentences(text: string, maxChunkSize?: number): TextChunk[];
  /**
   * Split text into chunks with smarter sentence detection.
   * Avoids splitting on decimal numbers, abbreviations, etc.
   *
   * Uses a pattern that requires sentence-ending punctuation to be followed by:
   * - Whitespace and an uppercase letter (new sentence)
   * - End of string
   *
   * @param text - Input text to split
   * @param maxChunkSize - Maximum characters per chunk (default: 400)
   * @returns Array of text chunks with position information
   */
  static chunkBySentencesSmart(
    text: string,
    maxChunkSize?: number,
  ): TextChunk[];
  /**
   * Split text by paragraphs (double newlines), respecting max size.
   * Useful for processing long documents.
   *
   * @param text - Input text to split
   * @param maxChunkSize - Maximum characters per chunk
   * @returns Array of text chunks with position information
   */
  static chunkByParagraphs(text: string, maxChunkSize: number): TextChunk[];
}
//# sourceMappingURL=TextChunker.d.ts.map
