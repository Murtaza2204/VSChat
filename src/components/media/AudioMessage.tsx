import React, { useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import useMedia from '../../hooks/useMedia';
import { MessageRecord } from '../../types/mediaTypes';

export default function AudioMessage({ message, visible }: { message: MessageRecord; visible: boolean }) {
  const objectKey = message.metadata?.objectKey;
  const { url, loading, error, retry } = useMedia(objectKey, visible);
  const [playing, setPlaying] = useState(false);

  if (!objectKey) return <Text>Invalid media</Text>;

  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator />}
      {error && (<View style={styles.error}><Text>Failed to load audio</Text><TouchableOpacity onPress={retry}><Text>Retry</Text></TouchableOpacity></View>)}
      {url && !loading && !error && (
        <View style={styles.player}><Text>Audio ready</Text><TouchableOpacity onPress={() => setPlaying(!playing)} style={styles.playBtn}><Text>{playing ? 'Pause' : 'Play'}</Text></TouchableOpacity></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 280, height: 60, backgroundColor: '#fafafa', padding: 8 },
  player: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playBtn: { padding: 8, backgroundColor: '#ddd' },
});
