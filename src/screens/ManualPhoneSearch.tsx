import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import contactSync from '../utils/contactSync';

const ManualPhoneSearch = ({ navigation }) => {
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState(null);

  const onSearch = async () => {
    const res = await contactSync.checkPhoneNumber(phone);
    setResult(res);
  };

  return (
    <View style={{padding:16}}>
      <TextInput placeholder="Enter phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={{borderWidth:1,borderColor:'#ddd',padding:8,marginBottom:12}} />
      <Button title="Search" onPress={onSearch} />

      {result && (
        result.found ? (
          <View style={{marginTop:16}}>
            <Text style={{fontWeight:'600'}}>{result.user.displayName || result.user.phoneNumber}</Text>
            <Text>{result.user.phoneNumber}</Text>
            <Button title="Open Chat" onPress={() => navigation.navigate('Chat', { userId: result.user._id })} />
          </View>
        ) : (
          <View style={{marginTop:16}}>
            <Text>User not registered on VSChat.</Text>
            <Text style={{color:'#666',marginTop:8}}>Invite feature coming soon.</Text>
          </View>
        )
      )}
    </View>
  );
};

export default ManualPhoneSearch;
