// @ts-nocheck
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import api from '../config/api';
import { useThemeStore } from '../stores/themeStore';
import { extractPublicUserId } from '../utils/inviteLink';

const ScanQRScreen = ({ navigation }) => {
  const { theme } = useThemeStore();
  const [manualInput, setManualInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('checking');
  const [scannerError, setScannerError] = useState('');

  useEffect(() => {
    const checkCameraPermission = async () => {
      const permission = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
      try {
        const status = await check(permission);
        if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) {
          setPermissionStatus('granted');
          return;
        }

        const requested = await request(permission);
        setPermissionStatus(requested === RESULTS.GRANTED || requested === RESULTS.LIMITED ? 'granted' : 'denied');
      } catch (error) {
        setPermissionStatus('denied');
      }
    };

    checkCameraPermission();
  }, []);

  const handleDecoded = async (data) => {
    const text = typeof data === 'string'
      ? data
      : (data && data.nativeEvent && data.nativeEvent.codeStringValue)
        ? data.nativeEvent.codeStringValue
        : (data && data.data)
          ? data.data
          : null;

    if (!text) {
      setScannerError('Unsupported QR code.');
      return;
    }

    const publicUserId = extractPublicUserId(text);
    if (!publicUserId) {
      setScannerError('This QR code does not contain a valid invite link.');
      return;
    }

    await handleResolve(publicUserId);
  };

  const handleResolve = async (publicUserId) => {
    if (!publicUserId) return;
    setBusy(true);
    setScannerError('');
    try {
      const resp = await api.post('/conversations/direct', { publicUserId });
      const conversation = resp.data.conversation;
      if (!conversation) {
        Alert.alert('Error', 'Could not open conversation');
        return;
      }

      navigation.navigate('Main', {
        screen: 'Chats',
        params: {
          screen: 'Chat',
          params: {
            conversationId: conversation._id,
            participant: conversation.participantProfile,
          },
        },
      });
    } catch (e) {
      console.warn('resolve/create convo failed', e && e.message, e && e.response && e.response.data);
      const serverMsg = e && e.response && (e.response.data && (e.response.data.message || e.response.data.error)) ? (e.response.data.message || e.response.data.error) : null;
      Alert.alert('Error', serverMsg || 'Could not open conversation');
    } finally {
      setBusy(false);
    }
  };

  const handleStartChat = async () => {
    const text = manualInput.trim();
    const publicUserId = extractPublicUserId(text);
    if (!publicUserId) {
      Alert.alert('Invalid invite', 'Paste a valid invite link or public user id.');
      return;
    }

    await handleResolve(publicUserId);
  };

  if (busy) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}> 
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={styles.header}><Text style={{ color: theme.text, fontSize: 18 }}>Scan QR</Text></View>

      {permissionStatus === 'granted' ? (
        <View style={styles.scannerWrap}>
          <Camera
            scanBarcode
            onReadCode={handleDecoded}
            showFrame
            laserColor={theme.primary}
            frameColor={theme.primary}
            cameraType="back"
            torchMode="off"
            style={styles.scanner}
          />
          {scannerError ? <Text style={[styles.errorText, { color: theme.textSecondary }]}>{scannerError}</Text> : null}
        </View>
      ) : (
        <View style={styles.fallback}>
          <Text style={{ color: theme.textSecondary }}>
            {scannerError || 'Open the camera to scan an invite QR code, or paste the invite link below:'}
          </Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={manualInput}
            onChangeText={setManualInput}
            placeholder="vschat://user/{uuid}"
            placeholderTextColor={theme.textSecondary}
          />
          <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]} onPress={handleStartChat}>
            <Text style={{ color: theme.background }}>Start Chat</Text>
          </TouchableOpacity>
          {permissionStatus === 'denied' ? (
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>Camera permission is required to scan QR codes.</Text>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16 },
  fallback: { padding: 20 },
  scannerWrap: { flex: 1 },
  scanner: { flex: 1 },
  scannerOverlay: { flex: 0 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 12 },
  button: { marginTop: 12, padding: 12, borderRadius: 8, alignItems: 'center' },
  helperText: { marginTop: 8 },
  errorText: { marginTop: 12, paddingHorizontal: 20 },
});

export default ScanQRScreen;
