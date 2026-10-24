require('dotenv').config();

const { DynamoDBClient, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand
} = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'multitenacytablebars';
const REGION = process.env.AWS_REGION || 'us-east-1';
const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = getNumericOption('--page-size', 100, 1, 1000);
const CONCURRENCY = getNumericOption('--concurrency', 5, 1, 20);
const MAX_RETRIES = 6;

const rawClient = new DynamoDBClient({ region: REGION });
const client = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: { removeUndefinedValues: true }
});

function getNumericOption(name, fallback, minimum, maximum) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  if (!argument) return fallback;
  const value = Number(argument.slice(name.length + 1));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function getProductId(item) {
  return item.id || item._id || item.sk?.replace(/^PRODUCT#/, '');
}

function getExpectedKeys(item) {
  const productId = getProductId(item);
  const productName = String(item.name || '').trim();
  if (!item.barId || !productId || !productName) {
    return null;
  }

  return {
    GSI5PK: `BAR#${item.barId}#PRODUCT`,
    GSI5SK: `${productName.toLowerCase()}#${productId}`
  };
}

function hasExpectedKeys(item, expectedKeys) {
  return Boolean(
    expectedKeys
    && item.GSI5PK === expectedKeys.GSI5PK
    && item.GSI5SK === expectedKeys.GSI5SK
  );
}

function isRetryable(error) {
  return [
    'ProvisionedThroughputExceededException',
    'ThrottlingException',
    'RequestLimitExceeded',
    'InternalServerError'
  ].includes(error?.name);
}

async function sendWithRetry(commandFactory) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await client.send(commandFactory());
    } catch (error) {
      if (!isRetryable(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const backoff = Math.min(1000 * (2 ** attempt), 30000);
      const jitter = Math.floor(Math.random() * 500);
      const delay = backoff + jitter;
      console.log(`Retrying after ${delay}ms because of ${error.name}...`);
      await sleep(delay);
    }
  }
}

async function assertGsi5Active() {
  const result = await rawClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
  const index = result.Table?.GlobalSecondaryIndexes?.find((candidate) => candidate.IndexName === 'GSI5');
  const keyNames = (index?.KeySchema || []).map((key) => key.AttributeName);

  if (
    index?.IndexStatus !== 'ACTIVE'
    || !keyNames.includes('GSI5PK')
    || !keyNames.includes('GSI5SK')
  ) {
    throw new Error('GSI5 must exist with GSI5PK/GSI5SK and be ACTIVE before applying the backfill.');
  }
}

async function updateProductGsi(item, expectedKeys) {
  return sendWithRetry(() => new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: item.pk,
      sk: item.sk
    },
    UpdateExpression: 'SET #gsiPk = :gsiPk, #gsiSk = :gsiSk',
    ConditionExpression: '#barId = :barId AND #name = :name',
    ExpressionAttributeNames: {
      '#gsiPk': 'GSI5PK',
      '#gsiSk': 'GSI5SK',
      '#barId': 'barId',
      '#name': 'name'
    },
    ExpressionAttributeValues: {
      ':gsiPk': expectedKeys.GSI5PK,
      ':gsiSk': expectedKeys.GSI5SK,
      ':barId': item.barId,
      ':name': item.name
    },
    ReturnValues: 'NONE'
  }));
}

async function updateWithConcurrency(items, updateItem) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await updateItem(item);
    }
  });

  await Promise.all(workers);
}

async function backfill() {
  if (APPLY) {
    await assertGsi5Active();
  }

  let lastEvaluatedKey;
  const failures = [];
  const counts = {
    scanned: 0,
    eligible: 0,
    alreadyIndexed: 0,
    updated: 0,
    skippedChanged: 0,
    invalid: 0,
    failed: 0
  };

  do {
    const result = await sendWithRetry(() => new QueryCommand({
      TableName: TABLE_NAME,
      Limit: PAGE_SIZE,
      KeyConditionExpression: '#pk = :productPk',
      ProjectionExpression: '#pk, #sk, #id, #legacyId, #barId, #name, #gsiPk, #gsiSk',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk',
        '#id': 'id',
        '#legacyId': '_id',
        '#barId': 'barId',
        '#name': 'name',
        '#gsiPk': 'GSI5PK',
        '#gsiSk': 'GSI5SK'
      },
      ExpressionAttributeValues: {
        ':productPk': 'PRODUCT'
      },
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {})
    }));

    const pendingUpdates = [];
    for (const item of result.Items || []) {
      counts.scanned += 1;
      const expectedKeys = getExpectedKeys(item);
      if (!expectedKeys) {
        counts.invalid += 1;
        continue;
      }

      counts.eligible += 1;
      if (hasExpectedKeys(item, expectedKeys)) {
        counts.alreadyIndexed += 1;
        continue;
      }

      pendingUpdates.push({ item, expectedKeys });
    }

    if (APPLY) {
      await updateWithConcurrency(pendingUpdates, async ({ item, expectedKeys }) => {
        try {
          await updateProductGsi(item, expectedKeys);
          counts.updated += 1;
        } catch (error) {
          if (error?.name === 'ConditionalCheckFailedException') {
            counts.skippedChanged += 1;
            return;
          }

          counts.failed += 1;
          failures.push({
            pk: item.pk,
            sk: item.sk,
            reason: error.message,
            errorName: error.name
          });
          console.error(`Failed to update ${item.pk}/${item.sk}: ${error.message}`);
        }
      });
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
    console.log(
      `Progress: scanned=${counts.scanned}, eligible=${counts.eligible}, `
      + `alreadyIndexed=${counts.alreadyIndexed}, updated=${counts.updated}, `
      + `skippedChanged=${counts.skippedChanged}, failed=${counts.failed}`
    );
  } while (lastEvaluatedKey);

  console.log('\nProduct GSI5 backfill summary');
  console.log(JSON.stringify({
    table: TABLE_NAME,
    region: REGION,
    mode: APPLY ? 'apply' : 'dry-run',
    pageSize: PAGE_SIZE,
    concurrency: CONCURRENCY,
    ...counts,
    failures
  }, null, 2));

  if (counts.failed > 0 || counts.invalid > 0) {
    process.exitCode = 1;
  }
}

backfill().catch((error) => {
  console.error('Product GSI5 backfill stopped:', error);
  process.exitCode = 1;
}).finally(() => {
  rawClient.destroy();
});
