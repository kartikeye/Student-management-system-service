# AWS Cognito Setup & Implementation Guide

This document explains how authentication and role-based access control (RBAC) work in the Student Management System, why each piece is built the way it is, and walks through the full request lifecycle from sign-up to an authorized API call.

Related: [aws/AWS_Archetect.md](aws/AWS_Archetect.md) covers the overall AWS infrastructure (VPC, RDS, EC2). This doc focuses specifically on identity.

---

## 1. What problem this solves

Before this work, the API (`api-studentMangSys`) had **no authentication at all** — every `/students` route was open to anyone. The requirements were:

1. Users authenticate with email + password.
2. Students can **self-register** (no admin has to create their account).
3. Only **admins** can delete student records; any authenticated user can read/create/update.
4. No custom user database — identity is fully delegated to a managed service (Cognito), so there are no passwords to hash, store, or leak.

Cognito was chosen because it's a managed, free-tier-friendly identity provider that issues industry-standard JWTs and has first-class support for **groups**, which map naturally onto "roles" here.

---

## 2. Architecture at a glance

```
┌─────────────┐   1. Sign up / sign in (SRP)   ┌──────────────────────┐
│   Browser   │ ─────────────────────────────▶ │  Cognito User Pool   │
│  (React SPA)│ ◀───────────────────────────── │  (AuthStack)         │
└──────┬──────┘   ID / access / refresh tokens  └──────────┬───────────┘
       │                                                    │ PostConfirmation
       │ 2. API calls with                                  │ trigger
       │    Authorization: Bearer <access token>            ▼
       │                                          ┌──────────────────────┐
       ▼                                          │  Lambda: auto-adds   │
┌─────────────┐  3. Verify JWT against Cognito's  │  new users to the    │
│  Express API │    JWKS, read cognito:groups      │  "student" group     │
│ (EC2/Docker) │ ─────────────────────────────────▶└──────────────────────┘
└──────┬───────┘
       │ 4. Authorized request proceeds
       ▼
┌─────────────┐
│  PostgreSQL  │
│    (RDS)     │
└─────────────┘
```

Key design decision: **the API never sees a password, and Cognito never sees the database.** The browser talks to Cognito directly (steps 1) using the SRP protocol, which never transmits the password itself — only cryptographic proof of it. The API's only job is to verify the token Cognito issued (step 3) using Cognito's public signing keys (JWKS), which requires no network call to Cognito and no shared secret.

---

## 3. The three pieces

| Layer | Location | Responsibility |
|---|---|---|
| Infrastructure | `aws/lib/auth-stack.ts` | Creates the User Pool, groups, app client, and the auto-group-assignment Lambda |
| Backend | `api-studentMangSys/src/middleware/auth.ts` | Verifies tokens on incoming requests, enforces group-based authorization |
| Frontend | `client-studentMangSys/src/auth/` | Talks to Cognito directly to sign up/in/out, holds the current session, attaches tokens to API calls |

---

## 4. Infrastructure: `AuthStack`

### 4.1 The User Pool

