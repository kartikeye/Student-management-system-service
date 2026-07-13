import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

// Runs after a self-registered user confirms their email. Cognito has no
// concept of a "default group" for self sign-up, so every new user is
// dropped into the "student" group here. Admins are provisioned out of
// band (see AWS_Archetect.md) and are never touched by this trigger.
const POST_CONFIRMATION_SOURCE = `
const { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } = require('@aws-sdk/client-cognito-identity-provider');

const client = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
    return event;
  }

  try {
    await client.send(new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: 'student',
    }));
  } catch (err) {
    console.error('Failed to add user to student group', err);
  }

  return event;
};
`;

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'StudentMgmtUserPool', {
      userPoolName: 'student-mgmt-user-pool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        givenName: { required: false, mutable: true },
        familyName: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Public client used by the React SPA — no secret, SRP auth only
    // (matches amazon-cognito-identity-js, which never handles raw passwords over the wire).
    this.userPoolClient = new cognito.UserPoolClient(this, 'StudentMgmtUserPoolClient', {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admin',
      description: 'Full access, including deleting student records',
      precedence: 0,
    });

    new cognito.CfnUserPoolGroup(this, 'StudentGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'student',
      description: 'Default group assigned to self-registered users',
      precedence: 10,
    });

    const postConfirmationFn = new lambda.Function(this, 'PostConfirmationFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(POST_CONFIRMATION_SOURCE),
      timeout: cdk.Duration.seconds(10),
    });

    // Scoped to userpool/* (not this.userPool.userPoolArn) — referencing the pool's own
    // token here would make this policy depend on the pool, while addTrigger() below makes
    // the pool depend on this function, forming a circular CloudFormation dependency.
    postConfirmationFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminAddUserToGroup'],
      resources: [cdk.Arn.format({ service: 'cognito-idp', resource: 'userpool', resourceName: '*' }, this)],
    }));

    this.userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationFn);

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID (public SPA client)',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS region the User Pool lives in',
    });
  }
}
