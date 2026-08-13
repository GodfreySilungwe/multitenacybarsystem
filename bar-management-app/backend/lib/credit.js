const Order = require('../models/Order');
const Customer = require('../models/Customer');

function normalizePaymentAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }
  return amount;
}

function calculateCreditBalance(currentBalance, totalAmount, amountPaidNow = 0) {
  const normalizedCurrentBalance = normalizePaymentAmount(currentBalance);
  const normalizedTotalAmount = normalizePaymentAmount(totalAmount);
  const normalizedAmountPaidNow = normalizePaymentAmount(amountPaidNow);
  const remainingBalance = Math.max(0, normalizedTotalAmount - normalizedAmountPaidNow);

  return {
    remainingBalance,
    amountPaidNow: normalizedAmountPaidNow,
    balanceAfterOrder: Math.max(0, normalizedCurrentBalance + remainingBalance)
  };
}

function getOrderSalesAccount(order = {}) {
  const candidate = String(
    order.processedByName ||
    order.paymentProcessedByName ||
    order.processedByUsername ||
    order.processedBy ||
    order.paymentProcessedBy ||
    order.salesAccount ||
    'Sales account'
  ).trim();

  return candidate || 'Sales account';
}

function isManagerOrOwnerUser(currentUser = {}) {
  return ['owner', 'manager'].includes(String(currentUser?.role || '').toLowerCase());
}

function isOrderOwnedByUser(order = {}, currentUser = {}) {
  const currentSalesAccountId = String(currentUser?._id || currentUser?.id || '').trim();
  const currentSalesAccountName = String(currentUser?.fullName || currentUser?.username || currentUser?.email || '').trim();

  if (!currentSalesAccountId && !currentSalesAccountName) {
    return true;
  }

  const orderSalesAccountId = String(order.processedBy || order.paymentProcessedBy || '').trim();
  const orderSalesAccountName = getOrderSalesAccount(order);
  const orderProcessedByUsername = String(order.processedByUsername || '').trim();

  // Try to match by ID first (if both are valid UUID format)
  if (currentSalesAccountId && orderSalesAccountId) {
    const isOrderIdUuid = orderSalesAccountId.includes('-');
    const isCurrentIdUuid = currentSalesAccountId.includes('-');
    
    if (isOrderIdUuid && isCurrentIdUuid) {
      // Both are UUIDs, compare directly
      if (orderSalesAccountId === currentSalesAccountId) {
        return true;
      }
    } else if (!isOrderIdUuid && !isCurrentIdUuid) {
      // Both are username strings, compare directly (case-insensitive)
      if (orderSalesAccountId.toLowerCase() === currentSalesAccountId.toLowerCase()) {
        return true;
      }
    }
  }

  // Try to match by username if available (for old orders with processedByUsername)
  if (currentSalesAccountName && orderProcessedByUsername) {
    const currentUsernameNormalized = currentSalesAccountName.toLowerCase().trim();
    const orderUsernameNormalized = orderProcessedByUsername.toLowerCase().trim();
    if (orderUsernameNormalized.includes(currentUsernameNormalized) || currentUsernameNormalized.includes(orderUsernameNormalized)) {
      return true;
    }
  }

  // Fallback to name matching
  if (currentSalesAccountName && orderSalesAccountName && orderSalesAccountName !== 'Sales account') {
    const currentNameNormalized = currentSalesAccountName.toLowerCase().trim();
    const orderNameNormalized = orderSalesAccountName.toLowerCase().trim();
    if (orderNameNormalized === currentNameNormalized) {
      return true;
    }
  }

  // If no ID or clear name match, allow if current user has no specific account
  return !currentSalesAccountId;
}

function getSalesAccountMismatchMessage(orders = [], currentUser = {}) {
  if (isManagerOrOwnerUser(currentUser)) {
    return null;
  }

  // Helper to calculate outstanding balance
  const getOutstandingBalance = (order) => {
    let balance = Number(order.balanceDue || 0);
    if (balance <= 0) {
      const totalAmount = Number(order.totalAmount || 0);
      const amountPaid = Number(order.amountPaid || 0);
      balance = Math.max(0, totalAmount - amountPaid);
    }
    return balance;
  };

  const mismatchedOrder = (orders || [])
    .filter((order) => !order.reversed && getOutstandingBalance(order) > 0 && (order.paymentMethod === 'credit' || order.status === 'partial' || order.paymentStatus === 'partial' || order.status === 'credit' || order.paymentStatus === 'credit'))
    .find((order) => !isOrderOwnedByUser(order, currentUser));

  if (!mismatchedOrder) {
    return null;
  }

  return `This bill can only be settled by ${getOrderSalesAccount(mismatchedOrder)}.`;
}

function selectCreditOrdersForSettlement(orders = [], currentUser = {}) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return [];
  }

  // Helper to determine if order has outstanding balance
  const hasOutstandingBalance = (order) => {
    let balance = Number(order.balanceDue || 0);
    // For old bills that might not have balanceDue, calculate it
    if (balance <= 0) {
      const totalAmount = Number(order.totalAmount || 0);
      const amountPaid = Number(order.amountPaid || 0);
      balance = Math.max(0, totalAmount - amountPaid);
    }
    return balance > 0;
  };

  // Helper to check if order is credit type
  const isCreditOrder = (order) => {
    return order.paymentMethod === 'credit' || 
           order.status === 'partial' || 
           order.paymentStatus === 'partial' || 
           order.status === 'credit' || 
           order.paymentStatus === 'credit';
  };

  const activeOrders = orders
    .filter((order) => !order.reversed && hasOutstandingBalance(order) && isCreditOrder(order))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  if (isManagerOrOwnerUser(currentUser)) {
    console.debug('selectCreditOrdersForSettlement - manager/owner, returning all active orders in FIFO order:', activeOrders.map(o => ({ orderNumber: o.orderNumber, createdAt: o.createdAt })));
    return activeOrders;
  }

  const filtered = activeOrders.filter((order) => isOrderOwnedByUser(order, currentUser));
  console.debug('selectCreditOrdersForSettlement - sales user, returning owned orders in FIFO order:', filtered.map(o => ({ orderNumber: o.orderNumber, createdAt: o.createdAt })));
  return filtered;
}

async function recomputeCustomerCreditBalance(customerId, barId) {
  if (!customerId) {
    return 0;
  }

  const query = {
    customer: customerId,
    reversed: { $ne: true },
    paymentMethod: 'credit',
    balanceDue: { $gt: 0 }
  };
  if (barId) {
    query.barId = barId;
  }

  const creditOrders = await Order.find(query);
  const balance = (creditOrders || []).reduce((sum, order) => sum + Number(order.balanceDue || 0), 0);
  const customer = await Customer.findById(customerId);
  if (customer) {
    customer.creditBalance = balance;
    await customer.save();
  }

  return balance;
}

module.exports = {
  normalizePaymentAmount,
  calculateCreditBalance,
  getOrderSalesAccount,
  isOrderOwnedByUser,
  getSalesAccountMismatchMessage,
  selectCreditOrdersForSettlement,
  recomputeCustomerCreditBalance
};