```ts
this.userPool = new cognito.UserPool(this, 'StudentMgmtUserPool', {
  selfSignUpEnabled: true,
  signInAliases: { email: true },
  autoVerify: { email: true },
  passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

- `selfSignUpEnabled: true` — lets anyone create an account (the "students self-register" requirement). Without this, only an admin could create users via `AdminCreateUser`.
- `signInAliases: { email: true }` — the username *is* the email address; no separate username field.
- `autoVerify: { email: true }` — after sign-up, Cognito emails a 6-digit code; confirming it marks the account verified and fires the `PostConfirmation` trigger (see 4.3).
- `removalPolicy: DESTROY` — this is a study/demo project, so the pool (and all its users) is deleted when you `cdk destroy`. **Don't use this in a real production pool** — you'd lose every user account.

### 4.2 Groups = roles

```ts
new cognito.CfnUserPoolGroup(this, 'AdminGroup', { groupName: 'admin', precedence: 0, ... });
new cognito.CfnUserPoolGroup(this, 'StudentGroup', { groupName: 'student', precedence: 10, ... });
```

Cognito groups aren't just labels — when a user who belongs to a group signs in, Cognito automatically embeds a `cognito:groups` claim (an array of group names) into both their ID token and access token. That claim is what the backend reads to make authorization decisions. This means **role information travels inside the JWT itself** — the API doesn't need to query anywhere to find out if a user is an admin.

`precedence` matters when a user is in multiple groups and you use Cognito's built-in IAM-role-mapping feature (not used here, since we only use a User Pool, not an Identity Pool) — lower number wins. It's set here mostly for correctness/documentation; harmless either way for our use case.

### 4.3 Auto-assigning the `student` group

This is the trickiest part of the stack, and the one place a subtle bug was found and fixed during implementation.

**The problem**: Cognito has no concept of "default group for self sign-up." If you do nothing, a self-registered user belongs to *no* group, and `cognito:groups` is simply absent from their token — which would make every route return `403` for everyone.

**The fix**: a `PostConfirmation` Lambda trigger. Cognito invokes this Lambda automatically right after a user confirms their email (`ConfirmSignUp`/`AdminConfirmSignUp`), and — critically — **synchronously**, meaning Cognito waits for the Lambda to finish before returning success to the client. That means by the time the confirmation call returns, group membership is already set; no race condition.

```js
exports.handler = async (event) => {
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;
  await client.send(new AdminAddUserToGroupCommand({
    UserPoolId: event.userPoolId,
    Username: event.userName,
    GroupName: 'student',
  }));
  return event; // Cognito requires the trigger to return the (possibly mutated) event
};
```

A few things worth noting:
- The code is inlined via `lambda.Code.fromInline(...)` rather than a separate file, because it's ~15 lines and doesn't justify a build step (no `esbuild`/`NodejsFunction` bundling needed).
- It `require()`s `@aws-sdk/client-cognito-identity-provider` without it being a declared dependency anywhere — this works because **AWS Lambda's Node.js 18+ runtimes ship AWS SDK v3 pre-installed** in the execution environment.
- There's no self-service way to become an `admin` — this is intentional. Promoting someone is a manual `admin-add-user-to-group` call (see §7). If self-registered users could grant themselves admin, the RBAC would be meaningless.

**The circular dependency bug** (fixed, worth understanding if you touch this file again): the Lambda's IAM policy needs permission to call `AdminAddUserToGroup` scoped to the pool. The naive approach is:

```ts
// DON'T DO THIS — causes a circular dependency
resources: [this.userPool.userPoolArn]
```

This creates a CloudFormation dependency: *Lambda's policy → User Pool* (the policy needs the pool's ARN attribute). But `this.userPool.addTrigger(...)` creates the opposite dependency: *User Pool → Lambda* (the pool's `LambdaConfig` needs the function's ARN). Two resources each waiting on the other is a cycle CloudFormation cannot resolve, and `cdk deploy` fails with `Circular dependency between resources`.

The fix is to scope the policy to a wildcard pattern instead of the specific pool's CDK token, which doesn't create a resource-level dependency edge:

```ts
resources: [cdk.Arn.format({ service: 'cognito-idp', resource: 'userpool', resourceName: '*' }, this)]
// → arn:aws:cognito-idp:ap-southeast-2:<account>:userpool/*
```

This is slightly less tightly scoped (any user pool in the account/region, not just this one), but for a single-pool-per-environment setup it's a reasonable tradeoff to avoid the cycle. If you ever need it scoped exactly, you'd have to break the cycle a different way (e.g., a separate custom resource that runs after both exist).

### 4.4 The App Client

```ts
this.userPoolClient = new cognito.UserPoolClient(this, 'StudentMgmtUserPoolClient', {
  generateSecret: false,
  authFlows: { userSrp: true },
  accessTokenValidity: cdk.Duration.hours(1),
  refreshTokenValidity: cdk.Duration.days(30),
});
```

- `generateSecret: false` — this client is used **directly by the browser** (a "public client" in OAuth terms). A client secret can't be kept secret in JS shipped to a browser, so Cognito app clients used by SPAs must never have one.
- `authFlows: { userSrp: true }` — only SRP (Secure Remote Password) is allowed. SRP is a zero-knowledge proof protocol: the browser proves it knows the password without ever sending it (or a hash of it) over the wire. This is what `amazon-cognito-identity-js` implements on the frontend. We deliberately did **not** enable `USER_PASSWORD_AUTH` (which sends the plaintext password over TLS) — SRP is strictly more secure and is the flow the frontend library already uses.
- CDK also always enables `ALLOW_REFRESH_TOKEN_AUTH` regardless of these flags (hardcoded in the L2 construct) — refresh tokens are how the session survives longer than the 1-hour access token without re-prompting for a password.

---

## 5. Backend: verifying tokens and enforcing roles

File: [api-studentMangSys/src/middleware/auth.ts](api-studentMangSys/src/middleware/auth.ts)

### 5.1 Why verify the *access* token, not the *ID* token

Cognito issues three tokens on sign-in:

| Token | Purpose |
|---|---|
| **ID token** | Describes *who the user is* (email, name, etc.) — meant for the client app to read, not for authorizing API calls |
| **Access token** | Describes *what the user can do* — meant to be sent to resource servers (our API) to authorize requests. Carries `cognito:groups`. |
| **Refresh token** | Used to silently get new ID/access tokens without re-authenticating |

The middleware verifies the **access token** — that's the one designed for this exact purpose, and the one that carries the group claim we need.

### 5.2 How verification works (no network call per request)

```ts
const verifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_USER_POOL_ID,
  clientId: COGNITO_CLIENT_ID,
  tokenUse: 'access',
});
```

`aws-jwt-verify` fetches the User Pool's public JSON Web Key Set (JWKS) once, caches it, and then verifies each incoming token's RSA signature locally — no call to Cognito on the hot path. It also checks `iss` (issuer matches this pool), `token_use` (must be `access`), `client_id`, and expiry. If any check fails, verification throws and the request is rejected with `401`.

### 5.3 The middleware

```ts
export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing Authorization header.' });

  try {
    const payload = await verifier.verify(token);
    req.user = {
      sub: payload.sub,
      username: payload.username,
      groups: Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] : [],
    };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

