import Share from 'react-native-share';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {Platform} from 'react-native';

// Mock the androidPermission module
jest.mock('../androidPermission', () => ({
  ensureLegacyStoragePermission: jest.fn().mockResolvedValue(true),
}));

import {exportChatSessionAsPdf} from '../exportUtils';

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Alert: {
    alert: jest.fn(),
  },
}));

jest.mock('react-native-share', () => ({
  open: jest.fn().mockResolvedValue({success: true}),
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(''),
  exists: jest.fn().mockResolvedValue(true),
  copyFile: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/mock/document/path',
  CachesDirectoryPath: '/mock/cache/path',
  DownloadDirectoryPath: '/mock/download/path',
}));

jest.mock('date-fns', () => ({
  format: jest.fn().mockReturnValue('2024-01-01_12-00-00'),
}));

// Avoid the heavyweight PDF build in tests: mock the builder to a tiny stub
// whose output we can recognize inside the written file.
jest.mock('../pdf/chatPdfBuilder', () => ({
  buildChatPdf: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])), // %PDF
}));

// Import the actual repository to spy on it (pattern from exportUtils.test.ts)
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';

jest.spyOn(chatSessionRepository, 'getSessionById');

describe('exportChatSessionAsPdf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
  });

  it('writes the PDF as base64 and shares it', async () => {
    (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue({
      session: {
        id: 's1',
        title: 'Test Chat',
        date: new Date().toISOString(),
      },
      messages: [
        {
          id: 'm1',
          author: 'user-1',
          text: 'hello',
          type: 'text',
          createdAt: 1700000000000,
          metadata: JSON.stringify({imageUris: ['file:///tmp/a.jpg']}),
          toMessageObject: () => ({
            type: 'text',
            text: 'hello',
            steps: [],
          }),
        },
      ],
      completionSettings: null,
    });

    await exportChatSessionAsPdf('s1');

    // PDF bytes written as base64 ("%PDF" → "JVBERg==")
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      '/mock/cache/path/chat_test_chat_2024-01-01_12-00-00.pdf',
      'JVBERg==',
      'base64',
    );
    expect(Share.open).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'file:///mock/cache/path/chat_test_chat_2024-01-01_12-00-00.pdf',
        type: 'application/pdf',
      }),
    );
  });

  it('throws for a missing session', async () => {
    (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(null);
    await expect(exportChatSessionAsPdf('missing')).rejects.toThrow(
      'Session not found',
    );
    expect(Share.open).not.toHaveBeenCalled();
  });
});
