const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const PurchaseOrder = require('../models/PurchaseOrder');
const CustomerOrderRequest = require('../models/CustomerOrderRequest');
const CustomerPaymentRequest = require('../models/CustomerPaymentRequest');
const StockSnapshot = require('../models/StockSnapshot');
const { recomputeCustomerCreditBalance } = require('../lib/credit');
const { queryEntities, decodeLastEvaluatedKey } = require('../lib/dynamodb');
const { buildOrderSummary, calculateOutstandingCreditInPeriod } = require('../lib/orderSummary');
const { createAuditEntry } = require('../lib/audit');

router.use(protect, isBarOwnerOrSales);

const toNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const MALAWI_OFFSET_MINUTES = 120;

const parseLocalDateBoundary = (value, endOfDay = false, offsetMinutes = MALAWI_OFFSET_MINUTES) => {
  if (!value) {
    return null;
  }

  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (dateOnlyMatch) {
    const [year, month, day] = value.split('-').map(Number);
    const utcValue = Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    const adjusted = utcValue - offsetMinutes * 60000;
    return new Date(adjusted).toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const getLocalTodayStartUtc = (offsetMinutes = MALAWI_OFFSET_MINUTES) => {
  const now = new Date();
  const localNowMs = now.getTime() + offsetMinutes * 60000;
  const localNow = new Date(localNowMs);
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();
  const day = localNow.getUTCDate();
  const localMidnightUtcMs = Date.UTC(year, month, day, 0, 0, 0, 0);
  // adjust back by offset to produce the UTC timestamp representing local midnight
  return new Date(localMidnightUtcMs - offsetMinutes * 60000);
};

const getLocalDateKey = (dateValue, offsetMinutes = MALAWI_OFFSET_MINUTES) => {
  const value = dateValue ? new Date(dateValue) : new Date();
  const localMs = value.getTime() + offsetMinutes * 60000;
  const localDate = new Date(localMs);
  return localDate.toISOString().slice(0, 10);
};

const ensureOpeningStockSnapshot = async (barId, productId, productRecord, snapshotDate, source = 'daily_snapshot', recordedBy = 'system') => {
  if (!barId || !productId) {
    return null;
  }

  const existingSnapshot = await StockSnapshot.findOne({
    barId,
    productId,
    snapshotDate,
    source
  });

  if (existingSnapshot) {
    return existingSnapshot;
  }

  const openingQty = Number(productRecord?.currentStock || 0);
  const snapshot = new StockSnapshot({
    barId,
    productId,
    snapshotDate,
    openingQty,
    source,
    recordedBy,
    createdAt: new Date().toISOString()
  });

  await snapshot.save();
  return snapshot;
};

const cleanProductName = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const normalized = String(value).trim();
  const genericNames = new Set(['Product', 'Unknown Product', 'Unknown product', 'unknown product']);
  return genericNames.has(normalized) ? '' : normalized;
};

// Get all orders
router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const lastKey = req.query.lastKey ? decodeLastEvaluatedKey(req.query.lastKey) : null;
    // Get raw dates but don't pass to DynamoDB filter - will filter in app instead
    const startDateStr = req.query.startDate ? parseLocalDateBoundary(req.query.startDate, false) : null;
    const endDateStr = req.query.endDate ? parseLocalDateBoundary(req.query.endDate, true) : null;
    const includeReversed = req.query.includeReversed !== 'false';

    const queryOptions = {
      barId: req.user.barId,
      limit: limit * 3, // Fetch more items since we'll filter on app level
      lastEvaluatedKey: lastKey,
      // Don't send dates to DynamoDB - will filter in app
      startDate: null,
      endDate: null,
      includeReversed: includeReversed ? undefined : false
    };

    console.debug('DEBUG /orders -> queryOptions (will filter in app):', queryOptions);

    let orderQuery = await queryEntities('order', queryOptions);
    let orders = (orderQuery.items || []);
    
    // Filter by date in application layer
    if (startDateStr || endDateStr) {
      orders = orders.filter((order) => {
        const orderDate = order.createdAt;
        if (startDateStr && orderDate < startDateStr) return false;
        if (endDateStr && orderDate > endDateStr) return false;
        return true;
      });
      console.debug('DEBUG /orders -> after date filter:', orders.length, 'orders');
    }
    
    // Apply limit after filtering
    orders = orders.slice(0, limit);
    
    orders = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const enrichedOrders = orders.map((order) => ({
      ...order,
      items: (order.items || []).map((item) => ({
        ...item,
        productName: item.productName || item.product?.name || 'Product'
      }))
    }));

    console.debug('DEBUG /orders -> returned:', enrichedOrders.length, 'orders, nextKey:', Boolean(orderQuery.lastEvaluatedKey));

    return res.json({
      items: enrichedOrders,
      nextKey: orderQuery.lastEvaluatedKey
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: error.message });
  }
});

