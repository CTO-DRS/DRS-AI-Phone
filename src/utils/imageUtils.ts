import * as RNFS from '@dr.pogodin/react-native-fs';
import {logger} from '../utils/logger';

/**
 * Utility functions for downloading and managing assistant thumbnail images
 */

const ASSISTANT_IMAGES_DIR = `${RNFS.DocumentDirectoryPath}/assistant-images`;

/**
 * Check if a thumbnail URL is a local filename (not a remote URL)
 */
export const isLocalThumbnailPath = (thumbnailUrl: string): boolean => {
  return (
    !thumbnailUrl.startsWith('http://') && !thumbnailUrl.startsWith('https://')
  );
};

/**
 * Check if a thumbnail URL is a remote HTTP/HTTPS URL
 */
export const isRemoteThumbnailUrl = (thumbnailUrl: string): boolean => {
  return (
    thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://')
  );
};

/**
 * Convert a thumbnail filename to a full file:// URI for React Native Image component
 * @param filename - Filename like "assistantId_thumbnail.jpg"
 * @returns Full file:// URI like "file:///path/to/documents/assistant-images/assistantId_thumbnail.jpg"
 */
export const getFullThumbnailUri = (filename: string): string => {
  if (isRemoteThumbnailUrl(filename)) {
    return filename; // Return remote URLs as-is
  }

  // Convert filename to full file:// URI
  const fullPath = `${ASSISTANT_IMAGES_DIR}/${filename}`;
  return `file://${fullPath}`;
};

/**
 * Get the absolute file system path from a thumbnail filename (for file operations)
 * @param filename - Filename like "assistantId_thumbnail.jpg"
 * @returns Absolute file system path
 */
export const getAbsoluteThumbnailPath = (filename: string): string => {
  return `${ASSISTANT_IMAGES_DIR}/${filename}`;
};

/**
 * Ensure the assistant images directory exists
 */
const ensureAssistantImagesDirectory = async (): Promise<void> => {
  try {
    const exists = await RNFS.exists(ASSISTANT_IMAGES_DIR);
    if (!exists) {
      await RNFS.mkdir(ASSISTANT_IMAGES_DIR);
      logger.debug('Created assistant images directory:', ASSISTANT_IMAGES_DIR);
    }
  } catch (error) {
    console.error('Failed to create assistant images directory:', error);
    throw error;
  }
};

/**
 * Extract file extension from URL, default to jpg if not found
 */
const getFileExtension = (url: string): string => {
  const urlParts = url.split('.');
  return urlParts.length > 1 ? urlParts.pop()?.split('?')[0] || 'jpg' : 'jpg';
};

/**
 * Generate thumbnail filename for a assistant
 */
const generateThumbnailFilename = (
  assistantId: string,
  originalUrl: string,
): string => {
  const extension = getFileExtension(originalUrl);
  return `${assistantId}_thumbnail.${extension}`;
};

/**
 * Generate the absolute file path for a assistant thumbnail (for file operations)
 */
const getAbsoluteThumbnailPathForAssistant = (
  assistantId: string,
  originalUrl: string,
): string => {
  const filename = generateThumbnailFilename(assistantId, originalUrl);
  return `${ASSISTANT_IMAGES_DIR}/${filename}`;
};

/**
 * Download a thumbnail image from a URL and save it locally
 * @param assistantId - The ID of the assistant
 * @param imageUrl - The remote URL of the image
 * @returns Promise<string> - The filename of the downloaded image (for storage)
 */
