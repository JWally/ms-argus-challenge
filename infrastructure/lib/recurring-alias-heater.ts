import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime, type IFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

interface RecurringAliasHeaterProps {
  ruleName: string;
  target: IFunction;
  invokesPerMinute: number;
  spacingSeconds: number;
  warmupPayload: Record<string, unknown>;
}

export function createRecurringAliasHeater(
  scope: Construct,
  id: string,
  props: RecurringAliasHeaterProps
): void {
  const logGroup = new LogGroup(scope, `${id}Logs`, {
    retention: RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  const heater = new Function(scope, `${id}Function`, {
    runtime: Runtime.NODEJS_22_X,
    architecture: Architecture.ARM_64,
    handler: 'index.handler',
    memorySize: 128,
    timeout: Duration.seconds(
      Math.max(10, props.spacingSeconds * Math.max(0, props.invokesPerMinute - 1) + 10)
    ),
    code: Code.fromInline(`
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const client = new LambdaClient({});
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

exports.handler = async () => {
  const invokes = Number(process.env.INVOKES_PER_MINUTE);
  const spacing = Number(process.env.SPACING_SECONDS) * 1000;
  const payload = Buffer.from(process.env.WARMUP_PAYLOAD);
  for (let index = 0; index < invokes; index += 1) {
    await client.send(new InvokeCommand({
      FunctionName: process.env.TARGET_ARN,
      InvocationType: "Event",
      Payload: payload,
    }));
    if (index < invokes - 1) await sleep(spacing);
  }
  return { invoked: invokes };
};
`),
    environment: {
      TARGET_ARN: props.target.functionArn,
      INVOKES_PER_MINUTE: String(props.invokesPerMinute),
      SPACING_SECONDS: String(props.spacingSeconds),
      WARMUP_PAYLOAD: JSON.stringify(props.warmupPayload),
    },
    logGroup,
  });
  props.target.grantInvoke(heater);
  heater.addToRolePolicy(
    new PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [props.target.functionArn],
    })
  );
  const rule = new Rule(scope, `${id}Rule`, {
    ruleName: props.ruleName,
    schedule: Schedule.rate(Duration.minutes(1)),
    description: `Warm ${props.target.functionName} ${props.invokesPerMinute}x/min`,
  });
  rule.addTarget(new LambdaFunction(heater));
}
