const getPaymentCustomerId = (user, requestedCustomerId) => (
  user?.role === 'customer'
    ? user.customerId || null
    : requestedCustomerId || null
);

module.exports = { getPaymentCustomerId };