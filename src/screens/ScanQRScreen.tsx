// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import api from '../config/api';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';

const ScanQRScreen = ({ navigation }) => {
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const [scanningAvailable] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Scanner library removed; keep fallback input only
  }, []);

  const handleDecoded = async (data) => {
    // data might be an object or string depending on scanner
    const text = (data && data.data) ? data.data : (typeof data === 'string' ? data : null);
    if (!text) return;
    // extract publicUserId from supported patterns
    const match1 = text.match(/vschat:\/\/user\/([0-9a-fA-F-]{36})/);
    const match2 = text.match(/https?:\/\/[^\/]+\/u\/([0-9a-fA-F-]{36})/);
    const raw = match1 ? match1[1] : (match2 ? match2[1] : text);
    await handleResolve(raw);
  };

  const handleResolve = async (publicUserId) => {
    setBusy(true);
    try {
      // Resolve public profile (optional) and create/find conversation idempotently
      const resp = await api.post('/conversations/direct', { publicUserId });
      const conversation = resp.data.conversation;
      if (!conversation) return Alert.alert('Error', 'Could not open conversation');
      // navigate to nested Chat screen (Main -> Chats -> Chat)
      navigation.navigate('Main', { screen: 'Chats', params: { screen: 'Chat', params: { conversationId: conversation._id, participant: conversation.participantProfile } } });
    } catch (e) {
      console.warn('resolve/create convo failed', e && e.message, e && e.response && e.response.data);
      const serverMsg = e && e.response && (e.response.data && (e.response.data.message || e.response.data.error)) ? (e.response.data.message || e.response.data.error) : null;
      Alert.alert('Error', serverMsg || 'Could not open conversation');
    } finally { setBusy(false); }
  };

  const handleStartChat = async () => {
    const text = manualInput.trim();
    if (!text) return Alert.alert('Enter publicUserId');
    // accept full deep-link or raw id
    const match1 = text.match(/vschat:\/\/user\/([0-9a-fA-F-]{36})/);
    const match2 = text.match(/https?:\/\/[^\/]+\/u\/([0-9a-fA-F-]{36})/);
    const id = match1 ? match1[1] : (match2 ? match2[1] : text);
    console.warn('Resolving publicUserId payload', { publicUserId: id });
    await handleResolve(id);
  };

  if (busy) return <View style={[styles.container, { backgroundColor: theme.background }]}><ActivityIndicator /></View>;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={styles.header}><Text style={{ color: theme.text, fontSize: 18 }}>Scan QR</Text></View>
      <View style={styles.fallback}>
        <Text style={{ color: theme.textSecondary }}>Camera scanner removed. Paste publicUserId or deep-link URL below:</Text>
        <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} value={manualInput} onChangeText={setManualInput} placeholder="vschat://user/{uuid}" placeholderTextColor={theme.textSecondary} />
        <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]} onPress={handleStartChat}><Text style={{ color: theme.background }}>Start Chat</Text></TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({ container: { flex: 1 }, header: { padding: 16 }, fallback: { padding: 20 }, input: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 12 }, button: { marginTop: 12, padding: 12, borderRadius: 8, alignItems: 'center' } });

export default ScanQRScreen;
