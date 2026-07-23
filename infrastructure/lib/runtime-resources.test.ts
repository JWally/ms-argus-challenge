import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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
});
