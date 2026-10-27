// Track deleted files for stateful behavior in tests
const deletedFiles = new Set();
export const stat = jest.fn();
export const mkdir = jest.fn();
// SHA-256 hasher (utils.getSHA256Hash) — default digest is a stable 64-char
// placeholder; tests override per-file expectations when verification runs.
export const hash = jest.fn(() => Promise.resolve('a'.repeat(64)));
// Chunked read (utils/fileSha256.ts) — default empty; fileSha256 tests mock
// an in-memory filesystem.
export const read = jest.fn(() => Promise.resolve(''));
export const unlink = jest.fn().mockImplementation(path => {
  deletedFiles.add(path);
  console.log('deleting: ', path);
  return Promise.resolve();
});
export const exists = jest.fn().mockImplementation(path => {
  const fileExists = !deletedFiles.has(path);
  if (fileExists) {
    console.log(
      'checkFileExists: marking as downloaded - this should not happen:',
      path.split('/').pop()?.replace('.gguf', ''),
    );
  }
  return Promise.resolve(fileExists);
});
export const stopDownload = jest.fn();
export const readFile = jest.fn(path => {
  if (path.includes('session-metadata.json')) {
    // Return valid session metadata JSON
    return Promise.resolve(
      JSON.stringify([
        {
          id: '1',
          title: 'Test Session',
          date: '2024-01-01T00:00:00Z',
          messages: [],
        },
      ]),
    );
  }

  // Handle other required file.
  return Promise.resolve('Some default content');
});
export const writeFile = jest.fn(() => {
  return Promise.resolve();
});
export const downloadFile = jest.fn();
// Make DocumentDirectoryPath configurable for tests
let documentDirectoryPath = '/path/to/documents';
export const DocumentDirectoryPath = documentDirectoryPath;
export const LibraryDirectoryPath = '/path/to/library';
export const MainBundlePath = '/path/to/bundle';

// Allow tests to override the path
export const __setDocumentDirectoryPath = path => {
  documentDirectoryPath = path;
  // Update the exported constant
  Object.defineProperty(exports, 'DocumentDirectoryPath', {
    value: path,
    writable: true,
    configurable: true,
  });
};
export const copyFile = jest.fn().mockResolvedValue(true);

/**
 * Configure stat/hash/exists so `verifyTtsFile` passes for the given TTS
 * file descriptors (AI-01 tests). `extraExists` lists path suffixes that
 * should also report as existing (e.g. a legacy FP16 `model.onnx`).
 */
export const __satisfyIntegrity = (descriptors, extraExists = []) => {
  exists.mockImplementation(path =>
    Promise.resolve(
      descriptors.some(d => path.endsWith(d.name)) ||
        extraExists.some(suffix => path.endsWith(suffix)),
    ),
  );
  stat.mockImplementation(path => {
    const d = descriptors.find(x => path.endsWith(x.name));
    return Promise.resolve({size: d?.bytes ?? 1234});
  });
  hash.mockImplementation(path => {
    const d = descriptors.find(x => path.endsWith(x.name));
    return Promise.resolve(d?.sha256 ?? 'b'.repeat(64));
  });
};

// Expose method to reset state for tests
export const __resetMockState = () => {
  deletedFiles.clear();
  // Restore the stateful default implementations: tests that override
  // them with mockResolvedValue(...) otherwise leak the override into
  // every later test in the file (jest.clearAllMocks only clears call
  // history, not implementations).
  exists.mockReset();
  exists.mockImplementation(path => Promise.resolve(!deletedFiles.has(path)));
  unlink.mockReset();
  unlink.mockImplementation(path => {
    deletedFiles.add(path);
    console.log('deleting: ', path);
    return Promise.resolve();
  });
  stat.mockReset();
  hash.mockReset();
  hash.mockImplementation(() => Promise.resolve('a'.repeat(64)));
  read.mockReset();
  read.mockImplementation(() => Promise.resolve(''));
};

// Add namespace export for compatibility
const RNFS = {
  mkdir,
  stat,
  unlink,
  exists,
  stopDownload,
  readFile,
  writeFile,
  downloadFile,
  DocumentDirectoryPath,
  LibraryDirectoryPath,
  MainBundlePath,
  copyFile,
  __resetMockState,
  __setDocumentDirectoryPath,
};

export {RNFS};
