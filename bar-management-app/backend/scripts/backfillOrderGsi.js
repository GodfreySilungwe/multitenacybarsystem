require('dotenv').config();

const {
  DynamoDBClient
} = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand
} = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'multitenacytablebars';
const REGION = process.env.AWS_REGION || 'us-east-1';
const APPLY = process.argv.includes('--apply');
const PAGE_LIMIT = 100;
const MAX_RETRIES = 5;
const FAILURE_FILE = path.join(__dirname, 'order-gsi-backfill-failures.json');

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { marshallOptions: { removeUndefinedValues: true } }
);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function getOrderId(item) {
  return item.id || item._id || item.sk?.replace(/^ORDER#/, '');
}

function getExpectedGsiKeys(item) {
  const orderId = getOrderId(item);
  if (!item.barId || !item.createdAt || !orderId) {
    return null;
  }

  return {
    GSI1PK: `BAR#${item.barId}#ORDER`,
    GSI1SK: `${item.createdAt}#${orderId}`
  };
}

function hasValidGsiKeys(item, expectedKeys) {
  return Boolean(
    expectedKeys &&
    item.GSI1PK === expectedKeys.GSI1PK &&
    item.GSI1SK === expectedKeys.GSI1SK
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

      const delay = Math.min(1000 * (2 ** attempt), 15000);
      console.log(`Retrying after ${delay}ms because of ${error.name}...`);
      await sleep(delay);
    }
  }
}

async function updateOrderGsi(item, expectedKeys) {
  return sendWithRetry(() => new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: item.pk,
      sk: item.sk
    },
    UpdateExpression: 'SET #gsiPk = :gsiPk, #gsiSk = :gsiSk',
    ExpressionAttributeNames: {
      '#pk': 'pk',
      '#sk': 'sk',
      '#gsiPk': 'GSI1PK',
      '#gsiSk': 'GSI1SK'
    },
    ExpressionAttributeValues: {
      ':pk': item.pk,
      ':sk': item.sk,
      ':gsiPk': expectedKeys.GSI1PK,
      ':gsiSk': expectedKeys.GSI1SK
    },
    ConditionExpression: '#pk = :pk AND #sk = :sk',
    ReturnValues: 'NONE'
  }));
}

async function scanOrders() {
  let lastEvaluatedKey;
  const counts = {
    scanned: 0,
    withGsi: 0,
    withoutGsi: 0,
    invalidData: 0,
    updated: 0,
    skipped: 0,
    failed: 0
  };
  const failures = [];

  do {
    const result = await sendWithRetry(() => new QueryCommand({
      TableName: TABLE_NAME,
      Limit: PAGE_LIMIT,
      KeyConditionExpression: '#pk = :orderPk',
      ProjectionExpression: '#pk, #sk, #entityType, #id, #legacyId, #barId, #createdAt, #gsiPk, #gsiSk',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk',
        '#entityType': 'entityType',
        '#id': 'id',
        '#legacyId': '_id',
        '#barId': 'barId',
        '#createdAt': 'createdAt',
        '#gsiPk': 'GSI1PK',
        '#gsiSk': 'GSI1SK'
      },
      ExpressionAttributeValues: {
        ':orderPk': 'ORDER'
      },
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {})
    }));

    for (const item of result.Items || []) {
      counts.scanned += 1;
      const expectedKeys = getExpectedGsiKeys(item);

      if (!expectedKeys) {
        counts.invalidData += 1;
        failures.push({
          pk: item.pk,
          sk: item.sk,
          reason: 'Missing barId, createdAt, or id/_id'
        });
        continue;
      }

      if (hasValidGsiKeys(item, expectedKeys)) {
        counts.withGsi += 1;
        continue;
      }

      counts.withoutGsi += 1;

      if (!APPLY) {
        continue;
      }

      try {
        await updateOrderGsi(item, expectedKeys);
        counts.updated += 1;
      } catch (error) {
        if (error?.name === 'ConditionalCheckFailedException') {
          counts.skipped += 1;
          continue;
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
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
    console.log(`Progress: scanned=${counts.scanned}, withGsi=${counts.withGsi}, withoutGsi=${counts.withoutGsi}, updated=${counts.updated}, failed=${counts.failed}`);
  } while (lastEvaluatedKey);

  fs.writeFileSync(FAILURE_FILE, JSON.stringify(failures, null, 2));

  console.log('\nMigration summary');
  console.log(JSON.stringify({
    table: TABLE_NAME,
    region: REGION,
    mode: APPLY ? 'apply' : 'dry-run',
    ...counts,
    failureFile: FAILURE_FILE
  }, null, 2));

  if (counts.failed > 0 || counts.invalidData > 0) {
    process.exitCode = 1;
  }
}

scanOrders().catch((error) => {
  console.error('Migration stopped:', error);
  process.exitCode = 1;
});
