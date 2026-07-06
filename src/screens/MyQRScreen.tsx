// @ts-nocheck
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Share,
  TextInput,  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import RNShare from 'react-native-share';
import api from '../config/api';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { buildInviteLink } from '../utils/inviteLink';
import Header from '../components/Header';

const MyQRScreen = ({ navigation }) => {
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState(null);
  const [deepLink, setDeepLink] = useState(null);
  const qrCodeRef = useRef(null);
  const viewShotRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  const fetchQr = async () => {
    setLoading(true);
    try {
      const resp = await api.get('/users/me/qr');
      setQr(resp.data);
    } catch (e) {
      console.warn('Failed to load QR', e && e.message);
      Alert.alert('Error', 'Could not load QR code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQr();
  }, []);

  useEffect(() => {
    const publicId = qr && (qr.publicUserId || qr.publicId || qr.id)
      ? (qr.publicUserId || qr.publicId || qr.id)
      : (user && user.publicUserId ? user.publicUserId : null);

    setDeepLink(buildInviteLink(publicId));
  }, [qr, user]);

  const handleShareQRCode = async () => {
    try {
      setSharing(true);
      
      if (!viewShotRef.current) {
        Alert.alert('Error', 'QR code not ready');
        setSharing(false);
        return;
      }

      // Capture the QR code as an image
      const imageUri = await viewShotRef.current.capture();
      
      // Share using react-native-share which handles images better
      await RNShare.open({
        url: Platform.OS === 'ios' ? imageUri : `file://${imageUri}`,
        type: 'image/png',
        message: 'Scan this QR code to start a chat with me!',
        title: 'My QR Code',
      });
      
      setSharing(false);
    } catch (e) {
      if (e.message !== 'User did not share') {
        console.warn('qr share error', e && e.message);
        Alert.alert('Error', 'Could not share QR code');
      }
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Header
          title="My QR"
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
          theme={theme}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const payload = deepLink || (qr && qr.qrUri ? qr.qrUri : null);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="My QR"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        theme={theme}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
        {qr && qr.profilePictureUrl ? (
          <Image source={{ uri: qr.profilePictureUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.surface }]} />
        )}
        <Text style={[styles.name, { color: theme.text }]}>{qr?.displayName || user?.displayName || 'You'}</Text>

        <Text style={[styles.notice, { color: theme.textSecondary }]}>Share the invite link or QR code below to let others start a chat with you.</Text>

        {payload ? (
          <>
            <ViewShot 
              ref={viewShotRef}
              options={{ format: 'png', quality: 0.9 }}
              style={[styles.qrBox, { borderColor: theme.border, backgroundColor: '#FFFFFF' }]}
            > 
              <QRCode 
                getRef={(c) => { qrCodeRef.current = c; }}
                value={payload} 
                size={220} 
                backgroundColor="#FFFFFF" 
                color="#111827" 
              />
            </ViewShot>

            <TouchableOpacity
              style={[styles.shareQRButton, { backgroundColor: theme.primary }]}
              onPress={handleShareQRCode}
              disabled={sharing}
            >
              <Text style={{ color: theme.background, fontWeight: '600' }}>
                {sharing ? 'Preparing...' : 'Share QR Code'}
              </Text>
            </TouchableOpacity>

            <View style={[styles.deepLinkBox, { borderColor: theme.border }]}> 
              <TextInput value={payload} selectTextOnFocus editable={false} style={[styles.deepLinkText, { color: theme.text }]} />
              <TouchableOpacity
                style={[styles.shareButton, { backgroundColor: theme.primary }]}
                onPress={async () => {
                  try {
                    await Share.share({ message: payload });
                  } catch (e) {
                    console.warn('share failed', e && e.message);
                    Alert.alert('Error', 'Could not share link');
                  }
                }}>
                <Text style={{ color: theme.background, fontWeight: '600' }}>Share Link</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={{ color: theme.textSecondary }}>Invite link not available</Text>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 16 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  name: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  qrBox: { padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 12 },
  notice: { textAlign: 'center', paddingHorizontal: 20, marginBottom: 8 },
  shareQRButton: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, alignItems: 'center', width: '100%' },
  deepLinkBox: { width: '100%', marginTop: 12, borderWidth: 1, borderRadius: 8, padding: 8, flexDirection: 'row', alignItems: 'center' },
  deepLinkText: { flex: 1, paddingVertical: 8, paddingHorizontal: 8 },
  shareButton: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
});

export default MyQRScreen;

