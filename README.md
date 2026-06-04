# Student Management System

A full-stack CRUD application for managing student records, built with Node.js, Express, Prisma, PostgreSQL, React, and TypeScript — deployable locally with Docker Compose or to AWS using CDK (EC2 + RDS + ECR).

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Data Model](#data-model)
- [API Endpoints](#api-endpoints)
- [Option 1 — Run with Docker Compose (Recommended for local dev)](#option-1--run-with-docker-compose-recommended-for-local-dev)
- [Option 2 — Run Locally Without Docker](#option-2--run-locally-without-docker)
- [Option 3 — Deploy to AWS with CDK](#option-3--deploy-to-aws-with-cdk)
- [CORS Configuration](#cors-configuration)
- [Security](#security)
- [Project Structure](#project-structure)

---

## Tech Stack

| Layer      | Technology                               |
|------------|------------------------------------------|
| Backend    | Node.js 22, Express.js, TypeScript       |
| ORM        | Prisma 7                                 |
| Database   | PostgreSQL 16                            |
| Frontend   | React 19, TypeScript, Vite 8, MUI v9    |
| Containers | Docker, Docker Compose                   |
| Cloud      | AWS CDK v2 (EC2, RDS, ECR, Secrets Manager, IAM, VPC) |

---

## Data Model

The `Student` model (mapped to the `students` table):

| Column           | Type         | Notes                          |
|------------------|--------------|--------------------------------|
| `id`             | Int          | Auto-increment primary key     |
| `firstName`      | VarChar(50)  | Required                       |
| `lastName`       | VarChar(50)  | Required                       |
| `email`          | VarChar(100) | Unique, indexed                |
| `age`            | Int          | Optional                       |
| `grade`          | VarChar(20)  | Optional                       |
| `enrollmentDate` | Date         | Defaults to current date       |
| `phone`          | VarChar(15)  | Optional                       |
| `address`        | Text         | Optional                       |
| `createdAt`      | DateTime     | Auto-set on create             |
| `updatedAt`      | DateTime     | Auto-updated on every change   |

Indexes: `email`, `(lastName, firstName)`.

---

## API Endpoints

Base URL (local): `http://localhost:3000`  
Base URL (AWS): `http://<EC2-PUBLIC-IP>:3000`

| Method | Endpoint         | Description                  |
|--------|------------------|------------------------------|
| GET    | `/health`        | Health check — returns `200 OK` |
| GET    | `/students`      | List all students            |
| POST   | `/students`      | Create a new student         |
| PUT    | `/students/:id`  | Update a student by ID       |
| DELETE | `/students/:id`  | Delete a student by ID       |

**Example — create a student:**
```bash
curl -X POST http://localhost:3000/students \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Alice",
    "lastName": "Smith",
    "email": "alice@example.com",
    "age": 21,
    "grade": "A"
  }'
```

---

## Option 1 — Run with Docker Compose (Recommended for local dev)

Runs the API and PostgreSQL together in containers. Only Docker is required.

**1. Clone the repository**

```bash
git clone <your-repo-url>
cd Student-Management-System
```

**2. Start the stack**

```bash
docker compose up --build
```

This will:
- Build the API image from `api-studentMangSys/Dockerfile` (multi-stage, Node 22 Alpine)
- Start a PostgreSQL 16 container with a health check (port 5432 is internal-only — not exposed to the host)
- Run `prisma migrate deploy` automatically on API startup
- Serve the API at `http://localhost:3000`

**3. Start the frontend**

In a separate terminal:

```bash
cd client-studentMangSys
npm install
npm run dev
```

Frontend available at `http://localhost:5173`.

**4. Stop**

```bash
docker compose down          # stop containers
docker compose down -v       # stop + remove database volume
```

---

## Option 2 — Run Locally Without Docker

### Backend

**1. Install dependencies**

```bash
cd api-studentMangSys
npm install
```

**2. Create `.env`**

```env
DATABASE_URL=postgresql://postgres:root@localhost:5432/student_management?schema=public
PORT=3000
```

Make sure a local PostgreSQL instance is running and the `student_management` database exists.

**3. Run migrations**

```bash
npx prisma migrate deploy
```

**4. Start the dev server**

```bash
npm run dev
```

API runs at `http://localhost:3000`.

---

### Frontend

**1. Install dependencies**

```bash
cd client-studentMangSys
npm install
```

**2. Create `.env`**

```env
VITE_API_URL=http://localhost:3000
```

**3. Start the dev server**

```bash
npm run dev
```

Frontend runs at `http://localhost:5173`.

---

## Option 3 — Deploy to AWS with CDK

The `aws/` directory contains an AWS CDK v2 app that provisions the full production infrastructure in **ap-southeast-2 (Sydney)** using three independent stacks deployed in order: **Network → Database → App**.

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  AWS Cloud  (ap-southeast-2)                                   │
│                                                                │
│  ┌──────────────── NetworkStack ─────────────────────────────┐ │
│  │  VPC (10.0.0.0/16, 2 AZs, no NAT gateway)                │ │
│  │                                                           │ │
│  │  Public Subnet (10.0.0.0/24)   Private Subnet            │ │
│  │  ┌──────────────────────┐      ┌─────────────────────┐   │ │
│  │  │  EC2 Security Group  │      │  RDS Security Group │   │ │
│  │  │  in:  :3000 (API)    │      │  in: :5432 (EC2 SG) │   │ │
│  │  │  out: all            │      │  out: none          │   │ │
│  │  └──────────────────────┘      └─────────────────────┘   │ │
│  │  (SSH port 22 closed — use SSM Session Manager)           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────── DatabaseStack ─────────────┐                   │
│  │  RDS PostgreSQL 16 (db.t3.micro)       │                   │
│  │  DB name  : student_management         │                   │
│  │  Subnet   : Private isolated           │                   │
│  │  Encrypted at rest                     │                   │
│  │  Credentials → Secrets Manager ────────┼──► (ARN → App)   │
│  └────────────────────────────────────────┘                   │
│                                                                │
│  ┌─────────────────── AppStack ──────────────────────────────┐ │
│  │  ECR Repository  ◄── CDK builds & pushes image on deploy  │ │
│  │       │                                                    │ │
│  │       ▼  docker pull                                       │ │
│  │  EC2 t3.micro (Amazon Linux 2023)                          │ │
│  │  ├── Docker container: student-mgmt-api (:3000)           │ │
│  │  │     DATABASE_URL  fetched from Secrets Manager         │ │
│  │  │     NODE_ENV=production                                 │ │
│  │  │                                                         │ │
│  │  ├── IAM Role                                              │ │
│  │  │     ECR  : grantPull                                    │ │
│  │  │     SM   : grantRead (DB secret)                        │ │
│  │  │     SSM  : AmazonSSMManagedInstanceCore (Session Mgr)   │ │
│  │  │                                                         │ │
│  │  └── User Data (runs on first boot)                        │ │
│  │        1. Install Docker (dnf)                             │ │
│  │        2. Authenticate with ECR                            │ │
│  │        3. Fetch DB credentials from Secrets Manager        │ │
│  │        4. docker pull <ECR image>                          │ │
│  │        5. docker run (Prisma migrate + node server)        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                │
│  Internet Gateway ← port 3000 ← Client / Browser              │
└────────────────────────────────────────────────────────────────┘
```

### Stack Responsibilities

**NetworkStack** (`student-mgmt-network`)

| Resource | Detail |
|---|---|
| VPC | 2 AZs, no NAT gateway (cost saving) |
| Public Subnet | EC2 lives here — internet access via IGW |
| Private Subnet | RDS lives here — no internet route |
| EC2 Security Group | Inbound: port 3000 only — SSH (22) is closed, use SSM |
| RDS Security Group | Inbound: port 5432 from EC2 SG only |

**DatabaseStack** (`student-mgmt-database`)

| Resource | Detail |
|---|---|
| RDS PostgreSQL 16 | `db.t3.micro`, 20 GB gp2, encrypted at rest |
| Secrets Manager | Auto-generated credentials for `postgres` user |
| Removal policy | `DESTROY` (safe to tear down in dev) |

**AppStack** (`student-mgmt-app`)

| Resource | Detail |
|---|---|
| DockerImageAsset | CDK builds the image from `api-studentMangSys/Dockerfile` and pushes to ECR on every deploy |
| IAM Role | EC2 permission to pull from ECR and read the DB secret (least-privilege) |
| EC2 t3.micro | Amazon Linux 2023, IMDSv2 enforced, runs the Docker container via User Data |
| Outputs | API endpoint URL, EC2 public IP, ECR image URI |

### Prerequisites

- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) configured with a `dev` profile pointing to `ap-southeast-2`
- [AWS CDK v2](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) (`npm install -g aws-cdk`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running (CDK builds the image locally)
- Node.js 18+

Verify your profile:
```bash
aws configure list --profile dev
```

### One-Time Bootstrap

If this is the first CDK deployment in your account/region:

```bash
cd aws
cdk bootstrap --profile dev
```

### Deploy

```bash
cd aws
cdk deploy --all --profile dev
```

CDK will:
1. Deploy `NetworkStack` — VPC and security groups
2. Deploy `DatabaseStack` — RDS instance (takes ~5 min)
3. Build the Docker image locally, push it to ECR, then deploy `AppStack` — EC2 instance

At the end you will see output like:

```
Outputs:
AppStack.ApiEndpoint    = http://<EC2-PUBLIC-IP>:3000
AppStack.EC2PublicIp    = <EC2-PUBLIC-IP>
AppStack.DockerImageUri = <account>.dkr.ecr.ap-southeast-2.amazonaws.com/...
```

> **Note:** After the EC2 instance starts, the User Data script takes ~2 minutes to install Docker, pull the image, and start the container. Poll the health check to know when it is ready:
> ```bash
> curl http://<EC2-PUBLIC-IP>:3000/health
> ```

### Update the Frontend to Point at AWS

Edit `client-studentMangSys/.env`:

```env
VITE_API_URL=http://<EC2-PUBLIC-IP>:3000
```

Then restart the Vite dev server:

```bash
# in the client-studentMangSys directory
npm run dev
```

### Deploy a Single Stack

```bash
cdk deploy NetworkStack  --profile dev
cdk deploy DatabaseStack --profile dev
cdk deploy AppStack      --profile dev
```

### Access the EC2 Instance (SSM Session Manager)

SSH port 22 is intentionally closed on the security group. Use SSM Session Manager instead — no key pair needed, access is IAM-authenticated:

```bash
# Find the instance ID from the AWS console, or:
aws ec2 describe-instances \
  --filters "Name=tag:aws:cloudformation:stack-name,Values=student-mgmt-app" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text --profile dev

# Open a shell session
aws ssm start-session --target <INSTANCE-ID> --profile dev
```

### View Container Logs on EC2

```bash
# Via SSM session (see above), then:
sudo docker logs student-mgmt-api --follow
```

### Tear Down

```bash
cd aws
cdk destroy --all --profile dev
```

This removes all AWS resources (EC2, RDS, ECR images, VPC). The RDS instance has `deletionProtection: false` and `removalPolicy: DESTROY` so it will be deleted without manual intervention.

> **Cost note:** A running `db.t3.micro` RDS instance costs approximately $15–25/month in `ap-southeast-2`. Always run `cdk destroy` when the environment is not in use.

---

## CORS Configuration

The API uses a dynamic CORS policy (configured in `api-studentMangSys/src/server.ts`):

| Environment | Allowed origins |
|---|---|
| Default (no `CORS_ORIGIN` env var) | Any `http://localhost:*` origin |
| Production (set `CORS_ORIGIN`) | Comma-separated list, e.g. `https://myapp.com,https://www.myapp.com` |
| No origin (curl, Postman, server-to-server) | Always allowed |

To lock down CORS in production, set the `CORS_ORIGIN` environment variable when running the container:

```bash
docker run -e CORS_ORIGIN="https://myapp.com" ...
```

---

## Security

### AWS infrastructure

| Control | Detail |
|---|---|
| No SSH exposure | EC2 security group has port 22 closed. Remote access is via SSM Session Manager (IAM-authenticated, no key pair). |
| IMDSv2 enforced | `requireImdsv2: true` on the EC2 instance. Blocks SSRF-based credential theft via the `169.254.169.254` metadata endpoint. |
| Least-privilege IAM | EC2 role grants only ECR `grantPull` and Secrets Manager `grantRead` on the specific DB secret — no wildcards. |
| Database not public | RDS lives in a private isolated subnet with no internet route. Its security group accepts connections on port 5432 from the EC2 security group only. |
| Credentials via Secrets Manager | `DATABASE_URL` is never stored in environment files or CloudFormation parameters. It is fetched from Secrets Manager at EC2 boot time and passed to the container as a runtime env var. |
| Storage encrypted | RDS storage encryption is enabled at rest. |

### Local development

| Control | Detail |
|---|---|
| `.env` not in git | `api-studentMangSys/.env` is gitignored. Credentials never leave your machine. |
| DB not exposed to host | `docker-compose.yml` does not publish port 5432. PostgreSQL is reachable only by the `api` container on the internal Docker network. |
| Dynamic CORS | The API rejects cross-origin requests from non-localhost origins unless `CORS_ORIGIN` is explicitly set. See [CORS Configuration](#cors-configuration). |

### Known dev-only trade-offs (not suitable for production as-is)

| Trade-off | Production fix |
|---|---|
| HTTP only, no TLS | Add an Application Load Balancer with an ACM certificate in front of EC2 |
| Single EC2, no auto-scaling | Replace EC2 with ECS Fargate + ALB |
| `deletionProtection: false` on RDS | Set to `true` and enable automated snapshots |
| Weak local DB password (`root`) | Use a strong generated password or a `.env.example` template |

---

## Project Structure

```
Student-Management-System/
├── api-studentMangSys/          # Express API
│   ├── src/
│   │   ├── server.ts            # Entry point — Express app, CORS, routes
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   └── studentsRoute.ts
│   │   └── config/
│   │       └── prisma.ts        # Prisma client singleton
│   ├── prisma/
│   │   └── schema.prisma        # Data model
│   ├── Dockerfile               # Multi-stage build (Node 22 Alpine)
│   └── package.json
│
├── client-studentMangSys/       # React frontend
│   ├── src/
│   │   ├── App.tsx              # Root component — state, CRUD handlers
│   │   ├── api/
│   │   │   └── studentApi.ts    # Axios calls to the API
│   │   ├── components/
│   │   │   ├── StudentTable.tsx
│   │   │   ├── StudentForm.tsx
│   │   │   └── DeleteDialog.tsx
│   │   └── types/
│   │       └── student.ts       # Shared TypeScript interfaces
│   └── .env                     # VITE_API_URL
│
├── aws/                         # AWS CDK app
│   ├── bin/
│   │   └── aws.ts               # CDK app entry — instantiates all stacks
│   ├── lib/
│   │   ├── network-stack.ts     # VPC, subnets, security groups
│   │   ├── database-stack.ts    # RDS PostgreSQL + Secrets Manager
│   │   └── app-stack.ts         # ECR image asset, IAM role, EC2 + User Data
│   └── AWS_Archetect.md         # Architecture reference diagram
│
└── docker-compose.yml           # Local dev: API + PostgreSQL containers
```
