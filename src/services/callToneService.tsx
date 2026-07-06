import React, { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import Video from 'react-native-video';

type ToneKind = 'incoming' | 'outgoing' | null;

type ToneState = {
  tone: ToneKind;
  revision: number;
  playing: boolean;
};

type Listener = () => void;

let toneState: ToneState = {
  tone: null,
  revision: 0,
  playing: false,
};

const listeners = new Set<Listener>();

const notify = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {}
  });
};

const setToneState = (next: Partial<ToneState>) => {
  toneState = {
    ...toneState,
    ...next,
  };
  notify();
};

export const playIncomingRingtone = () => {
  setToneState({
    tone: 'incoming',
    playing: true,
    revision: toneState.revision + 1,
  });
};

export const playOutgoingRingback = () => {
  setToneState({
    tone: 'outgoing',
    playing: true,
    revision: toneState.revision + 1,
  });
};

export const stopCallTone = () => {
  if (!toneState.playing && !toneState.tone) return;
  setToneState({
    tone: null,
    playing: false,
    revision: toneState.revision + 1,
  });
};

export const useCallToneState = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toneState,
    () => toneState,
  );

const incomingToneSource = require('../assets/audio/incoming.mp3');
const outgoingToneSource = require('../assets/audio/outgoing.mp3');

export const CallTonePlayerHost: React.FC = () => {
  const state = useCallToneState();

  useEffect(() => {
    return () => {
      stopCallTone();
    };
  }, []);

  if (!state.playing || !state.tone) return null;

  const source = state.tone === 'incoming' ? incomingToneSource : outgoingToneSource;

  return (
    <View pointerEvents="none" style={styles.hidden}>
      <Video
        key={`${state.tone}-${state.revision}`}
        source={source}
        paused={false}
        repeat
        playInBackground
        playWhenInactive
        ignoreSilentSwitch="ignore"
        resizeMode="cover"
        style={styles.hidden}
        onError={() => {
          // Keep call flow intact even if audio playback fails.
          stopCallTone();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -9999,
    top: -9999,
  },
});

export default {
  playIncomingRingtone,
  playOutgoingRingback,
  stopCallTone,
  CallTonePlayerHost,
};
