import { PermissionsAndroid, Platform } from 'react-native';
import Contacts from 'react-native-contacts';
import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';
import api from '../config/api';

const requestContactsPermission = async () => {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      {
        title: 'Contacts',
        message: 'This app needs access to your contacts to find friends on VSChat.',
        buttonPositive: 'OK'
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
};

const normalizeToE164 = (raw: string) => {
  try {
    const pn = parsePhoneNumberFromString(raw, 'IN');
    if (pn && pn.isValid()) return pn.number; // returns E.164
  } catch (e) {}
  // fallback: strip non-digits and prefix + if country default unknown
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return null;
};

export const syncDeviceContacts = async () => {
  const ok = await requestContactsPermission();
  if (!ok) throw new Error('Contacts permission denied');

  const contacts = await Contacts.getAll();
  console.warn('Device contacts count', contacts.length);
  const phones = new Set();

  contacts.forEach(c => {
    (c.phoneNumbers || []).forEach(p => {
      const e164 = normalizeToE164(p.number);
      if (e164) phones.add(e164);
    });
  });

  const list = Array.from(phones);
  console.warn('Normalized phones count', list.length);
  console.warn('First normalized phones sample', list.slice(0, 20));
  const res = await api.post('/contacts/sync', { phones: list });
  console.warn('Backend response status', res.status);
  console.warn('Backend response body', res.data);
  console.warn('Backend matched count', (res.data && res.data.matched && res.data.matched.length) || 0);
  return res.data.matched; // array of matched user profiles
};

export const checkPhoneNumber = async (phone: string) => {
  const e164 = normalizeToE164(phone);
  if (!e164) return { found: false };
  const res = await api.post('/users/check-phone', { phone: e164 });
  return res.data;
};

export default {
  syncDeviceContacts,
  checkPhoneNumber,
};
