/**
 * Character-level IPA Tokenizer for Kitten TTS
 *
 * Kitten uses a simple character-level tokenization where each valid
 * IPA character maps directly to a token ID. The sequence is wrapped
 * with '$' (token 0) at start and end — same boundary pattern as Kokoro.
 *
 * If no external vocab is provided, uses the built-in symbol table
 * from the Kitten TTS TextCleaner.
 */
export declare class IPATokenizer {
    private vocab;
    private reverseVocab;
    private validChars;
    private boundaryTokenId;
    private eosTokenId;
    private isInitialized;
    /**
     * Load vocabulary from a JSON mapping { char: id }
     */
    loadFromData(vocabData: Record<string, number>): Promise<void>;
    /**
     * Load the built-in Kitten symbol table (no external file needed)
     */
    loadBuiltinVocab(): void;
    /**
     * Encode phonemes into token IDs.
     *
     * Steps:
     * 1. Apply basic_english_tokenize regex (split into words/punct, rejoin with spaces)
     * 2. Remove characters not in vocab
     * 3. Map each character to its token ID
     * 4. Frame as: [pad=0, ...tokens..., eos=10, pad=0]
     *
     * Reference: KittenTTS onnx_model.py _prepare_inputs()
     */
    encode(text: string): number[];
    /**
     * Equivalent of Python's basic_english_tokenize: r"\w+|[^\w\s]"
     * Splits text into word tokens and single punctuation chars, then joins with spaces.
     *
     * Note: Python's \w matches Unicode letters (including IPA chars like ð, ɪ, ɑ),
     * but JS \w only matches [a-zA-Z0-9_]. We use \p{L} (Unicode Letter) to match
     * the Python behavior for IPA phoneme text.
     */
    private basicEnglishTokenize;
    /**
     * Decode token IDs back to text
     */
    decode(tokenIds: number[]): string;
    /**
     * Check if tokenizer is ready
     */
    isReady(): boolean;
    /**
     * Clear all tokenizer data and reset to uninitialized state.
     */
    clear(): void;
    /**
     * Normalize text by removing characters not in vocab.
     */
    private normalize;
}
//# sourceMappingURL=IPATokenizer.d.ts.map