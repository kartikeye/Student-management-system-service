import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CognitoUser,
  CognitoUserAttribute,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';
import type { CognitoUserSession } from 'amazon-cognito-identity-js';
import { userPool } from './cognitoConfig';
import { setAccessToken } from './tokenStore';

interface AuthUser {
  email: string;
  groups: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = () => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      setAccessToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        setAccessToken(null);
        setUser(null);
        setLoading(false);
        return;
      }

      const accessTokenPayload = session.getAccessToken().payload as Record<string, unknown>;
      setAccessToken(session.getAccessToken().getJwtToken());
      setUser({
        email: typeof accessTokenPayload.username === 'string' ? accessTokenPayload.username : '',
        groups: Array.isArray(accessTokenPayload['cognito:groups'])
          ? (accessTokenPayload['cognito:groups'] as string[])
          : [],
      });
      setLoading(false);
    });
  };

  useEffect(() => {
    loadSession();
  }, []);

  const signUp = (email: string, password: string) =>
    new Promise<void>((resolve, reject) => {
      const attributes = [new CognitoUserAttribute({ Name: 'email', Value: email })];
      userPool.signUp(email, password, attributes, [], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

  const confirmSignUp = (email: string, code: string) =>
    new Promise<void>((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      cognitoUser.confirmRegistration(code, true, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

  const resendCode = (email: string) =>
    new Promise<void>((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      cognitoUser.resendConfirmationCode((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

  const signIn = (email: string, password: string) =>
    new Promise<void>((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      const authDetails = new AuthenticationDetails({ Username: email, Password: password });
      cognitoUser.authenticateUser(authDetails, {
        onSuccess: () => {
          loadSession();
          resolve();
        },
        onFailure: (err) => reject(err),
      });
    });

  const signOut = () => {
    userPool.getCurrentUser()?.signOut();
    setAccessToken(null);
    setUser(null);
  };

  const isAdmin = user?.groups?.includes('admin') ?? false;

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signIn, signUp, confirmSignUp, resendCode, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
