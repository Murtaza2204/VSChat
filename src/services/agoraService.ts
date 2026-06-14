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

    // Ensure we are in communication mode (not live-broadcast audience) and able to publish audio
    try {
      if (typeof engine.setChannelProfile === 'function') {
        // 0 = Communication profile
        await engine.setChannelProfile(0);
        console.log('✅ setChannelProfile -> communication');
      }
    } catch (e) {
      console.warn('⚠️ setChannelProfile failed:', e);
    }

    try {
      if (typeof engine.setClientRole === 'function') {
        // Try numeric role first (1 = broadcaster/publisher), otherwise string
        try { await engine.setClientRole(1); console.log('✅ setClientRole -> 1'); }
        catch (_) {
          try { await engine.setClientRole('broadcaster'); console.log('✅ setClientRole -> broadcaster'); } catch (e) { throw e; }
        }
      }
    } catch (e) {
      console.warn('⚠️ setClientRole failed:', e);
    }

    try {
      if (typeof engine.setAudioProfile === 'function') {
        // set default audio profile (speech, default scenario)
        await engine.setAudioProfile && await engine.setAudioProfile(1, 1);
        console.log('✅ setAudioProfile -> 1,1');
      }
    } catch (e) {
      console.warn('⚠️ setAudioProfile failed:', e);
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
  console.log('🔄 Calling joinChannel... enginePresent:', !!engine, 'engineType:', typeof engine);
  try {
    const available = {
      joinChannel: engine ? typeof engine.joinChannel : 'undefined',
      registerEventHandler: engine ? typeof engine.registerEventHandler : 'undefined',
      addListener: engine ? typeof engine.addListener : 'undefined',
    };
    console.log('🔎 Engine APIs:', available);
  } catch (err) {
    console.warn('🔎 Error reading engine APIs', err);
  }

  if (!engine) {
    console.error('❌ Engine not initialized - cannot join channel');
    throw new Error('Engine not initialized');
  }

  // Register listeners BEFORE joining channel
  const userJoinedListener = (uid: number) => {
    // Normalize possible object payloads from different SDK versions
    let normalizedUid: number | null = null;
    try {
      if (uid && typeof uid === 'object') {
        normalizedUid = (uid.localUid ?? uid.uid ?? uid.userId) ?? null;
      } else {
        normalizedUid = uid ?? null;
      }
    } catch (e) {
      normalizedUid = null;
    }
    console.log('✓ UserJoined event:', uid, '-> normalizedUid:', normalizedUid);
    onUserJoined && onUserJoined(normalizedUid as any);
    if (remoteUidListener) remoteUidListener(normalizedUid as any);
  };

  const userOfflineListener = (uid: number) => {
    let normalizedUid: number | null = null;
    try {
      if (uid && typeof uid === 'object') {
        normalizedUid = (uid.localUid ?? uid.uid ?? uid.userId) ?? null;
      } else {
        normalizedUid = uid ?? null;
      }
    } catch (e) {
      normalizedUid = null;
    }
    console.log('✓ UserOffline event:', uid, '-> normalizedUid:', normalizedUid);
    onUserLeft && onUserLeft(normalizedUid as any);
    if (remoteUidListener) remoteUidListener(null);
  };

  const joinChannelSuccessListener = (channelName: string, uid: number) => {
    // Some SDKs pass an object instead of (channelName, uid)
    let nChannel = channelName as any;
    let nUid: number | null = null;
    try {
      if (channelName && typeof channelName === 'object') {
        nChannel = channelName.channelId ?? channelName.channelName ?? JSON.stringify(channelName);
        nUid = channelName.localUid ?? channelName.uid ?? channelName.userId ?? null;
      } else {
        nChannel = channelName;
        nUid = uid ?? null;
      }
    } catch (e) {
      nUid = uid ?? null;
    }
    console.log('✓✓✓ JoinChannelSuccess event:', { channelName: nChannel, uid: nUid });
    onJoinSuccess && onJoinSuccess(nChannel, nUid as any);
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
      // Build a minimal event handler wrapper (new API)
      const handler: any = {
        onUserJoined: (uid: number) => userJoinedListener(uid),
        onUserOffline: (uid: number) => userOfflineListener(uid),
        onJoinChannelSuccess: (channelName: string, uid: number) => joinChannelSuccessListener(channelName, uid),
        onJoinChannelFailure: (channelName: string, code: number) => joinChannelFailureListener(channelName, code),
        onError: (err: any) => console.error('Agora onError event:', err),
        onWarning: (warn: any) => console.warn('Agora onWarning event:', warn),
      };
      console.log('🔔 registerEventHandler on engine with handler keys:', Object.keys(handler));
      engine.registerEventHandler(handler);
      _registeredEventHandler = handler;
    } else if (typeof engine.addListener === 'function') {
      engine.addListener('UserJoined', userJoinedListener);
      engine.addListener('UserOffline', userOfflineListener);
      engine.addListener('JoinChannelSuccess', joinChannelSuccessListener);
      engine.addListener('JoinChannelFailure', joinChannelFailureListener);
      // Also attach alternative event name variants to catch SDK differences
      try {
        engine.addListener('joinChannelSuccess', joinChannelSuccessListener);
        engine.addListener('joinChannelFailure', joinChannelFailureListener);
        engine.addListener('onJoinChannelSuccess', joinChannelSuccessListener);
        engine.addListener('onJoinChannelFailure', joinChannelFailureListener);
        engine.addListener('userJoined', userJoinedListener);
        engine.addListener('userOffline', userOfflineListener);
        engine.addListener('error', (e: any) => console.error('Agora error event (alt):', e));
        engine.addListener('warning', (w: any) => console.warn('Agora warning event (alt):', w));
      } catch (e) {
        console.warn('⚠️ adding alternative listeners failed:', e);
      }
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
    // Ensure local audio is enabled and unmuted after joining
    try {
      if (typeof engine.enableLocalAudio === 'function') {
        await engine.enableLocalAudio(true);
        console.log('✅ enableLocalAudio -> true');
      }
    } catch (e) {
      console.warn('⚠️ enableLocalAudio failed:', e);
    }

    try {
      if (typeof engine.muteLocalAudioStream === 'function') {
        await engine.muteLocalAudioStream(false);
        console.log('✅ muteLocalAudioStream -> false');
      }
    } catch (e) {
      console.warn('⚠️ muteLocalAudioStream failed:', e);
    }

    try {
      // Try to force speakerphone on so playback is audible during tests
      if (typeof engine.setEnableSpeakerphone === 'function') {
        await engine.setEnableSpeakerphone(true);
        console.log('✅ setEnableSpeakerphone -> true');
      } else if (typeof engine.setDefaultAudioRouteToSpeakerphone === 'function') {
        await engine.setDefaultAudioRouteToSpeakerphone(true);
        console.log('✅ setDefaultAudioRouteToSpeakerphone -> true');
      }
    } catch (e) {
      console.warn('⚠️ setting speakerphone failed:', e);
    }
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

export const setSpeakerphone = async (on: boolean) => {
  try {
    if (!engine) return;
    if (typeof engine.setEnableSpeakerphone === 'function') {
      await engine.setEnableSpeakerphone(on);
      console.log('✅ setEnableSpeakerphone ->', on);
    } else if (typeof engine.setDefaultAudioRouteToSpeakerphone === 'function') {
      await engine.setDefaultAudioRouteToSpeakerphone(on);
      console.log('✅ setDefaultAudioRouteToSpeakerphone ->', on);
    } else {
      console.warn('⚠️ Speakerphone API not available on engine');
    }
  } catch (e) {
    console.warn('setSpeakerphone failed', e);
  }
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
