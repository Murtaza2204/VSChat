import React from 'react';
import { View, Image, ActivityIndicator, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MessageRecord } from '../../types/mediaTypes';
import useMedia from '../../hooks/useMedia';

export default function ImageMessage({ message, visible }: { message: MessageRecord; visible: boolean }) {
  const objectKey = message.metadata?.objectKey;
  const { url, loading, error, retry } = useMedia(objectKey, visible);

  if (!objectKey) return <Text>Invalid media</Text>;

  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator />}
      {error && (
        <View style={styles.error}>
          <Text style={styles.errorText}>Failed to load image</Text>
          <TouchableOpacity onPress={retry} style={styles.retryBtn}><Text>Retry</Text></TouchableOpacity>
        </View>
      )}
      {url && !loading && !error && (
        <Image source={{ uri: url }} style={styles.image} resizeMode="cover" onError={(e) => console.error('[ImageMessage] Image load error:', e.nativeEvent.error)} />
      )}
      {!loading && !error && !url && (
        <View style={styles.error}>
          <Text style={styles.errorText}>Loading image...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 240, height: 160, backgroundColor: '#eee' },
  image: { width: '100%', height: '100%' },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#900' },
  retryBtn: { marginTop: 8, padding: 6, backgroundColor: '#ddd' },
});
