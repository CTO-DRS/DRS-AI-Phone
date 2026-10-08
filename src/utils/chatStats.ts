/**
 * Chat statistics: message/word counts and trending topics.
 *
 * Topics are computed with a pragmatic keyword-frequency approach over the
 * visible text of every turn: light Arabic normalisation (strip tashkeel,
 * unify alef/yeh/teh-marbuta), stopword filtering for Arabic and English,
 * then a frequency ranking. Good enough to surface "what have I been
 * chatting about" without any model inference.
 */

import type {MessageType} from './types';

export interface TopicCount {
  topic: string;
  count: number;
}

export interface ChatStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalWords: number;
  userWords: number;
  assistantWords: number;
  totalChars: number;
  topTopics: TopicCount[];
  firstActivity: string | null; // ISO date of the oldest message
  lastActivity: string | null; // ISO date of the newest message
}

export const TOPICS_LIMIT = 8;

/** Arabic diacritics + small normalization deltas. */
const TASHKEEL = /[\u064B-\u0652\u0670\u0653-\u0655]/g;

export const normalizeArabicWord = (word: string): string =>
  word
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');

// Common Arabic + English stopwords removed from topic ranking. Compared
// against the normalized form, so entries here are already normalized.
const STOPWORDS = new Set([
  // Arabic
  'في',
  'من',
  'علي',
  'عن',
  'الي',
  'هذا',
  'هذه',
  'ذلك',
  'تلك',
  'الذي',
  'التي',
  'الذين',
  'هو',
  'هي',
  'هم',
  'انا',
  'نحن',
  'انت',
  'انتم',
  'كان',
  'كانت',
  'يكون',
  'تكون',
  'ما',
  'لا',
  'لم',
  'لن',
  'ان',
  'قد',
  'كل',
  'بعض',
  'غير',
  'او',
  'أو',
  'و',
  'ثم',
  'حتي',
  'حتى',
  'اذا',
  'إذا',
  'كما',
  'عند',
  'عندما',
  'بعد',
  'قبل',
  'بين',
  'فوق',
  'تحت',
  'نعم',
  'حسنا',
  'شكرا',
  'مرحبا',
  'اهلا',
  'السلام',
  'عليكم',
  'يرجي',
  'ممكن',
  'كيف',
  'لماذا',
  'وين',
  'شو',
  'ايش',
  'هلا',
  'طيب',
  'يعني',
  'حالا',
  'دائما',
  'ابدا',
  'جدا',
  'فقط',
  'حول',
  'ضد',
  'نفس',
  'مثل',
  'مثلا',
  'ايضا',
  'أيضا',
  'له',
  'لها',
  'لهم',
  'به',
  'بها',
  'فيه',
  'فيها',
  'منه',
  'منها',
  'عليه',
  'عليها',
  'المستخدم',
  'المساعد',
  'سؤال',
  'جواب',
  'رساله',
  'رسالة',
  'الجواب',
  'السؤال',
  // English
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'your',
  'with',
  'that',
  'this',
  'have',
  'from',
  'was',
  'were',
  'been',
  'will',
  'would',
  'could',
  'should',
  'can',
  'into',
  'about',
  'out',
  'just',
  'also',
  'some',
  'any',
  'all',
  'more',
  'most',
  'other',
  'than',
  'then',
  'them',
  'they',
  'their',
  'there',
  'here',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'why',
  'how',
  'its',
  "it's",
  'our',
  'us',
  'we',
  'me',
  'my',
  'i',
  'he',
  'she',
  'his',
  'her',
  'one',
  'two',
  'get',
  'got',
  'has',
  'had',
  'did',
  'does',
  'do',
  'is',
  'it',
  'of',
  'on',
  'in',
  'to',
  'a',
  'an',
  'as',
  'at',
  'by',
  'or',
  'if',
  'so',
  'no',
  'yes',
  'okay',
  'thanks',
  'please',
  'hello',
  'hi',
  'hey',
  'very',
  'really',
  'like',
  'want',
  'need',
  'make',
  'made',
  'use',
  'using',
  'used',
  'see',
  'look',
  'know',
]);

const PUNCT = /[^\p{L}\p{N}_]+/u;

const countWords = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
};

/** Rank normalized keywords across the given texts. */
export const computeTopTopics = (
  texts: string[],
  limit: number = TOPICS_LIMIT,
): TopicCount[] => {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const words = text.toLowerCase().split(PUNCT).filter(Boolean);
    for (const raw of words) {
      const word = normalizeArabicWord(raw);
      const isArabic = /[\u0600-\u06FF]/.test(word);
      const minLength = isArabic ? 2 : 3;
      if (word.length < minLength || /^\d+$/.test(word)) {
        continue;
      }
      if (STOPWORDS.has(word)) {
        continue;
      }
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([topic, count]) => ({topic, count}))
    .filter(t => t.count > 1)
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, limit);
};

/**
 * Compute stats for a set of in-memory messages.
 * `userAuthorId` marks which author is "the user"; everything else counts
 * as an assistant turn. Reasoning/tool plumbing is excluded — only visible
 * content counts.
 */
export const computeChatStats = (
  messages: MessageType.Any[],
  userAuthorId: string,
): ChatStats => {
  let totalMessages = 0;
  let userMessages = 0;
  let assistantMessages = 0;
  let totalWords = 0;
  let userWords = 0;
  let assistantWords = 0;
  let totalChars = 0;
  let oldest: number | null = null;
  let newest: number | null = null;
  const texts: string[] = [];

  const pushText = (text: string, isUser: boolean, createdAt?: number) => {
    totalMessages += 1;
    totalWords += countWords(text);
    totalChars += text.length;
    if (isUser) {
      userMessages += 1;
      userWords += countWords(text);
    } else {
      assistantMessages += 1;
      assistantWords += countWords(text);
    }
    if (text.trim().length > 0) {
      texts.push(text);
    }
    if (createdAt != null) {
      oldest = oldest === null ? createdAt : Math.min(oldest, createdAt);
      newest = newest === null ? createdAt : Math.max(newest, createdAt);
    }
  };

  for (const message of messages) {
    if (message.type === 'text') {
      pushText(
        message.text ?? '',
        message.author?.id === userAuthorId,
        message.createdAt,
      );
    } else if (message.type === 'assistant_turn') {
      const stepContents = (message.steps ?? [])
        .map(step => ('content' in step && step.content ? step.content : ''))
        .filter(Boolean)
        .join('\n');
      pushText(stepContents, false, message.createdAt);
    } else if (message.type === 'image') {
      // image-only user turn
      totalMessages += 1;
      userMessages += 1;
    }
  }

  return {
    totalMessages,
    userMessages,
    assistantMessages,
    totalWords,
    userWords,
    assistantWords,
    totalChars,
    topTopics: computeTopTopics(texts),
    firstActivity: oldest !== null ? new Date(oldest).toISOString() : null,
    lastActivity: newest !== null ? new Date(newest).toISOString() : null,
  };
};
