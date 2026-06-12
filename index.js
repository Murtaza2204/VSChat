/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

// Background handler for FCM messages
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
	console.log('FCM background message received', remoteMessage);
	try {
		// create channel (Android)
		const channelId = await notifee.createChannel({ id: 'default', name: 'Default', importance: AndroidImportance.HIGH });

		const data = remoteMessage?.data || {};
		const type = data.type || (remoteMessage.notification ? 'message' : 'message');

		if (type === 'call') {
			await notifee.displayNotification({
				title: remoteMessage.notification?.title || 'Incoming call',
				body: remoteMessage.notification?.body || `${data.fromName || 'Caller'} is calling`,
				android: {
					channelId,
					smallIcon: 'ic_launcher',
					actions: [
						{ title: 'Accept', pressAction: { id: 'accept' } },
						{ title: 'Decline', pressAction: { id: 'decline' } },
					],
					category: 'call',
					importance: AndroidImportance.HIGH,
				},
				data,
			});
		} else {
			// message: include reply and mark as read actions
			await notifee.displayNotification({
				title: remoteMessage.notification?.title || 'New message',
				body: remoteMessage.notification?.body || '',
				android: {
					channelId,
					smallIcon: 'ic_launcher',
					actions: [
						{ title: 'Reply', pressAction: { id: 'reply' }, input: { allowFreeFormInput: true, placeholder: 'Type a reply' } },
						{ title: 'Mark as read', pressAction: { id: 'mark_read' } },
					],
					importance: AndroidImportance.DEFAULT,
				},
				data,
			});
		}
	} catch (e) {
		console.warn('Background notifee display failed', e);
	}
});

AppRegistry.registerComponent(appName, () => App);
