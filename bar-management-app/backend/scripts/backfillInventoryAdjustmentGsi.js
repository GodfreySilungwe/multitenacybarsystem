require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'multitenacytablebars';
const REGION = process.env.AWS_REGION || 'us-east-1';
const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = getNumericOption('--page-size', 100, 1, 1000);
const FAILURE_FILE = path.join(__dirname, 'inventory-adjustment-gsi-backfill-failures.json');
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function getNumericOption(name, fallback, minimum, maximum) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  if (!argument) return fallback;
  const value = Number(argument.slice(name.length + 1));
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), minimum), maximum) : fallback;
}

const getExpectedKeys = (item) => {
  const id = item.id || item._id || item.sk?.replace(/^INVENTORYADJUSTMENT#/, '');
  if (!item.barId || !item.createdAt || !id) return null;
  return {
    GSI1PK: `BAR#${item.barId}#INVENTORY-ADJUSTMENT`,
    GSI1SK: `${item.createdAt}#${id}`,
    id
  };
};

const hasExpectedKeys = (item, expected) => (
  Boolean(expected && item.GSI1PK === expected.GSI1PK && item.GSI1SK === expected.GSI1SK)
);

const backfill = async () => {
  let lastEvaluatedKey;
  const failures = [];
  const counts = { scanned: 0, alreadyIndexed: 0, missing: 0, updated: 0, invalid: 0, failed: 0 };

  do {
    const result = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      Limit: PAGE_SIZE,
      KeyConditionExpression: '#pk = :pk',
      ProjectionExpression: '#pk, #sk, #id, #legacyId, #barId, #createdAt, #gsiPk, #gsiSk',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk',
        '#id': 'id',
        '#legacyId': '_id',
        '#barId': 'barId',
        '#createdAt': 'createdAt',
        '#gsiPk': 'GSI1PK',
        '#gsiSk': 'GSI1SK'
      },
      ExpressionAttributeValues: { ':pk': 'INVENTORYADJUSTMENT' },
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {})
    }));

    for (const item of result.Items || []) {
      counts.scanned += 1;
      const expected = getExpectedKeys(item);
      if (!expected) {
        counts.invalid += 1;
        failures.push({ pk: item.pk, sk: item.sk, reason: 'Missing barId, createdAt, or id/_id' });
        continue;
      }
      if (hasExpectedKeys(item, expected)) {
        counts.alreadyIndexed += 1;
        continue;
      }

      counts.missing += 1;
      if (!APPLY) continue;

      try {
        const idField = item.id ? '#id' : '#legacyId';
        await client.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { pk: item.pk, sk: item.sk },
          UpdateExpression: 'SET #gsiPk = :gsiPk, #gsiSk = :gsiSk',
          ConditionExpression: `#barId = :barId AND #createdAt = :createdAt AND ${idField} = :id`,
          ExpressionAttributeNames: {
            '#gsiPk': 'GSI1PK',
            '#gsiSk': 'GSI1SK',
            '#barId': 'barId',
            '#createdAt': 'createdAt',
            [idField]: item.id ? 'id' : '_id'
          },
          ExpressionAttributeValues: {
            ':gsiPk': expected.GSI1PK,
            ':gsiSk': expected.GSI1SK,
            ':barId': item.barId,
            ':createdAt': item.createdAt,
            ':id': expected.id
          }
        }));
        counts.updated += 1;
      } catch (error) {
        counts.failed += 1;
        failures.push({ pk: item.pk, sk: item.sk, reason: error.message, errorName: error.name });
        console.error(`Failed to update ${item.pk}/${item.sk}: ${error.message}`);
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
    console.log(`Progress: scanned=${counts.scanned}, alreadyIndexed=${counts.alreadyIndexed}, missing=${counts.missing}, updated=${counts.updated}, failed=${counts.failed}`);
  } while (lastEvaluatedKey);

  fs.writeFileSync(FAILURE_FILE, JSON.stringify(failures, null, 2));
  console.log(JSON.stringify({ table: TABLE_NAME, region: REGION, mode: APPLY ? 'apply' : 'dry-run', ...counts, failureFile: FAILURE_FILE }, null, 2));
  if (counts.failed || counts.invalid) process.exitCode = 1;
};

backfill().catch((error) => {
  console.error('Inventory adjustment GSI backfill stopped:', error);
  process.exitCode = 1;
});