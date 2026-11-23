import admin from 'firebase-admin';
import { env } from './env.ts';

export function getFirebaseAuth(): admin.auth.Auth {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) throw new Error('Firebase Admin credentials are not configured');
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
  }
  return admin.auth();
}
