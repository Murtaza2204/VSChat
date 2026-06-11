import { Platform, Alert } from 'react-native';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';

export const requestAudioVideoPermissions = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'android') {
      const cam = await request(PERMISSIONS.ANDROID.CAMERA);
      const mic = await request(PERMISSIONS.ANDROID.RECORD_AUDIO);
      return cam === RESULTS.GRANTED && mic === RESULTS.GRANTED;
    }

    // iOS
    const cam = await request(PERMISSIONS.IOS.CAMERA);
    const mic = await request(PERMISSIONS.IOS.MICROPHONE);
    return cam === RESULTS.GRANTED && mic === RESULTS.GRANTED;
  } catch (e) {
    console.warn('Permission request failed', e);
    return false;
  }
};

export const ensureAudioVideoPermissions = async (): Promise<boolean> => {
  const granted = await requestAudioVideoPermissions();
  if (!granted) {
    Alert.alert(
      'Permissions required',
      'Camera and microphone permissions are required for calls. Please enable them in settings.',
    );
  }
  return granted;
};

export default { requestAudioVideoPermissions, ensureAudioVideoPermissions };
