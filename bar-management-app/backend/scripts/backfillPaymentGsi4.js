require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
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
const PAGE_SIZE = getNumericOption('--page-size', 100, 1, 1000);
const CONCURRENCY = getNumericOption('--concurrency', 5, 1, 20);
const MAX_RETRIES = 6;
const FAILURE_FILE = path.join(__dirname, 'payment-gsi4-backfill-failures.json');

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { marshallOptions: { removeUndefinedValues: true } }
);

function getNumericOption(name, fallback, minimum, maximum) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  if (!argument) return fallback;
  const value = Number(argument.slice(name.length + 1));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function getPaymentId(item) {
  return item.id || item._id || item.sk?.replace(/^CUSTOMERPAYMENTREQUEST#/, '');
}

function getPaymentStatus(item) {
  return String(item.status || 'pending').trim().toLowerCase() || 'pending';
}

function getExpectedKeys(item) {
  const paymentId = getPaymentId(item);
  if (!item.barId || !item.createdAt || !paymentId) {
    return null;
  }

  const status = getPaymentStatus(item);
  return {
    GSI4PK: `BAR#${item.barId}#PAYMENT#${status}`,
    GSI4SK: `${item.createdAt}#${paymentId}`,
    status
  };
}

function hasValidKeys(item, expectedKeys) {
  return Boolean(
    expectedKeys
    && item.GSI4PK === expectedKeys.GSI4PK
    && item.GSI4SK === expectedKeys.GSI4SK
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

async function updatePaymentGsi(item, expectedKeys) {
  const paymentId = getPaymentId(item);
  const statusCondition = item.status === undefined
    ? 'attribute_not_exists(#status)'
    : '#status = :status';

  return sendWithRetry(() => new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: item.pk,
      sk: item.sk
    },
    UpdateExpression: 'SET #gsiPk = :gsiPk, #gsiSk = :gsiSk',
    ConditionExpression: '#barId = :barId AND #createdAt = :createdAt AND #id = :id AND ' + statusCondition,
    ExpressionAttributeNames: {
      '#gsiPk': 'GSI4PK',
      '#gsiSk': 'GSI4SK',
      '#barId': 'barId',
      '#createdAt': 'createdAt',
      '#id': 'id',
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':gsiPk': expectedKeys.GSI4PK,
      ':gsiSk': expectedKeys.GSI4SK,
      ':barId': item.barId,
      ':createdAt': item.createdAt,
      ':id': paymentId,
      ...(item.status === undefined ? {} : { ':status': item.status })
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
  let lastEvaluatedKey;
  const failures = [];
  const countsByStatus = {};
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
      KeyConditionExpression: '#pk = :paymentPk',
      ProjectionExpression: '#pk, #sk, #id, #legacyId, #barId, #createdAt, #status, #gsiPk, #gsiSk',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk',
        '#id': 'id',
        '#legacyId': '_id',
        '#barId': 'barId',
        '#createdAt': 'createdAt',
        '#status': 'status',
        '#gsiPk': 'GSI4PK',
        '#gsiSk': 'GSI4SK'
      },
      ExpressionAttributeValues: {
        ':paymentPk': 'CUSTOMERPAYMENTREQUEST'
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
      countsByStatus[expectedKeys.status] = (countsByStatus[expectedKeys.status] || 0) + 1;
      if (hasValidKeys(item, expectedKeys)) {
        counts.alreadyIndexed += 1;
        continue;
      }

      pendingUpdates.push({ item, expectedKeys });
    }

    if (APPLY) {
      await updateWithConcurrency(pendingUpdates, async ({ item, expectedKeys }) => {
        try {
          await updatePaymentGsi(item, expectedKeys);
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
            id: getPaymentId(item),
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

  fs.writeFileSync(FAILURE_FILE, JSON.stringify(failures, null, 2));
  console.log('\nPayment GSI4 backfill summary');
  console.log(JSON.stringify({
    table: TABLE_NAME,
    region: REGION,
    mode: APPLY ? 'apply' : 'dry-run',
    pageSize: PAGE_SIZE,
    concurrency: CONCURRENCY,
    countsByStatus,
    ...counts,
    failureFile: FAILURE_FILE
  }, null, 2));

  if (counts.failed > 0) {
    process.exitCode = 1;
  }
}

backfill().catch((error) => {
  console.error('Payment GSI4 backfill stopped:', error);
  process.exitCode = 1;
});