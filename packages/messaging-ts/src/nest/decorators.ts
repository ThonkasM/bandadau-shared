import { SetMetadata } from '@nestjs/common';

import { CONSUME_MESSAGE_KEY } from './tokens';

export interface ConsumeMessageOptions {
  /** Queue owned by this service, e.g. `ticketing-service.commands`. */
  queue: string;
  /** CloudEvent type (= routing key), e.g. `bandada.ticketing.cmd.issue-ticket.v1`. */
  type: string;
}

/** Marks a provider method as the handler of one message type: `(event: CloudEvent<T>, ctx: MessageContext) => Promise<void>`. */
export const ConsumeMessage = (options: ConsumeMessageOptions) => SetMetadata(CONSUME_MESSAGE_KEY, options);
