import {
  validateBackupPayload,
  describeBackupCounts,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
} from '../backupService';

const validRow = (id: string) => ({id, title: 'row', created_at: 1});

const validPayload = () => ({
  format: BACKUP_FORMAT,
  formatVersion: BACKUP_FORMAT_VERSION,
  createdAt: 1234,
  appVersion: '1.40.0',
  tables: {
    chat_sessions: [validRow('s1')],
    messages: [validRow('m1')],
    completion_settings: [],
    global_settings: [validRow('g1')],
    local_assistants: [validRow('a1')],
  },
});

describe('validateBackupPayload', () => {
  it('accepts a well-formed payload and keeps only valid rows', () => {
    const result = validateBackupPayload(validPayload());
    expect(result).not.toBeNull();
    expect(result!.tables.chat_sessions).toHaveLength(1);
    expect(result!.appVersion).toBe('1.40.0');
  });

  it('rejects non-objects and foreign formats', () => {
    expect(validateBackupPayload(null)).toBeNull();
    expect(validateBackupPayload('json')).toBeNull();
    expect(
      validateBackupPayload({...validPayload(), format: 'other-app'}),
    ).toBeNull();
  });

  it('rejects unknown or out-of-range format versions', () => {
    expect(
      validateBackupPayload({...validPayload(), formatVersion: 0}),
    ).toBeNull();
    expect(
      validateBackupPayload({
        ...validPayload(),
        formatVersion: BACKUP_FORMAT_VERSION + 1,
      }),
    ).toBeNull();
  });

  it('rejects missing tables map', () => {
    const payload = validPayload();
    delete (payload as {tables?: unknown}).tables;
    expect(validateBackupPayload(payload)).toBeNull();
  });

  it('drops rows without a string id but keeps the table', () => {
    const payload = validPayload();
    (payload.tables as Record<string, unknown[]>).messages = [
      {id: 'keep', title: 'ok'},
      {title: 'no-id'},
      null,
      'garbage',
      {id: 42},
    ];
    const result = validateBackupPayload(payload);
    expect(result!.tables.messages).toEqual([{id: 'keep', title: 'ok'}]);
  });

  it('treats missing tables as empty arrays', () => {
    const payload = validPayload();
    delete (payload.tables as Record<string, unknown>).local_assistants;
    const result = validateBackupPayload(payload);
    expect(result!.tables.local_assistants).toEqual([]);
  });

  it('covers the five v1 tables (chats + assistants + settings)', () => {
    expect(BACKUP_TABLES).toEqual([
      'chat_sessions',
      'messages',
      'completion_settings',
      'global_settings',
      'local_assistants',
    ]);
  });
});

describe('describeBackupCounts', () => {
  it('summarises human-facing counts', () => {
    const counts = describeBackupCounts(validPayload() as never);
    expect(counts).toEqual({
      chatSessions: 1,
      messages: 1,
      assistants: 1,
      settings: 1,
    });
  });
});
