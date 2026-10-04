// Mock RNFS with our expected path first
const mockDocumentPath = '/mock/documents';
jest.mock('@dr.pogodin/react-native-fs', () => ({
  exists: jest.fn(),
  mkdir: jest.fn(),
  downloadFile: jest.fn(),
  unlink: jest.fn(),
  readDir: jest.fn(),
  DocumentDirectoryPath: '/mock/documents',
}));

import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  downloadAssistantThumbnail,
  deleteAssistantThumbnail,
  localThumbnailExists,
  getLocalThumbnailPath,
  cleanupOrphanedThumbnails,
} from '../imageUtils';

const mockRNFS = RNFS as jest.Mocked<typeof RNFS>;

describe('imageUtils', () => {
  const mockAssistantId = 'test-assistant-123';
  const mockImageUrl = 'https://example.com/image.jpg';
  const expectedLocalPath = `${mockDocumentPath}/pal-images/${mockAssistantId}_thumbnail.jpg`;
  const expectedFilename = `${mockAssistantId}_thumbnail.jpg`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('downloadAssistantThumbnail', () => {
    it('should create directory and download image successfully', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(false); // Directory doesn't exist
      mockRNFS.mkdir.mockResolvedValueOnce(undefined);
      mockRNFS.exists.mockResolvedValueOnce(false); // File doesn't exist
      mockRNFS.downloadFile.mockReturnValueOnce({
        jobId: 1,
        promise: Promise.resolve({statusCode: 200}),
      } as any);

      // Execute
      const result = await downloadAssistantThumbnail(
        mockAssistantId,
        mockImageUrl,
      );

      // Verify
      expect(mockRNFS.mkdir).toHaveBeenCalledWith(
        `${mockDocumentPath}/pal-images`,
      );
      expect(mockRNFS.downloadFile).toHaveBeenCalledWith({
        fromUrl: mockImageUrl,
        toFile: expectedLocalPath,
        background: false,
        discretionary: false,
        progressInterval: 1000,
      });
      expect(result).toBe(expectedFilename);
    });

    it('should return existing file path if image already exists', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(true); // Directory exists
      mockRNFS.exists.mockResolvedValueOnce(true); // File exists

      // Execute
      const result = await downloadAssistantThumbnail(
        mockAssistantId,
        mockImageUrl,
      );

      // Verify
      expect(mockRNFS.downloadFile).not.toHaveBeenCalled();
      expect(result).toBe(expectedFilename);
    });

    it('should throw error if download fails', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(true); // Directory exists
      mockRNFS.exists.mockResolvedValueOnce(false); // File doesn't exist
      mockRNFS.downloadFile.mockReturnValueOnce({
        jobId: 1,
        promise: Promise.resolve({statusCode: 404}),
      } as any);

      // Execute & Verify
      await expect(
        downloadAssistantThumbnail(mockAssistantId, mockImageUrl),
      ).rejects.toThrow('Download failed with status: 404');
    });
  });

  describe('deleteAssistantThumbnail', () => {
    it('should delete existing file', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(true);
      mockRNFS.unlink.mockResolvedValueOnce(undefined);

      // Execute
      await deleteAssistantThumbnail(expectedFilename);

      // Verify
      expect(mockRNFS.exists).toHaveBeenCalledWith(expectedLocalPath);
      expect(mockRNFS.unlink).toHaveBeenCalledWith(expectedLocalPath);
    });

    it('should not fail if file does not exist', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(false);

      // Execute
      await deleteAssistantThumbnail(expectedFilename);

      // Verify
      expect(mockRNFS.exists).toHaveBeenCalledWith(expectedLocalPath);
      expect(mockRNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('localThumbnailExists', () => {
    it('should return true if file exists', async () => {
      mockRNFS.exists.mockResolvedValueOnce(true);

      const result = await localThumbnailExists(expectedFilename);

      expect(result).toBe(true);
      expect(mockRNFS.exists).toHaveBeenCalledWith(expectedLocalPath);
    });

    it('should return false if file does not exist', async () => {
      mockRNFS.exists.mockResolvedValueOnce(false);

      const result = await localThumbnailExists(expectedFilename);

      expect(result).toBe(false);
    });
  });

  describe('getLocalThumbnailPath', () => {
    it('should return filename if file exists', async () => {
      mockRNFS.exists.mockResolvedValueOnce(true);

      const result = await getLocalThumbnailPath(mockAssistantId, mockImageUrl);

      expect(result).toBe(expectedFilename);
    });

    it('should return null if file does not exist', async () => {
      mockRNFS.exists.mockResolvedValueOnce(false);

      const result = await getLocalThumbnailPath(mockAssistantId, mockImageUrl);

      expect(result).toBe(null);
    });
  });

  describe('cleanupOrphanedThumbnails', () => {
    it('should remove thumbnails for inactive assistant IDs', async () => {
      const activeAssistantIds = ['assistant-1', 'assistant-2'];
      const mockFiles = [
        {
          name: 'assistant-1_thumbnail.jpg',
          path: '/path/assistant-1_thumbnail.jpg',
          isFile: () => true,
        },
        {
          name: 'assistant-2_thumbnail.png',
          path: '/path/assistant-2_thumbnail.png',
          isFile: () => true,
        },
        {
          name: 'assistant-3_thumbnail.jpg',
          path: '/path/assistant-3_thumbnail.jpg',
          isFile: () => true,
        }, // Orphaned
        {
          name: 'other-file.txt',
          path: '/path/other-file.txt',
          isFile: () => true,
        },
      ];

      mockRNFS.exists.mockResolvedValueOnce(true); // Directory exists
      mockRNFS.readDir.mockResolvedValueOnce(mockFiles as any);
      mockRNFS.unlink.mockResolvedValue(undefined);

      await cleanupOrphanedThumbnails(activeAssistantIds);

      // Should only delete the orphaned thumbnail
      expect(mockRNFS.unlink).toHaveBeenCalledTimes(1);
      expect(mockRNFS.unlink).toHaveBeenCalledWith(
        '/path/assistant-3_thumbnail.jpg',
      );
    });

    it('should handle missing directory gracefully', async () => {
      mockRNFS.exists.mockResolvedValueOnce(false); // Directory doesn't exist
      (mockRNFS as any).readDir = jest.fn();

      await cleanupOrphanedThumbnails(['assistant-1']);

      expect((mockRNFS as any).readDir).not.toHaveBeenCalled();
      expect(mockRNFS.unlink).not.toHaveBeenCalled();
    });
  });
});
