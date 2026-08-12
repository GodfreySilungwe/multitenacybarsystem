const { DynamoDBClient, DescribeTableCommand, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { getTenantId, isGlobalAdmin } = require('./tenantContext');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'multitenacytablebars';
const region = process.env.AWS_REGION || 'us-east-1';
const TABLE_CREATION_WAIT_MS = 2000;
const TABLE_CREATION_MAX_ATTEMPTS = 20;

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);
let tableReadyPromise = null;

function generateId() {
  return crypto.randomUUID();
}

function normalizeRecord(record) {
  if (!record) return null;
  const normalized = { ...record };
  if (normalized.id && !normalized._id) normalized._id = normalized.id;
  if (normalized._id && !normalized.id) normalized.id = normalized._id;
  return normalized;
}

function serializeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, itemValue]) => {
      acc[key] = serializeValue(itemValue);
      return acc;
    }, {});
  }

  return value;
}

function toDynamoItem(entityType, data) {
  const now = new Date().toISOString();
  const entityName = String(entityType).toUpperCase();
  const normalizedData = serializeValue(data || {});
  const id = normalizedData?.id || normalizedData?._id || generateId();
  const tenantBarId = normalizedData?.barId || getTenantId();
  const record = {
    pk: entityName,
    sk: `${entityName}#${id}`,
    entityType: String(entityType).toLowerCase(),
    id,
    _id: id,
    createdAt: normalizedData?.createdAt || now,
    updatedAt: normalizedData?.updatedAt || now,
    ...normalizedData
  };

  if (entityType !== 'bar' && tenantBarId) {
    record.barId = tenantBarId;
  }

  if (record.id && !record._id) record._id = record.id;
  if (record._id && !record.id) record.id = record._id;

  delete record.pk;
  delete record.sk;
  delete record.entityType;

  return {
    pk: entityName,
    sk: `${entityName}#${id}`,
    entityType: String(entityType).toLowerCase(),
    id,
    _id: id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...record
  };
}

function fromDynamoItem(item) {
  if (!item) return null;
  const record = { ...item };
  delete record.pk;
  delete record.sk;
  return normalizeRecord(record);
}

function encodeLastEvaluatedKey(lastEvaluatedKey) {
  if (!lastEvaluatedKey) return null;
  try {
    return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');
  } catch (error) {
    return null;
  }
}

function decodeLastEvaluatedKey(token) {
  if (!token) return null;
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
  } catch (error) {
    return null;
  }
}

async function queryEntities(entityType, options = {}) {
  await ensureTableExists();
  const entityPartitionKey = String(entityType).toUpperCase();
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': entityPartitionKey
    }
  };

  if (options.limit && Number.isFinite(Number(options.limit))) {
    params.Limit = Number(options.limit);
  }

  if (options.lastEvaluatedKey) {
    params.ExclusiveStartKey = options.lastEvaluatedKey;
  }

  const filterExpressions = [];
  const values = params.ExpressionAttributeValues;

  if (options.barId !== undefined && options.barId !== null) {
    filterExpressions.push('barId = :barId');
    values[':barId'] = options.barId;
  }

  if (options.filters && typeof options.filters === 'object') {
    for (const [field, fieldValue] of Object.entries(options.filters)) {
      if (fieldValue === undefined || fieldValue === null) continue;
      const placeholder = `:${field}`;
      filterExpressions.push(`${field} = ${placeholder}`);
      values[placeholder] = fieldValue;
    }
  }

  if (options.startDate) {
    filterExpressions.push('createdAt >= :startDate');
    values[':startDate'] = options.startDate;
  }

  if (options.endDate) {
    filterExpressions.push('createdAt <= :endDate');
    values[':endDate'] = options.endDate;
  }

  if (options.includeReversed === false) {
    filterExpressions.push('(attribute_not_exists(reversed) OR reversed <> :reversed)');
    values[':reversed'] = true;
  }

  if (filterExpressions.length) {
    params.FilterExpression = filterExpressions.join(' AND ');
  }

  console.debug(`queryEntities(${entityType}):`, {
    barId: options.barId,
    limit: options.limit,
    startDate: options.startDate,
    endDate: options.endDate,
    includeReversed: options.includeReversed,
    filterExpressions,
    hasFilter: filterExpressions.length > 0
  });

  const result = await docClient.send(new QueryCommand(params));
  const items = (result.Items || []).map(fromDynamoItem);

  console.debug(`queryEntities(${entityType}) result:`, {
    itemsCount: items.length,
    scannedCount: result.ScannedCount,
    hasMoreData: Boolean(result.LastEvaluatedKey)
  });

  return {
    items,
    lastEvaluatedKey: result.LastEvaluatedKey ? encodeLastEvaluatedKey(result.LastEvaluatedKey) : null
  };
}

