const PUBLIC_SITE_ORIGIN = 'https://www.smartbarmw.tech';

export const createCustomerReceiptAccessUrl = (token, usePublicOrigin = false) => {
  const origin = usePublicOrigin ? PUBLIC_SITE_ORIGIN : window.location.origin;
  return `${origin}/customer-receipt-access#token=${encodeURIComponent(token)}`;
};
