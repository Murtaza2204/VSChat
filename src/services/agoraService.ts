import RtcEngineDefault, {
  RtcLocalView,
  RtcRemoteView,
  VideoRenderMode,
  createAgoraRtcEngine,
} from 'react-native-agora';

let engine: any = null;
let remoteUidListener: ((uid: number | null) => void) | null = null;
let _registeredEventHandler: any = null; // keep reference to avoid GC

/**
 * Initialize Agora engine.
 * This supports both the older RtcEngine.create API and the newer createAgoraRtcEngine API.
 */
export const initAgora = async (appId: string) => {
  if (engine) return engine;

  try {
    console.log('📱 Attempting to create Agora engine with appId:', appId.slice(0, 16) + '...');

    // Prefer new API if available
    if (typeof createAgoraRtcEngine === 'function') {
      try {
        const rtc = createAgoraRtcEngine();
        // initialize expects an object with appId on newer SDKs
        if (typeof rtc.initialize === 'function') {
          await rtc.initialize({ appId });
        } else if (typeof rtc.create === 'function') {
          // fallback
          await rtc.create(appId);
        }
        engine = rtc;
        console.log('✅ Agora engine (createAgoraRtcEngine) initialized');
      } catch (e) {
        console.warn('⚠️ createAgoraRtcEngine path failed:', e);
      }
    }

    // Fallback to legacy default export if engine still not created
    if (!engine) {
      // Some installs export default object with create()
      if (RtcEngineDefault && typeof RtcEngineDefault.create === 'function') {
        engine = await RtcEngineDefault.create(appId);
        console.log('✅ Agora engine (RtcEngine.create) created successfully');
      } else {
        console.error('❌ No supported Agora engine factory found. RtcEngineDefault:', typeof RtcEngineDefault, 'createAgoraRtcEngine:', typeof createAgoraRtcEngine);
        throw new Error('No supported Agora engine factory found - native module may not be linked or API mismatch');
      }
    }

    // Common setup: enable audio/video and start preview where supported
    try {
      if (typeof engine.enableAudio === 'function') {
        await engine.enableAudio();
        console.log('✅ Audio enabled');
      }
    } catch (e) {
      console.warn('⚠️ enableAudio failed:', e);
    }

    try {
      if (typeof engine.enableVideo === 'function') {
        await engine.enableVideo();
        console.log('✅ Video enabled');
      }
    } catch (e) {
      console.warn('⚠️ enableVideo failed:', e);
    }

    try {
      if (typeof engine.setVideoEncoderConfiguration === 'function') {
        await engine.setVideoEncoderConfiguration({ width: 640, height: 480, bitrate: 1000, frameRate: 30 });
        console.log('✅ Video encoder configured');
      }
    } catch (e) {
      console.warn('⚠️ Video encoder config failed:', e);
    }

    try {
      if (typeof engine.startPreview === 'function') {
        await engine.startPreview();
        console.log('✅ Preview started');
      }
    } catch (e) {
      console.warn('⚠️ startPreview error:', e);
    }

    try {
      if (typeof engine.enableLocalVideo === 'function') {
        await engine.enableLocalVideo(true);
        console.log('✅ Local video enabled');
      }
    } catch (e) {
      console.warn('⚠️ enableLocalVideo error:', e);
    }
  } catch (e) {
    console.error('❌ Agora init error:', e);
    console.error('Error details:', e instanceof Error ? e.message : String(e));
    engine = null; // Reset engine on failure
    throw e;
  }

  return engine;
};

export const joinChannel = async (
  token: string | null,
  channel: string,
  uid = 0,
  onUserJoined?: (uid: number) => void,
  onUserLeft?: (uid: number) => void,
  onJoinSuccess?: (channel: string, uid: number) => void
) => {
  if (!engine) {
    console.error('❌ Engine not initialized - cannot join channel');
    throw new Error('Engine not initialized');
  }

  // Register listeners BEFORE joining channel
  const userJoinedListener = (uid: number) => {
    console.log('✓ UserJoined event:', uid);
    onUserJoined && onUserJoined(uid);
    if (remoteUidListener) remoteUidListener(uid);
  };

  const userOfflineListener = (uid: number) => {
    console.log('✓ UserOffline event:', uid);
    onUserLeft && onUserLeft(uid);
    if (remoteUidListener) remoteUidListener(null);
  };

  const joinChannelSuccessListener = (channelName: string, uid: number) => {
    console.log('✓✓✓ JoinChannelSuccess event:', { channelName, uid });
    onJoinSuccess && onJoinSuccess(channelName, uid);
  };

  const joinChannelFailureListener = (channelName: string, code: number) => {
    console.error('✗ JoinChannelFailure:', { channelName, code });
  };

  try {
    // Remove old listeners to avoid duplicates
    // Try registerEventHandler (new API) or addListener (legacy)
    if (typeof engine.removeAllListeners === 'function') {
      engine.removeAllListeners();
    }

    if (typeof engine.registerEventHandler === 'function') {
      // Build a minimal event handler wrapper
      const handler: any = {
        onUserJoined: (uid: number) => userJoinedListener(uid),
        onUserOffline: (uid: number) => userOfflineListener(uid),
        onJoinChannelSuccess: (channelName: string, uid: number) => joinChannelSuccessListener(channelName, uid),
        onJoinChannelFailure: (channelName: string, code: number) => joinChannelFailureListener(channelName, code),
      };
      engine.registerEventHandler(handler);
      _registeredEventHandler = handler;
    } else if (typeof engine.addListener === 'function') {
      engine.addListener('UserJoined', userJoinedListener);
      engine.addListener('UserOffline', userOfflineListener);
      engine.addListener('JoinChannelSuccess', joinChannelSuccessListener);
      engine.addListener('JoinChannelFailure', joinChannelFailureListener);
    }

    console.log('🔗 Joining channel:', { tokenLength: token?.length, channel, uid });

    // Try different join method signatures safely
    let joinedResult: any = null;
    if (typeof engine.joinChannel === 'function') {
      try {
        // new API may expect (token, channel, uid, options)
        joinedResult = await engine.joinChannel(token, channel, uid, {});
      } catch (e) {
        try {
          // legacy signature: joinChannel(token, channel, null, uid)
          joinedResult = await engine.joinChannel(token, channel, null, uid);
        } catch (e2) {
          throw e2;
        }
      }
    } else {
      throw new Error('joinChannel is not available on the Agora engine instance');
    }

    console.log('✅ joinChannel returned:', joinedResult);
  } catch (e) {
    console.error('❌ joinChannel error:', e instanceof Error ? e.message : String(e));
    throw e;
  }
};

export const leaveChannel = async () => {
  try {
    if (!engine) return;
    await engine.leaveChannel();
    engine.removeAllListeners && engine.removeAllListeners();
  } catch (e) {
    console.warn('leaveChannel error', e);
  }
};

export const setRemoteUidListener = (cb: (uid: number | null) => void) => {
  remoteUidListener = cb;
};

export const switchCamera = async () => {
  try {
    await engine?.switchCamera();
  } catch (e) {}
};

export const muteLocalAudio = async (mute: boolean) => {
  try {
    await engine?.muteLocalAudioStream(mute);
  } catch (e) {}
};

export const muteLocalVideo = async (mute: boolean) => {
  try {
    await engine?.muteLocalVideoStream(mute);
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
};
