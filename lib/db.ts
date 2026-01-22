import "server-only";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const DEFAULT_TABLE_PREFIX = "logisticZaxon";

let cachedClient: DynamoDBDocumentClient | null = null;

export function getDb(): DynamoDBDocumentClient {
  if (!cachedClient) {
    const baseClient = new DynamoDBClient({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    });
    cachedClient = DynamoDBDocumentClient.from(baseClient, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return cachedClient;
}

export function getTablePrefix(): string {
  return process.env.DDB_TABLE_PREFIX ?? DEFAULT_TABLE_PREFIX;
}

export function tableName(suffix: string): string {
  return `${getTablePrefix()}-${suffix}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export async function inTransaction<T>(
  _db: DynamoDBDocumentClient,
  fn: () => Promise<T> | T,
): Promise<T> {
  return await fn();
}

function isConditionalCheckFailed(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return name === "ConditionalCheckFailedException";
}

export async function nextId(
  entity: string,
  db: DynamoDBDocumentClient = getDb(),
): Promise<number> {
  const result = await db.send(
    new UpdateCommand({
      TableName: tableName("counters"),
      Key: { entity },
      UpdateExpression: "ADD #value :inc",
      ExpressionAttributeNames: { "#value": "value" },
      ExpressionAttributeValues: { ":inc": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  const value = result.Attributes?.value;
  if (typeof value !== "number") {
    throw new Error(`Failed to allocate id for ${entity}`);
  }
  return value;
}

export async function getItem<T>(
  table: string,
  key: Record<string, unknown>,
  db: DynamoDBDocumentClient = getDb(),
): Promise<T | null> {
  const result = await db.send(
    new GetCommand({
      TableName: table,
      Key: key,
    }),
  );
  return (result.Item as T | undefined) ?? null;
}

export async function putItem<T>(
  table: string,
  item: T,
  options?: {
    conditionExpression?: string;
    expressionNames?: Record<string, string>;
    expressionValues?: Record<string, unknown>;
  },
  db: DynamoDBDocumentClient = getDb(),
): Promise<boolean> {
  try {
    await db.send(
      new PutCommand({
        TableName: table,
        Item: item as Record<string, unknown>,
        ConditionExpression: options?.conditionExpression,
        ExpressionAttributeNames: options?.expressionNames,
        ExpressionAttributeValues: options?.expressionValues,
      }),
    );
    return true;
  } catch (error) {
    if (isConditionalCheckFailed(error)) return false;
    throw error;
  }
}

export async function deleteItem(
  table: string,
  key: Record<string, unknown>,
  db: DynamoDBDocumentClient = getDb(),
): Promise<void> {
  await db.send(
    new DeleteCommand({
      TableName: table,
      Key: key,
    }),
  );
}

export async function updateItem<T>(
  table: string,
  key: Record<string, unknown>,
  updateExpression: string,
  expressionValues: Record<string, unknown>,
  expressionNames?: Record<string, string>,
  db: DynamoDBDocumentClient = getDb(),
): Promise<T | null> {
  try {
    const result = await db.send(
      new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
        ExpressionAttributeNames: expressionNames,
        ReturnValues: "ALL_NEW",
      }),
    );
    return (result.Attributes as T | undefined) ?? null;
  } catch (error) {
    if (isConditionalCheckFailed(error)) return null;
    throw error;
  }
}

export async function scanAll<T>(
  table: string,
  input?: {
    filterExpression?: string;
    expressionNames?: Record<string, string>;
    expressionValues?: Record<string, unknown>;
    limit?: number;
  },
  db: DynamoDBDocumentClient = getDb(),
): Promise<T[]> {
  const items: T[] = [];
  let lastKey: Record<string, unknown> | undefined;
  const limit = input?.limit ?? 0;

  do {
    const result = await db.send(
      new ScanCommand({
        TableName: table,
        ExclusiveStartKey: lastKey,
        FilterExpression: input?.filterExpression,
        ExpressionAttributeNames: input?.expressionNames,
        ExpressionAttributeValues: input?.expressionValues,
      }),
    );

    if (result.Items?.length) {
      items.push(...(result.Items as T[]));
      if (limit > 0 && items.length >= limit) {
        return items.slice(0, limit);
      }
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}

export async function queryAll<T>(
  table: string,
  input: {
    keyConditionExpression: string;
    expressionValues: Record<string, unknown>;
    expressionNames?: Record<string, string>;
    indexName?: string;
    scanIndexForward?: boolean;
    limit?: number;
  },
  db: DynamoDBDocumentClient = getDb(),
): Promise<T[]> {
  const items: T[] = [];
  let lastKey: Record<string, unknown> | undefined;
  const limit = input.limit ?? 0;

  do {
    const result = await db.send(
      new QueryCommand({
        TableName: table,
        IndexName: input.indexName,
        KeyConditionExpression: input.keyConditionExpression,
        ExpressionAttributeValues: input.expressionValues,
        ExpressionAttributeNames: input.expressionNames,
        ExclusiveStartKey: lastKey,
        ScanIndexForward: input.scanIndexForward,
      }),
    );

    if (result.Items?.length) {
      items.push(...(result.Items as T[]));
      if (limit > 0 && items.length >= limit) {
        return items.slice(0, limit);
      }
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}
