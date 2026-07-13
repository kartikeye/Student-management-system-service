// Bridges the current Cognito access token from AuthContext to the axios
// instance in api/studentApi.ts without creating a circular import between them.
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;
