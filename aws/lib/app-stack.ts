import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import * as path from 'path';

interface AppStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ec2Sg: ec2.SecurityGroup;
  database: rds.DatabaseInstance;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // CDK builds the Docker image from the Dockerfile and pushes it to ECR automatically
    const dockerImage = new ecr_assets.DockerImageAsset(this, 'ApiImage', {
      directory: path.join(__dirname, '../../api-studentMangSys'),
    });

    const ec2Role = new iam.Role(this, 'Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // Enables Session Manager — open a browser shell without SSH keys
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    dockerImage.repository.grantPull(ec2Role);
    props.database.secret!.grantRead(ec2Role);

    const ecrRegistry = `${this.account}.dkr.ecr.${this.region}.amazonaws.com`;

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      // Install Docker (Amazon Linux 2023 uses dnf)
      'dnf update -y',
      'dnf install -y docker',
      'systemctl start docker',
      'systemctl enable docker',

      // Authenticate with ECR
      `aws ecr get-login-password --region ${this.region} | docker login --username AWS --password-stdin ${ecrRegistry}`,

      // Fetch DB credentials from Secrets Manager and build DATABASE_URL
      // Password is URL-encoded so special chars (^, =, @, etc.) don't break URL parsing in pg.Pool
      `SECRET=$(aws secretsmanager get-secret-value --secret-id ${props.database.secret!.secretArn} --query SecretString --output text --region ${this.region})`,
      `DB_HOST=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['host'])")`,
      `DB_USER=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")`,
      `DB_PASS=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")`,
      `DB_NAME=$(echo $SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['dbname'])")`,
      `DB_PASS_ENCODED=$(echo "$DB_PASS" | python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.readline().rstrip('\\n'), safe=''))")`,
      `DATABASE_URL="postgresql://$DB_USER:$DB_PASS_ENCODED@$DB_HOST:5432/$DB_NAME"`,

      // Pull and run the containerised API
      `docker pull ${dockerImage.imageUri}`,
      `docker run -d --name student-mgmt-api --restart unless-stopped -p 3000:3000 -e DATABASE_URL="$DATABASE_URL" -e NODE_ENV=production -e PORT=3000 ${dockerImage.imageUri}`,
    );

    const instance = new ec2.Instance(this, 'StudentMgmtEc2', {
      vpc: props.vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({ cachedInContext: true }),
      securityGroup: props.ec2Sg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      role: ec2Role,
      userData,
      associatePublicIpAddress: true,
    });

    // Ensure RDS is ready before EC2 boots and runs migrations
    instance.node.addDependency(props.database);

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: `http://${instance.instancePublicIp}:3000`,
      description: 'Student Management API endpoint',
    });

    new cdk.CfnOutput(this, 'EC2PublicIp', {
      value: instance.instancePublicIp,
      description: 'SSH: ssh ec2-user@<ip>',
    });

    new cdk.CfnOutput(this, 'DockerImageUri', {
      value: dockerImage.imageUri,
      description: 'ECR image URI pushed by CDK',
    });
  }
}
