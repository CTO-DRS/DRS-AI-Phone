import {
  computeChatStats,
  computeTopTopics,
  normalizeArabicWord,
} from '../chatStats';
import {MessageType} from '../types';

const user = (text: string, createdAt = 1700000000000): MessageType.Text =>
  ({
    id: Math.random().toString(36).slice(2),
    type: 'text',
    text,
    author: {id: 'user-1'},
    createdAt,
  }) as MessageType.Text;

const assistantTurn = (
  content: string,
  createdAt = 1700000000000,
): MessageType.AssistantTurn =>
  ({
    id: Math.random().toString(36).slice(2),
    type: 'assistant_turn',
    author: {id: 'assistant'},
    createdAt,
    // Real shape: visible text lives in `content`, reasoning in
    // `reasoningContent` (see AgentStep in utils/types.ts).
    steps: [{reasoningContent: 'hidden thoughts'} as any, {content} as any],
  }) as MessageType.AssistantTurn;

describe('chatStats', () => {
  describe('normalizeArabicWord', () => {
    it('strips tashkeel and unifies letter variants', () => {
      expect(normalizeArabicWord('مُحَمَّد')).toBe('محمد');
      expect(normalizeArabicWord('أحمد')).toBe('احمد');
      expect(normalizeArabicWord('مدرسة')).toBe('مدرسه');
      expect(normalizeArabicWord('علي')).toBe('علي');
    });
  });

  describe('computeTopTopics', () => {
    it('ranks repeated words and ignores stopwords', () => {
      const topics = computeTopTopics([
        'الذكاء الاصطناعي يغير العالم',
        'الذكاء الاصطناعي مفيد في العمل',
        'the quick brown fox',
      ]);
      const ai = topics.find(t => t.topic === 'الذكاء');
      expect(ai?.count).toBe(2);
      expect(topics.map(t => t.topic)).not.toContain('في');
      expect(topics.map(t => t.topic)).not.toContain('the');
    });

    it('drops single-occurrence words and numbers', () => {
      const topics = computeTopTopics(['كلمة نادرة جدا 2026 2026 2026']);
      expect(topics.map(t => t.topic)).not.toContain('نادرة');
      expect(topics).toEqual([]);
    });

    it('keeps only one entry per normalized form', () => {
      const topics = computeTopTopics(['الأطفال الأطفال الأطفال', 'الاطفال']);
      const found = topics.find(t => t.topic === 'الاطفال');
      expect(found?.count).toBe(4);
    });
  });

  describe('computeChatStats', () => {
    it('counts messages and words per role', () => {
      const stats = computeChatStats(
        [
          user('one two three'),
          assistantTurn('four five'),
          user('six seven eight nine'),
        ],
        'user-1',
      );
      expect(stats.totalMessages).toBe(3);
      expect(stats.userMessages).toBe(2);
      expect(stats.assistantMessages).toBe(1);
      expect(stats.totalWords).toBe(9);
      expect(stats.userWords).toBe(7);
      expect(stats.assistantWords).toBe(2);
    });

    it('excludes reasoning content from assistant turns', () => {
      const stats = computeChatStats(
        [assistantTurn('visible reply')],
        'user-1',
      );
      expect(stats.topTopics.map(t => t.topic)).not.toContain('thoughts');
      expect(stats.assistantWords).toBe(2);
    });

    it('tracks first/last activity timestamps', () => {
      const base = 1700000000000;
      const stats = computeChatStats(
        [user('hi', base), assistantTurn('hello', base + 5000)],
        'user-1',
      );
      expect(stats.firstActivity).toBe(new Date(base).toISOString());
      expect(stats.lastActivity).toBe(new Date(base + 5000).toISOString());
    });

    it('handles an empty message list', () => {
      const stats = computeChatStats([], 'user-1');
      expect(stats.totalMessages).toBe(0);
      expect(stats.topTopics).toEqual([]);
      expect(stats.firstActivity).toBeNull();
    });
  });
});
