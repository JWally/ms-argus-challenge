import { execFileSync, spawnSync } from 'node:child_process';

const pairStack = process.env.CHALLENGE_CONFIG_SOURCE_STACK ?? 'ms-argus-pair-dev-jw';
const requiredKeys = ['MERCHANT_API_URL', 'MERCHANT_API_CREDENTIAL', 'MERCHANT_CPI'];
const optionalKeys = ['SSO_CALLBACK_ORIGINS', 'OAUTH_GOOGLE_CLIENT_ID'];

function awsJson(arguments_) {
  const output = execFileSync('aws', [...arguments_, '--no-cli-pager', '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function hasRequired(environment) {
  return requiredKeys.every((key) => Boolean(environment[key]));
}

function deployedPairConfiguration() {
  const stack = awsJson(['cloudformation', 'list-stack-resources', '--stack-name', pairStack]);
  const functions = (stack.StackResourceSummaries ?? []).filter(
    (resource) => resource.ResourceType === 'AWS::Lambda::Function'
  );
  for (const resource of functions) {
    const configuration = awsJson([
      'lambda',
      'get-function-configuration',
      '--function-name',
      resource.PhysicalResourceId,
    ]);
    const variables = configuration.Environment?.Variables ?? {};
    if (hasRequired(variables)) {
      return { variables, logicalId: resource.LogicalResourceId };
    }
  }
  throw new Error(`No Lambda in ${pairStack} contains the current merchant configuration`);
}

function deployEnvironment() {
  if (hasRequired(process.env)) {
    return { ...process.env, CDK_DEPLOYING: '1' };
  }
  const source = deployedPairConfiguration();
  console.log(`Using current merchant and SSO settings from ${pairStack}/${source.logicalId}.`);
  const selected = Object.fromEntries(
    [...requiredKeys, ...optionalKeys]
      .filter((key) => source.variables[key])
      .map((key) => [key, source.variables[key]])
  );
  return { ...process.env, ...selected, CDK_DEPLOYING: '1' };
}

function run(command, arguments_, environment) {
  const result = spawnSync(command, arguments_, { env: environment, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const environment = deployEnvironment();
const publicOrigin = 'https://challenge-dev-jw.argus.pw';
run('npm', ['run', 'build:web'], {
  ...environment,
  VITE_MERCHANT_CPI: environment.MERCHANT_CPI,
});
run('npm', ['run', 'build:loader'], {
  ...environment,
  CHALLENGE_EMBED_ORIGIN: publicOrigin,
});
run('npm', ['--workspace', '@argus-challenge/infrastructure', 'run', 'deploy:dev'], environment);

const deployed = awsJson([
  'cloudformation',
  'describe-stacks',
  '--stack-name',
  'ms-argus-challenge-dev-jw',
]);
const outputs = Object.fromEntries(
  (deployed.Stacks?.[0]?.Outputs ?? []).map(({ OutputKey, OutputValue }) => [
    OutputKey,
    OutputValue,
  ])
);
if (!outputs.SiteUrl || !outputs.WebSocketUrl) {
  throw new Error('Challenge deployment did not publish its live endpoints');
}
run('npm', ['run', 'test:e2e'], {
  ...environment,
  CHALLENGE_BASE_URL: outputs.SiteUrl,
  CHALLENGE_WS_URL: outputs.WebSocketUrl,
  CHALLENGE_CPI: environment.MERCHANT_CPI,
});
run('npm', ['run', 'test:browser', '--', '--project=chromium'], {
  ...environment,
  CHALLENGE_E2E_ORIGIN: outputs.SiteUrl,
  CHALLENGE_CPI: environment.MERCHANT_CPI,
  CHALLENGE_LIVE: '1',
});
