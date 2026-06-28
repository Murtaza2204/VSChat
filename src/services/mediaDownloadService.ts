import { NativeModules, Platform, PermissionsAndroid, TurboModuleRegistry } from 'react-native';
import RNFetchBlob from 'react-native-blob-util';

const LOG_PREFIX = '[mediaDownloadService]';

const diagnoseRNFetchBlob = () => {
  try {
    console.log(LOG_PREFIX, 'RNFetchBlob available:', !!RNFetchBlob);
    console.log(LOG_PREFIX, 'RNFetchBlob keys:', RNFetchBlob ? Object.keys(RNFetchBlob).sort() : null);
    console.log(LOG_PREFIX, 'RNFetchBlob.fs keys:', RNFetchBlob?.fs ? Object.keys(RNFetchBlob.fs).sort() : null);
    console.log(LOG_PREFIX, 'RNFetchBlob.android keys:', RNFetchBlob?.android ? Object.keys(RNFetchBlob.android).sort() : null);
    console.log(LOG_PREFIX, 'RNFetchBlob.MediaCollection keys:', RNFetchBlob?.MediaCollection ? Object.keys(RNFetchBlob.MediaCollection).sort() : null);
    console.log(LOG_PREFIX, 'NativeModules keys:', NativeModules ? Object.keys(NativeModules).sort() : null);
    console.log(LOG_PREFIX, 'NativeModules.ReactNativeBlobUtil:', NativeModules?.ReactNativeBlobUtil);
    console.log(LOG_PREFIX, 'TurboModuleRegistry ReactNativeBlobUtil:', TurboModuleRegistry.get('ReactNativeBlobUtil'));
  } catch (error) {
    console.warn(LOG_PREFIX, 'diagnoseRNFetchBlob failed', error);
  }
};

export type DownloadableMediaKind = 'image' | 'video' | 'audio' | 'document';

interface SaveMediaToPublicStorageParams {
  sourceUri?: string | null;
  objectKey?: string | null;
  mimeType?: string | null;
  type?: string | null;
  name?: string | null;
  onProgress?: (progress: number) => void;
}

interface SaveMediaToPublicStorageResult {
  success: boolean;
  fileName: string;
  uri?: string;
  message: string;
}

const FALLBACK_EXTENSIONS: Record<DownloadableMediaKind, string> = {
  image: '.jpg',
  video: '.mp4',
  audio: '.mp3',
  document: '.bin',
};

const getMediaKind = (type?: string | null, mimeType?: string | null, name?: string | null): DownloadableMediaKind => {
  const normalizedType = (type || '').toLowerCase();
  const normalizedMime = (mimeType || '').toLowerCase();
  const normalizedName = (name || '').toLowerCase();

  if (normalizedType === 'video' || normalizedMime.startsWith('video/')) return 'video';
  if (normalizedType === 'audio' || normalizedMime.startsWith('audio/')) return 'audio';
  if (normalizedType === 'image' || normalizedMime.startsWith('image/')) return 'image';
  if (normalizedMime.includes('pdf') || normalizedName.endsWith('.pdf') || normalizedType === 'document' || normalizedType === 'file') return 'document';

  return 'document';
};

const getExtensionFromMime = (mimeType?: string | null) => {
  if (!mimeType) return '';
  const mime = mimeType.toLowerCase();
  if (mime.includes('image/jpeg') || mime.includes('image/jpg')) return '.jpg';
  if (mime.includes('image/png')) return '.png';
  if (mime.includes('image/webp')) return '.webp';
  if (mime.includes('video/mp4')) return '.mp4';
  if (mime.includes('video/quicktime')) return '.mov';
  if (mime.includes('audio/mpeg') || mime.includes('audio/mp3')) return '.mp3';
  if (mime.includes('audio/aac')) return '.aac';
  if (mime.includes('audio/ogg')) return '.ogg';
  if (mime.includes('application/pdf')) return '.pdf';
  if (mime.includes('application/msword')) return '.doc';
  if (mime.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) return '.docx';
  if (mime.includes('application/vnd.ms-excel')) return '.xls';
  if (mime.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) return '.xlsx';
  if (mime.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation')) return '.pptx';
  if (mime.includes('text/plain')) return '.txt';
  return '';
};

const getMimeTypeFromName = (name?: string | null) => {
  const extension = (name || '').split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'mp3':
      return 'audio/mpeg';
    case 'aac':
      return 'audio/aac';
    case 'ogg':
      return 'audio/ogg';
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt':
      return 'text/plain';
    default:
      return undefined;
  }
};

