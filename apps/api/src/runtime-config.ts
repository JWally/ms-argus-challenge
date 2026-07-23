export interface RuntimeConfig {
  tableName: string;
  publicOrigin: string;
  webSocketUrl: string;
  webSocketManagementEndpoint: string;
  webSocketSecretArn: string;
  deviceTrustSecretArn: string;
  verdictSecretArn: string;
  merchantApiUrl: string;
  merchantApiCredential: string;
  merchantCpi: string;
  allowedOrigins: string[];
  ssoCallbackOrigins: string[];
  googleClientId: string;
  proofRequiredByDefault: boolean;
  allowTestAuthenticators: boolean;
  sessionTtlSeconds: number;
}

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

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

export function readRuntimeConfig(
  environment: Record<string, string | undefined> = process.env
): RuntimeConfig {
  const publicOrigin = required(environment, 'PUBLIC_ORIGIN');
  const allowedOrigins = list(environment.ALLOWED_ORIGINS);
  if (!allowedOrigins.includes(publicOrigin)) allowedOrigins.unshift(publicOrigin);
  return {
    tableName: required(environment, 'TABLE_NAME'),
    publicOrigin,
    webSocketUrl: required(environment, 'WS_API_URL'),
    webSocketManagementEndpoint: required(environment, 'WS_MGMT_ENDPOINT'),
    webSocketSecretArn: required(environment, 'WS_SECRET_ARN'),
    deviceTrustSecretArn: required(environment, 'DEVICE_TRUST_SECRET_ARN'),
    verdictSecretArn: required(environment, 'VERDICT_SECRET_ARN'),
    merchantApiUrl: required(environment, 'MERCHANT_API_URL'),
    merchantApiCredential: required(environment, 'MERCHANT_API_CREDENTIAL'),
    merchantCpi: required(environment, 'MERCHANT_CPI'),
    allowedOrigins,
    ssoCallbackOrigins: list(environment.SSO_CALLBACK_ORIGINS),
    googleClientId: environment.OAUTH_GOOGLE_CLIENT_ID ?? '',
    proofRequiredByDefault: environment.REQUIRE_PROOF_OF_LIFE === 'true',
    allowTestAuthenticators: environment.ALLOW_TEST_AUTHENTICATORS === 'true',
    sessionTtlSeconds: 300,
  };
}
