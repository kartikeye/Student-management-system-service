# Student Management System — AWS Architecture

## Stack Overview

The infrastructure is split into four CDK stacks, each owning a distinct layer.
Stacks are deployed in order: **Network → Database → Auth → App**.

```
cdk deploy --all --profile dev
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  AWS Cloud  (ap-southeast-2 — Sydney)                               │
│                                                                     │
│  ┌─────────────────────── NetworkStack ──────────────────────────┐  │
│  │                                                               │  │
│  │   VPC (10.0.0.0/16)                                          │  │
│  │                                                               │  │
│  │   ┌──────────────────────┐   ┌──────────────────────────┐    │  │
│  │   │   Public Subnet      │   │   Private Subnet         │    │  │
│  │   │   (10.0.0.0/24)      │   │   (10.0.1.0/24)          │    │  │
│  │   │                      │   │                          │    │  │
│  │   │  ┌───────────────┐   │   │  ┌────────────────────┐  │    │  │
│  │   │  │  EC2 SG       │   │   │  │  RDS SG            │  │    │  │
│  │   │  │  in:  :3000   │   │   │  │  in: :5432 (EC2SG) │  │    │  │
│  │   │  │  in:  :22     │   │   │  │  out: none         │  │    │  │
│  │   │  │  out: all     │   │   │  └────────────────────┘  │    │  │
│  │   │  └───────────────┘   │   │                          │    │  │
│  │   └──────────────────────┘   └──────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────── DatabaseStack ─────────────┐                        │
│  │                                        │                        │
│  │   RDS PostgreSQL 16  (db.t3.micro)     │                        │
│  │   ├── DB name : student_management     │                        │
│  │   ├── Subnet  : Private (isolated)     │                        │
│  │   ├── SG      : RDS SG                 │                        │
│  │   └── Secret  : Secrets Manager ──────┼──► (ARN passed to App) │
│  │                                        │                        │
│  └────────────────────────────────────────┘                        │
│                                                                     │
│  ┌──────────────── AuthStack ─────────────────┐                     │
│  │                                              │                     │
│  │   Cognito User Pool                          │                     │
│  │   ├── Self sign-up: enabled (email + pwd)   │                     │
│  │   ├── Groups: admin, student (default)      │                     │
│  │   ├── PostConfirmation Lambda ───────────┐  │                     │
│  │   │     adds every new confirmed user    │  │                     │
│  │   │     to the "student" group           │  │                     │
│  │   └── App Client (public, no secret,     │  │                     │
│  │         SRP auth — used by the React SPA)│  │                     │
│  │                                              │                     │
│  └──────────────────────────────────────────────┘                     │
│                                                                     │
│  ┌──────────────────────── AppStack ──────────────────────────────┐ │
│  │                                                                │ │
│  │   ECR Repository  ◄── cdk deploy builds & pushes image        │ │
│  │         │                                                      │ │
│  │         │ docker pull                                          │ │
│  │         ▼                                                      │ │
│  │   EC2 (t2.micro, Amazon Linux 2023)   ── SG: EC2 SG           │ │
│  │   ├── Docker container: student-mgmt-api                      │ │
│  │   │     ├── PORT                3000                           │ │
│  │   │     ├── NODE_ENV            production                     │ │
│  │   │     ├── DATABASE_URL        fetched from Secrets Manager  │ │
│  │   │     ├── COGNITO_USER_POOL_ID  from AuthStack               │ │
│  │   │     ├── COGNITO_CLIENT_ID     from AuthStack               │ │
│  │   │     └── COGNITO_REGION        from AuthStack               │ │
│  │   │                                                            │ │
│  │   ├── IAM Role                                                 │ │
│  │   │     ├── ECR  : grantPull                                   │ │
│  │   │     ├── SM   : grantRead (DB secret)                       │ │
│  │   │     └── SSM  : AmazonSSMManagedInstanceCore                │ │
│  │   │                                                            │ │
│  │   └── User Data (runs on first boot)                           │ │
│  │         1. Install Docker                                      │ │
│  │         2. Authenticate with ECR                               │ │
│  │         3. Fetch DB credentials from Secrets Manager           │ │
│  │         4. docker pull <image>                                 │ │
│  │         5. docker run (Prisma migrate deploy + node server)    │ │
│  │                                                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│         Internet Gateway                                            │
│               ▲                                                     │
└───────────────┼─────────────────────────────────────────────────────┘
                │
         Internet (port 3000)
                │
            Client / Browser  ── authenticates directly against Cognito
                                  (amazon-cognito-identity-js), then calls
                                  the API with the access token as a Bearer
                                  header. The API never sees passwords.
```

