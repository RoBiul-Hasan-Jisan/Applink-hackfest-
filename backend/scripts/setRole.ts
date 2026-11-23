// Bootstrap the FIRST admin (or fix a role) from the server operator's machine. Sets Firebase custom claims + the profile.
// usage: node scripts/setRole.ts <email> <admin|coordinator|volunteer> "<Full Name>"
import mongoose from 'mongoose';
import { env } from '../src/config/env.ts';
import { getFirebaseAuth } from '../src/config/firebase.ts';
import { User } from '../src/models/index.ts';

const [email, role, name] = process.argv.slice(2);
if (!email || !['admin', 'coordinator', 'volunteer'].includes(role ?? '') || !name) throw new Error('usage: setRole.ts <email> <admin|coordinator|volunteer> "<Full Name>"');
const auth = getFirebaseAuth(), fu = await auth.getUserByEmail(email);
await mongoose.connect(env.MONGODB_URI);
const u = await User.findOneAndUpdate({ firebaseUid: fu.uid }, { $set: { name, role, identityApproved: true } }, { upsert: true, new: true });
await auth.setCustomUserClaims(fu.uid, { role, phoneVerified: !!u.phoneVerified });
console.log(`${email} is now ${role} (phone verified: ${!!u.phoneVerified}). They must sign in again to refresh their token.`); await mongoose.disconnect();
