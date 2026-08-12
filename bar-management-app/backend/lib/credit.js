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
    order.processedBy ||
    order.paymentProcessedBy ||
    order.salesAccount ||
    'Sales account'
  ).trim();

  return candidate || 'Sales account';
}

function selectCreditOrdersForSettlement(orders = [], currentUser = {}) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return [];
  }

  const currentSalesAccountId = String(currentUser?._id || currentUser?.id || '').trim();
  const currentSalesAccountName = String(currentUser?.fullName || currentUser?.username || currentUser?.email || '').trim();

  const eligibleOrders = orders
    .filter((order) => !order.reversed && Number(order.balanceDue || 0) > 0 && (order.paymentMethod === 'credit' || order.paymentStatus === 'partial' || order.paymentStatus === 'credit'))
    .filter((order) => {
      const orderSalesAccountId = String(order.processedBy || order.paymentProcessedBy || '').trim();
      const orderSalesAccountName = getOrderSalesAccount(order);

      if (!currentSalesAccountId && !currentSalesAccountName) {
        return true;
      }

      return (
        (!currentSalesAccountId || orderSalesAccountId === currentSalesAccountId) &&
        (!currentSalesAccountName || orderSalesAccountName === currentSalesAccountName || orderSalesAccountName === 'Sales account')
      );
    })
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  return eligibleOrders;
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
  selectCreditOrdersForSettlement,
  recomputeCustomerCreditBalance
};