export const sanitizeFileName = (input?: string | null, mimeType?: string | null, type?: string | null) => {
  const kind = getMediaKind(type, mimeType, input);
  const extension = getExtensionFromMime(mimeType) || FALLBACK_EXTENSIONS[kind];
  const baseName = (input || '').trim();
  const withoutPath = baseName.split(/[\\/]/).pop() || '';
  const stem = withoutPath.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
  const cleanedStem = stem || `vschat_${kind}`;
  const hasExt = /\.[a-z0-9]{1,6}$/i.test(cleanedStem);
  const timestamp = Date.now();
  if (!stem) {
    return `vschat_${kind}_${timestamp}${extension}`;
  }
  return `${hasExt ? cleanedStem : `${cleanedStem}${extension}`}`.replace(/_+/g, '_');
};

const getTargetMediaType = (kind: DownloadableMediaKind) => {
  switch (kind) {
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    default:
      return 'Download';
  }
};

const getTargetRelativeFolder = (kind: DownloadableMediaKind) => {
  switch (kind) {
    case 'image':
      return 'VSChat';
    case 'video':
      return 'VSChat';
    case 'audio':
      return 'VSChat';
    default:
      return 'VSChat';
  }
};

const ensureStoragePermission = async () => {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) >= 29) return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
  return granted === PermissionsAndroid.RESULTS.GRANTED || granted === PermissionsAndroid.RESULTS.LIMITED;
};

