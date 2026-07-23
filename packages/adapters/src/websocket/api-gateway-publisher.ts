import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { WebSocketEvent } from '@argus-challenge/core';

interface ManagementClient {
  send(command: PostToConnectionCommand): Promise<unknown>;
}

type ClientFactory = (endpoint: string) => ManagementClient;

const awsClient: ClientFactory = (endpoint) => new ApiGatewayManagementApiClient({ endpoint });

async function publish(
  client: ManagementClient,
  connectionId: string,
  data: unknown
): Promise<void> {
  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(data),
      })
    );
  } catch (error) {
    if (!(error instanceof GoneException)) throw error;
  }
}

export function createApiGatewayPublisher(createClient: ClientFactory = awsClient) {
  return {
    fromEvent(event: WebSocketEvent, connectionId: string, data: unknown) {
      const endpoint = `https://${event.requestContext.domainName}/` + event.requestContext.stage;
      return publish(createClient(endpoint), connectionId, data);
    },

    atEndpoint(endpoint: string, connectionId: string, data: unknown) {
      return publish(createClient(endpoint), connectionId, data);
    },
  };
}
