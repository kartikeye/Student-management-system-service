# AWS CDK Guide — ShopLocally API Infrastructure

> **Audience:** Junior developer learning AWS CDK for the first time.
> **Goal:** Understand every AWS service and CDK concept used to deploy the ShopLocally API, so you can explain it in an interview and reproduce it from scratch.

---

## Table of Contents

1. [What is AWS CDK?](#1-what-is-aws-cdk)
2. [Why We Used CDK Instead of the AWS Console](#2-why-we-used-cdk-instead-of-the-aws-console)
3. [Project Structure](#3-project-structure)
4. [Prerequisites & Installation](#4-prerequisites--installation)
5. [Core CDK Concepts](#5-core-cdk-concepts)
6. [CDK CLI — Every Command Explained](#6-cdk-cli--every-command-explained)
7. [CDK Bootstrap — What It Is and Why It Matters](#7-cdk-bootstrap--what-it-is-and-why-it-matters)
8. [Stack 1 — VPC (Virtual Private Cloud)](#8-stack-1--vpc-virtual-private-cloud)
9. [Stack 2 — Security Groups](#9-stack-2--security-groups)
10. [Stack 3 — IAM Roles & Policies](#10-stack-3--iam-roles--policies)
11. [Stack 4 — ECR (Elastic Container Registry)](#11-stack-4--ecr-elastic-container-registry)
12. [Stack 5 — S3 Buckets (Images & Backups)](#12-stack-5--s3-buckets-images--backups)
13. [Stack 6 — RDS (PostgreSQL Database)](#13-stack-6--rds-postgresql-database)
14. [Stack 7 — EC2 (The Application Server)](#14-stack-7--ec2-the-application-server)
15. [Stack 8 — Cognito (Authentication)](#15-stack-8--cognito-authentication)
16. [Stack 9 — Lambda & Secrets Manager](#16-stack-9--lambda--secrets-manager)
17. [Stack 10 — Monitoring (CloudWatch, SNS)](#17-stack-10--monitoring-cloudwatch-sns)
18. [The Docker + ECR Workflow](#18-the-docker--ecr-workflow)
19. [Multi-Environment Setup (dev / qas / preview / prod)](#19-multi-environment-setup-dev--qas--preview--prod)
20. [Stack Dependencies — The Order Matters](#20-stack-dependencies--the-order-matters)
21. [CfnOutput — How We Export Values Between Stacks](#21-cfnoutput--how-we-export-values-between-stacks)
22. [Tagging — Why We Tag Everything](#22-tagging--why-we-tag-everything)
23. [Full Deployment Walkthrough](#23-full-deployment-walkthrough)
24. [Interview Questions & Answers](#24-interview-questions--answers)

---

## 1. What is AWS CDK?

**AWS CDK (Cloud Development Kit)** is a framework that lets you define AWS cloud infrastructure using real programming languages (TypeScript, Python, Java, etc.) instead of writing YAML/JSON CloudFormation templates by hand.

Under the hood, CDK converts your TypeScript code into a CloudFormation template and then deploys it. Think of CloudFormation as the actual engine that creates AWS resources, and CDK as the friendly wrapper on top of it.

### CDK vs CloudFormation vs Terraform

| Tool | Language | Approach |
|------|----------|----------|
| CloudFormation | YAML / JSON | Declarative, verbose |
| Terraform | HCL | Declarative, multi-cloud |
| AWS CDK | TypeScript, Python, etc. | Imperative + declarative, AWS-native |

**Why CDK?** Because you get loops, conditions, helper functions, type-checking, and autocomplete — things you cannot do in raw YAML.

---

## 2. Why We Used CDK Instead of the AWS Console

Clicking around in the AWS Console is fine for learning but terrible for real projects because:

- It is not repeatable — you cannot recreate the exact same setup.
- It has no version control — you cannot track what changed or roll back.
- It is error-prone — one wrong click in production breaks things.
- It does not scale — imagine clicking through 11 stacks across 4 environments manually.

With CDK, our entire infrastructure is code. It lives in git, can be reviewed, and can be deployed in one command.

---

## 3. Project Structure

```
api-shoplocally/
├── Dockerfile                     # Multi-stage Docker image for the API
├── aws-setup/                     # Main CDK project (production infrastructure)
│   ├── bin/
│   │   ├── shoplocally.ts         # CDK entry point — creates the App
│   │   └── shoplocally-app.ts     # Wires all stacks together with dependencies
│   ├── lib/
│   │   ├── vpc-stack.ts           # Networking
│   │   ├── security-groups-stack.ts
│   │   ├── iam-stack.ts           # Roles & permissions
│   │   ├── ecr-stack.ts           # Docker image registry
│   │   ├── s3-images-stack.ts     # Public image storage (per environment)
│   │   ├── s3-backup-stack.ts     # Private encrypted backups
│   │   ├── rds-stack.ts           # PostgreSQL database
│   │   ├── ec2-stack.ts           # Application server
│   │   ├── cognito-stack.ts       # User authentication (per environment)
│   │   ├── lambda-stack.ts        # QR key rotation
│   │   └── monitoring-stack.ts    # CloudWatch alarms & dashboard
│   ├── cdk.json                   # CDK configuration
│   └── package.json
│
├── aws/
│   ├── backend-cdk/               # Older experimental CDK project
│   │   └── lib/
│   │       ├── backend-cdk-stack.ts   # RDS PostgreSQL stack
│   │       └── apiDockerEc2Stack-cdk.ts # EC2 + Docker stack
│   └── deployment/
│       ├── prod/push-image.sh     # Build & push Docker image to ECR
│       ├── qas/deploy-qas.sh      # Deploy QAS environment
│       └── ...                    # Scripts for each environment
```

---

## 4. Prerequisites & Installation

Before you can use CDK, you need:

### Step 1 — Install Node.js
CDK is a Node.js tool. Download from nodejs.org.

### Step 2 — Install AWS CLI
```bash
# On Mac/Linux
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

npm install -g aws-cdk

# Verify
aws --version
```

### Step 3 — Configure AWS Credentials
```bash
aws configure
# Enter: AWS Access Key ID
# Enter: AWS Secret Access Key
# Enter: Default region (we used: ap-southeast-2 — Sydney)
# Enter: Output format (json)
```

This creates `~/.aws/credentials` and `~/.aws/config`. You can have multiple profiles (e.g., `dev`, `prod`) and switch between them with `--profile prod`.

### Step 4 — Install CDK CLI globally
```bash
npm install -g aws-cdk

# Verify
cdk --version
```

### Step 5 — Install project dependencies
```bash
cd aws-setup
npm install
```

---

## 5. Core CDK Concepts

Understanding these four things is the foundation of everything else.

### 5.1 App

The `App` is the root of your CDK program. Every CDK program starts with `new cdk.App()`. It is the container that holds all your Stacks.

```typescript
// bin/shoplocally.ts
const app = new cdk.App();
app.synth(); // This triggers CloudFormation synthesis
```

### 5.2 Stack

A `Stack` maps to one CloudFormation stack — a group of AWS resources that are deployed together. If one resource in the stack fails to create, all resources in that stack are rolled back.

```typescript
export class VpcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // AWS resources go here
  }
}
```

We split our infrastructure into **11 separate stacks** because:
- Smaller stacks deploy faster.
- Stacks can be updated independently.
- Stacks can share outputs with each other.
- Failure in one stack does not break another.

### 5.3 Construct

A `Construct` is the basic building block of CDK. Everything — a VPC, an EC2 instance, a Lambda function — is a Construct. Constructs can be nested. Stacks are constructs, the App is a construct.

There are three levels:
- **L1 (Cfn)**: Direct CloudFormation resource, e.g., `ec2.CfnInstance`. Very low-level.
- **L2**: Higher-level with sensible defaults, e.g., `ec2.Instance`. This is what we use most.
- **L3 (Patterns)**: Pre-built combinations, e.g., `ecs_patterns.ApplicationLoadBalancedFargateService`.

### 5.4 Props

Every Construct takes a `props` object as its third argument. This is how you pass configuration (like a VPC reference) from one stack to another.

```typescript
// Passing the VPC from VpcStack into EC2Stack
const ec2Stack = new EC2Stack(this, 'Ec2Stack', {
  vpc: vpcStack.vpc,      // passing the VPC object
  env: props.env,
});
```

---

## 6. CDK CLI — Every Command Explained

These are the commands you will type in your terminal.

### `cdk init`
Creates a new CDK project from a template.
```bash
cdk init app --language typescript
```
This generates the folder structure, `cdk.json`, `package.json`, and a sample stack. We ran this once at the beginning.

### `cdk synth`
**Synthesizes** (converts) your TypeScript CDK code into a CloudFormation template. It does NOT deploy anything. Use it to preview what will be created.
```bash
cdk synth
# Output: shows the CloudFormation YAML template
```

This is very useful for debugging — if your code has an error, `cdk synth` will catch it before touching AWS.

### `cdk diff`
Shows what will **change** if you deploy. Like `git diff` but for your cloud infrastructure.
```bash
cdk diff
# Output: shows + (additions), - (deletions), ~ (modifications)
```

Always run `cdk diff` before `cdk deploy` in production. Never deploy blind.

### `cdk deploy`
Deploys your stack(s) to AWS. This actually creates or updates AWS resources.
```bash
# Deploy a specific stack
cdk deploy shoplocally-vpc-ap-southeast-2

# Deploy all stacks
cdk deploy --all

# Deploy with a specific AWS profile
cdk deploy --profile prod

# Deploy without asking for approval (used in scripts)
cdk deploy --require-approval never

# Pass context values at deploy time
cdk deploy --context environment=qas
```

### `cdk bootstrap`
(See full explanation in Section 7.)
```bash
cdk bootstrap aws://789842199839/ap-southeast-2 --profile prod
```

### `cdk destroy`
Tears down a stack and **deletes all its resources**. This is destructive.
```bash
cdk destroy shoplocally-vpc-ap-southeast-2
```

Note: Resources with `RemovalPolicy.RETAIN` (like our ECR repository and prod S3 bucket) will NOT be deleted by `cdk destroy`. This is intentional protection for data.

### `cdk list` (or `cdk ls`)
Lists all the stacks defined in your CDK app.
```bash
cdk list
# Output:
# shoplocally-vpc-ap-southeast-2
# shoplocally-security-ap-southeast-2
# shoplocally-ecr-ap-southeast-2
# ...
```

### `cdk doctor`
Checks your CDK environment for any issues (wrong Node version, missing tools, etc.).
```bash
cdk doctor
```

---

## 7. CDK Bootstrap — What It Is and Why It Matters

**Bootstrapping** is a one-time setup step that creates a special CloudFormation stack called `CDKToolkit` in your AWS account.

This stack creates:
- An **S3 bucket** where CDK stores deployment assets (Lambda code, Docker images during synth, etc.)
- An **ECR repository** for Docker assets
- **IAM roles** that CDK assumes when deploying

### Why do you need it?

When CDK deploys a Lambda function, it needs to upload the function's code to S3 first. Without bootstrapping, there is nowhere to put that code.

### How to check if an account is bootstrapped

```bash
aws cloudformation describe-stacks --stack-name CDKToolkit --profile prod
```

If it exists and its status is `CREATE_COMPLETE` or `UPDATE_COMPLETE`, the account is bootstrapped.

### How to bootstrap

```bash
# Format: cdk bootstrap aws://ACCOUNT_ID/REGION
cdk bootstrap aws://789842199839/ap-southeast-2 --profile prod
```

We only need to do this **once per AWS account per region**.

### In our deployment scripts

```bash
# From aws/deployment/qas/deploy-qas.sh
if ! aws cloudformation describe-stacks --profile $AWS_PROFILE --stack-name CDKToolkit \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null | grep -q "COMPLETE"; then
    echo "Bootstrapping CDK..."
    npx cdk bootstrap aws://$AWS_ACCOUNT/$AWS_REGION --profile $AWS_PROFILE
fi
```

---

## 8. Stack 1 — VPC (Virtual Private Cloud)

**File:** [aws-setup/lib/vpc-stack.ts](aws-setup/lib/vpc-stack.ts)

### What is a VPC?

A VPC is your own private section of the AWS cloud. Think of it as your own private data center inside AWS. All resources (EC2, RDS, etc.) live inside a VPC.

### What We Created

```typescript
this.vpc = new ec2.Vpc(this, 'ShopLocallyVpc', {
  ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),  // 65,536 private IP addresses
  maxAzs: 2,           // span 2 Availability Zones for redundancy
  natGateways: 0,      // no NAT Gateway — saves ~$32/month
  subnetConfiguration: [
    { cidrMask: 24, name: 'Public',   subnetType: ec2.SubnetType.PUBLIC },
    { cidrMask: 24, name: 'Private1', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    { cidrMask: 24, name: 'Private2', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  ],
  enableDnsHostnames: true,
  enableDnsSupport: true,
});
```

### Key Concepts

**CIDR Block (`10.0.0.0/16`):** This defines the IP address range for the entire VPC. `/16` means we have 65,536 IP addresses available. Subnets carve this range into smaller pieces.

**Subnet:** A subdivision of the VPC IP range, scoped to one Availability Zone.
- **Public subnet** — has a route to the internet via an Internet Gateway. EC2 instances here can get a public IP address. Our EC2 server lives here.
- **Private (Isolated) subnet** — no route to the internet at all. Databases should live here in production. Note: we skipped NAT Gateway for cost savings.

**Availability Zone (AZ):** A physically separate data center within an AWS region. Using 2 AZs means if one data center goes down, the other keeps running.

**`maxAzs: 2`:** CDK will automatically create subnets in 2 different AZs. For each subnet type, it creates one subnet per AZ. So we actually get 2 public + 2 private1 + 2 private2 = 6 subnets total.

**S3 Gateway Endpoint:**
```typescript
this.vpc.addGatewayEndpoint('S3Endpoint', {
  service: ec2.GatewayVpcEndpointAwsService.S3,
});
```
This means traffic from our EC2 or Lambda to S3 stays inside the AWS network — it never goes to the internet. Faster and no data transfer cost.

**`natGateways: 0`:** NAT (Network Address Translation) Gateways allow resources in private subnets to call the internet (e.g., to download packages). They cost ~$32/month each. We skipped them to save money, meaning our private subnet resources cannot reach the internet directly.

---

## 9. Stack 2 — Security Groups

**File:** [aws-setup/lib/security-groups-stack.ts](aws-setup/lib/security-groups-stack.ts)

### What is a Security Group?

A Security Group is a virtual firewall for your AWS resources. It controls which traffic is allowed **in (ingress)** and **out (egress)**.

Key rules:
- By default, **all inbound traffic is denied**.
- By default, **all outbound traffic is allowed**.
- Security groups are **stateful** — if you allow inbound traffic on a port, the response automatically comes back out.

### What We Created

**Web Security Group (for EC2):**
```typescript
this.apiSecurityGroup = new ec2.SecurityGroup(this, 'ApiSg', {
  vpc: props.vpc,
  allowAllOutbound: true,
  description: 'API EC2 SG allowing 22/80/443/3000',
});
this.apiSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));  // SSH
this.apiSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));  // HTTP
this.apiSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443)); // HTTPS
this.apiSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000));// API port
```

**Database Security Group (for RDS):** Only accepts connections on port 5432 (PostgreSQL) from the EC2 security group. Not from everywhere — only from our specific EC2 server.

```typescript
new ec2.CfnSecurityGroupIngress(this, 'DbIngressFromApi', {
  groupId: props.dbSecurityGroup.securityGroupId,
  sourceSecurityGroupId: this.apiSecurityGroup.securityGroupId, // only from EC2
  ipProtocol: 'tcp',
  fromPort: 5432,
  toPort: 5432,
});
```

This is the **principle of least privilege** — the database only accepts connections from the specific resource that needs it.

---

## 10. Stack 3 — IAM Roles & Policies

**File:** [aws-setup/lib/iam-stack.ts](aws-setup/lib/iam-stack.ts)

### What is IAM?

**IAM (Identity and Access Management)** controls **who** can do **what** on AWS. It has:

- **Users**: Human users with access keys or console login.
- **Roles**: Identities assumed by AWS services (e.g., an EC2 instance assumes a role to call other services).
- **Policies**: JSON documents that define permissions. Attached to users or roles.

### EC2 Instance Role

Our EC2 instance needs to:
1. Pull Docker images from ECR.
2. Read/write images to S3.
3. Get secrets from Secrets Manager.
4. Send logs to CloudWatch.
5. Be managed via AWS Systems Manager (SSM).

```typescript
const role = new iam.Role(this, 'ApiInstanceRole', {
  assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'), // EC2 can assume this role
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
    iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
  ],
});

// ECR permissions (to pull Docker images)
role.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    'ecr:GetAuthorizationToken',
    'ecr:BatchCheckLayerAvailability',
    'ecr:GetDownloadUrlForLayer',
    'ecr:BatchGetImage',
  ],
  resources: ['*'],
}));
```

**Why `ec2.amazonaws.com` as the principal?** This is a "service principal" — it means only the EC2 service can assume this role, not a human or another service. This is how AWS knows the role is for EC2 instances.

**Managed Policy vs Inline Policy:**
- **Managed Policy**: Pre-written policy by AWS, referenced by name. Reusable.
- **Inline Policy**: Custom policy written by us, attached to one specific role.

---

## 11. Stack 4 — ECR (Elastic Container Registry)

**File:** [aws-setup/lib/ecr-stack.ts](aws-setup/lib/ecr-stack.ts)

### What is ECR?

ECR is AWS's private Docker image registry. It's like Docker Hub, but private and inside your AWS account. When our EC2 instance needs to run the API, it pulls the Docker image from ECR.

### What We Created

```typescript
this.apiRepository = new ecr.Repository(this, 'ApiRepository', {
  repositoryName: 'shoplocally-api',
  imageScanOnPush: true,          // Automatically scan for security vulnerabilities
  imageTagMutability: ecr.TagMutability.MUTABLE, // Allow re-using same tag (e.g., "latest")
  lifecycleRules: [
    {
      maxImageCount: 10,          // Only keep the 10 most recent images
      rulePriority: 1,
      tagStatus: ecr.TagStatus.TAGGED,
      tagPrefixList: ['latest', 'preview', 'qas', 'prod'],
    }
  ],
  removalPolicy: cdk.RemovalPolicy.RETAIN, // Do NOT delete ECR when stack is destroyed
});
```

**`imageScanOnPush: true`:** Every time we push a new Docker image, ECR automatically scans it for known OS-level security vulnerabilities (CVEs). This is free and important.

**`lifecycleRules`:** ECR stores Docker images as layers. Old images accumulate and cost money. The lifecycle rule automatically deletes images once we have more than 10, keeping storage costs low.

**`RemovalPolicy.RETAIN`:** If we accidentally run `cdk destroy`, we do NOT want to lose all our Docker images. RETAIN keeps the ECR repository even after the CDK stack is deleted.

### ECR URI Format
```
789842199839.dkr.ecr.ap-southeast-2.amazonaws.com/shoplocally-api
```
- `789842199839` = AWS Account ID
- `ap-southeast-2` = Region (Sydney)
- `shoplocally-api` = Repository name

---

## 12. Stack 5 — S3 Buckets (Images & Backups)

**Files:** [aws-setup/lib/s3-images-stack.ts](aws-setup/lib/s3-images-stack.ts), [aws-setup/lib/s3-backup-stack.ts](aws-setup/lib/s3-backup-stack.ts)

### What is S3?

**S3 (Simple Storage Service)** is AWS's object storage. It stores files (called "objects") in containers called "buckets". Files can be public (accessible via URL) or private.

### S3 Images Bucket (per environment)

This bucket stores product images uploaded by businesses. It is **publicly readable** so browsers can display images.

```typescript
this.imagesBucket = new s3.Bucket(this, 'ShopLocallyImagesBucket', {
  bucketName: `shoplocally-images-${environment}`, // e.g., shoplocally-images-prod
  publicReadAccess: true,
  blockPublicAccess: new s3.BlockPublicAccess({
    blockPublicAcls: false,
    blockPublicPolicy: false,
    ignorePublicAcls: false,
    restrictPublicBuckets: false
  }),
  versioned: true,             // Keep old versions of files
  cors: [ ... ],               // Allow web browsers to upload/download
  lifecycleRules: [
    {
      transitions: [
        { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(30) },
        { storageClass: s3.StorageClass.GLACIER, transitionAfter: Duration.days(90) },
      ]
    }
  ],
  removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: environment !== 'prod',
});
```

**CORS (Cross-Origin Resource Sharing):** Without CORS, web browsers block JavaScript from calling an S3 bucket hosted on a different domain. We explicitly allow specific origins (like `https://shoplocally.co.nz`) to upload and download images. This is a security mechanism — only our domains are whitelisted.

**S3 Storage Classes:**
| Class | Use Case | Cost |
|-------|----------|------|
| Standard | Frequently accessed files | Most expensive |
| Infrequent Access (IA) | Files accessed once a month or less | ~40% cheaper |
| Glacier | Archives, barely accessed | Very cheap |

**Lifecycle Rule:** After 30 days, automatically move objects to IA. After 90 days, move to Glacier. This dramatically reduces costs for old images.

**`versioned: true`:** Every time an image is replaced, the old version is saved. This prevents accidental data loss.

### S3 Backup Bucket

This bucket stores database backups. It is **private, encrypted, blocked from public access**.

```typescript
this.backupBucket = new s3.Bucket(this, 'BackupBucket', {
  bucketName: `shoplocally-backups-${this.account}-${this.region}`,
  encryption: s3.BucketEncryption.S3_MANAGED, // Encrypt at rest
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  lifecycleRules: [
    { expiration: cdk.Duration.days(90) }, // Auto-delete after 90 days
    { transitions: [ ... ] },              // Move to cheaper storage over time
  ],
});
```

**`BucketEncryption.S3_MANAGED`:** AWS automatically encrypts every file stored in the bucket using AES-256. The keys are managed by AWS. This is required for anything containing sensitive data.

---

## 13. Stack 6 — RDS (PostgreSQL Database)

**File:** [aws-setup/lib/rds-stack.ts](aws-setup/lib/rds-stack.ts)

### What is RDS?

**RDS (Relational Database Service)** is a managed database service. AWS handles backups, patching, failover, and scaling. You just use it like a regular PostgreSQL database.

### What We Created

```typescript
const dbInstance = new rds.DatabaseInstance(this, 'PostgresInstance', {
  engine: rds.DatabaseInstanceEngine.postgres({
    version: rds.PostgresEngineVersion.VER_16,
  }),
  vpc,
  instanceType: ec2.InstanceType.of(
    ec2.InstanceClass.BURSTABLE4_GRAVITON,
    ec2.InstanceSize.MICRO     // t4g.micro — free tier eligible
  ),
  credentials: rds.Credentials.fromPassword('dbadmin', secretValue),
  allocatedStorage: 20,        // 20 GB disk
  storageType: rds.StorageType.GP2,
  multiAz: false,              // No standby replica (saves cost for dev/qas)
  publiclyAccessible: true,    // For testing; in strict production: false
  backupRetention: cdk.Duration.days(1),
  deletionProtection: false,   // Allow deletion (set true in production)
  databaseName: 'shoplocallydb',
  securityGroups: [dbSg],
});
```

**Multi-AZ:** If set to `true`, AWS creates a standby replica in a second AZ. If the primary database fails, it automatically fails over to the standby in ~60 seconds. We disabled this for cost savings but should enable it in production.

**`BURSTABLE4_GRAVITON` (`t4g`):** Graviton is AWS's ARM-based processor. It is about 40% cheaper than x86 (`t3`) for the same performance. The `t` series is "burstable" — it uses CPU credits and can burst to 100% CPU when needed.

**`GP2` storage:** General Purpose SSD. Good balance of performance and cost.

**Credentials:** We store the database password using `rds.Credentials.fromPassword()`. In the early version, we used `fromGeneratedSecret()` which lets AWS Secrets Manager auto-generate and store the password (more secure).

---

## 14. Stack 7 — EC2 (The Application Server)

**Files:** [aws-setup/lib/api-ec2-stack.ts](aws-setup/lib/api-ec2-stack.ts), [aws-setup/lib/ec2-stack.ts](aws-setup/lib/ec2-stack.ts)

### What is EC2?

**EC2 (Elastic Compute Cloud)** is a virtual server in the cloud. You choose the operating system, CPU, RAM, and disk. Our Node.js API runs as a Docker container on an EC2 instance.

### What We Created

```typescript
const instance = new ec2.Instance(this, 'ApiInstance', {
  vpc: props.vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // Place in public subnet
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
  machineImage: ec2.MachineImage.latestAmazonLinux2023(), // OS
  securityGroup: this.apiSecurityGroup,
  role,                        // IAM role we created in iam-stack
});
```

**t3.micro:** 2 vCPU, 1 GB RAM. Burstable. Free tier: 750 hours/month. Good for development and low-traffic production.

**Amazon Linux 2023:** AWS's own Linux distribution based on Fedora. Comes pre-installed with AWS tools.

### User Data — The Startup Script

`User Data` is a script that runs **once** when the EC2 instance first boots. We use it to install Docker and the CloudWatch agent.

```typescript
instance.userData.addCommands(
  'yum update -y',
  'yum install -y docker',
  'systemctl start docker',
  'systemctl enable docker',       // Start Docker automatically on reboot
  'usermod -a -G docker ec2-user', // Allow ec2-user to run Docker without sudo
  'yum install -y awscli',
  'yum install -y amazon-cloudwatch-agent',
  '...',
);
```

**`systemctl enable docker`:** This ensures Docker starts automatically if the server reboots. Without this, a reboot would stop the API.

**CloudWatch Agent:** Reads log files from the server and sends them to CloudWatch Logs. We configure it to collect:
- `/var/log/shoplocally/*.log` — application logs
- `/var/lib/docker/containers/*/*.log` — Docker container logs

### Earlier Version (backend-cdk)

In the earlier experimental version, we also created a Key Pair using the `cdk-ec2-key-pair` community construct:

```typescript
const key = new KeyPair(this, 'KeyPair', {
  keyPairName: 'api-shoplocally-api-key',
  description: 'Key pair created by CDK for SSH access',
});

// Store the private key in SSM Parameter Store
new ssm.StringParameter(this, 'KeyPairPrivateKeyParam', {
  parameterName: '/ec2/keypair/api-shoplocally-api-key-private',
  stringValue: key.privateKeyArn,
});
```

A **Key Pair** is an SSH key. The public key goes on the server, and the private key goes on your machine. You use it to SSH into the EC2 instance.

**SSM Parameter Store:** Used to store configuration values (like an ARN or a URL). Not for secrets (use Secrets Manager for that).

---

## 15. Stack 8 — Cognito (Authentication)

**File:** [aws-setup/lib/cognito-stack.ts](aws-setup/lib/cognito-stack.ts)

### What is Cognito?

**AWS Cognito** is a managed authentication service. It handles user signup, login, password reset, multi-factor authentication, and social sign-in (Google, Apple). You do NOT have to write or manage JWT tokens yourself.

### Two User Pools Per Environment

We have two separate Cognito User Pools per environment because ShopLocally has two types of users:
- **Client users** — people who shop at local stores.
- **Business users** — store owners who manage listings.

```typescript
this.clientUserPool = new cognito.UserPool(this, 'ShopLocallyClientUserPool', {
  userPoolName: `shoplocally-client-${environment}`,
  selfSignUpEnabled: true,
  signInAliases: { email: true, username: true, phone: true },
  standardAttributes: {
    email: { required: true, mutable: true },
    givenName: { required: true, mutable: true },
    familyName: { required: true, mutable: true },
  },
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
  },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
  removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
});
```

### Lambda Triggers

Cognito allows you to attach Lambda functions that run **at specific points in the auth flow**:

**Pre-signup Lambda** (`preSignUp.handler`): Runs before a new account is created. We use it to:
- Check if an email is already registered via Google but the user is trying to sign up with email/password.
- Automatically link the accounts so the user does not end up with two separate accounts.

**Post-confirmation Lambda** (`postConfirmation.handler`): Runs after a user confirms a forgot-password reset. We use it to:
- Call `AdminUserGlobalSignOut` — signs the user out of ALL devices after they reset their password. This is a security best practice.

### Social Sign-In (Google, Apple)

We configured optional Google and Apple OAuth. The config is passed via CDK context:
```bash
cdk deploy --context clientAppGoogleOAuth='{"clientId":"...","clientSecret":"..."}'
```

---

## 16. Stack 9 — Lambda & Secrets Manager

**File:** [aws-setup/lib/lambda-stack.ts](aws-setup/lib/lambda-stack.ts)

### What is Lambda?

**AWS Lambda** is "serverless" compute. You write a function, upload it, and AWS runs it on demand — you do not manage any servers. You pay only for the time your function runs (in milliseconds).

### What is Secrets Manager?

**AWS Secrets Manager** stores sensitive values (passwords, API keys, encryption keys) securely. Values are encrypted at rest. Applications can retrieve secrets via API. Supports automatic rotation.

### What We Built

We needed to rotate the QR code encryption key daily (security best practice). Here is the full flow:

1. **Secrets Manager** stores the current QR encryption key.
2. A **Lambda function** (`qrRotateTrigger`) updates the key with a new random value.
3. An **EventBridge rule** triggers the Lambda every day at 04:00 UTC.

```typescript
// 1. Create the secret
this.qrEncryptionSecret = new secretsmanager.Secret(this, 'QREncryptionKeys', {
  secretName: 'shoplocally/qr-encryption-keys',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ algorithm: 'AES-256-GCM', version: '1.0' }),
    generateStringKey: 'key',
    passwordLength: 44, // Base64 of 32 random bytes = 256-bit key
  },
});

// 2. Create the Lambda
this.qrRotateTriggerFunction = new lambda.Function(this, 'QRRotateTriggerFunction', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'qrRotateTrigger.handler',    // file: qrRotateTrigger.ts, function: handler
  code: lambda.Code.fromAsset('../aws/lambda'), // Path to Lambda source code
  timeout: cdk.Duration.seconds(60),
  environment: { SECRET_NAME: this.qrEncryptionSecret.secretName },
});

// 3. Schedule it with EventBridge
const dailyRule = new events.Rule(this, 'QRDailyRotationRule', {
  schedule: events.Schedule.cron({ minute: '0', hour: '4' }), // 04:00 UTC daily
});
dailyRule.addTarget(new targets.LambdaFunction(this.qrRotateTriggerFunction));
```

**`lambda.Code.fromAsset()`:** Packages a local directory and uploads it to S3 (the CDK bootstrap bucket) so Lambda can use it.

**EventBridge (formerly CloudWatch Events):** AWS's event bus. You can trigger Lambda functions on a schedule (cron), on an API call, or on almost any AWS event.

---

## 17. Stack 10 — Monitoring (CloudWatch, SNS)

**File:** [aws-setup/lib/monitoring-stack.ts](aws-setup/lib/monitoring-stack.ts)

### What is CloudWatch?

**AWS CloudWatch** is the monitoring and observability service. It collects:
- **Metrics** — numbers over time (CPU %, memory %, request count).
- **Logs** — text output from your services.
- **Alarms** — trigger when a metric crosses a threshold.
- **Dashboards** — visual graphs of metrics.

### SNS (Simple Notification Service)

**SNS** is a messaging service. We use it to send email alerts when an alarm triggers.

### Alarms We Created

| Alarm | Threshold | What It Means |
|-------|-----------|---------------|
| HighCPU | CPU > 80% for 10 min | Server is overloaded |
| HighMemory | Memory > 85% for 10 min | Running out of RAM |
| HighDisk | Disk > 90% | Running out of disk space |
| ProdAPIDown | Container status = 0 | API container crashed |
| SSLExpiry | Days until expiry < 30 | SSL certificate needs renewal |
| FailedLogins | >10 failures per hour | Possible brute force attack |
| NginxDown | Nginx status = 0 | Reverse proxy crashed |

```typescript
const highCpuAlarm = new cloudwatch.Alarm(this, 'HighCPUAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/EC2',
    metricName: 'CPUUtilization',
    dimensionsMap: { InstanceId: props.instance.instanceId },
    statistic: 'Average',
    period: cdk.Duration.minutes(5),
  }),
  threshold: 80,
  evaluationPeriods: 2,  // Must breach threshold for 2 consecutive periods (10 min total)
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
});
highCpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
```

**`evaluationPeriods: 2`:** The alarm only fires if the threshold is breached for 2 consecutive 5-minute periods (10 minutes total). This avoids false alarms from brief spikes.

### CloudWatch Dashboard

We created a visual dashboard at `ShopLocally-Overview` showing:
- System resources (CPU, memory)
- Container statuses (prod, qas, preview, dev)
- Security metrics (failed logins, banned IPs)

---

## 18. The Docker + ECR Workflow

This is the process of building, packaging, and deploying the Node.js API.

### Step 1 — Build the Docker Image

The `Dockerfile` at the root of the project uses a **multi-stage build** for smaller final images:

```dockerfile
# Stage 1: Builder — compile TypeScript to JavaScript
FROM node:18-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY prisma ./prisma/
RUN npx prisma generate
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Stage 2: Production — only copy the compiled output
FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates
COPY package*.json ./
RUN npm install
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# ...
EXPOSE 3000
CMD ["node", "--max-old-space-size=512", "dist/src/server.js"]
```

**Why multi-stage?** The builder stage has TypeScript compiler, source maps, and dev dependencies (~300 MB). The production stage only has compiled JavaScript and production dependencies (~80 MB). Smaller images pull faster and have a smaller attack surface.

### Step 2 — Authenticate Docker with ECR

```bash
aws ecr get-login-password --region ap-southeast-2 \
  | docker login --username AWS --password-stdin \
    789842199839.dkr.ecr.ap-southeast-2.amazonaws.com
```

ECR uses temporary tokens (12 hours expiry). `get-login-password` gets a token from AWS, and we pipe it directly to `docker login`. No permanent passwords.

### Step 3 — Tag the Image

```bash
# Tag with a timestamp for traceability
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
docker tag api-shoplocally-api:$TIMESTAMP \
  789842199839.dkr.ecr.ap-southeast-2.amazonaws.com/api-shoplocally-api:latest

docker tag api-shoplocally-api:$TIMESTAMP \
  789842199839.dkr.ecr.ap-southeast-2.amazonaws.com/api-shoplocally-api:$TIMESTAMP
```

We always push both `latest` and a timestamped tag. `latest` is what the server pulls. The timestamped tag allows us to roll back.

### Step 4 — Push to ECR

```bash
docker push 789842199839.dkr.ecr.ap-southeast-2.amazonaws.com/api-shoplocally-api:latest
docker push 789842199839.dkr.ecr.ap-southeast-2.amazonaws.com/api-shoplocally-api:$TIMESTAMP
```

### Step 5 — EC2 Pulls and Runs the Image

On the EC2 server:
```bash
# Authenticate
aws ecr get-login-password --region ap-southeast-2 \
  | docker login --username AWS --password-stdin 789842199839.dkr.ecr.ap-southeast-2.amazonaws.com

# Pull latest image
docker pull 789842199839.dkr.ecr.ap-southeast-2.amazonaws.com/api-shoplocally-api:latest

# Stop old container
docker stop prodapi && docker rm prodapi

# Run new container
docker run -d \
  --name prodapi \
  -p 3004:3000 \
  --env-file /home/ec2-user/.env.prod \
  789842199839.dkr.ecr.ap-southeast-2.amazonaws.com/api-shoplocally-api:latest
```

---

## 19. Multi-Environment Setup (dev / qas / preview / prod)

We deploy the same application in four environments. Each has its own database, S3 bucket, Cognito user pools, and API container running on a different port.

### Environment Configuration

Defined in [aws-setup/bin/shoplocally.ts](aws-setup/bin/shoplocally.ts):

```typescript
app.node.setContext('environments', {
  dev:     { port: 3001, domain: 'devapi.shoplocally.co.nz',     databaseName: 'shoplocally_dev' },
  qas:     { port: 3002, domain: 'qasapi.shoplocally.co.nz',     databaseName: 'shoplocally_qas' },
  preview: { port: 3003, domain: 'previewapi.shoplocally.co.nz', databaseName: 'shoplocally_preview' },
  prod:    { port: 3004, domain: 'api.shoplocally.co.nz',        databaseName: 'shoplocally_prod' },
});
```

### Shared vs Per-Environment Resources

| Resource | Shared or Per-Env? | Why |
|----------|--------------------|-----|
| VPC | Shared | One network for all |
| ECR | Shared | One image registry, different tags |
| EC2 | Shared | All environments run on one server |
| RDS | Shared instance | Cost savings; separate databases within |
| S3 Images | Per-environment | Separate buckets: `shoplocally-images-prod`, `shoplocally-images-qas` |
| Cognito | Per-environment | Separate user pools for each env |
| Monitoring | Shared | One dashboard showing all |

### CDK Context

Context is how you pass variables to CDK at deploy time:
```bash
cdk deploy --context environment=qas
```

Inside your stack, you read it with:
```typescript
const env = this.node.tryGetContext('environment');
const config = this.node.tryGetContext('environments')[env];
```

---

## 20. Stack Dependencies — The Order Matters

When resources in Stack B need values from Stack A (like a VPC ID), Stack B must be deployed AFTER Stack A. CDK handles this with `addDependency()`.

```typescript
// From shoplocally-app.ts
securityGroupsStack.addDependency(vpcStack);       // Security Groups need VPC
rdsStack.addDependency(securityGroupsStack);        // RDS needs Security Groups
ec2Stack.addDependency(ecrStack);                   // EC2 needs ECR to exist first
ec2Stack.addDependency(iamStack);                   // EC2 needs IAM role
monitoringStack.addDependency(ec2Stack);            // Monitoring needs EC2 instance ID
monitoringStack.addDependency(rdsStack);            // Monitoring needs RDS instance ID
```

**Deployment Order:**
1. VPC
2. Security Groups (needs VPC)
3. IAM (needs VPC)
4. S3 Backup, Lambda, ECR (needs VPC)
5. S3 Images per-env (needs VPC)
6. Cognito per-env (needs Lambda — for triggers)
7. RDS (needs Security Groups)
8. EC2 (needs IAM, Security Groups, ECR, S3, Cognito)
9. Monitoring (needs EC2, RDS)

If you run `cdk deploy --all`, CDK automatically figures out this order from your `addDependency()` calls and runs them in the correct sequence.

---

## 21. CfnOutput — How We Export Values Between Stacks

`CfnOutput` prints a value to the console after deployment and can export it for other stacks to import.

```typescript
// In VPC stack — export the VPC ID
new cdk.CfnOutput(this, 'VpcId', {
  value: this.vpc.vpcId,
  description: 'VPC ID',
  exportName: 'ShopLocally-VpcId',  // Other stacks can import this
});

// In ECR stack — export the repository URI
new cdk.CfnOutput(this, 'ApiRepositoryUri', {
  value: this.apiRepository.repositoryUri,
  exportName: 'ShopLocally-ApiRepositoryUri',
});
```

After deployment, you see outputs like:
```
Outputs:
shoplocally-vpc-ap-southeast-2.VpcId = vpc-0abc123def456
shoplocally-ecr-ap-southeast-2.ApiRepositoryUri = 789842199839.dkr.ecr.ap-southeast-2.amazonaws.com/shoplocally-api
```

We also store key values in **SSM Parameter Store** so deployment scripts can look them up at any time:
```typescript
new ssm.StringParameter(this, 'ApiInstanceId', {
  parameterName: `/api-shoplocally/prod/instance-id`,
  stringValue: instance.instanceId,
});
```

Then in a deployment script:
```bash
INSTANCE_ID=$(aws ssm get-parameter --name /api-shoplocally/prod/instance-id --query 'Parameter.Value' --output text)
```

---

## 22. Tagging — Why We Tag Everything

Tags are key-value pairs attached to AWS resources. They are crucial for:

1. **Cost tracking** — Filter your AWS bill by `Project: ShopLocally`.
2. **Finding resources** — Filter in the console by `Environment: prod`.
3. **Security policies** — IAM policies can restrict access by tag.
4. **Automation** — Auto-start/stop EC2 by `AutoShutdown: true`.

We tag everything globally in `shoplocally.ts`:
```typescript
cdk.Tags.of(app).add('Project', 'ShopLocally');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(root).add('Region', region);
cdk.Tags.of(root).add('Account', account ?? 'unknown');
```

And add specific tags in each stack:
```typescript
cdk.Tags.of(this.vpc).add('Name', 'ShopLocally-VPC');
cdk.Tags.of(this.vpc).add('Environment', 'Multi');
```

---

## 23. Full Deployment Walkthrough

Here is the complete sequence to deploy the entire ShopLocally infrastructure from scratch.

### Prerequisites Check
```bash
aws --version                     # AWS CLI installed?
node --version                    # Node.js installed?
cdk --version                     # CDK installed?
aws sts get-caller-identity       # Logged in to correct AWS account?
```

### First-Time Setup
```bash
cd api-shoplocally/aws-setup
npm install                        # Install CDK dependencies

# Bootstrap the AWS account (one-time per account)
cdk bootstrap aws://789842199839/ap-southeast-2 --profile prod
```

### Preview Changes
```bash
cdk synth                          # Synthesize CloudFormation templates
cdk diff                           # Preview what will be created
cdk list                           # List all stacks
```

### Deploy All Infrastructure
```bash
cdk deploy --all --profile prod --require-approval never
```

Or deploy individual stacks:
```bash
cdk deploy shoplocally-vpc-ap-southeast-2 --profile prod
cdk deploy shoplocally-security-ap-southeast-2 --profile prod
cdk deploy shoplocally-ecr-ap-southeast-2 --profile prod
# ... etc
```

### Build and Push Docker Image
```bash
cd api-shoplocally/aws/deployment/prod
./push-image.sh                    # Builds Docker image and pushes to ECR
```

### Deploy New Version to EC2
```bash
./deploy-simple.sh                 # Pulls latest image from ECR, restarts container
```

---

## 24. Interview Questions & Answers

### AWS CDK Fundamentals

**Q: What is the difference between CDK, CloudFormation, and Terraform?**

A: CloudFormation is AWS's native IaC service that uses YAML/JSON templates — verbose and hard to reuse. Terraform uses HCL and is multi-cloud but not AWS-native. CDK lets you use TypeScript/Python and compiles down to CloudFormation under the hood. CDK is the best choice when working exclusively with AWS because you get type safety, autocomplete, loops, and conditionals.

---

**Q: What are L1, L2, and L3 constructs in CDK?**

A: L1 constructs are direct wrappers around CloudFormation resources — they match CloudFormation 1:1 and are prefixed with `Cfn` (e.g., `ec2.CfnInstance`). L2 constructs are higher-level with sensible defaults and helper methods (e.g., `ec2.Instance`). L3 constructs are complete patterns combining multiple resources (e.g., `ecs_patterns.ApplicationLoadBalancedFargateService`). In this project, we primarily used L2 constructs.

---

**Q: What does `cdk bootstrap` do and why is it needed?**

A: Bootstrapping creates a `CDKToolkit` CloudFormation stack in your AWS account that provisions an S3 bucket (for deployment assets like Lambda code) and IAM roles (for CDK to assume during deployment). Without it, CDK cannot upload assets or deploy stacks that reference local files. It only needs to be done once per AWS account per region.

---

**Q: What is `cdk synth` used for?**

A: `cdk synth` converts your TypeScript CDK code into CloudFormation YAML/JSON templates. It does NOT deploy anything. You run it to preview what CloudFormation will create, to debug errors before hitting AWS, or to check into source control alongside your code.

---

**Q: What is `RemovalPolicy` and what are the options?**

A: `RemovalPolicy` controls what happens to a resource when its CDK stack is deleted. Options are:
- `RETAIN` — Keep the resource after stack deletion (used for prod ECR, prod S3).
- `DESTROY` — Delete the resource (used for dev/qas S3).
- `SNAPSHOT` — Take a snapshot before deleting (used for databases).

---

### Networking

**Q: What is the difference between a public subnet and a private subnet?**

A: A public subnet has a route to an Internet Gateway, so resources in it can have public IP addresses and communicate with the internet. A private subnet has no internet route — resources in it can only communicate with other resources inside the VPC (or use a NAT Gateway to initiate outbound internet connections). We put EC2 in a public subnet (it needs to serve HTTP traffic) and ideally put RDS in a private subnet (it should never be directly accessible from the internet).

---

**Q: What is a Security Group? How is it different from a Network ACL?**

A: A Security Group is a stateful virtual firewall attached to individual resources (EC2, RDS). Stateful means if inbound traffic is allowed, the response automatically goes out without a separate outbound rule. A Network ACL is stateless and operates at the subnet level — you need explicit rules for both inbound and outbound. Security Groups are the primary and most commonly used firewall for EC2/RDS.

---

**Q: What is a VPC Endpoint and why did we add an S3 endpoint?**

A: A VPC Endpoint creates a private connection between your VPC and an AWS service without traffic going over the internet. We added an S3 Gateway Endpoint so that when our EC2 pulls Docker layers from ECR (which are stored in S3) or uploads images, the traffic stays within the AWS network. This is faster, more secure, and avoids data transfer costs.

---

### IAM & Security

**Q: What is the difference between an IAM Role and an IAM User?**

A: An IAM User represents a person with long-term credentials (access key + secret). An IAM Role is assumed temporarily by an AWS service, a Lambda function, or a federated user — it issues temporary credentials. EC2 instances use Roles (not Users) so there are no permanent credentials stored on the server. This is much more secure.

---

**Q: What is the principle of least privilege?**

A: Only grant the minimum permissions needed to perform a task. In our RDS security group, we only allow port 5432 from the specific EC2 security group ID — not from `0.0.0.0/0`. In our EC2 role, we only grant `ecr:GetAuthorizationToken` and specific ECR read actions — not full ECR admin access.

---

### Containers & ECR

**Q: Explain the ECR authentication process. Why does `docker login` require a token?**

A: ECR uses AWS IAM for authentication, not Docker credentials. You call `aws ecr get-login-password` which exchanges your AWS credentials for a temporary Docker registry token (valid 12 hours). You pipe this token to `docker login` so Docker can push/pull images. This way, there are no long-term Docker passwords to manage or rotate.

---

**Q: What is a multi-stage Dockerfile and why is it useful?**

A: A multi-stage Dockerfile uses multiple `FROM` statements. Each stage can have different tools installed. The final stage only copies what it needs from earlier stages. In our Dockerfile, Stage 1 (builder) installs TypeScript, dev dependencies, and compiles the code. Stage 2 (production) only copies the compiled `dist/` folder and production `node_modules`. The final image is ~80MB instead of ~300MB — smaller images push/pull faster and have fewer vulnerabilities.

---

**Q: What is a lifecycle policy in ECR?**

A: A lifecycle policy automatically deletes old Docker images based on rules you define. In our project, we keep the last 10 tagged images. Without this, images accumulate indefinitely and you pay for storage. ECR charges per GB of stored image data.

---

### S3

**Q: What is CORS and why do we configure it on S3?**

A: CORS (Cross-Origin Resource Sharing) is a browser security mechanism that blocks JavaScript code running on `domain-a.com` from making requests to `domain-b.com` unless `domain-b.com` explicitly allows it. Our React frontend on `shoplocally.co.nz` uploads images directly to S3. Without CORS configured on the S3 bucket, the browser would block these uploads. We whitelist specific origins in the CORS configuration.

---

**Q: What is S3 Intelligent-Tiering / S3 storage classes?**

A: S3 has different storage classes with different costs: Standard (frequently accessed, highest cost), Infrequent Access (accessed once a month, 40% cheaper), Glacier (archival, very cheap but slow to retrieve). We use lifecycle rules to automatically move objects to cheaper storage after 30 and 90 days. This reduces costs for images that haven't been viewed recently.

---

**Q: What is the difference between `publicReadAccess: true` and `blockPublicAccess`?**

A: `blockPublicAccess` is an account-level or bucket-level safety switch that prevents any public access regardless of bucket policy. To enable public access you must first set `blockPublicAccess` to allow it. Then `publicReadAccess: true` adds a bucket policy allowing `s3:GetObject` from `*` (everyone). For backup buckets, we leave `blockPublicAccess: BLOCK_ALL` so they can never be accidentally made public.

---

### RDS & Databases

**Q: What is Multi-AZ in RDS and when would you use it?**

A: Multi-AZ creates a synchronous standby replica in a different Availability Zone. If the primary database fails (hardware issue, AZ outage), RDS automatically fails over to the standby in ~60 seconds with no manual intervention. We disabled it for cost savings in dev/qas but it should be enabled in production for any database that cannot afford downtime.

---

**Q: What is the difference between `Credentials.fromGeneratedSecret()` and `Credentials.fromPassword()`?**

A: `fromGeneratedSecret()` lets AWS Secrets Manager auto-generate a strong random password and store it. Your application reads it from Secrets Manager at runtime — the password never appears in your code or config. `fromPassword()` takes a password you provide, which risks it appearing in source code (as happened in the early version of our project). Always use `fromGeneratedSecret()` in production.

---

### Lambda & Serverless

**Q: What is EventBridge and how did we use it?**

A: EventBridge is AWS's event bus service. You can create rules that trigger on AWS API events (e.g., "when an S3 object is uploaded"), on a schedule (cron), or from custom events. We used a cron schedule to trigger our QR key rotation Lambda every day at 04:00 UTC: `events.Schedule.cron({ minute: '0', hour: '4' })`.

---

**Q: What is AWS Secrets Manager and when would you use it over SSM Parameter Store?**

A: Both store configuration values. Secrets Manager is designed for sensitive data (passwords, API keys, encryption keys). It supports automatic rotation, has fine-grained access control, and costs $0.40/secret/month. SSM Parameter Store stores configuration (URLs, instance IDs, non-sensitive config) and is free for standard parameters. Use Secrets Manager for anything you would never put in source code; use SSM Parameter Store for everything else.

---

### CloudWatch & Monitoring

**Q: What is the difference between a CloudWatch Metric, Alarm, and Log?**

A:
- **Metric**: A numerical time-series data point (e.g., CPU is 72% at 14:00).
- **Log**: A text record of events (e.g., an HTTP request log line).
- **Alarm**: A rule that watches a metric and fires when it crosses a threshold. An alarm has three states: `OK`, `ALARM`, `INSUFFICIENT_DATA`.

---

**Q: What does `evaluationPeriods: 2` mean on a CloudWatch Alarm?**

A: The metric is measured every `period` (e.g., 5 minutes). `evaluationPeriods: 2` means the threshold must be breached for 2 consecutive periods before the alarm fires. This prevents false alarms from brief spikes. If CPU spikes to 90% for 1 minute and then drops, the alarm will not fire. It only fires if CPU is above 80% for 10 consecutive minutes.

---

### General Architecture

**Q: Why did you split infrastructure into multiple CDK stacks instead of one?**

A: Multiple stacks have several advantages: faster deployments (only changed stacks are updated), isolated failures (a bug in the monitoring stack doesn't roll back the VPC), independent lifecycles (you can destroy a dev stack without touching prod), and cleaner code. The trade-off is managing cross-stack references and deployment ordering.

---

**Q: What is `cdk.Tags.of(app).add()`? Why tag at the app level?**

A: This applies a tag to every resource in the entire CDK app by tagging the root `app` construct. Child constructs inherit tags from parents. By tagging at the app level with `Project: ShopLocally`, every single resource — VPC, subnets, EC2, RDS, S3 buckets, Lambda functions — gets that tag automatically. This makes cost reporting easy because you can filter your AWS bill by project.

---

**Q: How would you handle secrets in CDK? What did you avoid?**

A: Never hardcode secrets (passwords, API keys) in CDK code or environment variables committed to git. The correct approaches are:
1. Use `rds.Credentials.fromGeneratedSecret()` — let AWS create and store the password.
2. Use `secretsmanager.Secret` for custom secrets; app reads them at runtime via SDK.
3. Use SSM Parameter Store for non-sensitive config.
4. Pass secrets via CDK context only at deploy time (not in cdk.json committed to git).

In the early version of this project, the database password was hardcoded as a plain string — this is something to fix in a code review.

---

**Q: Explain the IAM role that our EC2 instance has and why it needs each permission.**

A: The EC2 instance role has:
- `AmazonSSMManagedInstanceCore` — allows AWS Systems Manager to connect to and manage the instance (for running commands remotely without SSH keys).
- `CloudWatchAgentServerPolicy` — allows the CloudWatch agent to send metrics and logs to CloudWatch.
- `ecr:GetAuthorizationToken` + ECR read actions — allows the instance to pull Docker images from ECR without needing stored credentials.
- `s3:PutObject/GetObject` on the images bucket — allows the API to serve and store user-uploaded product images.
- `secretsmanager:GetSecretValue` on the QR key secret — allows the API to decrypt QR codes.

---

**Q: What is `--require-approval never` in `cdk deploy`?**

A: By default, CDK asks for your approval before making changes to security groups, IAM policies, or other sensitive resources (it calls these "broadening security changes"). `--require-approval never` skips this prompt, which is necessary in automated deployment scripts where no human is present. You should only use this in scripts where you have already reviewed the changes with `cdk diff`.

---
