import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { deploymentConfig } from './deployment-config.js';
import { createChallengeRuntime } from './runtime-resources.js';

describe('WebSocket runtime infrastructure', () => {
  it('allows API Gateway to invoke the Lambda for every WebSocket route', () => {
    const app = new App();
    const stack = new Stack(app, 'WebSocketRuntimeTest', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    createChallengeRuntime(
      stack,
      deploymentConfig('dev-jw', { CDK_DEFAULT_ACCOUNT: '123456789012' })
    );

    const permissions = Template.fromStack(stack).findResources('AWS::Lambda::Permission');
    const webSocketPermissions = Object.values(permissions).filter((resource) =>
      JSON.stringify(resource.Properties?.FunctionName).includes('WebSocketFunction')
    );
    const sourceArns = webSocketPermissions.map((resource) =>
      JSON.stringify(resource.Properties?.SourceArn)
    );

    expect(webSocketPermissions).toHaveLength(3);
    expect(sourceArns.some((source) => source.includes('$connect'))).toBe(true);
    expect(sourceArns.some((source) => source.includes('$disconnect'))).toBe(true);
    expect(sourceArns.some((source) => source.includes('$default'))).toBe(true);
  }, 15_000);

  it('keeps the QR HTTP path warm through the same live alias used by API Gateway', () => {
    const app = new App();
    const stack = new Stack(app, 'HttpRuntimeTest', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    createChallengeRuntime(
      stack,
      deploymentConfig('dev-jw', { CDK_DEFAULT_ACCOUNT: '123456789012' })
    );
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 2048,
    });
    template.resourceCountIs('AWS::Lambda::Alias', 1);
    template.hasResourceProperties('AWS::Lambda::Alias', {
      Name: 'live',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 128,
      Environment: {
        Variables: Match.objectLike({
          INVOKES_PER_MINUTE: '6',
          SPACING_SECONDS: '10',
          WARMUP_PAYLOAD: '{"source":"argus.challenge.warmup"}',
        }),
      },
    });
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(1 minute)',
      State: 'ENABLED',
    });

    const aliases = template.findResources('AWS::Lambda::Alias');
    const [aliasLogicalId] = Object.keys(aliases);
    const integrations = template.findResources('AWS::ApiGatewayV2::Integration');
    expect(aliasLogicalId).toBeDefined();
    expect(JSON.stringify(integrations)).toContain(aliasLogicalId);
  }, 15_000);
});
