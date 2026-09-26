const EXPORT_LIMITS = {
  sales: 5000,
  'sales-pdf': 5000,
  inventory: 10000,
  customers: 10000
};

const getExportLimit = (type) => EXPORT_LIMITS[type] || 5000;

const applyExportLimit = (rows = [], type, totalCount = Array.isArray(rows) ? rows.length : 0) => {
  const limit = getExportLimit(type);
  const truncated = rows.slice(0, limit);

  return {
    rows: truncated,
    totalCount,
    exceeded: totalCount > limit,
    limit
  };
};

const createTopNCollector = (maxRows, compare) => {
  const heap = [];

  const swap = (leftIndex, rightIndex) => {
    [heap[leftIndex], heap[rightIndex]] = [heap[rightIndex], heap[leftIndex]];
  };

  const siftUp = (index) => {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (compare(heap[parentIndex], heap[index]) >= 0) break;
      swap(parentIndex, index);
      index = parentIndex;
    }
  };

  const siftDown = (index) => {
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let worstIndex = index;
      if (leftIndex < heap.length && compare(heap[worstIndex], heap[leftIndex]) < 0) {
        worstIndex = leftIndex;
      }
      if (rightIndex < heap.length && compare(heap[worstIndex], heap[rightIndex]) < 0) {
        worstIndex = rightIndex;
      }
      if (worstIndex === index) break;
      swap(index, worstIndex);
      index = worstIndex;
    }
  };

  return {
    add(item) {
      if (maxRows <= 0) return;
      if (heap.length < maxRows) {
        heap.push(item);
        siftUp(heap.length - 1);
      } else if (compare(item, heap[0]) < 0) {
        heap[0] = item;
        siftDown(0);
      }
    },
    getSorted() {
      return [...heap].sort(compare);
    }
  };
};

module.exports = {
  getExportLimit,
  applyExportLimit,
  createTopNCollector
};
