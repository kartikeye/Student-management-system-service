# Student Management System — AWS Architecture

## Stack Overview

The infrastructure is split into three CDK stacks, each owning a distinct layer.
Stacks are deployed in order: **Network → Database → App**.

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
│  ┌──────────────────────── AppStack ──────────────────────────────┐ │
│  │                                                                │ │
│  │   ECR Repository  ◄── cdk deploy builds & pushes image        │ │
│  │         │                                                      │ │
│  │         │ docker pull                                          │ │
│  │         ▼                                                      │ │
│  │   EC2 (t2.micro, Amazon Linux 2023)   ── SG: EC2 SG           │ │
│  │   ├── Docker container: student-mgmt-api                      │ │
│  │   │     ├── PORT          3000                                 │ │
│  │   │     ├── NODE_ENV      production                           │ │
│  │   │     └── DATABASE_URL  fetched from Secrets Manager        │ │
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
            Client / Browser
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

### AppStack
Owns the application layer. Receives `vpc`, `ec2Sg`, and `database` from the other two stacks.

| Resource | Detail |
|---|---|
| DockerImageAsset | CDK builds the image from `api-studentMangSys/Dockerfile` and pushes to ECR on every `cdk deploy` |
| IAM Role | Grants EC2 permission to pull from ECR and read the DB secret |
| EC2 (t2.micro) | Amazon Linux 2023, runs Docker container on boot via User Data |
| User Data | Installs Docker, fetches DB credentials, pulls and runs the container |

---

## Data Flow

```
Client
  │
  │  HTTP :3000
  ▼
EC2 (Public IP)
  │
  │  Docker container reads DATABASE_URL
  │  DATABASE_URL = postgresql://user:pass@rds-endpoint:5432/student_management
  ▼
RDS PostgreSQL (Private Subnet)
```

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
cdk deploy AppStack      --profile dev

# Tear everything down
cdk destroy --all --profile dev
```

> **Note:** `cdk deploy` automatically builds the Docker image locally and pushes it to ECR before provisioning EC2. No manual `docker build` or `docker push` is needed.
