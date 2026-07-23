#!/usr/bin/env npx tsx
import { App } from 'aws-cdk-lib';
import { ChallengeStack } from '../lib/challenge-stack.js';
import { deploymentConfig } from '../lib/deployment-config.js';

const app = new App();
const stage = String(app.node.tryGetContext('stage') ?? 'dev-jw');
const config = deploymentConfig(stage, process.env);

new ChallengeStack(app, `ms-argus-challenge-${stage}`, {
  env: { account: config.account, region: config.region },
  stackName: `ms-argus-challenge-${stage}`,
  config,
});