const isRemoteUrl = (value?: string | null) => !!value && /^(https?:|blob:)/i.test(value);
const toLocalPath = (value?: string | null) => {
  if (!value) return '';
  if (value.startsWith('file://')) return decodeURIComponent(value.replace(/^file:\/\//, ''));
  return value;
};

const resolveLocalPath = async (path: string) => {
  if (path.startsWith('content://') && RNFetchBlob?.fs?.stat) {
    try {
      const stat = await RNFetchBlob.fs.stat(path);
      if (stat && stat.path) return stat.path;
    } catch (error) {
      console.warn('[mediaDownloadService] Failed to resolve content URI path', error);
    }
  }
  return path;
};

const fileExistsAndHasContent = async (path: string) => {
  if (!RNFetchBlob?.fs?.exists || !RNFetchBlob?.fs?.stat) return false;
  try {
    const exists = await RNFetchBlob.fs.exists(path);
    if (!exists) return false;
    const stat = await RNFetchBlob.fs.stat(path);
    return stat && Number(stat.size) > 0;
  } catch (error) {
    console.warn('[mediaDownloadService] Failed to validate file', path, error);
    return false;
  }
};

const getFinalMimeType = (mimeType?: string | null, name?: string | null) => {
  return mimeType || getMimeTypeFromName(name) || 'application/octet-stream';
};

const copyFileToDownloadDir = async (sourcePath: string, destinationPath: string) => {
  if (RNFetchBlob?.fs?.cp) {
    try {
      await RNFetchBlob.fs.cp(sourcePath, destinationPath);
      return;
    } catch (error) {
      console.warn('[mediaDownloadService] cp fallback failed', error);
    }
  }

  if (RNFetchBlob?.fs?.readFile && RNFetchBlob?.fs?.writeFile) {
    try {
      const data = await RNFetchBlob.fs.readFile(sourcePath, 'base64');
      await RNFetchBlob.fs.writeFile(destinationPath, data, 'base64');
      return;
    } catch (error) {
      console.warn('[mediaDownloadService] read/write fallback failed', error);
    }
  }

  throw new Error('Unable to copy file to public download directory.');
};

const writeToPublicStorage = async (filePath: string, fileName: string, mimeType: string | null | undefined, kind: DownloadableMediaKind) => {
  const mime = getFinalMimeType(mimeType, fileName);
  const publicDownloadFilePath = `${RNFetchBlob.fs.dirs.DownloadDir}/${fileName}`;

  await copyFileToDownloadDir(filePath, publicDownloadFilePath);

  if (RNFetchBlob?.android?.addCompleteDownload) {
    await RNFetchBlob.android.addCompleteDownload({
      title: fileName,
      description: `Saved by VSChat`,
      mime,
      path: publicDownloadFilePath,
      showNotification: true,
      mediaScannable: true,
      notification: true,
    });
  }

  return publicDownloadFilePath;
};

export const saveMediaToPublicStorage = async ({
  sourceUri,
  objectKey,
  mimeType,
  type,
  name,
  onProgress,
}: SaveMediaToPublicStorageParams): Promise<SaveMediaToPublicStorageResult> => {
  if (Platform.OS !== 'android') {
    return {
      success: false,
      fileName: sanitizeFileName(name, mimeType, type),
      message: 'Downloads are currently supported on Android devices only.',
    };
  }

  const kind = getMediaKind(type, mimeType, name);
  const fileName = sanitizeFileName(name || objectKey || undefined, mimeType, type);

  if (!RNFetchBlob?.fs?.mkdir || !RNFetchBlob?.fs?.exists || !RNFetchBlob?.fs?.cp) {
    diagnoseRNFetchBlob();
    return {
      success: false,
      fileName,
      message: 'The native download module is not available.',
    };
  }

  const cacheBaseDir = `${RNFetchBlob.fs.dirs.CacheDir}/VSChat`;

  const permissionGranted = await ensureStoragePermission();
  if (!permissionGranted) {
    return {
      success: false,
      fileName,
      message: 'Storage permission was denied.',
    };
  }

  const cacheFilePath = `${cacheBaseDir}/${fileName}`;
  const cacheExists = await RNFetchBlob.fs.exists(cacheFilePath);
  if (cacheExists) {
    const publicUri = await writeToPublicStorage(cacheFilePath, fileName, mimeType, kind);
    return {
      success: true,
      fileName,
      uri: publicUri,
      message: 'Saved to device storage.',
    };
  }

  let sourcePath = '';
  if (sourceUri && !isRemoteUrl(sourceUri)) {
    sourcePath = toLocalPath(sourceUri);
    if (!sourcePath) {
      return {
        success: false,
        fileName,
        message: 'The media file could not be located.',
      };
    }
    sourcePath = await resolveLocalPath(sourcePath);
    const valid = await fileExistsAndHasContent(sourcePath);
    if (!valid) {
      return {
        success: false,
        fileName,
        message: 'The media file is missing or empty.',
      };
    }
  } else if (sourceUri && isRemoteUrl(sourceUri)) {
    await RNFetchBlob.fs.mkdir(cacheBaseDir);
    const task = RNFetchBlob.config({ path: cacheFilePath, fileCache: true }).fetch('GET', sourceUri, {});
    task.progress((received: number, total: number) => {
      if (onProgress && total > 0) {
        onProgress(Math.round((received / total) * 100));
      }
    });
    const response = await task;
    const status = response?.info?.()?.status || response?.info()?.status;
    if (typeof status === 'number' && (status < 200 || status >= 300)) {
      return {
        success: false,
        fileName,
        message: `Remote download failed with status ${status}.`,
      };
    }
    await response?.flush?.();
    const fileExists = await RNFetchBlob.fs.exists(cacheFilePath);
    const valid = fileExists && (await fileExistsAndHasContent(cacheFilePath));
    if (!valid) {
      return {
        success: false,
        fileName,
        message: 'The media download failed or resulted in an empty file.',
      };
    }
    sourcePath = cacheFilePath;
  } else {
    return {
      success: false,
      fileName,
      message: 'No media source was available to download.',
    };
  }

  if (sourcePath && sourcePath !== cacheFilePath) {
    await RNFetchBlob.fs.mkdir(cacheBaseDir);
    await RNFetchBlob.fs.cp(sourcePath, cacheFilePath);
  }

  const publicUri = await writeToPublicStorage(cacheFilePath, fileName, mimeType, kind);
  return {
    success: true,
    fileName,
    uri: publicUri,
    message: 'Saved to device storage.',
  };
};
