import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ARecord, RecordTarget, type IHostedZone } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { BlockPublicAccess, Bucket, BucketEncryption, type IBucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, CacheControl, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

// Web Integrity fetches its signed worker bundle and executes the verified bytes
// from a blob URL so the worker inherits the merchant page's origin and cookies.
const WORKER_CONTENT_SECURITY_POLICY = "worker-src 'self' blob:";

function responseHeaders(scope: Construct) {
  const shared = {
    strictTransportSecurity: {
      accessControlMaxAge: Duration.days(365),
      includeSubdomains: true,
      preload: true,
      override: true,
    },
    contentTypeOptions: { override: true },
    referrerPolicy: {
      referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
      override: true,
    },
    contentSecurityPolicy: {
      contentSecurityPolicy: WORKER_CONTENT_SECURITY_POLICY,
      override: true,
    },
  };
  const site = new ResponseHeadersPolicy(scope, 'SiteHeaders', {
    securityHeadersBehavior: {
      ...shared,
      frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
    },
  });
  const embed = new ResponseHeadersPolicy(scope, 'EmbedHeaders', {
    securityHeadersBehavior: shared,
  });
  return { site, embed };
}

function deployAssets(scope: Construct, bucket: IBucket, distribution: Distribution): void {
  const repository = join(sourceDirectory, '../..');
  new BucketDeployment(scope, 'DeployShell', {
    sources: [
      Source.asset(join(repository, 'apps/web/dist'), { exclude: ['assets/*'] }),
      Source.asset(join(repository, 'apps/loader/dist')),
    ],
    destinationBucket: bucket,
    distribution,
    distributionPaths: ['/*'],
    prune: false,
    cacheControl: [CacheControl.fromString('public,max-age=0,must-revalidate')],
  });
  new BucketDeployment(scope, 'DeployAssets', {
    sources: [Source.asset(join(repository, 'apps/web/dist/assets'))],
    destinationBucket: bucket,
    destinationKeyPrefix: 'assets',
    distribution,
    distributionPaths: ['/assets/*'],
    prune: false,
    cacheControl: [CacheControl.fromString('public,max-age=31536000,immutable')],
  });
}

interface SiteInput {
  scope: Construct;
  zone: IHostedZone;
  domainName: string;
  apiDomainName: string;
}

function createDistribution(input: SiteInput, bucket: IBucket): Distribution {
  const certificate = new Certificate(input.scope, 'Certificate', {
    domainName: input.domainName,
    validation: CertificateValidation.fromDns(input.zone),
  });
  const headers = responseHeaders(input.scope);
  const origin = S3BucketOrigin.withOriginAccessControl(bucket);
  const router = new CloudFrontFunction(input.scope, 'SpaRouter', {
    code: FunctionCode.fromFile({ filePath: join(sourceDirectory, '../cloudfront/spa-router.js') }),
  });
  const distribution = new Distribution(input.scope, 'Distribution', {
    domainNames: [input.domainName],
    certificate,
    defaultRootObject: 'index.html',
    minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
    httpVersion: HttpVersion.HTTP2,
    priceClass: PriceClass.PRICE_CLASS_100,
    defaultBehavior: {
      origin,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      responseHeadersPolicy: headers.site,
      functionAssociations: [{ function: router, eventType: FunctionEventType.VIEWER_REQUEST }],
    },
    additionalBehaviors: {
      '/api/*': {
        origin: new HttpOrigin(input.apiDomainName),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: headers.site,
      },
      '/embed': {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        responseHeadersPolicy: headers.embed,
        functionAssociations: [{ function: router, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      '*.js': {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers.site,
      },
      '*.css': {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers.site,
      },
    },
  });
  return distribution;
}

export function createSite(input: SiteInput): Distribution {
  const bucket = new Bucket(input.scope, 'SiteBucket', {
    encryption: BucketEncryption.S3_MANAGED,
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    autoDeleteObjects: true,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  // CDK's concrete Bucket currently marks isWebsite optional while IBucket does not.
  const siteBucket = bucket as unknown as IBucket;
  const distribution = createDistribution(input, siteBucket);
  new ARecord(input.scope, 'DnsAlias', {
    zone: input.zone,
    recordName: input.domainName,
    target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
  });
  deployAssets(input.scope, siteBucket, distribution);
  return distribution;
}
