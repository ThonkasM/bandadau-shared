export const EXCHANGES = {
  events: 'bandada.events',
  commands: 'bandada.commands',
  dlx: 'bandada.dlx',
} as const;

export interface RetryDelay {
  /** Queue suffix: `<queue>.retry.<suffix>` */
  suffix: string;
  ttlMs: number;
}

/** eventos-y-mensajeria.md section 2.3: 5 s, 30 s, 5 min. */
export const DEFAULT_RETRY_DELAYS: readonly RetryDelay[] = [
  { suffix: '5s', ttlMs: 5_000 },
  { suffix: '30s', ttlMs: 30_000 },
  { suffix: '5m', ttlMs: 300_000 },
];

export const retryQueueName = (queue: string, delay: RetryDelay): string => `${queue}.retry.${delay.suffix}`;
export const dlqName = (queue: string): string => `${queue}.dlq`;

export interface TopologySpec {
  exchanges?: readonly string[];
  queues?: readonly string[];
}

/** Everything a consumer of `queue` expects to exist (created by bandadau-infra definitions.json in phase 1). */
export function consumerTopology(queue: string, retryDelays: readonly RetryDelay[] = DEFAULT_RETRY_DELAYS): Required<TopologySpec> {
  return {
    exchanges: [EXCHANGES.events, EXCHANGES.commands, EXCHANGES.dlx],
    queues: [queue, ...retryDelays.map((d) => retryQueueName(queue, d)), dlqName(queue)],
  };
}

export const publisherTopology: Required<TopologySpec> = {
  exchanges: [EXCHANGES.events, EXCHANGES.commands],
  queues: [],
};
