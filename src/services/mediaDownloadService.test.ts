import { sanitizeFileName } from './mediaDownloadService';

describe('mediaDownloadService', () => {
  it('preserves a clean original name and adds the expected extension', () => {
    expect(sanitizeFileName('IMG_0001.JPG', 'image/jpeg', 'image')).toBe('IMG_0001.JPG');
  });

  it('falls back to a timestamped name when the original name is missing', () => {
    const name = sanitizeFileName('', 'application/pdf', 'document');
    expect(name).toMatch(/^vschat_document_\d+\.pdf$/);
  });
});
