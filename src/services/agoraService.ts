import RtcEngineDefault, {
  createAgoraRtcEngine,
} from 'react-native-agora';

let engine: any = null;
let remoteUidListener: ((uid: number | null) => void) | null = null;
let registeredEventHandler: any = null;

const normalizeUid = (...values: any[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    if (value && typeof value === 'object') {
      const nested = normalizeUid(value.remoteUid, value.uid, value.userId);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
};

const callEngine = async (method: string, ...args: any[]) => {
  if (!engine || typeof engine[method] !== 'function') return undefined;
  return engine[method](...args);
};

const routeAudioToSpeaker = async (on = true) => {
  await callEngine('setDefaultAudioRouteToSpeakerphone', on);
  await callEngine('setEnableSpeakerphone', on);
};

const mediaOptions = {
  autoSubscribeAudio: true,
  autoSubscribeVideo: true,
  publishCameraTrack: true,
  publishMicrophoneTrack: true,
  clientRoleType: 1,
};

const configureMedia = async () => {
  await callEngine('enableAudio');
  await callEngine('enableVideo');
  await callEngine('setChannelProfile', 0);

  try {
    await callEngine('setClientRole', 1);
  } catch (e) {
    await callEngine('setClientRole', 'broadcaster');
  }

  await callEngine('setAudioProfile', 1, 1);
  await routeAudioToSpeaker(true);
  await callEngine('enableLocalAudio', true);
  await callEngine('enableLocalVideo', true);
  await callEngine('muteLocalAudioStream', false);
  await callEngine('muteLocalVideoStream', false);
  await callEngine('muteAllRemoteAudioStreams', false);
  await callEngine('muteAllRemoteVideoStreams', false);

  try {
    await callEngine('setVideoEncoderConfiguration', {
      width: 640,
      height: 360,
      bitrate: 900,
      frameRate: 24,
    });
  } catch (e) {
    console.warn('[Agora] Video encoder configuration failed:', e);
  }
};

export const initAgora = async (appId: string) => {
  if (engine) return engine;

  try {
    if (typeof createAgoraRtcEngine === 'function') {
      const rtc: any = createAgoraRtcEngine();
      if (typeof rtc.initialize === 'function') {
        await rtc.initialize({ appId });
      } else if (typeof rtc.create === 'function') {
        await rtc.create(appId);
      }
      engine = rtc;
    }

    if (!engine) {
      const legacyEngineFactory: any = RtcEngineDefault;
      if (legacyEngineFactory && typeof legacyEngineFactory.create === 'function') {
        engine = await legacyEngineFactory.create(appId);
      } else {
        throw new Error('No supported Agora engine factory found');
      }
    }

    await configureMedia();
    await callEngine('startPreview');
    return engine;
  } catch (e) {
    engine = null;
    console.error('[Agora] init error:', e);
    throw e;
  }
};

export const joinChannel = async (
  token: string | null,
  channel: string,
  uid = 0,
  onUserJoined?: (uid: number) => void,
  onUserLeft?: (uid: number) => void,
  onJoinSuccess?: (channel: string, uid: number) => void,
) => {
  if (!engine) {
    throw new Error('Engine not initialized');
  }

  const notifyRemoteJoined = async (...args: any[]) => {
    const remoteUid = normalizeUid(args[1], args[0]);
    console.log('[Agora] remote user/media event:', args, '->', remoteUid);
    if (!remoteUid) return;

    try {
      await callEngine('muteRemoteAudioStream', remoteUid, false);
      await callEngine('muteRemoteVideoStream', remoteUid, false);
      await callEngine('setRemoteVideoStreamType', remoteUid, 0);
    } catch (e) {
      console.warn('[Agora] remote subscribe failed:', e);
    }

    onUserJoined?.(remoteUid);
    remoteUidListener?.(remoteUid);
  };

  const notifyRemoteLeft = (...args: any[]) => {
    const remoteUid = normalizeUid(args[1], args[0]);
    console.log('[Agora] remote offline event:', args, '->', remoteUid);
    onUserLeft?.(remoteUid as any);
    remoteUidListener?.(null);
  };

  const notifyJoinSuccess = (...args: any[]) => {
    const connection = args[0];
    const joinedChannel = connection && typeof connection === 'object'
      ? connection.channelId ?? connection.channelName ?? channel
      : connection ?? channel;
    const localUid = normalizeUid(
      connection && typeof connection === 'object' ? connection.localUid : null,
      args[1],
      uid,
    ) ?? 0;

    console.log('[Agora] join success:', { channel: joinedChannel, uid: localUid });
    onJoinSuccess?.(joinedChannel, localUid);
  };

  if (typeof engine.removeAllListeners === 'function') {
    engine.removeAllListeners();
  }

  if (typeof engine.registerEventHandler === 'function') {
    registeredEventHandler = {
      onUserJoined: (...args: any[]) => notifyRemoteJoined(...args),
      onFirstRemoteVideoDecoded: (...args: any[]) => notifyRemoteJoined(...args),
      onRemoteVideoStateChanged: (...args: any[]) => notifyRemoteJoined(...args),
      onUserOffline: (...args: any[]) => notifyRemoteLeft(...args),
      onJoinChannelSuccess: (...args: any[]) => notifyJoinSuccess(...args),
      onRejoinChannelSuccess: (...args: any[]) => notifyJoinSuccess(...args),
      onError: (err: any) => console.error('[Agora] error:', err),
      onWarning: (warn: any) => console.warn('[Agora] warning:', warn),
    };
    engine.registerEventHandler(registeredEventHandler);
  } else if (typeof engine.addListener === 'function') {
    engine.addListener('UserJoined', (...args: any[]) => notifyRemoteJoined(...args));
    engine.addListener('userJoined', (...args: any[]) => notifyRemoteJoined(...args));
    engine.addListener('FirstRemoteVideoDecoded', (...args: any[]) => notifyRemoteJoined(...args));
    engine.addListener('RemoteVideoStateChanged', (...args: any[]) => notifyRemoteJoined(...args));
    engine.addListener('UserOffline', (...args: any[]) => notifyRemoteLeft(...args));
    engine.addListener('userOffline', (...args: any[]) => notifyRemoteLeft(...args));
    engine.addListener('JoinChannelSuccess', (...args: any[]) => notifyJoinSuccess(...args));
    engine.addListener('joinChannelSuccess', (...args: any[]) => notifyJoinSuccess(...args));
  }

  await configureMedia();

  let joinResult: any;
  try {
    joinResult = await engine.joinChannel(token || '', channel, uid, mediaOptions);
  } catch (e) {
    joinResult = await engine.joinChannel(token || '', channel, null, uid);
  }

  await configureMedia();
  await callEngine('updateChannelMediaOptions', mediaOptions);
  console.log('[Agora] joinChannel returned:', joinResult);
};

export const leaveChannel = async () => {
  try {
    if (!engine) return;
    await callEngine('leaveChannel');
    if (typeof engine.removeAllListeners === 'function') {
      engine.removeAllListeners();
    }
    registeredEventHandler = null;
    remoteUidListener = null;
  } catch (e) {
    console.warn('[Agora] leaveChannel error:', e);
  }
};

export const setRemoteUidListener = (cb: (uid: number | null) => void) => {
  remoteUidListener = cb;
};

export const switchCamera = async () => {
  try {
    await callEngine('switchCamera');
  } catch (e) {}
};

export const muteLocalAudio = async (mute: boolean) => {
  try {
    await callEngine('muteLocalAudioStream', mute);
  } catch (e) {}
};

export const setSpeakerphone = async (on: boolean) => {
  try {
    await routeAudioToSpeaker(on);
  } catch (e) {
    console.warn('[Agora] setSpeakerphone failed:', e);
  }
};

export const muteLocalVideo = async (mute: boolean) => {
  try {
    if (!mute) {
      await callEngine('enableLocalVideo', true);
    }
    await callEngine('muteLocalVideoStream', mute);
    await callEngine('updateChannelMediaOptions', {
      ...mediaOptions,
      publishCameraTrack: !mute,
    });
  } catch (e) {}
};

export default {
  initAgora,
  joinChannel,
  leaveChannel,
  setRemoteUidListener,
  switchCamera,
  muteLocalAudio,
  muteLocalVideo,
  setSpeakerphone,
};
