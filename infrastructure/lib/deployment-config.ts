export interface ChallengeDeploymentConfig {
  account: string;
  region: string;
  stage: 'dev-jw';
  rootDomain: string;
  hostedZoneId: string;
  domainName: string;
  publicOrigin: string;
  merchantApiUrl: string;
  merchantApiCredential: string;
  merchantCpi: string;
  ssoCallbackOrigins: string[];
  googleClientId: string;
}

const SYNTHETIC_CREDENTIAL = 'synth.synth-placeholder';

function list(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

export function deploymentConfig(
  stage: string,
  environment: Record<string, string | undefined>
): ChallengeDeploymentConfig {
  if (stage !== 'dev-jw') throw new Error(`unsupported_stage:${stage}`);
  if (
    environment.CDK_DEPLOYING === '1' &&
    (!environment.MERCHANT_API_URL ||
      !environment.MERCHANT_API_CREDENTIAL ||
      !environment.MERCHANT_CPI)
  ) {
    throw new Error('deploy_requires_live_merchant_configuration');
  }
  const rootDomain = 'argus.pw';
  const domainName = `challenge-${stage}.${rootDomain}`;
  return {
    account: environment.CDK_DEFAULT_ACCOUNT ?? environment.AWS_ACCOUNT_ID ?? '263318538229',
    region: 'us-east-1',
    stage,
    rootDomain,
    hostedZoneId: 'Z0810341271UXTLGDMLC6',
    domainName,
    publicOrigin: `https://${domainName}`,
    merchantApiUrl: environment.MERCHANT_API_URL ?? 'https://merchant-dev-jw.argus.pw',
    merchantApiCredential: environment.MERCHANT_API_CREDENTIAL ?? SYNTHETIC_CREDENTIAL,
    merchantCpi: environment.MERCHANT_CPI ?? 'argus_cpi_test_UEeqk7Bk7uetxKKDxNmIdB',
    ssoCallbackOrigins: list(environment.SSO_CALLBACK_ORIGINS),
    googleClientId: environment.OAUTH_GOOGLE_CLIENT_ID ?? '',
  };
}