const resolveOrderProductNames = async (orders = [], barId) => {
  const products = await Product.find({ barId });
  const productMap = new Map((products || []).map((product) => [String(product._id || product.id), product]));

  return (orders || []).map((order) => ({
    ...order,
    items: (order.items || []).map((item) => {
      const productId = item.product?._id || item.product || item.productId || item._id;
      const catalogProduct = productId ? productMap.get(String(productId)) : null;
      const resolvedName = cleanProductName(item.productName)
        || cleanProductName(item.product?.name)
        || cleanProductName(item.name)
        || catalogProduct?.name
        || (productId ? `Product ${String(productId).slice(-4)}` : 'Product');

      const enrichedProduct = catalogProduct
        ? {
            _id: catalogProduct._id || catalogProduct.id,
            name: catalogProduct.name,
            category: catalogProduct.category,
            costPrice: catalogProduct.costPrice ?? item.product?.costPrice ?? item.costPrice ?? item.productCostPrice ?? 0
          }
        : (item.product && typeof item.product === 'object' ? item.product : null);

      return {
        ...item,
        productName: resolvedName,
        product: enrichedProduct
      };
    })
  }));
};

router.get('/summary', async (req, res) => {
  try {
    const range = String(req.query.range || 'week').toLowerCase();
    let startDate = null;
    let endDate = new Date().toISOString();

    if (range === 'today') {
      startDate = getLocalTodayStartUtc().toISOString();
    } else if (range === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = weekAgo.toISOString();
    } else if (range === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      startDate = monthAgo.toISOString();
    } else if (range === 'year') {
      const yearAgo = new Date();
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      startDate = yearAgo.toISOString();
    } else if (req.query.startDate) {
      startDate = parseLocalDateBoundary(req.query.startDate, false);
    }

    const queryOptions = {
      barId: req.user.barId,
      includeReversed: false,
      startDate
    };

    if (req.query.endDate) {
      queryOptions.endDate = parseLocalDateBoundary(req.query.endDate, true);
    } else {
      queryOptions.endDate = endDate;
    }

    const { items: orders = [] } = await queryEntities('order', queryOptions);
    const enrichedOrders = await resolveOrderProductNames(orders, req.user.barId);
    const summary = buildOrderSummary(enrichedOrders);

    const reversedQueryOptions = {
      barId: req.user.barId,
      startDate,
      endDate
    };
    const { items: allOrdersInRange = [] } = await queryEntities('order', reversedQueryOptions);
    const reversedOrders = (allOrdersInRange || []).filter((order) => order.reversed).length;

    const paymentQuery = { barId: req.user.barId };

    const allPayments = await CustomerPaymentRequest.find(paymentQuery);
    const payments = (allPayments || []).filter((payment) => {
      if (payment.status !== 'confirmed') {
        return false;
      }
      if (!startDate && !queryOptions.endDate) {
        return true;
      }
      const paymentDate = payment.confirmedAt || payment.createdAt;
      if (!paymentDate) {
        return true;
      }
      const timestamp = new Date(paymentDate).getTime();
      if (Number.isNaN(timestamp)) {
        return true;
      }
      if (startDate && timestamp < new Date(startDate).getTime()) {
        return false;
      }
      if (queryOptions.endDate && timestamp > new Date(queryOptions.endDate).getTime()) {
        return false;
      }
      return true;
    });
    const allCreditOrders = await Order.find({ barId: req.user.barId, reversed: { $ne: true }, paymentMethod: 'credit' });

    const legacyCreditOrders = await Order.find({
      barId: req.user.barId,
      reversed: { $ne: true },
      paymentMethod: 'credit',
      amountPaid: { $gt: 0 }
    });

    const legacyCreditOrderPayments = (legacyCreditOrders || []).filter((order) => {
      if (!startDate && !queryOptions.endDate) {
        return true;
      }
      const paymentDate = order.createdAt;
      if (!paymentDate) {
        return true;
      }
      const timestamp = new Date(paymentDate).getTime();
      if (Number.isNaN(timestamp)) {
        return true;
      }
      if (startDate && timestamp < new Date(startDate).getTime()) {
        return false;
      }
      if (queryOptions.endDate && timestamp > new Date(queryOptions.endDate).getTime()) {
        return false;
      }
      return true;
    }).map((order) => ({
      amount: Number(order.amountPaid || 0),
      confirmedAt: order.createdAt ? new Date(order.createdAt).getTime() : 0,
      isLegacyCreditOrderPayment: true
    }));

    const paymentOrders = payments
      .map((payment) => ({
        amount: Number(payment.amountApplied || payment.amountRequested || payment.amount || 0),
        confirmedAt: payment.confirmedAt ? new Date(payment.confirmedAt).getTime() : 0,
        paymentMethod: String(payment.creditPaymentMethod || payment.paymentMethod || 'cash').toLowerCase()
      }))
      .filter((payment) => payment.amount > 0)
      .sort((a, b) => a.confirmedAt - b.confirmedAt);

    const creditOrderStates = (allCreditOrders || [])
      .map((order) => ({
        createdAt: new Date(order.createdAt).getTime(),
        balanceDue: Number(order.balanceDue || 0)
      }))
      .sort((a, b) => a.createdAt - b.createdAt);

    let previousBillsCollected = 0;
    let currentPeriodCreditCollected = 0;
    const rangeStartTime = startDate ? new Date(startDate).getTime() : 0;

    const settlementMethods = ['credit_cash', 'credit_airtel_money', 'credit_mpamba', 'credit_bank_account'];
    const currentPeriodSettlementMap = settlementMethods.reduce((acc, method) => {
      acc[method] = 0;
      return acc;
    }, {});

    const inRangePayments = (payments || []).filter((payment) => {
      const paymentDate = payment.confirmedAt || payment.createdAt;
      if (!paymentDate) return false;
      const timestamp = new Date(paymentDate).getTime();
      if (Number.isNaN(timestamp)) return false;
      return timestamp >= rangeStartTime && (!queryOptions.endDate || timestamp <= new Date(queryOptions.endDate).getTime());
    });

    inRangePayments.forEach((payment) => {
      const methodKey = settlementMethods.includes(String(payment.creditPaymentMethod || payment.paymentMethod || '').toLowerCase())
        ? String(payment.creditPaymentMethod || payment.paymentMethod || '').toLowerCase()
        : 'credit_cash';
      const amount = Number(payment.amountApplied || payment.amountRequested || payment.amount || 0);
      if (amount > 0) {
        currentPeriodSettlementMap[methodKey] += amount;
        currentPeriodCreditCollected += amount;
      }
    });

    legacyCreditOrderPayments.forEach((payment) => {
      const paymentDate = payment.confirmedAt || payment.createdAt;
      if (!paymentDate) return;
      const timestamp = new Date(paymentDate).getTime();
      if (!Number.isNaN(timestamp) && timestamp >= rangeStartTime && (!queryOptions.endDate || timestamp <= new Date(queryOptions.endDate).getTime())) {
        currentPeriodSettlementMap.credit_cash += Number(payment.amount || 0);
        currentPeriodCreditCollected += Number(payment.amount || 0);
      }
    });

    paymentOrders.forEach((payment) => {
      if (payment.isLegacyCreditOrderPayment) {
        return;
      }

      let remaining = payment.amount;
      while (remaining > 0) {
        const nextOrder = creditOrderStates.find((order) => order.balanceDue > 0);
        if (!nextOrder) break;

        const applied = Math.min(remaining, nextOrder.balanceDue);
        if (nextOrder.createdAt < rangeStartTime) {
          previousBillsCollected += applied;
        }

        nextOrder.balanceDue -= applied;
        remaining -= applied;
      }
    });

    const settlementLabels = {
      credit_cash: 'Credit Cash',
      credit_airtel_money: 'Credit Airtel Money',
      credit_mpamba: 'Credit Mpamba',
      credit_bank_account: 'Credit Bank Account'
    };

    const creditSettlementSummary = settlementMethods.map((method) => ({
      method: settlementLabels[method],
      amount: currentPeriodSettlementMap[method] || 0
    }));

    const unpaidCredit = calculateOutstandingCreditInPeriod(enrichedOrders || []);

    const totalOutstandingCredit = (allCreditOrders || [])
      .reduce((sum, order) => sum + Number(order.balanceDue || 0), 0);

    const totalCreditCollected = previousBillsCollected;
    const totalCreditSales = summary.paymentMethods
      .filter((method) => String(method.method).toLowerCase() === 'credit')
      .reduce((sum, method) => sum + Number(method.amount || 0), 0);
    const totalImmediateReceipts = summary.paymentMethods
      .filter((method) => String(method.method).toLowerCase() !== 'credit')
      .reduce((sum, method) => sum + Number(method.amount || 0), 0);
    const paymentMethodProceeds = (summary.paymentMethods || []).map((method) => ({
      method: method.method,
      totalAmount: Number(method.amount || 0)
    }));
    const expectedHandoverValue = summary.totalSales - unpaidCredit + totalCreditCollected;

    const uniqueCustomerIds = new Set(
      (enrichedOrders || [])
        .filter((order) => !order.reversed && order.customer)
        .map((order) => String(order.customer?._id || order.customer || order.customerId || ''))
        .filter(Boolean)
    );
    const customersServedCount = uniqueCustomerIds.size;

    const products = await Product.find({ barId: req.user.barId });
    const productMap = new Map((products || []).map((product) => [String(product._id || product.id), product]));

    const startingDate = startDate;
    const hasStartDate = Boolean(startingDate);

    const adjustmentsInRange = hasStartDate
      ? await InventoryAdjustment.find({
          barId: req.user.barId,
          createdAt: { $gte: startingDate, $lte: queryOptions.endDate }
        })
      : [];
    const purchaseReceiptsInRange = hasStartDate
      ? await PurchaseOrder.find({
          barId: req.user.barId,
          status: 'received',
          receivedDate: { $gte: startingDate, $lte: queryOptions.endDate }
        })
      : [];

    const stockChangesSinceStart = {};

    adjustmentsInRange.forEach((adjustment) => {
      const productId = String(adjustment.product);
      const quantity = Number(adjustment.quantity || 0);
      let delta = 0;

      if (adjustment.type === 'restock') {
        delta = quantity;
      } else if (adjustment.type === 'count_correction') {
        delta = Number(adjustment.newStock || 0) - Number(adjustment.previousStock || 0);
      } else if (adjustment.type === 'wastage' || adjustment.type === 'damage' || adjustment.type === 'return') {
        delta = -quantity;
      }

      stockChangesSinceStart[productId] = (stockChangesSinceStart[productId] || 0) + delta;
    });

    purchaseReceiptsInRange.forEach((purchaseOrder) => {
      (purchaseOrder.items || []).forEach((item) => {
        const productId = String(item.product);
        const quantity = Number(item.quantity || 0);
        stockChangesSinceStart[productId] = (stockChangesSinceStart[productId] || 0) + quantity;
      });
    });

    const productSalesMap = {};
    const openingStockSnapshots = {};

    for (const product of products || []) {
      const productId = String(product._id || product.id || '');
      if (!productId) continue;

      const snapshotDate = getLocalDateKey(startDate || new Date(), MALAWI_OFFSET_MINUTES);
      const snapshot = await StockSnapshot.findOne({
        barId: req.user.barId,
        productId,
        snapshotDate,
        source: 'daily_snapshot'
      });

      const resolvedSnapshot = snapshot || await ensureOpeningStockSnapshot(req.user.barId, productId, product, snapshotDate, 'daily_snapshot', 'system');
      openingStockSnapshots[productId] = resolvedSnapshot;

      if (productId && !productSalesMap[productId]) {
        productSalesMap[productId] = {
          productId,
          name: product.name || 'Product',
          soldQuantity: 0,
          totalAmount: 0,
          startingQty: 0,
          closingQty: 0,
          currentStock: Number(product.currentStock || 0),
          purchaseOrdersQty: 0,
          snapshotOpeningQty: resolvedSnapshot ? Number(resolvedSnapshot.openingQty || 0) : null
        };
      }
    }

    enrichedOrders.forEach((order) => {
      if (order.reversed) return;
      (order.items || []).forEach((item) => {
        const productId = String(item.product?._id || item.product || item.productId || item._id || item.productName);
        const productName = item.productName || item.product?.name || 'Product';
        const soldQty = Number(item.quantity || 0);
        const totalAmount = Number(item.subtotal || 0);

        if (!productSalesMap[productId]) {
          productSalesMap[productId] = {
            productId,
            name: productName,
            soldQuantity: 0,
            totalAmount: 0,
            startingQty: 0,
            closingQty: 0,
            currentStock: 0,
            purchaseOrdersQty: 0,
            snapshotOpeningQty: null
          };
        }

        productSalesMap[productId].soldQuantity += soldQty;
        productSalesMap[productId].totalAmount += totalAmount;
      });
    });

    purchaseReceiptsInRange.forEach((purchaseOrder) => {
      (purchaseOrder.items || []).forEach((item) => {
        const productId = String(item.product);
        const purchaseQty = Number(item.quantity || 0);

        if (!productSalesMap[productId]) {
          productSalesMap[productId] = {
            productId,
            name: productMap.get(productId)?.name || item.productName || 'Product',
            soldQuantity: 0,
            totalAmount: 0,
            startingQty: 0,
            closingQty: 0,
            currentStock: Number(productMap.get(productId)?.currentStock || 0),
            purchaseOrdersQty: 0
          };
        }

        productSalesMap[productId].purchaseOrdersQty += purchaseQty;
      });
    });

    Object.keys(productSalesMap).forEach((productId) => {
      const productRecord = productMap.get(productId);
      const currentStock = Number(productRecord?.currentStock || productSalesMap[productId].currentStock || 0);
      const netChangeSinceStart = Number(stockChangesSinceStart[productId] || 0);
      const soldQuantity = Number(productSalesMap[productId].soldQuantity || 0);
      const snapshot = openingStockSnapshots[productId];

      productSalesMap[productId].currentStock = currentStock;
      productSalesMap[productId].closingQty = currentStock;
      productSalesMap[productId].startingQty = hasStartDate
        ? (snapshot ? Number(snapshot.openingQty || 0) : currentStock + soldQuantity - netChangeSinceStart)
        : (snapshot ? Number(snapshot.openingQty || 0) : null);
      productSalesMap[productId].purchaseOrdersQty = Number(productSalesMap[productId].purchaseOrdersQty || 0);
    });

    const productSales = Object.values(productSalesMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 40);

    const creditCustomers = {};
    const creditOrders = (orders || []).filter((order) => !order.reversed && Number(order.balanceDue || 0) > 0 && (order.paymentMethod === 'credit' || order.paymentStatus === 'partial' || order.paymentStatus === 'credit'));
    creditOrders.forEach((order) => {
      const orderCustomer = order.customer || order.customerId || {};
      const customerId = String(orderCustomer?._id || orderCustomer?.id || orderCustomer || '').trim();
      const balanceDue = Number(order.balanceDue || 0);
      if (!customerId) return;
      if (!creditCustomers[customerId]) {
        creditCustomers[customerId] = {
          customerId,
          name: orderCustomer?.name || orderCustomer?.customerName || order.customerName || 'Unknown customer',
          phone: orderCustomer?.phone || orderCustomer?.phoneNumber || order.customerPhone || '',
          outstandingBalance: 0,
          totalOutstandingBalance: 0,
          periodOutstandingBalance: 0,
          ordersCount: 0
        };
      }
      creditCustomers[customerId].outstandingBalance += balanceDue;
      creditCustomers[customerId].totalOutstandingBalance += balanceDue;
      creditCustomers[customerId].periodOutstandingBalance += balanceDue;
      creditCustomers[customerId].ordersCount += 1;
    });

    const customerIds = Object.keys(creditCustomers);
    if (customerIds.length > 0) {
      const customerRecords = await Customer.find({ _id: { $in: customerIds }, barId: req.user.barId });
      customerRecords.forEach((customer) => {
        const key = String(customer._id || customer.id);
        if (creditCustomers[key]) {
          creditCustomers[key].name = customer.name || creditCustomers[key].name;
          creditCustomers[key].phone = customer.phone || creditCustomers[key].phone;
        }
      });
    }

    const outstandingCustomers = Object.values(creditCustomers)
      .sort((a, b) => b.totalOutstandingBalance - a.totalOutstandingBalance)
      .slice(0, 20);

    const salesAccountOutstandingMap = {};
    (enrichedOrders || [])
      .filter((order) => !order.reversed && Number(order.balanceDue || 0) > 0 && (order.paymentMethod === 'credit' || order.paymentStatus === 'partial' || order.paymentStatus === 'credit'))
      .forEach((order) => {
        const salesAccount = String(
          order.processedByName ||
          order.paymentProcessedByName ||
          order.processedBy ||
          order.paymentProcessedBy ||
          'Sales account'
        ).trim() || 'Sales account';

        if (!salesAccountOutstandingMap[salesAccount]) {
          salesAccountOutstandingMap[salesAccount] = {
            salesAccount,
            outstandingBalance: 0,
            ordersCount: 0,
            customerIds: new Set()
          };
        }

        const customerId = order.customer ? String(order.customer?._id || order.customer || '').trim() : '';
        if (customerId) {
          salesAccountOutstandingMap[salesAccount].customerIds.add(customerId);
        }

        salesAccountOutstandingMap[salesAccount].outstandingBalance += Number(order.balanceDue || 0);
        salesAccountOutstandingMap[salesAccount].ordersCount += 1;
      });

    const outstandingCreditBySalesAccount = Object.values(salesAccountOutstandingMap)
      .map((item) => ({
        salesAccount: item.salesAccount,
        outstandingBalance: Number(item.outstandingBalance || 0),
        ordersCount: Number(item.ordersCount || 0),
        customerCount: item.customerIds.size
      }))
      .sort((a, b) => b.outstandingBalance - a.outstandingBalance);

    res.json({
      sales: summary.sales,
      topProducts: summary.topProducts,
      categorySales: summary.categorySales,
      dailySales: summary.dailySales,
      paymentMethods: summary.paymentMethods,
      totalSales: summary.totalSales,
      totalProfit: summary.totalProfit,
      totalOrders: summary.totalOrders,
      reversedOrders,
      averageOrderValue: summary.averageOrderValue,
      totalQuantitySold: summary.totalQuantitySold,
      averageItemsPerOrder: summary.averageItemsPerOrder,
      grossMarginRatio: summary.grossMarginRatio,
      customersServedCount,
      totalCreditCollected,
      customerPreviousBillsPaid: totalCreditCollected,
      previousBillsCollected: totalCreditCollected,
      currentPeriodCreditCollected,
      totalCreditSales,
      totalImmediateReceipts,
      directSales: totalImmediateReceipts,
      paymentMethodProceeds,
      outstandingCreditInPeriod: unpaidCredit,
      totalOutstandingCredit,
      expectedHandoverValue,
      creditSettlementSummary,
      unpaidCredit,
      productSales,
      outstandingCustomers,
      outstandingCreditBySalesAccount
    });
  } catch (error) {
    console.error('Error fetching orders summary:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get today's orders (for dashboard)
router.get('/today', async (req, res) => {
  try {
    const startOfDay = getLocalTodayStartUtc();
    
    const todayOrders = await Order.find({
      barId: req.user.barId,
      createdAt: { $gte: startOfDay }
    });
    try {
      console.debug('DEBUG /orders/today -> found:', (todayOrders || []).length, 'firstOrder:', (todayOrders && todayOrders[0] && (todayOrders[0]._id || todayOrders[0].id || todayOrders[0].orderNumber)) || null);
    } catch (err) {}

    const reversedOrders = (todayOrders || []).filter((order) => order.reversed);
    const activeOrders = (todayOrders || []).filter((order) => !order.reversed);
    
    const totalSales = activeOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalProfit = activeOrders.reduce((sum, o) => sum + (o.profit || 0), 0);
    
    // Enrich orders with product names
    const products = await Product.find({ barId: req.user.barId });
    const productMap = new Map((products || []).map((product) => [product._id || product.id, product]));

    const enrichedOrders = (todayOrders || []).map((order) => ({
      ...order,
      items: (order.items || []).map((item) => {
        const itemProductId = item.product?._id || item.product;
        const catalogProduct = itemProductId ? productMap.get(itemProductId) : null;
        const productName = item.productName || catalogProduct?.name || item.product?.name || 'Product';
        const productCategory = catalogProduct?.category?.name || catalogProduct?.categoryName || item.product?.category?.name || 'Uncategorized';

        return {
          ...item,
          productName,
          product: catalogProduct
            ? { _id: catalogProduct._id || catalogProduct.id, name: catalogProduct.name, category: catalogProduct.category }
            : item.product || null,
          categoryName: productCategory
        };
      })
    }));
    
    res.json({
      count: activeOrders.length,
      totalSales,
      totalProfit,
      reversedCount: reversedOrders.length,
      orders: enrichedOrders
    });
  } catch (error) {
    console.error('Error fetching today orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create order (POS)
router.post('/', async (req, res) => {
  try {
    const { customer, items, paymentMethod, amountPaid } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }

    let totalAmount = 0;
    let totalCost = 0;
    const orderItems = [];

    // Process each item
    for (const item of items) {
      const product = await Product.findOne({ _id: item.product, barId: req.user.barId });
      
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      const quantity = Math.max(0, Math.floor(toNumber(item.quantity, 0)));

      // Check if enough stock
      if (product.currentStock < quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${product.currentStock}`
        });
      }

      // Deduct from inventory
      product.currentStock -= quantity;
      await product.save();

      const sellingPrice = toNumber(product.sellingPrice, 0);
      const costPrice = toNumber(product.costPrice, 0);
      const subtotal = sellingPrice * quantity;
      totalAmount += subtotal;
      totalCost += costPrice * quantity;

      orderItems.push({
        product: product._id,
        productName: product.name,
        quantity,
        priceAtSale: sellingPrice,
        subtotal
      });
    }

    const normalizedAmountPaid = toNumber(amountPaid, 0);
    let customerDoc = null;
    let paidAmount = Math.max(0, normalizedAmountPaid);
    let remainingBalance = totalAmount;
    let paymentStatus = 'paid';

    if (paymentMethod === 'credit' && customer) {
      customerDoc = await Customer.findOne({ _id: customer, barId: req.user.barId });
      if (!customerDoc) {
        return res.status(404).json({ message: 'Customer not found' });
      }

      const isRegisteredCustomer = Boolean(customerDoc.accountUsername || customerDoc.accountUserId || customerDoc.username);
      if (!isRegisteredCustomer) {
        return res.status(400).json({ message: 'Credit payments are only available for registered customer accounts.' });
      }

      if (paidAmount < 0) {
        return res.status(400).json({ message: 'Payment amount cannot be negative' });
      }

      const safePaidAmount = Math.min(paidAmount, totalAmount);
      remainingBalance = Math.max(0, totalAmount - safePaidAmount);
      paymentStatus = remainingBalance > 0 ? 'partial' : 'paid';

      customerDoc.totalSpent = toNumber(customerDoc.totalSpent, 0) + totalAmount;
      customerDoc.loyaltyPoints = toNumber(customerDoc.loyaltyPoints, 0) + Math.floor(totalAmount / 100);
      customerDoc.lastCreditPayment = safePaidAmount;
      // persist other customer fields now; creditBalance will be recomputed from orders after save
      await customerDoc.save();
    } else if (customer) {
      customerDoc = await Customer.findOne({ _id: customer, barId: req.user.barId });
      if (customerDoc) {
        customerDoc.totalSpent = toNumber(customerDoc.totalSpent, 0) + totalAmount;
        customerDoc.loyaltyPoints = toNumber(customerDoc.loyaltyPoints, 0) + Math.floor(totalAmount / 100);
        await customerDoc.save();
      }
    }

    const order = new Order({
      barId: req.user.barId,
      orderNumber: `ORD-${Date.now().toString().slice(-8)}`,
      customer: customer || null,
      customerName: customerDoc?.name || 'Walk-in Customer',
      items: orderItems,
      totalAmount,
      profit: totalAmount - totalCost,
      paymentMethod: paymentMethod || 'cash',
      amountPaid: paymentMethod === 'credit' ? Math.min(paidAmount, totalAmount) : totalAmount,
      balanceDue: paymentMethod === 'credit' ? remainingBalance : 0,
      paymentStatus,
      status: paymentStatus === 'paid' ? 'completed' : 'partial',
      processedBy: req.user._id,
      processedByName: req.user.fullName || req.user.username || req.user.email || 'Sales account'
    });

    const savedOrder = await order.save();

    await createAuditEntry({
      action: 'create_order',
      entityType: 'Order',
      entityId: savedOrder._id,
      details: {
        orderNumber: savedOrder.orderNumber,
        totalAmount: savedOrder.totalAmount,
        paymentMethod: savedOrder.paymentMethod,
        amountPaid: savedOrder.amountPaid,
        balanceDue: savedOrder.balanceDue,
        paymentStatus: savedOrder.paymentStatus,
        customer: savedOrder.customer
      }
    });

    // Recompute and persist customer's creditBalance from outstanding credit orders
    if (customerDoc) {
      await recomputeCustomerCreditBalance(customerDoc._id, req.user.barId);
    }

    await savedOrder.populate('customer');
    await savedOrder.populate('items.product');

    const customerAccount = customerDoc
      ? {
          username: customerDoc.accountUsername || customerDoc.username || '',
          password: customerDoc.accountPassword || ''
        }
      : null;

    // Enrich response with product names
    const enrichedOrder = {
      ...savedOrder,
      customerName: customerDoc?.name || savedOrder.customerName || 'Walk-in Customer',
      customerAccount,
      items: (savedOrder.items || []).map((item) => {
        const itemProductId = item.product?._id || item.product;
        const productData = itemProductId && typeof itemProductId === 'object' ? itemProductId : null;
        const productName = item.productName || productData?.name || 'Product';

        return {
          ...item,
          productName,
          product: productData || item.product || null
        };
      })
    };

    res.status(201).json(enrichedOrder);

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get order by ID
router.post('/:id/reverse', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, barId: req.user.barId });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.reversed) {
      return res.status(400).json({ message: 'This sale has already been reversed.' });
    }

    for (const item of order.items || []) {
      const product = await Product.findOne({ _id: item.product, barId: req.user.barId });
      if (product) {
        product.currentStock = toNumber(product.currentStock, 0) + toNumber(item.quantity, 0);
        await product.save();
      }
    }

    let customerDoc = null;
    if (order.customer) {
      customerDoc = await Customer.findOne({ _id: order.customer, barId: req.user.barId });
      if (customerDoc) {
        customerDoc.totalSpent = Math.max(0, toNumber(customerDoc.totalSpent, 0) - toNumber(order.totalAmount, 0));
        customerDoc.loyaltyPoints = Math.max(0, toNumber(customerDoc.loyaltyPoints, 0) - Math.floor(toNumber(order.totalAmount, 0) / 100));
        // do not adjust creditBalance here; we'll recompute from orders after marking reversed
        await customerDoc.save();
      }
    }

    order.reversed = true;
    order.reversedAt = new Date().toISOString();
    order.reversalReason = req.body?.reason || 'Sale reversed';
    order.status = 'reversed';
    order.reversedBy = req.user._id;
    order.reversedByName = req.user.fullName || req.user.username || req.user.email || 'Sales account';
    await order.save();

    await createAuditEntry({
      action: 'reverse_order',
      entityType: 'Order',
      entityId: order._id,
      details: {
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        reversalReason: order.reversalReason
      }
    });

    // Recompute customer's credit balance excluding reversed orders
    if (customerDoc) {
      const customerOrders = await Order.find({ customer: customerDoc._id, barId: req.user.barId });
      const outstanding = (customerOrders || [])
        .filter(o => !o.reversed && (o.paymentMethod === 'credit' || o.paymentStatus === 'partial' || o.paymentStatus === 'credit'))
        .reduce((sum, o) => sum + Number(o.balanceDue || 0), 0);
      customerDoc.creditBalance = outstanding;
      await customerDoc.save();
    }

    res.json(order);
  } catch (error) {
    console.error('Error reversing order:', error);
    res.status(400).json({ message: error.message });
  }
});

router.post('/:id/pay', async (req, res) => {
  try {
    const { amount } = req.body;
    const order = await Order.findOne({ _id: req.params.id, barId: req.user.barId });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const paymentAmount = toNumber(amount, 0);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    }

    const currentBalance = toNumber(order.balanceDue, 0);
    const safeAmount = Math.min(paymentAmount, currentBalance);
    const updatedBalance = currentBalance - safeAmount;

    order.balanceDue = updatedBalance;
    order.paymentStatus = updatedBalance > 0 ? 'partial' : 'paid';
    order.amountPaid = toNumber(order.amountPaid, 0) + safeAmount;
    order.paymentMethod = order.paymentMethod || 'credit';
    order.paymentProcessedBy = req.user._id;
    order.paymentProcessedByName = req.user.fullName || req.user.username || req.user.email || 'Sales account';

    if (order.customer) {
      const customerDocLocal = await Customer.findOne({ _id: order.customer, barId: req.user.barId });
      if (customerDocLocal) {
        await recomputeCustomerCreditBalance(customerDocLocal._id, req.user.barId);
      }
    }

    await createAuditEntry({
      action: 'record_order_payment',
      entityType: 'Order',
      entityId: order._id,
      details: {
        paymentAmount: safeAmount,
        paymentMethod: order.paymentMethod,
        paymentProcessedBy: order.paymentProcessedByName,
        balanceDue: order.balanceDue,
        paymentStatus: order.paymentStatus
      }
    });

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error paying order balance:', error);
    res.status(400).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, barId: req.user.barId })
      .populate('customer', 'name phone')
      .populate('items.product', 'name');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;