export const requireGroup = (...allowed: string[]) => (req, res, next) => {
  const groups = req.user?.groups ?? [];
  if (!allowed.some((g) => groups.includes(g))) {
    return res.status(403).json({ message: 'Insufficient permissions.' });
  }
  next();
};
```

`req.user` is typed via a small ambient declaration in [api-studentMangSys/src/types/express.d.ts](api-studentMangSys/src/types/express.d.ts) that augments Express's `Request` interface — this is what lets `req.user.groups` type-check everywhere without casting.

### 5.4 Wiring it into routes

File: [api-studentMangSys/src/routes/studentsRoute.ts](api-studentMangSys/src/routes/studentsRoute.ts)

```ts
router.use(authenticate);                                  // every route below needs a valid token
router.post('/', asyncHandler(createStudent));
router.get('/', asyncHandler(getStudents));
router.get('/:id', asyncHandler(getStudentById));
router.put('/:id', asyncHandler(updateStudent));
router.delete('/:id', requireGroup('admin'), asyncHandler(deleteStudent));   // + admin-only
```

`router.use(authenticate)` applies to every route registered after it in this router — that's why it's declared before the route list. `requireGroup('admin')` is inserted only in front of the `DELETE` handler, as a second middleware in that specific chain.

---

## 6. Frontend: talking to Cognito directly

The React app never sends a password to our own API — it talks to Cognito's endpoints directly using `amazon-cognito-identity-js`, gets back tokens, and only then talks to our API.

### 6.1 File map

| File | Purpose |
|---|---|
| `src/auth/cognitoConfig.ts` | Creates the `CognitoUserPool` instance from `VITE_COGNITO_*` env vars |
| `src/auth/AuthContext.tsx` | React context: sign up, confirm, resend code, sign in, sign out, current user/groups |
| `src/auth/AuthScreen.tsx` | The login/signup/confirm-code UI (MUI) |
| `src/auth/tokenStore.ts` | A tiny module holding the current access token, read by the API client |
| `src/api/studentApi.ts` | Axios instance; an interceptor attaches `Authorization: Bearer <token>` to every request |

### 6.2 Why `tokenStore.ts` exists

`AuthContext.tsx` and `studentApi.ts` both need the current access token, but `studentApi.ts` is a plain module (not a React component), so it can't call `useAuth()`. Rather than threading the token through every API call manually, `tokenStore.ts` is a minimal in-memory singleton:

```ts
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => { accessToken = token; };
export const getAccessToken = () => accessToken;
```

`AuthContext` calls `setAccessToken(...)` whenever the session changes (sign in, sign out, initial load); the axios interceptor in `studentApi.ts` calls `getAccessToken()` on every request:

```ts
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

