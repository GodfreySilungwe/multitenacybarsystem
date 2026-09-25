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
const PAGE_SIZE = getNumericOption('--page-size', 100, 1, 1000);
const CONCURRENCY = getNumericOption('--concurrency', 5, 1, 20);
const MAX_RETRIES = 6;
const FAILURE_FILE = path.join(__dirname, 'credit-order-gsi2-backfill-failures.json');

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

function getOrderId(item) {
  return item.id || item._id || item.sk?.replace(/^ORDER#/, '');
}

function getCustomerId(item) {
  if (item.customer && typeof item.customer === 'object') {
    return item.customer._id || item.customer.id || item.customer.customerId || null;
  }
  return item.customer || item.customerId || null;
}

function getExpectedKeys(item) {
  const orderId = getOrderId(item);
  const customerId = getCustomerId(item);
  const recordedBalance = Number(item.balanceDue);
  const fallbackBalance = Number(item.totalAmount || 0) - Number(item.amountPaid || 0);
  const balanceDue = Number.isFinite(recordedBalance) ? recordedBalance : fallbackBalance;

  if (
    !item.barId
    || !item.createdAt
    || !orderId
    || !customerId
    || item.paymentMethod !== 'credit'
    || item.reversed === true
    || !Number.isFinite(balanceDue)
    || balanceDue <= 0
  ) {
    return null;
  }

  return {
    GSI2PK: `BAR#${item.barId}#CUSTOMER#${customerId}#CREDIT`,
    GSI2SK: `${item.createdAt}#${orderId}`
  };
}

function hasValidKeys(item, expectedKeys) {
  return Boolean(
    expectedKeys
    && item.GSI2PK === expectedKeys.GSI2PK
    && item.GSI2SK === expectedKeys.GSI2SK
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

async function updateCreditOrderGsi(item, expectedKeys) {
  const customerId = getCustomerId(item);
  const recordedBalance = Number(item.balanceDue);
  const fallbackBalance = Number(item.totalAmount || 0) - Number(item.amountPaid || 0);
  const balanceDue = Number.isFinite(recordedBalance) ? recordedBalance : fallbackBalance;

  return sendWithRetry(() => new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: item.pk,
      sk: item.sk
    },
    UpdateExpression: 'SET #gsiPk = :gsiPk, #gsiSk = :gsiSk',
    ExpressionAttributeNames: {
      '#gsiPk': 'GSI2PK',
      '#gsiSk': 'GSI2SK',
      '#barId': 'barId',
      '#customer': 'customer',
      '#createdAt': 'createdAt',
      '#paymentMethod': 'paymentMethod',
      '#balanceDue': 'balanceDue',
      '#reversed': 'reversed',
      '#totalAmount': 'totalAmount',
      '#amountPaid': 'amountPaid'
    },
    ConditionExpression: '#barId = :barId'
      + ' AND #customer = :customer'
      + ' AND #createdAt = :createdAt'
      + ' AND #paymentMethod = :paymentMethod'
      + ' AND ((attribute_not_exists(#balanceDue) AND #totalAmount > #amountPaid)'
      + ' OR (#balanceDue = :balanceDue AND #balanceDue > :zero))'
      + ' AND (attribute_not_exists(#reversed) OR #reversed <> :true)',
    ExpressionAttributeValues: {
      ':gsiPk': expectedKeys.GSI2PK,
      ':gsiSk': expectedKeys.GSI2SK,
      ':barId': item.barId,
      ':customer': customerId,
      ':createdAt': item.createdAt,
      ':paymentMethod': 'credit',
      ':balanceDue': balanceDue,
      ':zero': 0,
      ':true': true
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
  const counts = {
    scanned: 0,
    eligible: 0,
    alreadyIndexed: 0,
    updated: 0,
    skippedChanged: 0,
    invalidOrIneligible: 0,
    failed: 0
  };

  do {
    const result = await sendWithRetry(() => new QueryCommand({
      TableName: TABLE_NAME,
      Limit: PAGE_SIZE,
      KeyConditionExpression: '#pk = :orderPk',
      ProjectionExpression: '#pk, #sk, #id, #legacyId, #barId, #customer, #createdAt, #paymentMethod, #balanceDue, #totalAmount, #amountPaid, #reversed, #gsiPk, #gsiSk',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk',
        '#id': 'id',
        '#legacyId': '_id',
        '#barId': 'barId',
        '#customer': 'customer',
        '#createdAt': 'createdAt',
        '#paymentMethod': 'paymentMethod',
        '#balanceDue': 'balanceDue',
        '#totalAmount': 'totalAmount',
        '#amountPaid': 'amountPaid',
        '#reversed': 'reversed',
        '#gsiPk': 'GSI2PK',
        '#gsiSk': 'GSI2SK'
      },
      ExpressionAttributeValues: {
        ':orderPk': 'ORDER'
      },
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {})
    }));

    const pendingUpdates = [];

    for (const item of result.Items || []) {
      counts.scanned += 1;
      const expectedKeys = getExpectedKeys(item);

      if (!expectedKeys) {
        counts.invalidOrIneligible += 1;
        continue;
      }

      counts.eligible += 1;
      if (hasValidKeys(item, expectedKeys)) {
        counts.alreadyIndexed += 1;
        continue;
      }

      pendingUpdates.push({ item, expectedKeys });
    }

    if (APPLY) {
      await updateWithConcurrency(pendingUpdates, async ({ item, expectedKeys }) => {
        try {
          await updateCreditOrderGsi(item, expectedKeys);
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
            id: getOrderId(item),
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

  console.log('\nCredit GSI2 backfill summary');
  console.log(JSON.stringify({
    table: TABLE_NAME,
    region: REGION,
    mode: APPLY ? 'apply' : 'dry-run',
    pageSize: PAGE_SIZE,
    concurrency: CONCURRENCY,
    ...counts,
    failureFile: FAILURE_FILE
  }, null, 2));

  if (counts.failed > 0) {
    process.exitCode = 1;
  }
}

backfill().catch((error) => {
  console.error('Credit GSI2 backfill stopped:', error);
  process.exitCode = 1;
});
