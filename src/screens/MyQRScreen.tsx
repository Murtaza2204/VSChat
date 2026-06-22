// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import api from '../config/api';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';

const MyQRScreen = ({ navigation }) => {
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState(null);

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

        {payload ? (
          <View style={styles.qrBox}>
            <QRCode value={payload} size={220} />
          </View>
        ) : (
          <Text style={{ color: theme.textSecondary }}>No QR available</Text>
        )}

        <Text style={[styles.hint, { color: theme.textSecondary, marginTop: 12 }]}>Scan this QR to connect with you</Text>

        <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]} onPress={handleRegenerate}>
          <Text style={{ color: theme.background, fontWeight: '600' }}>Regenerate QR</Text>
        </TouchableOpacity>
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
});

export default MyQRScreen;
