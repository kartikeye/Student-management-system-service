import { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const { COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID } = process.env;

if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) {
  console.warn(
    "COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID are not set — all authenticated routes will reject requests."
  );
}

// Verifies the access token (not the ID token) — it's the one meant for
// authorizing API calls and carries the "cognito:groups" claim we use for RBAC.
const verifier =
  COGNITO_USER_POOL_ID && COGNITO_CLIENT_ID
    ? CognitoJwtVerifier.create({
        userPoolId: COGNITO_USER_POOL_ID,
        clientId: COGNITO_CLIENT_ID,
        tokenUse: "access",
      })
    : null;

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  if (!verifier) {
    return res.status(500).json({ message: "Auth is not configured on the server." });
  }

  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing Authorization header." });
  }

  try {
    const payload = await verifier.verify(token);
    req.user = {
      sub: payload.sub,
      username: payload.username,
      groups: Array.isArray(payload["cognito:groups"]) ? (payload["cognito:groups"] as string[]) : [],
    };
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

export const requireGroup =
  (...allowed: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const groups = req.user?.groups ?? [];
    if (!allowed.some((group) => groups.includes(group))) {
      return res.status(403).json({ message: "Insufficient permissions." });
    }
    next();
  };