---

## Stack Responsibilities

### NetworkStack
Owns the networking layer. All other stacks consume resources from here.

| Resource | Detail |
|---|---|
| VPC | 2 AZs, no NAT gateway (cost saving) |
| Public Subnet | EC2 lives here — has internet access via IGW |
| Private Subnet | RDS lives here — no internet access |
| EC2 Security Group | Inbound: port 3000 (API), 22 (SSH) |
| RDS Security Group | Inbound: port 5432 from EC2 SG only |

### DatabaseStack
Owns the data layer. Receives `vpc` and `rdsSg` from NetworkStack.

| Resource | Detail |
|---|---|
| RDS PostgreSQL 16 | `db.t3.micro`, 20 GB, encrypted at rest |
| Secrets Manager | Auto-generated credentials for `postgres` user |
| Subnet | Private Isolated (no internet route) |

### AuthStack
Owns identity. Independent of the other stacks — no VPC, no dependency on Network/Database.

| Resource | Detail |
|---|---|
| Cognito User Pool | Email/password sign-in, self sign-up enabled, email auto-verified |
| User Pool Groups | `admin` (delete access), `student` (default group) |
| PostConfirmation Lambda | Auto-adds every newly confirmed self-registered user to the `student` group |
| App Client | Public client (no secret), SRP auth flow only — matches `amazon-cognito-identity-js` in the React app |

**There is no self-service way to become an admin** — by design, only the `student` group is auto-assigned. Promote a user manually after they've signed up:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId output> \
  --username <their email> \
  --group-name admin \
  --profile dev
```

### AppStack
Owns the application layer. Receives `vpc`, `ec2Sg`, `database`, `userPool`, and `userPoolClient` from the other stacks.

| Resource | Detail |
|---|---|
| DockerImageAsset | CDK builds the image from `api-studentMangSys/Dockerfile` and pushes to ECR on every `cdk deploy` |
| IAM Role | Grants EC2 permission to pull from ECR and read the DB secret |
| EC2 (t2.micro) | Amazon Linux 2023, runs Docker container on boot via User Data |
| User Data | Installs Docker, fetches DB credentials, pulls and runs the container with `COGNITO_USER_POOL_ID`/`COGNITO_CLIENT_ID`/`COGNITO_REGION` set |

---

## Data Flow

```
Client
  │
  │  1. Sign up / sign in directly against Cognito (SRP, via amazon-cognito-identity-js)
  ▼
Cognito User Pool ── issues ID + access + refresh tokens
  │
  │  2. HTTP :3000, Authorization: Bearer <access token>
  ▼
EC2 (Public IP)
  │
  │  Express middleware verifies the token's signature against Cognito's
  │  JWKS (aws-jwt-verify) and reads the "cognito:groups" claim for RBAC.
  │  Docker container also reads DATABASE_URL
  │  DATABASE_URL = postgresql://user:pass@rds-endpoint:5432/student_management
  ▼
RDS PostgreSQL (Private Subnet)
```

Route protection, as implemented in `api-studentMangSys/src/routes/studentsRoute.ts`:

| Route | Requires |
|---|---|
| `GET/POST/PUT /students*` | any authenticated user (valid access token) |
| `DELETE /students/:id` | `admin` group membership |

---

## Deployment

```bash
# One-time bootstrap (per account/region)
cdk bootstrap --profile dev

# Deploy all stacks in dependency order
cdk deploy --all --profile dev

# Deploy a single stack (useful for debugging)
cdk deploy NetworkStack  --profile dev
cdk deploy DatabaseStack --profile dev
cdk deploy AuthStack     --profile dev
cdk deploy AppStack      --profile dev

# Tear everything down
cdk destroy --all --profile dev
```

After `AuthStack` deploys, copy its `UserPoolId` / `UserPoolClientId` / `Region` outputs into:
- `api-studentMangSys/.env` (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION`) for local backend dev
- `client-studentMangSys/.env` (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REGION`) for local frontend dev

`AppStack` picks these up automatically from CDK's cross-stack references — no manual copying needed for the deployed EC2 container.

> **Note:** `cdk deploy` automatically builds the Docker image locally and pushes it to ECR before provisioning EC2. No manual `docker build` or `docker push` is needed.
