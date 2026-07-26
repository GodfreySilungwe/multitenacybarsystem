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

async function recomputeCustomerCreditBalance(customerId) {
  if (!customerId) {
    return 0;
  }

  const creditOrders = await Order.find({
    customer: customerId,
    reversed: { $ne: true },
    paymentMethod: 'credit',
    balanceDue: { $gt: 0 }
  });

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
  recomputeCustomerCreditBalance
};
