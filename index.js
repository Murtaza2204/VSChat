/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

const CALL_NOTIFICATION_CHANNEL_ID = 'incoming_call_ringtone';
const MESSAGE_NOTIFICATION_CHANNEL_ID = 'message_notifications_v1';

const cancelIncomingCallNotification = async (notificationId) => {
	if (!notificationId) return;
	try { await notifee.cancelDisplayedNotification(notificationId); } catch (e) {}
	try { await notifee.cancelNotification(notificationId); } catch (e) {}
};

const displayIncomingCallNotification = async (remoteMessage) => {
	const data = remoteMessage?.data || {};
	const notificationId = String(data.notificationId || data.messageId || data.callId || '');
	const title = data.title || remoteMessage.notification?.title || 'Incoming call';
	const body = data.body || remoteMessage.notification?.body || `${data.fromName || 'Caller'} is calling`;

	if (data.type === 'call_ended') {
		await cancelIncomingCallNotification(notificationId);
		return;
	}

	if (data.type !== 'call') {
		return;
	}

	const channelId = await notifee.createChannel({
		id: CALL_NOTIFICATION_CHANNEL_ID,
		name: 'Incoming calls',
		importance: AndroidImportance.HIGH,
		sound: 'incoming_call',
	});

	await notifee.displayNotification({
		id: notificationId || undefined,
		title,
		body,
		android: {
			channelId,
			smallIcon: 'ic_launcher',
			actions: [
				{ title: 'Accept', pressAction: { id: 'accept', launchActivity: 'default' } },
				{ title: 'Decline', pressAction: { id: 'decline' } },
			],
			category: 'call',
			importance: AndroidImportance.HIGH,
			sound: 'incoming_call',
			loopSound: true,
			ongoing: true,
		},
		data,
	});
};

const displayMessageNotification = async (remoteMessage) => {
	const data = remoteMessage?.data || {};
	const notificationId = String(data.notificationId || data.messageId || data.callId || '');

	const channelId = await notifee.createChannel({
		id: MESSAGE_NOTIFICATION_CHANNEL_ID,
		name: 'Messages',
		importance: AndroidImportance.DEFAULT,
		sound: 'message_notification',
	});

	await notifee.displayNotification({
		id: notificationId || undefined,
		title: data.title || remoteMessage.notification?.title || 'New message',
		body: data.body || remoteMessage.notification?.body || '',
		android: {
			channelId,
			smallIcon: 'ic_launcher',
			actions: [
				{ title: 'Reply', pressAction: { id: 'reply' }, input: { allowFreeFormInput: true, placeholder: 'Type a reply' } },
				{ title: 'Mark as read', pressAction: { id: 'mark_read' } },
			],
			importance: AndroidImportance.DEFAULT,
			sound: 'message_notification',
		},
		data,
	});
};

// Background handler for FCM messages
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
	console.log('FCM background message received', remoteMessage);
	try {
		const data = remoteMessage?.data || {};
		const notificationId = String(data.notificationId || data.messageId || data.callId || '');
		const type = data.type || (remoteMessage.notification ? 'message' : 'message');

		if (type === 'call_ended') {
			await cancelIncomingCallNotification(notificationId);
			return;
		}

		if (type === 'call' && data.expiresAt && Date.parse(String(data.expiresAt)) <= Date.now()) {
			await cancelIncomingCallNotification(notificationId);
			return;
		}

		if (type === 'call') {
			await displayIncomingCallNotification(remoteMessage);
			return;
		}

		await displayMessageNotification(remoteMessage);
	} catch (e) {
		console.warn('Background notifee display failed', e);
	}
});

AppRegistry.registerComponent(appName, () => App);
