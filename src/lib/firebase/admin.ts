import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App | null {
  if (app) return app;

  if (admin.apps.length > 0) {
    app = admin.apps[0]!;
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    try {
      app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      return app;
    } catch (error) {
      console.error('Error initializing Firebase Admin SDK:', error);
      return null;
    }
  }

  // Graceful fallback for local development before credentials are set
  return null;
}

export async function sendEmergencyPushToTopic(topic: string, title: string, body: string, data: Record<string, string> = {}) {
  const firebase = getFirebaseAdmin();
  if (!firebase) {
    console.warn('[FCM] Firebase Admin not initialized. Skipping push to topic:', topic);
    return { success: false, error: 'Firebase Admin not configured' };
  }

  try {
    const message: admin.messaging.Message = {
      topic,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'emergency_alerts',
          priority: 'max',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
    };

    const response = await firebase.messaging().send(message);
    return { success: true, messageId: response };
  } catch (error: any) {
    console.error('[FCM Error]:', error);
    return { success: false, error: error.message };
  }
}
