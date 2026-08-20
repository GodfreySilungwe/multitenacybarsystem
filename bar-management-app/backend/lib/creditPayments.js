function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function getInitialCreditPayment(order = {}) {
  const amount = normalizeAmount(order.initialAmountPaid);
  const paymentMethod = String(order.initialPaymentMethod || 'cash').toLowerCase();

  return {
    amount,
    paymentMethod: paymentMethod === 'cash' ? 'credit_cash' : `credit_${paymentMethod}`
  };
}

function summarizeCreditPaymentEvents(order, settlements = []) {
  const summary = {
    credit_cash: 0,
    credit_airtel_money: 0,
    credit_mpamba: 0,
    credit_bank_account: 0
  };

  const initialPayment = getInitialCreditPayment(order);
  if (initialPayment.amount > 0 && summary[initialPayment.paymentMethod] !== undefined) {
    summary[initialPayment.paymentMethod] += initialPayment.amount;
  }

  for (const settlement of settlements || []) {
    if (!settlement || ['cancelled', 'rejected', 'reversed'].includes(settlement.status)) {
      continue;
    }

    const amount = normalizeAmount(settlement.amountApplied ?? settlement.amountRequested ?? settlement.amount);
    const rawMethod = String(settlement.creditPaymentMethod || settlement.paymentMethod || 'cash').toLowerCase();
    const paymentMethod = rawMethod.startsWith('credit_') ? rawMethod : `credit_${rawMethod}`;
    if (amount > 0 && summary[paymentMethod] !== undefined) {
      summary[paymentMethod] += amount;
    }
  }

  return summary;
}

module.exports = {
  getInitialCreditPayment,
  summarizeCreditPaymentEvents
};
