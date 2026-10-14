import { type DynamoDBDocumentClient, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';

export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

export const MAX_TRANSACT_ITEMS = 100;

/**
 * Collects the items of one `TransactWriteItems` call so the business effect, the outbox row and the
 * inbox marker commit atomically (idempotencia.md 3.3). Everything lives in the service table.
 */
export class DynamoTransaction {
  readonly items: TransactItem[] = [];

  constructor(readonly tableName: string) {}

  put(item: Record<string, unknown>, conditionExpression?: string, names?: Record<string, string>, values?: Record<string, unknown>): this {
    this.items.push({
      Put: { TableName: this.tableName, Item: item, ConditionExpression: conditionExpression, ExpressionAttributeNames: names, ExpressionAttributeValues: values },
    });
    return this;
  }

  update(input: { key: Record<string, unknown>; update: string; condition?: string; names?: Record<string, string>; values?: Record<string, unknown> }): this {
    this.items.push({
      Update: {
        TableName: this.tableName,
        Key: input.key,
        UpdateExpression: input.update,
        ConditionExpression: input.condition,
        ExpressionAttributeNames: input.names,
        ExpressionAttributeValues: input.values,
      },
    });
    return this;
  }

  delete(key: Record<string, unknown>, conditionExpression?: string): this {
    this.items.push({ Delete: { TableName: this.tableName, Key: key, ConditionExpression: conditionExpression } });
    return this;
  }

  conditionCheck(key: Record<string, unknown>, conditionExpression: string, names?: Record<string, string>, values?: Record<string, unknown>): this {
    this.items.push({
      ConditionCheck: { TableName: this.tableName, Key: key, ConditionExpression: conditionExpression, ExpressionAttributeNames: names, ExpressionAttributeValues: values },
    });
    return this;
  }
}

export function isConditionalCheckFailed(error: unknown): boolean {
  return (error as { name?: string })?.name === 'ConditionalCheckFailedException';
}

/** `CancellationReasons[index].Code` of a `TransactionCanceledException`, if any. */
export function cancellationCode(error: unknown, index: number): string | undefined {
  const e = error as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
  return e?.name === 'TransactionCanceledException' ? e.CancellationReasons?.[index]?.Code : undefined;
}

export async function commitTransaction(client: DynamoDBDocumentClient, items: TransactItem[]): Promise<void> {
  if (items.length === 0) return;
  if (items.length > MAX_TRANSACT_ITEMS) throw new RangeError(`TransactWriteItems supports at most ${MAX_TRANSACT_ITEMS} items (got ${items.length})`);
  await client.send(new TransactWriteCommand({ TransactItems: items }));
}

/** Plain unit of work for use cases that are not driven by a message (HTTP command + outbox). */
export class DynamoUnitOfWork {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async run<R>(work: (tx: DynamoTransaction) => Promise<R>): Promise<R> {
    const tx = new DynamoTransaction(this.tableName);
    const result = await work(tx);
    await commitTransaction(this.client, tx.items);
    return result;
  }
}
