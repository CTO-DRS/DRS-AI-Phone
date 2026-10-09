// jest/setup.ts globally replaces this module with the manual mock; unmock +
// requireActual keeps the assertions on the REAL implementation (same
// load-bearing pattern as pinned.test.ts).
//
// `mockTables` must be declared BEFORE jest.mock and keep the `mock` prefix —
// babel-jest only lets factories close over out-of-scope variables that start
// with "mock", and the facade reads rows through it at fetch time.
const mockTables: Record<string, any[]> = {
  chat_sessions: [],
  completion_settings: [],
};

jest.mock('../../database', () => ({
  database: {
    collections: {
      get: (table: string) => ({
        query: () => ({
          fetch: async () => mockTables[table] ?? [],
        }),
      }),
    },
  },
}));

jest.unmock('../ChatSessionRepository');

const {chatSessionRepository} = jest.requireActual('../ChatSessionRepository');

const makeSession = (id: string) => ({
  id,
  title: `Session ${id}`,
  date: new Date().toISOString(),
  activeAssistantId: undefined,
  settingsSource: 'assistant',
  pinned: false,
});

const makeSettingsRow = (sessionId: string, temperature: number) => ({
  sessionId,
  settings: JSON.stringify({temperature}),
  getSettings: () => ({temperature}),
});

describe('ChatSessionRepository.getAllSessionsWithSettings (v1.36.0)', () => {
  beforeEach(() => {
    mockTables.chat_sessions = [];
    mockTables.completion_settings = [];
  });

  it('joins sessions with their settings row in one pass', async () => {
    mockTables.chat_sessions = [makeSession('a'), makeSession('b')];
    mockTables.completion_settings = [
      makeSettingsRow('a', 0.7),
      makeSettingsRow('b', 0.2),
    ];

    const rows = await chatSessionRepository.getAllSessionsWithSettings();

    expect(rows).toHaveLength(2);
    expect(rows[0].session.id).toBe('a');
    expect(rows[0].completionSettings!.getSettings()).toEqual({
      temperature: 0.7,
    });
    expect(rows[1].session.id).toBe('b');
    expect(rows[1].completionSettings!.getSettings()).toEqual({
      temperature: 0.2,
    });
  });

  it('yields null settings for sessions without a settings row', async () => {
    mockTables.chat_sessions = [makeSession('orphan')];

    const rows = await chatSessionRepository.getAllSessionsWithSettings();

    expect(rows).toHaveLength(1);
    expect(rows[0].completionSettings).toBeNull();
  });

  it('first settings row wins on duplicates (mirrors per-session [0] pick)', async () => {
    mockTables.chat_sessions = [makeSession('dup')];
    mockTables.completion_settings = [
      makeSettingsRow('dup', 0.1),
      makeSettingsRow('dup', 0.9),
    ];

    const rows = await chatSessionRepository.getAllSessionsWithSettings();

    expect(rows[0].completionSettings!.getSettings()).toEqual({
      temperature: 0.1,
    });
  });

  it('returns an empty list on an empty database', async () => {
    const rows = await chatSessionRepository.getAllSessionsWithSettings();
    expect(rows).toEqual([]);
  });
});

// Module marker: without an import/export this file is treated as a global
// script and its `chatSessionRepository` const collides with pinned.test.ts.
export {};
