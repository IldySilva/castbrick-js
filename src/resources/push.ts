import type { CastBrickClient } from "../client.js";
import type {
  IssuePushTokenRequest,
  IssuePushTokenResponse,
  PublishEventRequest,
  PublishEventResponse,
} from "../types.js";

export class PushResource {
  constructor(private readonly client: CastBrickClient) {}

  /** Issue a short-lived channel token for browser/mobile clients */
  issueToken(request: IssuePushTokenRequest): Promise<IssuePushTokenResponse> {
    return this.client.post<IssuePushTokenResponse>("/push/tokens", request);
  }

  /** Publish an event to a channel (server → subscribers) */
  publish(request: PublishEventRequest): Promise<PublishEventResponse> {
    return this.client.post<PublishEventResponse>("/push/publish", request);
  }
}
