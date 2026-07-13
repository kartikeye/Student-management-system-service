#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { AuthStack } from '../lib/auth-stack';
import { AppStack } from '../lib/app-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const networkStack = new NetworkStack(app, 'NetworkStack', {
  env,
  stackName: 'student-mgmt-network',
  description: 'VPC and Security Groups',
});

const databaseStack = new DatabaseStack(app, 'DatabaseStack', {
  env,
  stackName: 'student-mgmt-database',
  description: 'RDS PostgreSQL',
  vpc: networkStack.vpc,
  rdsSg: networkStack.rdsSg,
});
databaseStack.addDependency(networkStack);

const authStack = new AuthStack(app, 'AuthStack', {
  env,
  stackName: 'student-mgmt-auth',
  description: 'Cognito User Pool for authentication and role groups',
});

const appStack = new AppStack(app, 'AppStack', {
  env,
  stackName: 'student-mgmt-app',
  description: 'EC2 + Docker + ECR + IAM',
  vpc: networkStack.vpc,
  ec2Sg: networkStack.ec2Sg,
  database: databaseStack.database,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
});
appStack.addDependency(databaseStack);
appStack.addDependency(authStack);
