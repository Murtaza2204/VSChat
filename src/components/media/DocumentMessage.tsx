import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import useMedia from '../../hooks/useMedia';
import { MessageRecord } from '../../types/mediaTypes';

export default function DocumentMessage({ message, visible }: { message: MessageRecord; visible: boolean }) {
  const objectKey = message.metadata?.objectKey;
  const { url, loading, error, retry } = useMedia(objectKey, visible);

  if (!objectKey) return <Text>Invalid media</Text>;

  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator />}
      {error && (<View style={styles.error}><Text>Failed to load document</Text><TouchableOpacity onPress={retry}><Text>Retry</Text></TouchableOpacity></View>)}
      {url && !loading && !error && (
        <TouchableOpacity onPress={() => { /* open document via Linking.openURL(url) in future */ }} style={styles.doc}><Text>Open Document</Text></TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 8, backgroundColor: '#fff' },
  doc: { padding: 10, backgroundColor: '#eef' },
  error: { alignItems: 'center', justifyContent: 'center' },
});
