function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function summarizeCreditSettlements(settlements = []) {
  const byMethod = {
    cash: 0,
    airtel_money: 0,
    mpamba: 0,
    bank_account: 0
  };

  let totalAmount = 0;

  for (const settlement of settlements || []) {
    if (!settlement || settlement.status === 'cancelled') {
      continue;
    }

    const amount = normalizeAmount(settlement.amount);
    if (!amount) {
      continue;
    }

    totalAmount += amount;
    const method = ['cash', 'airtel_money', 'mpamba', 'bank_account'].includes(settlement.paymentMethod)
      ? settlement.paymentMethod
      : 'cash';
    byMethod[method] = (byMethod[method] || 0) + amount;
  }

  return {
    totalAmount,
    byMethod
  };
}

module.exports = {
  normalizeAmount,
  summarizeCreditSettlements
};
