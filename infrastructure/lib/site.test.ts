import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { describe, expect, it } from 'vitest';
import { createSite } from './site.js';

describe('Challenge site security headers', () => {
  it('allows required same-origin and blob workers on site and embed routes', () => {
    const app = new App();
    const stack = new Stack(app, 'SiteHeadersTest', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const zone = HostedZone.fromHostedZoneAttributes(stack, 'HostedZone', {
      hostedZoneId: 'Z0123456789',
      zoneName: 'example.test',
    });
    createSite({
      scope: stack,
      zone,
      domainName: 'challenge.example.test',
      apiDomainName: 'api.example.test',
    });

    const policies = Template.fromStack(stack).findResources(
      'AWS::CloudFront::ResponseHeadersPolicy'
    );
    const sitePolicy = Object.entries(policies).find(([logicalId]) =>
      logicalId.startsWith('SiteHeaders')
    )?.[1];
    const embedPolicy = Object.entries(policies).find(([logicalId]) =>
      logicalId.startsWith('EmbedHeaders')
    )?.[1];
    for (const policy of [sitePolicy, embedPolicy]) {
      expect(policy).toMatchObject({
        Properties: {
          ResponseHeadersPolicyConfig: {
            SecurityHeadersConfig: {
              ContentSecurityPolicy: {
                ContentSecurityPolicy: "worker-src 'self' blob:",
                Override: true,
              },
            },
          },
        },
      });
    }
  }, 15_000);
});
