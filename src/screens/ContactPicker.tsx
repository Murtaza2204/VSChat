import React, { useEffect, useState } from 'react';
import { View, FlatList, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import contactSync from '../utils/contactSync';

const ContactPicker = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const matched = await contactSync.syncDeviceContacts();
        setContacts(matched);
      } catch (e) {
        console.warn(e.message || e);
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
        keyExtractor={(item) => item._id}
        renderItem={({item}) => (
          <TouchableOpacity style={{padding:16}} onPress={() => navigation.navigate('Chat', { userId: item._id })}>
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
