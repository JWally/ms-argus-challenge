import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';
import type { ChallengeDeploymentConfig } from './deployment-config.js';
import { createChallengeRuntime } from './runtime-resources.js';
import { createSite } from './site.js';

interface ChallengeStackProps extends StackProps {
  config: ChallengeDeploymentConfig;
}

function monitor(scope: Construct, runtime: ReturnType<typeof createChallengeRuntime>): void {
  new Alarm(scope, 'HttpErrors', {
    metric: runtime.http.handler.metricErrors({ period: Duration.minutes(5) }),
    threshold: 3,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  });
  new Alarm(scope, 'WebSocketErrors', {
    metric: runtime.webSocket.handler.metricErrors({ period: Duration.minutes(5) }),
    threshold: 3,
    evaluationPeriods: 1,
  });
}

export class ChallengeStack extends Stack {
  constructor(scope: Construct, id: string, props: ChallengeStackProps) {
    super(scope, id, props);
    const runtime = createChallengeRuntime(this, props.config);
    const zone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.config.hostedZoneId,
      zoneName: props.config.rootDomain,
    });
    const apiDomain = `${runtime.http.api.apiId}.execute-api.${this.region}.amazonaws.com`;
    const distribution = createSite({
      scope: this,
      zone,
      domainName: props.config.domainName,
      apiDomainName: apiDomain,
    });
    monitor(this, runtime);
    new CfnOutput(this, 'SiteUrl', { value: props.config.publicOrigin });
    new CfnOutput(this, 'HttpApiUrl', { value: runtime.http.api.apiEndpoint });
    new CfnOutput(this, 'WebSocketUrl', { value: runtime.webSocket.url });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
