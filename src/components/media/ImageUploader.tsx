import React from 'react';
import { View, Button, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import useMediaUpload from '../../hooks/useMediaUpload';

export default function ImageUploader({ chatId, onUploadComplete }: { chatId: string; onUploadComplete?: (message: any) => void }) {
  const { state, upload, cancel, reset } = useMediaUpload();

  const pickAndUpload = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    if (res.didCancel) return;
    const asset = res.assets && res.assets[0];
    if (!asset || !asset.uri) return;
    
    const result = await upload({
      chatId,
      file: {
        uri: asset.uri,
        name: asset.fileName || 'photo.jpg',
        type: asset.type || 'image/jpeg',
        size: asset.fileSize,
      },
      mediaType: 'image' as any,
    });

    if (result.success && result.message && onUploadComplete) {
      onUploadComplete(result.message);
      reset();
    }
  };

  const handleRetry = async () => {
    reset();
    await pickAndUpload();
  };

  return (
    <View style={styles.container}>
      {!state.loading && !state.error && !state.done && (
        <Button title="📷 Send Image" onPress={pickAndUpload} />
      )}

      {state.loading && (
        <View style={styles.progress}>
          <ActivityIndicator size="small" />
          <Text style={styles.progressText}>{state.progress}%</Text>
        </View>
      )}

      {state.error && (
        <View style={styles.error}>
          <Text style={styles.errorText}>⚠ Upload failed: {state.error}</Text>
          <View style={styles.errorButtons}>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.btnText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={reset}>
              <Text style={styles.btnText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {state.done && (
        <View style={styles.success}>
          <Text style={styles.successText}>✓ Image uploaded</Text>
          <Button title="Send Another" onPress={() => { reset(); pickAndUpload(); }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 8, minHeight: 50 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressText: { fontSize: 12, color: '#666' },
  error: { backgroundColor: '#ffe5e5', padding: 10, borderRadius: 8 },
  errorText: { color: '#900', fontSize: 12, marginBottom: 8 },
  errorButtons: { flexDirection: 'row', gap: 8 },
  retryBtn: { flex: 1, backgroundColor: '#f0f0f0', padding: 8, borderRadius: 6 },
  cancelBtn: { flex: 1, backgroundColor: '#ddd', padding: 8, borderRadius: 6 },
  btnText: { textAlign: 'center', fontSize: 12, fontWeight: 'bold' },
  success: { backgroundColor: '#e5ffe5', padding: 10, borderRadius: 8 },
  successText: { color: '#060', marginBottom: 8, fontWeight: 'bold' },
});