### 6.3 The sign-up → confirm → sign-in flow

```
signUp(email, password)
   │  Cognito creates the user in UNCONFIRMED state, emails a 6-digit code
   ▼
confirmSignUp(email, code)
   │  Cognito verifies the code, marks user CONFIRMED,
   │  synchronously runs the PostConfirmation Lambda (adds "student" group)
   ▼
signIn(email, password)
   │  amazon-cognito-identity-js runs the SRP handshake — the password itself
   │  never leaves the browser, only cryptographic proof of it
   ▼
onSuccess(session) → access/ID/refresh tokens stored; setAccessToken() called
```

Each step is a thin promise wrapper around the callback-based `amazon-cognito-identity-js` API, e.g.:

```ts
const signIn = (email: string, password: string) =>
  new Promise<void>((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: () => { loadSession(); resolve(); },
      onFailure: (err) => reject(err),
    });
  });
```

### 6.4 Session restoration on page load

`amazon-cognito-identity-js` persists tokens in `localStorage` under the hood. `AuthContext`'s `loadSession()` runs on mount and calls `userPool.getCurrentUser()?.getSession(...)`, which — if a valid (or refreshable) session exists — resolves without requiring the user to log in again. This is why a page refresh doesn't kick you back to the login screen.

### 6.5 Gating the UI

`App.tsx` reads `user`, `loading`, and `isAdmin` from `useAuth()`:

```tsx
if (authLoading) return <CircularProgress />;
if (!user) return <AuthScreen />;
// ...authenticated dashboard, with:
<StudentTable ... canDelete={isAdmin} />
```

`isAdmin` is derived once, in `AuthContext`, from the token's groups claim:

```ts
const isAdmin = user?.groups?.includes('admin') ?? false;
```

`StudentTable` only renders the delete button/icon when `canDelete` is true — this is a **UX nicety, not a security boundary**. The real enforcement is server-side (`requireGroup('admin')` in §5.4); hiding the button just avoids showing students an action that would fail with `403` anyway. Anyone could re-enable the button via devtools and the request would still be rejected by the API.

### 6.6 The `global is not defined` gotcha

`amazon-cognito-identity-js` (through its crypto dependencies) references Node's `global` object, which doesn't exist in a browser. Vite doesn't polyfill Node globals by default (unlike older webpack-based tooling), so this throws at runtime unless you tell Vite to substitute it:

```ts
// vite.config.ts
export default defineConfig({
  define: { global: 'globalThis' },
});
```

If you ever see `ReferenceError: global is not defined` pointing into `amazon-cognito-identity-js`, this define is missing or the dev server wasn't restarted after adding it (Vite config changes require a restart, not just a browser refresh).

---

## 7. Operating it: common tasks

### Promote a user to admin
There's no UI for this by design — do it via the AWS CLI:
```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId> \
  --username <their email> \
  --group-name admin \
  --profile dev
```
The user must **sign in again** afterward — the `cognito:groups` claim is baked into the access token at issuance time, so an already-issued token won't reflect the new group until it's refreshed/reissued.

### List a user's groups
```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id <UserPoolId> --username <email> --profile dev
```

### Force-confirm a user without them clicking the email link (useful for testing)
```bash
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id <UserPoolId> --username <email> --profile dev
```
This still triggers `PostConfirmation` (and therefore the `student` group assignment) exactly like the real email-code flow does.

### Delete a user
```bash
aws cognito-idp admin-delete-user \
  --user-pool-id <UserPoolId> --username <email> --profile dev
```

### Find the current stack outputs (User Pool ID, Client ID, Region)
```bash
aws cloudformation describe-stacks --stack-name student-mgmt-auth \
  --profile dev --query "Stacks[0].Outputs"
```

---

## 8. Tutorial: tracing one request end-to-end

This section walks through exactly what happens, function by function, when a student signs up and then loads the student list.

