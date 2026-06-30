import {
  buildMediaDownloadUrl,
  buildMediaDownloadFileName,
  getMediaStorageDirectory,
} from '../src/utils/mediaDownload';

describe('media download helpers', () => {
  it('builds an R2 public download URL from the configured base and object key', () => {
    expect(
      buildMediaDownloadUrl(
        'https://pub-9e006aecccb34fa0af4dc9a24327c25f.r2.dev',
        'media/chat/2026/06/abc123.jpg',
      ),
    ).toBe('https://pub-9e006aecccb34fa0af4dc9a24327c25f.r2.dev/media/chat/2026/06/abc123.jpg');
  });

  it('uses a deterministic filename based on media id and preserves the extension', () => {
    expect(
      buildMediaDownloadFileName({
        mediaId: '6a2d001c4c0067e214f7bc46',
        objectKey: 'media/chat/2026/06/file.jpg',
      }),
    ).toBe('6a2d001c4c0067e214f7bc46.jpg');
  });

  it('falls back to message id when media id is missing', () => {
    expect(
      buildMediaDownloadFileName({
        messageId: 'msg-123',
        mimeType: 'application/pdf',
      }),
    ).toBe('msg-123.pdf');
  });

  it('maps media types to the expected local directory', () => {
    const dirs = {
      PictureDir: '/Pictures',
      MovieDir: '/Movies',
      DownloadDir: '/Downloads',
      DocumentDir: '/Documents',
      MusicDir: '/Music',
    };

    expect(getMediaStorageDirectory('image', dirs)).toBe('/Pictures');
    expect(getMediaStorageDirectory('video', dirs)).toBe('/Movies');
    expect(getMediaStorageDirectory('audio', dirs)).toBe('/Music');
    expect(getMediaStorageDirectory('document', dirs)).toBe('/Documents');
    expect(getMediaStorageDirectory('unknown', dirs)).toBe('/Downloads');
  });
});
