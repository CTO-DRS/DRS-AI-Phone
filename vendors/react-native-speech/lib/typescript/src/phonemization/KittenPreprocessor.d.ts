/**
 * Kitten TextPreprocessor — 1-to-1 port of kittentts.preprocess (v0.8.1).
 *
 * Also exports chunkText + ensurePunctuation from kittentts.onnx_model.
 *
 * Pipeline order and defaults match upstream. The Kitten reference uses
 * `TextPreprocessor(remove_punctuation=False)`.
 */
export declare function numberToWords(input: number | string): string;
export declare function floatToWords(value: number | string, decimalSep?: string): string;
export declare function expandOrdinals(text: string): string;
export declare function expandPercentages(text: string): string;
export declare function expandCurrency(text: string): string;
export declare function expandTime(text: string): string;
export declare function expandRanges(text: string): string;
export declare function expandModelNames(text: string): string;
export declare function expandUnits(text: string): string;
export declare function expandRomanNumerals(text: string): string;
export declare function normalizeLeadingDecimals(text: string): string;
export declare function expandScientificNotation(text: string): string;
export declare function expandScaleSuffixes(text: string): string;
export declare function expandFractions(text: string): string;
export declare function expandDecades(text: string): string;
export declare function expandIpAddresses(text: string): string;
export declare function expandPhoneNumbers(text: string): string;
export declare function replaceNumbers(text: string, replaceFloats?: boolean): string;
export declare function toLowercase(text: string): string;
export declare function removeUrls(text: string, replacement?: string): string;
export declare function removeEmails(text: string, replacement?: string): string;
export declare function removeHtmlTags(text: string): string;
export declare function removeHashtags(text: string, replacement?: string): string;
export declare function removeMentions(text: string, replacement?: string): string;
export declare function removePunctuation(text: string): string;
export declare function removeExtraWhitespace(text: string): string;
export declare function normalizeUnicode(text: string, form?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD'): string;
export declare function removeAccents(text: string): string;
export declare function expandContractions(text: string): string;
export interface TextPreprocessorConfig {
    lowercase: boolean;
    replaceNumbers: boolean;
    replaceFloats: boolean;
    expandContractions: boolean;
    expandModelNames: boolean;
    expandOrdinals: boolean;
    expandPercentages: boolean;
    expandCurrency: boolean;
    expandTime: boolean;
    expandRanges: boolean;
    expandUnits: boolean;
    expandScaleSuffixes: boolean;
    expandScientificNotation: boolean;
    expandFractions: boolean;
    expandDecades: boolean;
    expandPhoneNumbers: boolean;
    expandIpAddresses: boolean;
    normalizeLeadingDecimals: boolean;
    expandRomanNumerals: boolean;
    removeUrls: boolean;
    removeEmails: boolean;
    removeHtml: boolean;
    removeHashtags: boolean;
    removeMentions: boolean;
    removePunctuation: boolean;
    normalizeUnicode: boolean;
    removeAccents: boolean;
    removeExtraWhitespace: boolean;
    splitCamelCase?: boolean;
}
export declare class TextPreprocessor {
    private readonly cfg;
    constructor(overrides?: Partial<TextPreprocessorConfig>);
    process(text: string): string;
}
export declare function ensurePunctuation(text: string): string;
export declare function chunkText(text: string, maxLen?: number): string[];
