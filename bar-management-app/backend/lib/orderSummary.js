function normalizeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function cleanProductName(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const normalized = String(value).trim();
  const genericNames = new Set(['Product', 'Unknown Product', 'Unknown product', 'unknown product']);
  return genericNames.has(normalized) ? '' : normalized;
}

function getDisplayProductName(item) {
  const productId = item.product?._id || item.product || item.productId || item._id;
  const candidateName = cleanProductName(item.productName)
    || cleanProductName(item.product?.name)
    || cleanProductName(item.name)
    || (productId ? `Product ${String(productId).slice(-4)}` : 'Product');

  return candidateName === 'Product' && productId ? `Product ${String(productId).slice(-4)}` : candidateName;
}

function buildOrderSummary(orders = []) {
  const activeOrders = (orders || []).filter((order) => !order.reversed);

  const totalSales = activeOrders.reduce((sum, order) => sum + normalizeNumber(order.totalAmount), 0);
  const totalProfit = activeOrders.reduce((sum, order) => sum + normalizeNumber(order.profit), 0);
  const totalOrders = activeOrders.length;
  const totalQuantitySold = activeOrders.reduce((sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + normalizeNumber(item.quantity), 0), 0);
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const averageItemsPerOrder = totalOrders > 0 ? totalQuantitySold / totalOrders : 0;
  const grossMarginRatio = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

  const paymentMethodsMap = {};
  const productSalesMap = {};
  const categorySalesMap = {};

  activeOrders.forEach((order) => {
    const paymentMethod = order.paymentMethod || 'cash';
    if (!paymentMethodsMap[paymentMethod]) {
      paymentMethodsMap[paymentMethod] = { count: 0, amount: 0 };
    }
    paymentMethodsMap[paymentMethod].count += 1;
    paymentMethodsMap[paymentMethod].amount += normalizeNumber(order.totalAmount);

    (order.items || []).forEach((item) => {
      const productId = item.product?._id || item.product || item.productId || item.productName;
      const productName = getDisplayProductName(item);
      const key = productId || productName;

      const productCostPrice = normalizeNumber(item.costPrice ?? item.product?.costPrice ?? item.productCostPrice ?? 0);
      if (!productSalesMap[key]) {
        productSalesMap[key] = { name: productName, quantity: 0, revenue: 0, profit: 0 };
      }
      productSalesMap[key].quantity += normalizeNumber(item.quantity);
      productSalesMap[key].revenue += normalizeNumber(item.subtotal);
      productSalesMap[key].profit += normalizeNumber(item.subtotal) - (productCostPrice * normalizeNumber(item.quantity));

      const categoryName = item.categoryName || item.product?.category?.name || 'Uncategorized';
      if (!categorySalesMap[categoryName]) {
        categorySalesMap[categoryName] = 0;
      }
      categorySalesMap[categoryName] += normalizeNumber(item.subtotal);
    });
  });

  const paymentMethods = Object.keys(paymentMethodsMap).map((method) => ({
    method: method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    count: paymentMethodsMap[method].count,
    amount: paymentMethodsMap[method].amount
  }));

  const topProducts = Object.values(productSalesMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const categorySales = Object.keys(categorySalesMap).map((name) => ({
    name,
    revenue: categorySalesMap[name]
  })).sort((a, b) => b.revenue - a.revenue);

  const dailySalesMap = {};
  activeOrders.forEach((order) => {
    const date = new Date(order.createdAt).toLocaleDateString();
    if (!dailySalesMap[date]) {
      dailySalesMap[date] = { sales: 0, profit: 0, count: 0 };
    }
    dailySalesMap[date].sales += normalizeNumber(order.totalAmount);
    dailySalesMap[date].profit += normalizeNumber(order.profit);
    dailySalesMap[date].count += 1;
  });

  const dailySales = Object.keys(dailySalesMap).map((date) => ({
    date,
    sales: dailySalesMap[date].sales,
    profit: dailySalesMap[date].profit,
    count: dailySalesMap[date].count
  })).sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    sales: activeOrders.slice(0, 100),
    topProducts,
    categorySales,
    dailySales,
    paymentMethods,
    totalSales,
    totalProfit,
    totalOrders,
    averageOrderValue,
    totalQuantitySold,
    averageItemsPerOrder,
    grossMarginRatio
  };
}

module.exports = { buildOrderSummary };
