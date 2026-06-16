import React, { useEffect, useState } from 'react';
import { View, FlatList, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import contactSync from '../utils/contactSync';

const ContactPicker: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [contacts, setContacts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const matched = await contactSync.syncDeviceContacts();
        setContacts(matched);
      } catch (e) {
        console.warn((e as any).message || e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <ActivityIndicator style={{flex:1}} />;

  return (
    <View style={{flex:1}}>
      <FlatList
        data={contacts}
        keyExtractor={(item) => String(item._id || item.id || item.phoneNumber)}
        renderItem={({item}) => (
          <TouchableOpacity style={{padding:16}} onPress={() => navigation.navigate('Chat', { userId: item._id || item.id })}>
            <Text style={{fontWeight:'600'}}>{item.displayName || item.phoneNumber}</Text>
            <Text style={{color:'#666'}}>{item.phoneNumber}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => <Text style={{padding:16}}>No contacts found on VSChat.</Text>}
      />
    </View>
  );
};

export default ContactPicker;