### Step 1 — Sign up
User fills the "Sign Up" tab in `AuthScreen.tsx` and submits. This calls `signUp(email, password)` from `AuthContext`, which calls `userPool.signUp(...)`. Cognito:
1. Creates a user record in `UNCONFIRMED` state.
2. Sends a 6-digit verification code to their email (because `autoVerify: { email: true }` was configured).

The UI switches to the "enter verification code" view (`awaitingConfirmation` state in `AuthScreen`).

### Step 2 — Confirm
User enters the code; `confirmSignUp(email, code)` calls `cognitoUser.confirmRegistration(code, true, ...)`. Behind the scenes:
1. Cognito validates the code.
2. User status flips to `CONFIRMED`.
3. Cognito **synchronously invokes** the `PostConfirmationFn` Lambda (defined in `AuthStack`), passing an event that includes `userPoolId` and `userName`.
4. The Lambda calls `AdminAddUserToGroupCommand` to add the user to `student`.
5. Only once the Lambda returns does Cognito return success to the browser.

### Step 3 — Sign in
`signIn(email, password)` runs the SRP handshake via `cognitoUser.authenticateUser(...)`. On success, Cognito returns a `CognitoUserSession` containing ID, access, and refresh tokens. The access token's payload now includes:
```json
{ "sub": "...", "cognito:groups": ["student"], "token_use": "access", "client_id": "...", ... }
```
`AuthContext.loadSession()` extracts this token, calls `setAccessToken(token)` (populating `tokenStore.ts`), and sets React state `user = { email, groups: ["student"] }`.

### Step 4 — App re-renders
`App.tsx`'s `useEffect` watches `user`; once it's non-null, `fetchStudents()` runs, which calls `getStudents()` in `studentApi.ts`.

### Step 5 — The API call
Axios's request interceptor reads the token from `tokenStore.ts` and sets `Authorization: Bearer <token>` on the outgoing `GET /students` request.

### Step 6 — Server-side verification
On the EC2-hosted Express server:
1. `router.use(authenticate)` runs first. It extracts the bearer token and calls `verifier.verify(token)`.
2. `aws-jwt-verify` checks the token's signature against Cognito's cached JWKS, confirms `token_use: "access"`, `client_id` matches, and the token isn't expired.
3. On success, `req.user = { sub, username, groups: ["student"] }` is attached, and `next()` passes control to `getStudents`.
4. Since this route has no `requireGroup(...)`, any authenticated user (regardless of group) reaches the controller, which queries Postgres via Prisma and returns the list.

### Step 7 — Attempting to delete (the RBAC boundary)
If this same `student` user tries `DELETE /students/5`:
1. `authenticate` succeeds as before (`req.user.groups = ["student"]`).
2. `requireGroup('admin')` runs next: it checks whether `"admin"` is in `req.user.groups`. It isn't.
3. Middleware short-circuits with `403 { message: "Insufficient permissions." }` — `deleteStudent` never runs, and the database is never touched.

If an admin (`req.user.groups = ["admin", "student"]`) makes the same call, `requireGroup('admin')` passes and `deleteStudent` executes normally, returning `204`.

---

## 9. Things to know if you extend this later

- **Adding a new role** (e.g., `teacher`): add a `CfnUserPoolGroup` in `AuthStack`, decide whether it's auto-assigned (edit the Lambda) or manually granted, then use `requireGroup('teacher', 'admin')` (it accepts multiple allowed groups) on whichever routes need it.
- **Token expiry**: access tokens last 1 hour (`accessTokenValidity`). `amazon-cognito-identity-js` doesn't auto-refresh in the background by default in this implementation — a user whose token expires mid-session will start getting `401`s until they sign in again. A production-grade improvement would be an axios response interceptor that catches `401`, calls `cognitoUser.refreshSession(...)`, and retries the request once.
- **CORS**: the Express `cors()` config in `app.ts` already reflects any `Authorization` header sent cross-origin (default `cors` package behavior), so no extra CORS changes were needed to support the bearer token.
- **This is a User Pool only, no Identity Pool**: if a future feature needs the browser to call AWS services directly (e.g., uploading a file straight to S3 with temporary AWS credentials), you'd add a Cognito **Identity Pool** that federates with this User Pool. Not needed today since the browser only ever talks to our own API and to Cognito's auth endpoints.
