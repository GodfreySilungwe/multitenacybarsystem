function getSubscriptionGraceNotice(subscription, now = new Date()) {
  if (!subscription?.paidThrough || !subscription?.graceEndsAt) {
    return null;
  }

  const paidThrough = new Date(subscription.paidThrough);
  const graceEndsAt = new Date(subscription.graceEndsAt);
  const currentTime = new Date(now);

  if (
    Number.isNaN(paidThrough.getTime())
    || Number.isNaN(graceEndsAt.getTime())
    || Number.isNaN(currentTime.getTime())
    || currentTime <= paidThrough
    || currentTime > graceEndsAt
  ) {
    return null;
  }

  return {
    paidThrough: paidThrough.toISOString(),
    graceEndsAt: graceEndsAt.toISOString()
  };
}

module.exports = { getSubscriptionGraceNotice };
