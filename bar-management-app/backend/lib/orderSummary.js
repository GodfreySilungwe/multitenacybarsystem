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

function calculateOutstandingCreditInPeriod(orders = [], payments = []) {
  // Filter credit orders, explicitly excluding those that are already fully paid
  // This prevents counting paid orders in the outstanding balance
  // Only include orders with:
  // - paymentMethod === 'credit' but NOT paymentStatus === 'paid'
  // - OR paymentStatus === 'partial' (partial payments)
  // - OR paymentStatus === 'credit' (original credit order status)
  const creditOrders = (orders || [])
    .filter((order) => {
      if (order.reversed) return false;
      if (order.paymentStatus === 'paid') return false; // Exclude fully paid orders
      return order.paymentMethod === 'credit' || order.paymentStatus === 'partial' || order.paymentStatus === 'credit';
    });

  // Try to use balanceDue if available (this is the most accurate source of truth)
  const ordersWithBalanceDue = creditOrders.filter((order) => normalizeNumber(order.balanceDue || 0) > 0);
  if (ordersWithBalanceDue.length > 0) {
    // If we have orders with balanceDue > 0, use that as the source of truth
    return ordersWithBalanceDue.reduce((sum, order) => {
      return sum + normalizeNumber(order.balanceDue || 0);
    }, 0);
  }

  // Fallback: Calculate from totalAmount - repayments
  // This handles legacy data where balanceDue might not be set
  const creditSalesTotal = creditOrders.reduce((sum, order) => {
    const orderTotal = normalizeNumber(order.totalAmount || order.amount || 0);
    return sum + orderTotal;
  }, 0);

  if (Array.isArray(payments) && payments.length > 0) {
    const repaymentsTotal = payments.reduce((sum, payment) => {
      const paymentAmount = normalizeNumber(
        payment.amountApplied ?? payment.amountRequested ?? payment.amount ?? payment.totalAmount ?? 0
      );
      return sum + paymentAmount;
    }, 0);

    return Math.max(creditSalesTotal - repaymentsTotal, 0);
  }

  // Final fallback: use balanceDue even if it's 0
  return creditOrders
    .filter((order) => normalizeNumber(order.balanceDue || order.amountDue || 0) > 0)
    .reduce((sum, order) => {
      const amount = normalizeNumber(order.balanceDue || order.amountDue || 0);
      return sum + amount;
    }, 0);
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

    const orderProfit = normalizeNumber(order.profit);
    const orderRevenue = (order.items || []).reduce((sum, item) => sum + normalizeNumber(item.subtotal), 0);

    (order.items || []).forEach((item) => {
      const productId = item.product?._id || item.product || item.productId || item.productName;
      const productName = getDisplayProductName(item);
      const key = productId || productName;

      const rawCostPrice = item.costPrice ?? item.product?.costPrice ?? item.productCostPrice;
      const hasCostPrice = rawCostPrice !== null && rawCostPrice !== undefined;
      const productCostPrice = normalizeNumber(rawCostPrice ?? 0);
      const itemRevenue = normalizeNumber(item.subtotal);

      let itemProfit = 0;
      if (hasCostPrice) {
        itemProfit = itemRevenue - (productCostPrice * normalizeNumber(item.quantity));
      } else if (orderRevenue > 0) {
        itemProfit = (orderProfit * itemRevenue) / orderRevenue;
      }

      if (!productSalesMap[key]) {
        productSalesMap[key] = { name: productName, quantity: 0, revenue: 0, profit: 0 };
      }
      productSalesMap[key].quantity += normalizeNumber(item.quantity);
      productSalesMap[key].revenue += itemRevenue;
      productSalesMap[key].profit += itemProfit;

      const categoryName = item.categoryName || item.product?.category?.name || 'Uncategorized';
      if (!categorySalesMap[categoryName]) {
        categorySalesMap[categoryName] = 0;
      }
      categorySalesMap[categoryName] += itemRevenue;
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

module.exports = { buildOrderSummary, calculateOutstandingCreditInPeriod };