export const downloadAssistantThumbnail = async (
  assistantId: string,
  imageUrl: string,
): Promise<string> => {
  try {
    // Ensure directory exists
    await ensureAssistantImagesDirectory();

    // Generate filename and absolute path
    const filename = generateThumbnailFilename(assistantId, imageUrl);
    const absolutePath = getAbsoluteThumbnailPathForAssistant(
      assistantId,
      imageUrl,
    );

    // Check if file already exists
    const exists = await RNFS.exists(absolutePath);
    if (exists) {
      logger.debug('Thumbnail already exists locally:', absolutePath);
      return filename; // Return filename for storage
    }

    logger.debug('Downloading thumbnail:', imageUrl, 'to:', absolutePath);

    // Download the image
    const downloadResult = await RNFS.downloadFile({
      fromUrl: imageUrl,
      toFile: absolutePath,
      background: false,
      discretionary: false,
      progressInterval: 1000,
    }).promise;

    if (downloadResult.statusCode === 200) {
      logger.debug('Successfully downloaded thumbnail:', absolutePath);
      return filename; // Return filename for storage
    } else {
      throw new Error(
        `Download failed with status: ${downloadResult.statusCode}`,
      );
    }
  } catch (error) {
    console.error('Failed to download assistant thumbnail:', error);
    throw error;
  }
};

/**
 * Delete a local thumbnail image
 * @param filename - The thumbnail filename like "assistantId_thumbnail.jpg"
 */
export const deleteAssistantThumbnail = async (
  filename: string,
): Promise<void> => {
  try {
    // Convert to absolute path for file operations
    const absolutePath = getAbsoluteThumbnailPath(filename);

    const exists = await RNFS.exists(absolutePath);
    if (exists) {
      await RNFS.unlink(absolutePath);
      logger.debug('Deleted local thumbnail:', absolutePath);
    }
  } catch (error) {
    console.error('Failed to delete local thumbnail:', error);
    // Don't throw error for cleanup operations
  }
};

/**
 * Check if a local thumbnail exists
 * @param filename - The thumbnail filename like "assistantId_thumbnail.jpg"
 * @returns Promise<boolean> - Whether the file exists
 */
export const localThumbnailExists = async (
  filename: string,
): Promise<boolean> => {
  try {
    // Convert to absolute path for file operations
    const absolutePath = getAbsoluteThumbnailPath(filename);
    return await RNFS.exists(absolutePath);
  } catch (error) {
    console.error('Failed to check if local thumbnail exists:', error);
    return false;
  }
};

/**
 * Get the local thumbnail filename for a assistant if it exists
 * @param assistantId - The ID of the assistant
 * @param originalUrl - The original remote URL (used to determine file extension)
 * @returns Promise<string | null> - The filename if it exists, null otherwise
 */
export const getLocalThumbnailPath = async (
  assistantId: string,
  originalUrl: string,
): Promise<string | null> => {
  try {
    const filename = generateThumbnailFilename(assistantId, originalUrl);
    const exists = await localThumbnailExists(filename);
    return exists ? filename : null;
  } catch (error) {
    console.error('Failed to get local thumbnail path:', error);
    return null;
  }
};

/**
 * Clean up all orphaned thumbnail images (images without corresponding assistants)
 * @param activeAssistantIds - Array of currently active assistant IDs
 */
export const cleanupOrphanedThumbnails = async (
  activeAssistantIds: string[],
): Promise<void> => {
  try {
    const exists = await RNFS.exists(ASSISTANT_IMAGES_DIR);
    if (!exists) {
      return;
    }

    const files = await RNFS.readDir(ASSISTANT_IMAGES_DIR);
    const activeIdSet = new Set(activeAssistantIds);

    for (const file of files) {
      if (file.isFile() && file.name.includes('_thumbnail.')) {
        // Extract assistant ID from filename (format: assistantId_thumbnail.ext)
        const assistantId = file.name.split('_thumbnail.')[0];

        if (!activeIdSet.has(assistantId)) {
          logger.debug('Cleaning up orphaned thumbnail:', file.path);
          await RNFS.unlink(file.path);
        }
      }
    }
  } catch (error) {
    console.error('Failed to cleanup orphaned thumbnails:', error);
    // Don't throw error for cleanup operations
  }
};