async function ensureTableExists() {
  if (tableReadyPromise) {
    return tableReadyPromise;
  }

  tableReadyPromise = (async () => {
    try {
      const result = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      if (result.Table?.TableStatus === 'ACTIVE') {
        return true;
      }
    } catch (error) {
      if (error?.name !== 'ResourceNotFoundException') {
        throw error;
      }

      console.log(`📦 Creating DynamoDB table ${TABLE_NAME}...`);
      try {
        await client.send(new CreateTableCommand({
          TableName: TABLE_NAME,
          AttributeDefinitions: [
            { AttributeName: 'pk', AttributeType: 'S' },
            { AttributeName: 'sk', AttributeType: 'S' }
          ],
          KeySchema: [
            { AttributeName: 'pk', KeyType: 'HASH' },
            { AttributeName: 'sk', KeyType: 'RANGE' }
          ],
          BillingMode: 'PAY_PER_REQUEST'
        }));
      } catch (createError) {
        if (createError?.name !== 'ResourceInUseException') {
          throw createError;
        }
      }
    }

    for (let attempt = 1; attempt <= TABLE_CREATION_MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
        if (result.Table?.TableStatus === 'ACTIVE') {
          return true;
        }
      } catch (error) {
        if (error?.name === 'ResourceNotFoundException') {
          // Table is still propagating; keep polling.
        } else {
          throw error;
        }
      }

      if (attempt === TABLE_CREATION_MAX_ATTEMPTS) {
        throw new Error(`DynamoDB table ${TABLE_NAME} did not become active in time`);
      }

      await new Promise((resolve) => setTimeout(resolve, TABLE_CREATION_WAIT_MS));
    }

    return false;
  })();

  return tableReadyPromise;
}

async function listEntities(entityType) {
  await ensureTableExists();
  const tenantBarId = getTenantId();
  const entityPartitionKey = String(entityType).toUpperCase();
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    ConsistentRead: true,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': entityPartitionKey
    }
  }));

  return (result.Items || [])
    .map(fromDynamoItem)
    .filter((record) => {
      if (!record || record.entityType !== String(entityType).toLowerCase()) {
        return false;
      }
      if (entityType === 'bar') {
        if (tenantBarId == null || isGlobalAdmin()) {
          return true;
        }
        return record._id === tenantBarId;
      }
      if (tenantBarId == null || isGlobalAdmin()) {
        return true;
      }
      return record.barId === tenantBarId;
    });
}

async function getEntity(entityType, id) {
  await ensureTableExists();
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: String(entityType).toUpperCase(),
      sk: `${String(entityType).toUpperCase()}#${id}`
    }
  }));

  const item = fromDynamoItem(result.Item);
  const tenantBarId = getTenantId();
  if (tenantBarId != null && !isGlobalAdmin() && item?.barId !== tenantBarId) {
    return null;
  }

  return item;
}

async function createEntity(entityType, data) {
  await ensureTableExists();
  const item = toDynamoItem(entityType, data);
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item
  }));
  return fromDynamoItem(item);
}

async function updateEntity(entityType, id, updates) {
  await ensureTableExists();
  const existing = await getEntity(entityType, id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
    id: existing.id,
    _id: existing._id,
    updatedAt: new Date().toISOString()
  };

  const item = toDynamoItem(entityType, updated);
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item
  }));

  return fromDynamoItem(item);
}

async function deleteEntity(entityType, id) {
  await ensureTableExists();
  const existing = await getEntity(entityType, id);
  if (!existing) return null;

  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: String(entityType).toUpperCase(),
      sk: `${String(entityType).toUpperCase()}#${id}`
    }
  }));

  return existing;
}

async function findByField(entityType, field, value) {
  const records = await listEntities(entityType);
  return records.find((record) => record[field] === value) || null;
}

module.exports = {
  TABLE_NAME,
  ensureTableExists,
  generateId,
  listEntities,
  queryEntities,
  decodeLastEvaluatedKey,
  getEntity,
  createEntity,
  updateEntity,
  deleteEntity,
  findByField,
  fromDynamoItem,
  toDynamoItem
};
