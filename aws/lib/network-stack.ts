import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly ec2Sg: ec2.SecurityGroup;
  public readonly rdsSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'StudentMgmtVpc', {
      maxAzs: 2,
      natGateways: 0, // no NAT gateway — keeps costs near zero
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.ec2Sg = new ec2.SecurityGroup(this, 'Ec2Sg', {
      vpc: this.vpc,
      description: 'EC2 - allow API and SSH inbound',
      allowAllOutbound: true,
    });
    this.ec2Sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000), 'API traffic');
    // SSH (port 22) intentionally not opened — use SSM Session Manager instead

    this.rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc: this.vpc,
      description: 'RDS - allow PostgreSQL from EC2 only',
      allowAllOutbound: false,
    });
    this.rdsSg.addIngressRule(this.ec2Sg, ec2.Port.tcp(5432), 'PostgreSQL from EC2');
  }
}
