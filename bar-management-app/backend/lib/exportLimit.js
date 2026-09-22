const EXPORT_LIMITS = {
  sales: 5000,
  'sales-pdf': 5000,
  inventory: 10000,
  customers: 10000
};

const getExportLimit = (type) => EXPORT_LIMITS[type] || 5000;

const applyExportLimit = (rows = [], type) => {
  const limit = getExportLimit(type);
  const totalCount = Array.isArray(rows) ? rows.length : 0;
  const truncated = rows.slice(0, limit);

  return {
    rows: truncated,
    totalCount,
    exceeded: totalCount > limit,
    limit
  };
};

module.exports = {
  getExportLimit,
  applyExportLimit
};
