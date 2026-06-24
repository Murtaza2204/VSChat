// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, Share, TextInput } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import api from '../config/api';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';

const MyQRScreen = ({ navigation }) => {
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState(null);
  const [deepLink, setDeepLink] = useState(null);

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

  useEffect(() => { fetchQr(); }, []);

  useEffect(() => {
    // build a deep-link URL that other users can open to start a chat
    const publicId = qr && (qr.publicUserId || qr.publicId || qr.id) ? (qr.publicUserId || qr.publicId || qr.id) : (user && user.publicUserId ? user.publicUserId : null);
    if (publicId) {
      const url = `vschat://user/${publicId}`;
      setDeepLink(url);
    }
  }, [qr, user]);

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      const resp = await api.post('/users/regenerate-qr', { generateInvite: false });
      setQr(resp.data);
      Alert.alert('QR regenerated');
    } catch (e) {
      console.warn('regenerate failed', e && e.message);
      Alert.alert('Error', 'Could not regenerate QR');
    } finally { setLoading(false); }
  };

  if (loading) return <View style={[styles.container, { backgroundColor: theme.background }]}><ActivityIndicator /></View>;

  const payload = qr && qr.qrUri ? qr.qrUri : (qr && qr.publicUserId ? `vschat://user/${qr.publicUserId}` : null);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={styles.content}>
        {qr && qr.profilePictureUrl ? (
          <Image source={{ uri: qr.profilePictureUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.surface }]} />
        )}
        <Text style={[styles.name, { color: theme.text }]}>{qr?.displayName || user?.displayName || 'You'}</Text>

        <Text style={[styles.notice, { color: theme.textSecondary }]}>QR generation is temporarily disabled. You can share the link below to let others start a chat with you.</Text>

        {deepLink ? (
          <View style={[styles.deepLinkBox, { borderColor: theme.border }]}> 
            <TextInput value={deepLink} selectTextOnFocus editable={false} style={[styles.deepLinkText, { color: theme.text }]} />
            <TouchableOpacity style={[styles.shareButton, { backgroundColor: theme.primary }]} onPress={async () => {
              try {
                await Share.share({ message: deepLink });
              } catch (e) {
                console.warn('share failed', e && e.message);
                Alert.alert('Error', 'Could not share link');
              }
            }}>
              <Text style={{ color: theme.background, fontWeight: '600' }}>Share Link</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={{ color: theme.textSecondary }}>Deep link not available</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  name: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  qrBox: { padding: 16, backgroundColor: '#fff', borderRadius: 8 },
  hint: { fontSize: 14 },
  button: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  notice: { textAlign: 'center', paddingHorizontal: 20 },
  deepLinkBox: { width: '90%', marginTop: 12, borderWidth: 1, borderRadius: 8, padding: 8, flexDirection: 'row', alignItems: 'center' },
  deepLinkText: { flex: 1, paddingVertical: 8, paddingHorizontal: 8 },
  shareButton: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
});

export default MyQRScreen;
