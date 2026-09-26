const getComparableValue = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return value;
};

const matchesFieldCondition = (record, field, condition) => {
  const recordValue = record[field];

  if (condition instanceof Date) {
    const comparableRecord = getComparableValue(recordValue);
    return comparableRecord === condition.getTime();
  }

  if (Array.isArray(condition)) {
    return condition.includes(recordValue);
  }

  if (condition && typeof condition === 'object') {
    const operators = Object.entries(condition);
    if (operators.length === 0) return recordValue === condition;

    const comparableRecord = getComparableValue(recordValue);
    return operators.every(([operator, expected]) => {
      const comparableExpected = getComparableValue(expected);
      switch (operator) {
        case '$gte': return comparableRecord >= comparableExpected;
        case '$lte': return comparableRecord <= comparableExpected;
        case '$gt': return comparableRecord > comparableExpected;
        case '$lt': return comparableRecord < comparableExpected;
        case '$ne': return recordValue !== expected;
        case '$in': return Array.isArray(expected) && expected.includes(recordValue);
        case '$nin': return Array.isArray(expected) && !expected.includes(recordValue);
        default: return false;
      }
    });
  }

  return recordValue === condition;
};

module.exports = { matchesFieldCondition };