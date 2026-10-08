jest.unmock('../ChatSessionStore');

import {chatSessionStore} from '../ChatSessionStore';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';

import {defaultCompletionSettings} from '../ChatSessionStore';
import {SessionMetaData} from '../ChatSessionStore';

// Make the repository methods mockable
jest.spyOn(chatSessionRepository, 'setSessionFolder');
jest.spyOn(chatSessionRepository, 'setSessionTags');
jest.spyOn(chatSessionRepository, 'renameFolder');
jest.spyOn(chatSessionRepository, 'deleteFolder');
jest.spyOn(chatSessionRepository, 'removeTagEverywhere');

const makeSession = (overrides: Partial<SessionMetaData>): SessionMetaData => ({
  id: overrides.id ?? Math.random().toString(36).slice(2),
  title: 'Session',
  date: new Date().toISOString(),
  messages: [],
  completionSettings: defaultCompletionSettings,
  settingsSource: 'assistant',
  ...overrides,
});

describe('chatSessionStore — folders & tags organization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionStore.sessions = [];
    chatSessionStore.activeFolderFilter = null;
    chatSessionStore.activeTagFilter = null;
  });

  describe('folders/tags getters', () => {
    it('returns distinct folders with counts, sorted', () => {
      chatSessionStore.sessions = [
        makeSession({id: 'a', folder: 'Work'}),
        makeSession({id: 'b', folder: 'Work'}),
        makeSession({id: 'c', folder: 'Ideas'}),
        makeSession({id: 'd'}),
      ];
      expect(chatSessionStore.folders).toEqual([
        {name: 'Ideas', count: 1},
        {name: 'Work', count: 2},
      ]);
    });

    it('aggregates tags across sessions with counts', () => {
      chatSessionStore.sessions = [
        makeSession({id: 'a', tags: ['ai', 'news']}),
        makeSession({id: 'b', tags: ['ai']}),
        makeSession({id: 'c'}),
      ];
      expect(chatSessionStore.tags).toEqual([
        {name: 'ai', count: 2},
        {name: 'news', count: 1},
      ]);
    });
  });

  describe('filters', () => {
    it('filters groupedSessions by folder', () => {
      chatSessionStore.sessions = [
        makeSession({id: 'in', folder: 'Work'}),
        makeSession({id: 'out', folder: 'Ideas'}),
      ];
      chatSessionStore.setFolderFilter('Work');
      const groups = chatSessionStore.groupedSessions;
      const ids = Object.values(groups)
        .flat()
        .map(s => s.id);
      expect(ids).toEqual(['in']);
    });

    it('filters groupedSessions by tag', () => {
      chatSessionStore.sessions = [
        makeSession({id: 'tagged', tags: ['ai']}),
        makeSession({id: 'other', tags: ['news']}),
      ];
      chatSessionStore.setTagFilter('ai');
      const ids = Object.values(chatSessionStore.groupedSessions)
        .flat()
        .map(s => s.id);
      expect(ids).toEqual(['tagged']);
    });

    it('combines folder and tag filters', () => {
      chatSessionStore.sessions = [
        makeSession({id: 'both', folder: 'W', tags: ['ai']}),
        makeSession({id: 'folderOnly', folder: 'W'}),
      ];
      chatSessionStore.setFolderFilter('W');
      chatSessionStore.setTagFilter('ai');
      const ids = Object.values(chatSessionStore.groupedSessions)
        .flat()
        .map(s => s.id);
      expect(ids).toEqual(['both']);
    });

    it('clearOrganizationFilters resets both filters', () => {
      chatSessionStore.setFolderFilter('Work');
      chatSessionStore.setTagFilter('ai');
      expect(chatSessionStore.hasActiveFilters).toBe(true);
      chatSessionStore.clearOrganizationFilters();
      expect(chatSessionStore.hasActiveFilters).toBe(false);
    });

    it('pinned sessions inside a filter still land in the pinned group', () => {
      chatSessionStore.sessions = [
        makeSession({id: 'pinned', folder: 'Work', pinned: true}),
        makeSession({id: 'plain', folder: 'Work'}),
      ];
      chatSessionStore.setFolderFilter('Work');
      const groups = chatSessionStore.groupedSessions;
      const groupNames = Object.keys(groups);
      expect(groupNames.length).toBeGreaterThan(0);
      expect(
        Object.values(groups)
          .flat()
          .map(s => s.id),
      ).toEqual(expect.arrayContaining(['pinned', 'plain']));
    });
  });

  describe('setSessionFolder / setSessionTags', () => {
    it('persists and mirrors the folder assignment', async () => {
      chatSessionStore.sessions = [makeSession({id: 'a'})];
      await chatSessionStore.setSessionFolder('a', 'Work');
      expect(chatSessionRepository.setSessionFolder).toHaveBeenCalledWith(
        'a',
        'Work',
      );
      expect(chatSessionStore.sessions[0].folder).toBe('Work');
    });

    it('persists and mirrors tag updates', async () => {
      chatSessionStore.sessions = [makeSession({id: 'a'})];
      await chatSessionStore.setSessionTags('a', ['ai', ' work ', '']);
      expect(chatSessionRepository.setSessionTags).toHaveBeenCalledWith('a', [
        'ai',
        ' work ',
        '',
      ]);
      expect(chatSessionStore.sessions[0].tags).toEqual(['ai', ' work ', '']);
    });

    it('does not mutate local state when the repository throws', async () => {
      chatSessionStore.sessions = [makeSession({id: 'a'})];
      (
        chatSessionRepository.setSessionFolder as jest.Mock
      ).mockRejectedValueOnce(new Error('db down'));
      await chatSessionStore.setSessionFolder('a', 'Work');
      expect(chatSessionStore.sessions[0].folder).toBeUndefined();
    });
  });

  describe('bulk folder/tag operations', () => {
    it('renameFolder updates every session and the active filter', async () => {
      chatSessionStore.sessions = [
        makeSession({id: 'a', folder: 'Work'}),
        makeSession({id: 'b', folder: 'Other'}),
      ];
      chatSessionStore.setFolderFilter('Work');
      await chatSessionStore.renameFolder('Work', 'Career');
      expect(chatSessionRepository.renameFolder).toHaveBeenCalledWith(
        'Work',
        'Career',
      );
      expect(chatSessionStore.sessions[0].folder).toBe('Career');
      expect(chatSessionStore.activeFolderFilter).toBe('Career');
    });

    it('deleteFolder unfiles sessions and clears the filter', async () => {
      chatSessionStore.sessions = [makeSession({id: 'a', folder: 'Work'})];
      chatSessionStore.setFolderFilter('Work');
      await chatSessionStore.deleteFolder('Work');
      expect(chatSessionRepository.deleteFolder).toHaveBeenCalledWith('Work');
      expect(chatSessionStore.sessions[0].folder).toBeNull();
      expect(chatSessionStore.activeFolderFilter).toBeNull();
    });

    it('removeTagEverywhere strips the tag from all sessions', async () => {
      chatSessionStore.sessions = [
        makeSession({id: 'a', tags: ['ai', 'news']}),
        makeSession({id: 'b', tags: ['ai']}),
      ];
      chatSessionStore.setTagFilter('ai');
      await chatSessionStore.removeTagEverywhere('ai');
      expect(chatSessionRepository.removeTagEverywhere).toHaveBeenCalledWith(
        'ai',
      );
      expect(chatSessionStore.sessions[0].tags).toEqual(['news']);
      expect(chatSessionStore.sessions[1].tags).toEqual([]);
      expect(chatSessionStore.activeTagFilter).toBeNull();
    });
  });
});
