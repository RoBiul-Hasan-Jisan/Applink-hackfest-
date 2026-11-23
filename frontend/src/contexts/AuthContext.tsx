'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
export type Role = 'volunteer' | 'coordinator' | 'admin' | null;
interface A { user: User | null; role: Role; loading: boolean; signIn: (e: string, p: string) => Promise<unknown>; signInGoogle: () => Promise<unknown>; signOut: () => Promise<void> }
const Ctx = createContext<A>(null as unknown as A);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null), [role, setRole] = useState<Role>(null), [loading, setLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u); setRole(u ? (((await u.getIdTokenResult(true)).claims.role as Role) ?? null) : null); setLoading(false); // role comes ONLY from Firebase custom claims
  }), []);
  return <Ctx.Provider value={{ user, role, loading, signIn: (e, p) => signInWithEmailAndPassword(auth, e, p), signInGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()), signOut: () => fbSignOut(auth) }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
