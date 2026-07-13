import { CognitoUserPool } from 'amazon-cognito-identity-js';

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

if (!userPoolId || !clientId) {
  console.warn('VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID are not set — sign in will fail.');
}

export const userPool = new CognitoUserPool({
  UserPoolId: userPoolId ?? '',
  ClientId: clientId ?? '',
});
