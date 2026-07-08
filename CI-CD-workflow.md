# CI/CD Workflow — Azure DevOps → AWS

> **Audience:** Learning CI/CD automation for the first time.
> **Goal:** Understand how this project's pipeline is wired — Azure DevOps for source control, pull requests, and pipeline orchestration, deploying infrastructure that lives on AWS (built with CDK).

---

## Table of Contents

1. [Why Azure DevOps + AWS?](#1-why-azure-devops--aws)
2. [Repository Setup](#2-repository-setup)
3. [Branching Strategy](#3-branching-strategy)
4. [AWS Credentials — IAM User for the Pipeline](#4-aws-credentials--iam-user-for-the-pipeline)
5. [Azure DevOps Library — Storing Secrets](#5-azure-devops-library--storing-secrets)
6. [Environments](#6-environments)
7. [The Pipeline File, Section by Section](#7-the-pipeline-file-section-by-section)
8. [Trigger Logic — When Does What Run?](#8-trigger-logic--when-does-what-run)
9. [The Day-to-Day Workflow](#9-the-day-to-day-workflow)
10. [Troubleshooting Log — Issues We Actually Hit](#10-troubleshooting-log--issues-we-actually-hit)
11. [How to Verify a Deployment Worked](#11-how-to-verify-a-deployment-worked)
12. [Known Gaps / Follow-ups](#12-known-gaps--follow-ups)

---

## 1. Why Azure DevOps + AWS?

There's nothing unusual about this combination — Azure DevOps (Repos, Pipelines, Boards) is just a CI/CD and project-management tool; it doesn't care where the code is actually deployed. AWS remains the deployment target (via CDK), Azure DevOps is only the automation layer that:

- Hosts the git repo (Azure Repos) and manages branches/PRs.
- Runs the CI/CD pipeline (Azure Pipelines) on Microsoft-hosted agents.
- Authenticates to AWS using an IAM access key stored as an encrypted pipeline secret — the pipeline agent is just running the same `cdk deploy` command you'd run locally, non-interactively.

---

## 2. Repository Setup

The project originally lived only on GitHub (`sms-service` remote). To manage branches/PRs from Azure DevOps, Azure Repos was made the **primary** remote:

```bash
git remote add azure https://kartikeyedangwal@dev.azure.com/kartikeyedangwal/Student_Management_Service/_git/Student_Management_Service
git push azure main dev develop
git branch --set-upstream-to=azure/main main
git branch --set-upstream-to=azure/dev dev
git branch --set-upstream-to=azure/develop develop
```

After this, a plain `git push` / `git pull` goes to Azure Repos by default. The GitHub remote (`sms-service`) is still present but no longer the working remote.

The **default branch** in Azure Repos was changed from `main` to `dev` via **Repos → Branches → ⋮ next to `dev` → "Set as default branch."**

---

## 3. Branching Strategy

- `dev` — day-to-day work, default branch, opens PRs against `main`.
- `main` — the branch that triggers real AWS deployments. Only reached via a merged PR from `dev`.
- `develop` — currently tracked but not part of the active pipeline triggers.

**Why this matters for CI/CD:** the pipeline is deliberately asymmetric — pushing to `dev` only runs the `Build` stage (safe, no AWS calls beyond authenticated `cdk synth` validation). Only a push to `main` (i.e., a merged PR) runs the `DeployAws` stage that touches real infrastructure. This keeps experimentation on `dev` free of any risk of accidentally redeploying AWS resources.

---

## 4. AWS Credentials — IAM User for the Pipeline

IAM users, roles, and access keys are **free** in AWS — billing only comes from provisioned resources (EC2, RDS, etc.), not identities. Rather than reusing the personal IAM user (`kartikeyeD`) already used for local CDK work and a separate RAG chatbot project, a **dedicated IAM user** was created for Azure Pipelines:

- **User:** `azure-devops-cicd`
- **Access:** Programmatic only (no console password).
- **Permissions:** Added to the existing `kartikeye_dev` group (`AdministratorAccess`) to get the pipeline working quickly. This is broader than necessary — a follow-up is to scope this down to just what the CDK stacks touch (EC2, RDS, VPC, ECR, IAM role creation, CloudFormation).
- **Access key:** generated under **IAM → Users → azure-devops-cicd → Security credentials → Create access key → "Third-party service."**

**Why a separate user instead of reusing an existing key:** each consumer of a credential (laptop, RAG bot, CI pipeline) should be independently revocable. If the pipeline's key ever needs to be rotated or is compromised, it can be deactivated without breaking local development or unrelated projects.

---

## 5. Azure DevOps Library — Storing Secrets

AWS credentials must never live in a project `.env` file — Azure Pipelines agents are ephemeral cloud VMs that don't read local files, and committing a real AWS key (even to a gitignored file) risks it leaking into history via one misconfigured `.gitignore` or a stray `git add -A`.

Instead, they're stored in **Pipelines → Library → Variable group `aws-credentials`**:

| Variable | Value | Secret? |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | access key of `azure-devops-cicd` | 🔒 yes |
| `AWS_SECRET_ACCESS_KEY` | secret key of `azure-devops-cicd` | 🔒 yes |
| `AWS_DEFAULT_REGION` | `ap-southeast-2` | no |

Marking a variable "secret" (lock icon) encrypts it at rest and masks it from pipeline logs. The region was taken from `aws/cdk.context.json`, which already had cached context keyed by `region=ap-southeast-2` from earlier local deploys — **not** from the AWS Console's IAM page, which always shows "Global" because IAM itself is a region-less service.

---

## 6. Environments

**Pipelines → Environments → `aws-production`** was created and is referenced by the `DeployAws` stage's `deployment` job. This is currently just a named target (no manual-approval checks configured yet) — but it's the natural place to add a required approval gate before production deploys, if desired later.

---

## 7. The Pipeline File, Section by Section

The full pipeline lives at [azure-pipelines.yml](azure-pipelines.yml). It has two stages:

### `Build` stage — runs on every push/PR to `dev` or `main`

Three parallel jobs, each validating one part of the stack:

- **`Client`** — `npm ci` + `npm run build` in `client-studentMangSys` (Vite/React).
- **`Api`** — `npm ci` + `npx prisma generate` + `npm run build` in `api-studentMangSys` (must generate the Prisma client first, mirroring what the Dockerfile does).
- **`Infra`** — `npm ci` + `tsc build` + `jest` + `cdk synth` in `aws`. This job is also given the `aws-credentials` variable group, because `cdk synth` performs a live AWS credentials check once a stack has a concrete `account`/`region` (see [Troubleshooting](#10-troubleshooting-log--issues-we-actually-hit)).

### `DeployAws` stage — only runs on a push to `main`, and never on a PR

```yaml
condition: |
  and(
    succeeded(),
    eq(variables['Build.SourceBranch'], 'refs/heads/main'),
    ne(variables['Build.Reason'], 'PullRequest')
  )
```

A single `deployment` job (`CdkDeploy`) targeting the `aws-production` environment, running `npx cdk deploy --all --require-approval never` with the same AWS credentials. `--require-approval never` is required because there's no human present to approve CDK's "security-broadening change" prompts in an automated pipeline — the tradeoff is that you should already trust the change (e.g. via `cdk diff` locally) before merging to `main`.

---

## 8. Trigger Logic — When Does What Run?

| Event | `Build` stage | `DeployAws` stage |
|---|---|---|
| Push to `dev` | ✅ runs | ❌ skipped (wrong branch) |
| Open/update a PR into `main` or `dev` | ✅ runs (build validation) | ❌ skipped (`Build.Reason == PullRequest`) |
| Merge PR into `main` (push to `main`) | ✅ runs | ✅ runs |

This means the only way to trigger a real AWS deployment is to merge a PR into `main` — pushing directly to `dev`, or just opening a PR, never touches AWS.

---

## 9. The Day-to-Day Workflow

1. Work on `dev` (or a feature branch off it), commit, push — this alone runs `Build` for fast feedback.
2. Open a PR: `dev` → `main` in Azure Repos.
3. Merge the PR once `Build` is green.
4. The merge triggers the full pipeline on `main`, including `DeployAws`, which runs `cdk deploy --all` against the real AWS account.
5. Verify the deployment (see [section 11](#11-how-to-verify-a-deployment-worked)).

---

## 10. Troubleshooting Log — Issues We Actually Hit

Real issues encountered while setting this up, in the order they appeared — kept here because the fixes aren't obvious from the final working yaml alone.

### "Nothing happened" after pushing — pipeline didn't exist

Going through the pipeline creation wizard (Connect → Select → Configure → Review) and reviewing the YAML is **not enough** — you must explicitly click **Save** or **Run** at the end. Until then, no pipeline object exists in Azure DevOps, so no push triggers anything, and **Pipelines** shows "Create your first Pipeline" as if nothing had ever been configured.

### First run queued for 9+ minutes on the second job

Looked like a stuck Microsoft-hosted parallelism grant (a common gotcha for brand-new Azure DevOps orgs, which sometimes start with 0 granted parallel jobs pending a manual request). In this case it resolved on its own — the second and third jobs completed in under a minute once the queue caught up. If it doesn't resolve within ~10-15 minutes, check **Organization Settings → Pipelines → Parallel jobs** for a "Request free parallelism" prompt.

### `cdk synth --all`: "Unknown option(s): --all"

`--all` is a `deploy`/`destroy` flag, not a `synth` flag. Plain `cdk synth` already synthesizes every stack in the app. Harmless (just ignored), but cleaned up anyway.

### `cdk synth` failing: `StackAccountRegionNotSpecified`

```
Cannot retrieve value from context provider ssm since account/region are not specified at the stack level.
```

`aws/bin/aws.ts` sets each stack's `env` from `process.env.CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION`. Locally, the CDK CLI auto-populates these from your configured AWS credentials. On the Build agent, there were no AWS credentials at all, so both were `undefined` — meaning the stack had no `env`, and CDK couldn't match the cached AMI lookup in `aws/cdk.context.json` (which is keyed by a specific `account`+`region` string).

First attempted fix: hardcode `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` as literal strings for the synth step. This got further, but exposed the next issue.

### `cdk synth` failing: "Need to perform AWS calls for account ..., but no credentials have been configured"

Once a stack has a **concrete** `account`/`region` (not just matching a context cache key), CDK's synth-time policy validation performs a live credentials check against that account — a basic sanity check that you actually have working AWS access before letting synth "succeed." Hardcoded literal strings satisfy the context-cache lookup but not this live check.

**Real fix:** give the `Infra` job the same `aws-credentials` variable group used by the deploy stage, and pass them as real `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_DEFAULT_REGION` env vars. This lets the CDK CLI auto-resolve `CDK_DEFAULT_ACCOUNT`/`CDK_DEFAULT_REGION` from real credentials, exactly like it does on a local machine — no more hardcoded account ID in the yaml.

### `DeployAws` stage failing: "Not found workingDirectory: /home/vsts/work/1/s/aws"

**Deployment jobs** (`- deployment: ... strategy: runOnce`) do **not** auto-checkout the repository the way normal `- job:` blocks do. Nothing had been checked out, so the `aws/` directory never existed on the agent.

**Fix:** add an explicit `- checkout: self` as the first step inside `strategy.runOnce.deploy.steps`.

### Node.js tool installer deprecation warning

```
Task 'Node.js tool installer' version 0 (NodeTool@0) is deprecated. Please use UseNodeV1 as a replacement.
```

Non-fatal — the pipeline still runs correctly. Left as-is for now; a follow-up is to swap `NodeTool@0` for `UseNode@1` across all jobs to clear the warning.

---

## 11. How to Verify a Deployment Worked

A green `DeployAws` stage means `cdk deploy` exited 0 — it doesn't by itself prove the app is reachable. After a deploy:

1. **Get the live endpoint** — either from the `cdk deploy` log output (`AppStack.ApiEndpoint = http://<ec2-public-ip>:3000`) or **AWS Console → CloudFormation → student-mgmt-app → Outputs**.
2. **Hit the health check:**
   ```bash
   curl http://<ec2-public-ip>:3000/health
   ```
3. **Hit a real data route** — proves the container *and* its RDS/Prisma connection both work, not just that Express is listening:
   ```bash
   curl http://<ec2-public-ip>:3000/students
   ```
4. **Point the local frontend at it** — update `client-studentMangSys/.env`'s `VITE_API_URL` to the current EC2 public IP, then `npm run dev` in `client-studentMangSys` and exercise the UI against the live API.

---

## 12. Known Gaps / Follow-ups

- **EC2 public IP is not static.** There's no Elastic IP attached to `StudentMgmtEc2`, so every time CDK replaces the instance (e.g. an AMI update), the public IP changes and `client-studentMangSys/.env`'s `VITE_API_URL` goes stale. Adding an `ec2.CfnEIP` in `app-stack.ts` would fix this.
- **No frontend hosting stack exists yet.** The CDK app only provisions the API (`network-stack`, `database-stack`, `app-stack`); the React client currently only runs wherever you run `npm run dev`/`vite build` yourself. A future stack (S3 + CloudFront static hosting, or Amplify) would be needed to make the UI reachable by anyone other than someone running it locally.
- **IAM permissions are broad.** `azure-devops-cicd` currently has `AdministratorAccess` via the `kartikeye_dev` group. Scope this down to exactly what the CDK stacks provision once the pipeline is stable.
- **No manual approval gate before production deploys.** The `aws-production` environment has no required checks configured — merging to `main` deploys immediately. Worth adding an approval check if this ever becomes a shared/team project.
