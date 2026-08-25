import { useEffect, useState } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import { formatPriceMK } from '../utils/formatPrice';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';

const CustomerPortal = () => {
  const { user } = useAuth();
  const [customer, setCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingBillRequest, setSubmittingBillRequest] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [orderItems, setOrderItems] = useState([{ productId: '', quantity: '1' }]);
  const [customerRequests, setCustomerRequests] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isCompact, setIsCompact] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const loadCustomer = async () => {
      if (!user?.customerId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [customerRes, productsRes, requestsRes] = await Promise.all([
          api.get(`/customers/${user.customerId}`),
          api.get('/products'),
          api.get('/customer-order-requests')
        ]);
        setCustomer(customerRes.data);
        setProducts(productsRes.data || []);
        setCustomerRequests((requestsRes.data || []).filter((request) => request.customerId === user.customerId));
      } catch (err) {
        console.error('Error loading customer portal:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCustomer();

    const handleRequestUpdate = () => {
      loadCustomer();
    };

    window.addEventListener('customer-request-updated', handleRequestUpdate);
    return () => {
      window.removeEventListener('customer-request-updated', handleRequestUpdate);
    };
  }, [refreshKey, user?.customerId]);

  useEffect(() => {
    const handleResize = () => setIsCompact(window.innerWidth < 640);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) {
    return (
      <PageContainer title="👤 My Account">
        <p>Loading your account...</p>
      </PageContainer>
    );
  }

  const unpaidCreditPurchases = customer?.creditSummary || [];
  const requestOutstandingBill = customerRequests
    .filter((request) => request.status === 'confirmed' && request.paymentStatus !== 'paid' && !request.linkedOrderId)
    .reduce((sum, request) => sum + Number(request.amountDue || request.totalAmount || 0), 0);
  const creditOutstandingBill = unpaidCreditPurchases.reduce((sum, purchase) => sum + Number(purchase.balanceDue || 0), 0);
  const outstandingBill = requestOutstandingBill + creditOutstandingBill;
  // Show requests in the account until they are fully paid; remove paid ones from the visible list
  const visibleRequests = (customerRequests || []).filter((r) => {
    const normalizedStatus = (r.paymentStatus || '').toLowerCase();
    const isPaid = normalizedStatus === 'paid';
    const isRejectedAndCleared = r.status === 'rejected' && Number(r.amountDue || 0) === 0;
    const isConfirmedCreditOrder = r.status === 'confirmed' && r.linkedOrderId;
    return !isPaid && !isRejectedAndCleared && !isConfirmedCreditOrder;
  });
  const hasOutstandingBill = outstandingBill > 0;
  const paymentMethods = [
    { value: 'cash', label: 'Cash' },
    { value: 'airtel_money', label: 'Airtel Money' },
    { value: 'mpamba', label: 'Mpamba' },
    { value: 'bank_account', label: 'Bank Account' }
  ];

  const paymentHint = paymentMethod === 'cash' ? 'No reference needed for cash payments.' : 'Add a receipt reference or payer name for this payment.';
  const responsiveStyles = isCompact
    ? {
        ...baseStyles,
        card: { ...baseStyles.card, padding: '14px', gap: '12px' },
        heroCard: { ...baseStyles.heroCard, padding: '14px', borderRadius: '14px' },
        sectionCard: { ...baseStyles.sectionCard, padding: '12px', borderRadius: '14px' },
        sectionHeader: { ...baseStyles.sectionHeader, marginBottom: '10px' },
        formRow: { ...baseStyles.formRow, gap: '8px' },
        paymentControls: { ...baseStyles.paymentControls, display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'flex-start', alignItems: 'stretch', width: '100%' },
        billBox: { ...baseStyles.billBox, padding: '12px 14px', gap: '10px', flexDirection: 'column', alignItems: 'flex-start' },
        requestStatusHeader: { ...baseStyles.requestStatusHeader, flexDirection: 'column', alignItems: 'flex-start' },
        requestStatusBody: { ...baseStyles.requestStatusBody, flexDirection: 'column', alignItems: 'flex-start' },
        purchaseHeader: { ...baseStyles.purchaseHeader, flexDirection: 'column', alignItems: 'flex-start' },
        purchaseFooter: { ...baseStyles.purchaseFooter, flexDirection: 'column', alignItems: 'flex-start' },
        orderRow: { ...baseStyles.orderRow, gridTemplateColumns: '1fr', alignItems: 'stretch' },
        quantityInput: { ...baseStyles.quantityInput, width: '100%', minHeight: '32px', padding: '6px 8px' },
        removeRowBtn: { ...baseStyles.removeRowBtn, width: '100%' },
        selectInput: { ...baseStyles.selectInput, width: '100%', maxWidth: '280px', margin: '0 auto', minHeight: '32px', padding: '6px 8px', fontSize: '13px' },
        referenceInput: { ...baseStyles.referenceInput, width: '100%', maxWidth: '280px', margin: '0 auto', minHeight: '32px', padding: '6px 8px', fontSize: '13px' },
        amountInput: { ...baseStyles.amountInput, width: '100%', maxWidth: '220px', margin: '0 auto', minHeight: '32px', padding: '6px 8px', fontSize: '13px' },
        listStack: { ...baseStyles.listStack, maxHeight: '360px', overflowY: 'auto' },
        purchaseCard: { ...baseStyles.purchaseCard, minWidth: 0 }
      }
    : {
      ...baseStyles,
      listStack: { ...baseStyles.listStack, gap: '12px' }
    };

  const emitCustomerPortalEvent = (type, detail = null) => {
    const eventDetail = { type, detail, timestamp: Date.now() };

    try {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch (error) {
      const ev = document.createEvent('Event');
      ev.initEvent(type, true, true);
      ev.detail = detail;
      window.dispatchEvent(ev);
    }

    try {
      const storageKey = 'customer-portal-event';
      localStorage.setItem(storageKey, JSON.stringify(eventDetail));
      setTimeout(() => localStorage.removeItem(storageKey), 500);
    } catch (error) {
      console.warn('Unable to persist customer portal event to localStorage:', error);
    }
  };

  const submitOrderRequest = async (e) => {
    e.preventDefault();
    const validItems = orderItems
      .map((item) => ({
        productId: item.productId,
        quantity: Math.max(1, Number(item.quantity) || 1)
      }))
      .filter((item) => item.productId);

    if (validItems.length === 0) {
      setRequestMessage('Please add at least one product to your order.');
      return;
    }

    setSubmitting(true);
    setRequestMessage('');

    try {
      const response = await api.post('/customer-order-requests', {
        customerId: user?.customerId,
        customerName: customer?.name || user?.fullName || user?.username,
        items: validItems
      });

      setRequestMessage(response.data?.message || 'Order request sent successfully.');
      setOrderItems([{ productId: '', quantity: '1' }]);
      emitCustomerPortalEvent('customer-request-updated');
      emitCustomerPortalEvent('customer-request-created', response.data?.request || null);
    } catch (err) {
      setRequestMessage(err.response?.data?.message || 'Could not send your order request.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatPaymentAmountInput = (value) => {
    const cleaned = String(value || '').replace(/,/g, '');
    const numberValue = Number(cleaned);
    if (!Number.isFinite(numberValue)) {
      return cleaned;
    }
    return numberValue.toLocaleString('en-US', {
      minimumFractionDigits: cleaned.includes('.') ? 0 : 0,
      maximumFractionDigits: 2
    });
  };

  const payAccumulatedBill = async () => {
    if (outstandingBill <= 0) {
      setRequestMessage('You do not have any outstanding bill to pay.');
      return;
    }

    const paymentAmountNumber = Number(String(paymentAmount || '').replace(/,/g, ''));

    if (!Number.isFinite(paymentAmountNumber) || paymentAmountNumber <= 0) {
      setRequestMessage('Payment amount must be greater than zero.');
      return;
    }

    if (paymentAmountNumber > outstandingBill) {
      setRequestMessage(`Amount cannot exceed outstanding bill of ${formatPriceMK(outstandingBill)}.`);
      return;
    }

    if (paymentMethod !== 'cash' && !paymentReference.trim()) {
      setRequestMessage('Please enter a transaction reference or payer name for this payment method.');
      return;
    }

    setSubmittingBillRequest(true);
    setRequestMessage('');

    try {
      const response = await api.post('/customer-order-requests/pay-bill', {
        customerId: user?.customerId,
        paymentMethod,
        paymentReference: paymentReference.trim(),
        amount: paymentAmountNumber
      });
      setRequestMessage(response.data?.message || 'Accumulated bill request submitted successfully.');
      setPaymentMethod('cash');
      setPaymentReference('');
      setPaymentAmount('');
      const paymentRequest = response.data?.paymentRequest || response.data;
      emitCustomerPortalEvent('customer-request-updated');
      emitCustomerPortalEvent('customer-payment-created', paymentRequest);
    } catch (err) {
      setRequestMessage(err.response?.data?.message || 'Could not submit your payment request.');
    } finally {
      setSubmittingBillRequest(false);
    }
  };

  return (
    <PageContainer title="👤 My Account">
      <div style={responsiveStyles.card}>
        <div style={responsiveStyles.heroCard}>
          <div>
            <div style={responsiveStyles.eyebrow}>Customer portal</div>
            <h2 style={responsiveStyles.title}>{customer?.name || user?.fullName || user?.username}</h2>
            <p style={responsiveStyles.subtitle}>Your orders, credit balance, and payment activity all in one place.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </Button>
          <div style={responsiveStyles.heroStats}>
            <div style={responsiveStyles.heroStatBox}>
              <span style={responsiveStyles.heroStatLabel}>Loyalty</span>
              <strong style={responsiveStyles.heroStatValue}>{customer?.loyaltyPoints || 0}</strong>
            </div>
            <div style={responsiveStyles.heroStatBox}>
              <span style={responsiveStyles.heroStatLabel}>Credit balance</span>
              <strong style={responsiveStyles.heroStatValue}>{formatPriceMK(customer?.creditBalance || 0)}</strong>
            </div>
          </div>
        </div>

        <div style={responsiveStyles.sectionCard}>
          <div style={responsiveStyles.sectionHeader}>
            <div>
              <div style={responsiveStyles.sectionTitle}>Request products</div>
              <p style={responsiveStyles.helperText}>Pick your items and send them for review. You can settle the accumulated bill later.</p>
            </div>
            <span style={{ ...responsiveStyles.pill, ...(hasOutstandingBill ? responsiveStyles.pillWarn : responsiveStyles.pillSuccess) }}>
              {hasOutstandingBill ? 'Bill due' : 'All clear'}
            </span>
          </div>

          <form onSubmit={submitOrderRequest} style={responsiveStyles.requestForm}>
            <div style={responsiveStyles.orderList}>
              {orderItems.map((item, index) => (
                <div key={index} style={responsiveStyles.orderRow}>
                  <select
                    style={responsiveStyles.selectInput}
                    value={item.productId}
                    onChange={(e) => setOrderItems((prev) => prev.map((row, rowIndex) => (
                      rowIndex === index
                        ? { ...row, productId: e.target.value }
                        : row
                    )))}
                  >
                    <option value="">Select a product</option>
                    {products.map((product) => (
                      <option key={product._id} value={product._id}>
                        {product.name} - {formatPriceMK(product.sellingPrice)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => setOrderItems((prev) => prev.map((row, rowIndex) => (
                      rowIndex === index
                        ? { ...row, quantity: e.target.value }
                        : row
                    )))}
                    style={responsiveStyles.quantityInput}
                  />
                  {orderItems.length > 1 && (
                    <button
                      type="button"
                      style={responsiveStyles.removeRowBtn}
                      onClick={() => setOrderItems((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              style={responsiveStyles.addRowBtn}
              onClick={() => setOrderItems((prev) => [...prev, { productId: '', quantity: '1' }])}
            >
              + Add another item
            </button>
            <div style={responsiveStyles.formActions}>
              <Button type="submit" disabled={submitting || orderItems.every((item) => !item.productId)}>
                {submitting ? 'Sending...' : 'Submit Order'}
              </Button>
            </div>
          </form>
          {requestMessage && <div style={responsiveStyles.requestMessage}>{requestMessage}</div>}
        </div>

        <div style={responsiveStyles.sectionCard}>
          <div style={responsiveStyles.sectionHeader}>
            <div>
              <div style={responsiveStyles.sectionTitle}>My order requests</div>
              <p style={responsiveStyles.helperText}>Track what you submitted and the current payment state of each request.</p>
            </div>
          </div>
          {visibleRequests.length > 0 ? (
            <div style={responsiveStyles.listStack}>
              {visibleRequests.map((request) => (
                <div key={request._id} style={responsiveStyles.requestStatusCard}>
                  <div style={responsiveStyles.requestStatusHeader}>
                    <span style={responsiveStyles.requestTitle}>{request.productName || 'Order'}</span>
                    <span style={{ ...responsiveStyles.statusBadge, ...(request.status === 'confirmed' ? responsiveStyles.confirmed : request.status === 'rejected' ? responsiveStyles.rejected : responsiveStyles.pending) }}>
                      {request.status === 'confirmed' ? 'Confirmed' : request.status === 'rejected' ? 'Rejected' : 'Pending'}
                    </span>
                  </div>
                  {request.items?.length > 0 ? (
                    <div style={responsiveStyles.requestItemsList}>
                      {request.items.map((item, index) => (
                        <div key={`${request._id}-${index}`} style={responsiveStyles.requestItemRow}>
                          <span>{item.productName || 'Product'}</span>
                          <span>x{item.quantity || 1}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={responsiveStyles.requestStatusBody}>
                      <span>Qty: {request.quantity || 1}</span>
                      <span>Amount: {formatPriceMK(request.totalAmount || 0)}</span>
                    </div>
                  )}
                    <div style={responsiveStyles.requestStatusBody}>
                    <span>Payment: {request.status === 'rejected' ? 'Cancelled' : request.paymentStatus === 'paid' ? 'Paid' : request.paymentStatus === 'partial' ? 'Partially paid' : 'Pending'}</span>
                    <span>Paid: {formatPriceMK(request.amountPaid || 0)}</span>
                    <span>Due: {formatPriceMK(request.amountDue || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={responsiveStyles.emptyBox}>You have no order requests yet.</div>
          )}
        </div>

        <div style={responsiveStyles.sectionCard}>
          <div style={responsiveStyles.sectionHeader}>
            <div>
              <div style={responsiveStyles.sectionTitle}>Accumulated bill</div>
              <p style={responsiveStyles.helperText}>Pay the amount that has built up from your confirmed orders.</p>
            </div>
          </div>
          <div style={responsiveStyles.billBox}>
            <div>
              <div style={responsiveStyles.summaryLabel}>Payable now</div>
              <div style={responsiveStyles.summaryValue}>{formatPriceMK(outstandingBill)}</div>
            </div>
            <div style={responsiveStyles.paymentControls}>
              <div style={baseStyles.paymentRadios}>
                {paymentMethods.map((method) => (
                  <label
                    key={method.value}
                    style={{
                      ...baseStyles.radioLabel,
                      ...(paymentMethod === method.value ? baseStyles.radioLabelActive : {})
                    }}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.value}
                      checked={paymentMethod === method.value}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      style={baseStyles.radioInput}
                    />
                    {method.label}
                  </label>
                ))}
              </div>
              <input
                type="text"
                inputMode="decimal"
                style={{ ...baseStyles.quantityInput, textAlign: 'right', width: '100%' }}
                placeholder={outstandingBill > 0 ? `Amount (max ${formatPriceMK(outstandingBill)})` : 'Amount'}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                onBlur={(e) => setPaymentAmount(formatPaymentAmountInput(e.target.value))}
                onFocus={(e) => setPaymentAmount(String(e.target.value).replace(/,/g, ''))}
              />
              <input
                type="text"
                style={{ ...baseStyles.quantityInput, width: '100%' }}
                placeholder={paymentMethod === 'cash' ? 'No reference needed' : 'Reference or payer name'}
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
              <Button fullWidth={isCompact} onClick={payAccumulatedBill} disabled={submittingBillRequest || outstandingBill <= 0}>
                {submittingBillRequest ? 'Submitting request...' : 'Submit Request'}
              </Button>
            </div>
          </div>
          <div style={responsiveStyles.helperText}>{paymentHint}</div>
        </div>

        <div style={responsiveStyles.sectionCard}>
          <div style={responsiveStyles.sectionHeader}>
            <div>
              <div style={responsiveStyles.sectionTitle}>Unpaid credit purchases</div>
              <p style={responsiveStyles.helperText}>A simple view of the purchases still outstanding on your account.</p>
            </div>
          </div>
          {unpaidCreditPurchases.length > 0 ? (
            <div style={responsiveStyles.listStack}>
              {unpaidCreditPurchases.map((entry) => (
                <div key={entry._id} style={responsiveStyles.purchaseCard}>
                  <div style={responsiveStyles.purchaseHeader}>
                    <span style={responsiveStyles.orderNumber}>{entry.orderNumber}</span>
                    <span style={responsiveStyles.date}>{entry.date || '—'}</span>
                  </div>
                  <div style={responsiveStyles.purchaseBody}>
                    {entry.products.map((product, index) => (
                      <div key={`${entry._id}-${index}`} style={responsiveStyles.productRow}>
                        <span>{product.name}</span>
                        <span>x{product.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <div style={responsiveStyles.purchaseFooter}>
                    <span>Balance: {formatPriceMK(entry.balanceDue || 0)}</span>
                    <span>Paid: {formatPriceMK(entry.amountPaid || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={responsiveStyles.emptyBox}>You have no unpaid credit purchases at the moment.</div>
          )}
        </div>

        <div style={responsiveStyles.accountFooterNote}>
          Apply on www.smartbarmw.tech to start using Smart Bar on your bar.
        </div>
      </div>
    </PageContainer>
  );
};

const baseStyles = {
  card: {
    backgroundColor: 'white',
    borderRadius: '20px',
    padding: '24px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  heroCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    padding: '18px 20px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #fff5f5 0%, #fffaf5 100%)',
    border: '1px solid #f7d6dc'
  },
  eyebrow: {
    display: 'inline-block',
    marginBottom: '6px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#b91c1c'
  },
  title: {
    margin: 0,
    color: '#1f2937',
    fontSize: '24px'
  },
  subtitle: {
    margin: '4px 0 0',
    color: '#6b7280',
    maxWidth: '560px'
  },
  heroStats: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap'
  },
  heroStatBox: {
    minWidth: '142px',
    padding: '10px 12px',
    borderRadius: '12px',
    backgroundColor: 'white',
    border: '1px solid #f4d6dc'
  },
  heroStatLabel: {
    display: 'block',
    fontSize: '11px',
    color: '#7f1d1d',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  heroStatValue: {
    display: 'block',
    marginTop: '4px',
    fontSize: '18px',
    color: '#b91c1c'
  },
  sectionCard: {
    border: '1px solid #f3e2e6',
    borderRadius: '16px',
    padding: '16px',
    backgroundColor: '#fcfcfd'
  },
  accountFooterNote: {
    marginTop: '4px',
    textAlign: 'center',
    fontSize: '12px',
    color: '#7f1d1d',
    fontWeight: '600'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '12px',
    flexWrap: 'wrap'
  },
  helperText: {
    margin: '3px 0 0',
    fontSize: '13px',
    color: '#6b7280'
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700'
  },
  pillWarn: {
    backgroundColor: '#fef3c7',
    color: '#92400e'
  },
  pillSuccess: {
    backgroundColor: '#dcfce7',
    color: '#166534'
  },
  summaryLabel: {
    fontSize: '13px',
    color: '#7f1d1d'
  },
  summaryValue: {
    marginTop: '6px',
    fontSize: '22px',
    fontWeight: '700',
    color: '#b91c1c'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1f2937'
  },
  requestForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  orderList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  orderRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 1.6fr) 0.9fr 0.5fr',
    gap: '10px',
    alignItems: 'center'
  },
  removeRowBtn: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    borderRadius: '10px',
    padding: '10px 12px',
    cursor: 'pointer'
  },
  addRowBtn: {
    backgroundColor: '#e5e7eb',
    border: '1px solid #d1d5db',
    color: '#1f2937',
    borderRadius: '10px',
    padding: '10px 14px',
    cursor: 'pointer',
    marginBottom: '14px'
  },
  formRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  selectInput: {
    flex: '1 1 220px',
    width: '100%',
    maxWidth: '280px',
    minHeight: '36px',
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    color: '#111827',
    fontSize: '13px',
    lineHeight: '1.2',
    boxSizing: 'border-box'
  },
  quantityInput: {
    width: '90px',
    minHeight: '36px',
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    color: '#111827',
    fontSize: '13px',
    lineHeight: '1.2'
  },
  amountInput: {
    flex: '1 1 180px',
    width: '100%',
    maxWidth: '220px',
    minHeight: '36px',
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    color: '#111827',
    fontSize: '13px',
    textAlign: 'right',
    boxSizing: 'border-box'
  },
  referenceInput: {
    flex: '1 1 220px',
    width: '100%',
    maxWidth: '280px',
    minHeight: '36px',
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    color: '#111827',
    fontSize: '13px',
    boxSizing: 'border-box'
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end'
  },
  requestMessage: {
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: '13px'
  },
  listStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  requestStatusCard: {
    border: '1px solid #f4d6dc',
    borderRadius: '12px',
    padding: '12px',
    backgroundColor: '#fff9fa',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  requestStatusHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px'
  },
  requestTitle: {
    fontWeight: '700',
    color: '#1f2937'
  },
  requestStatusBody: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '13px',
    color: '#4b5563'
  },
  requestItemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '13px',
    color: '#4b5563'
  },
  requestItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px'
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700'
  },
  confirmed: {
    backgroundColor: '#dcfce7',
    color: '#166534'
  },
  rejected: {
    backgroundColor: '#fee2e2',
    color: '#991b1b'
  },
  pending: {
    backgroundColor: '#fef3c7',
    color: '#92400e'
  },
  billBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    border: '1px solid #f4d6dc',
    borderRadius: '12px',
    padding: '14px 16px',
    backgroundColor: '#fff9fa'
  },
  paymentControls: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))',
    gap: '10px',
    alignItems: 'center',
    width: '100%'
  },
  paymentRadios: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%'
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #f4d6dc',
    backgroundColor: '#fff',
    fontSize: '13px',
    color: '#4b5563',
    cursor: 'pointer'
  },
  radioLabelActive: {
    backgroundColor: '#fff5f5',
    borderColor: '#e94560',
    color: '#b91c1c'
  },
  radioInput: {
    accentColor: '#e94560',
    margin: 0
  },
  purchaseCard: {
    border: '1px solid #f4d6dc',
    borderRadius: '12px',
    padding: '12px',
    backgroundColor: '#fff9fa'
  },
  purchaseHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '6px'
  },
  orderNumber: {
    fontWeight: '700',
    color: '#1a1a2e'
  },
  date: {
    fontSize: '12px',
    color: '#6b7280'
  },
  purchaseBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '8px'
  },
  productRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#4b5563'
  },
  purchaseFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '12px',
    color: '#7f1d1d'
  },
  mobileResponsiveControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%'
  },
  mobileInlineGroup: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap'
  },
  emptyBox: {
    padding: '16px',
    borderRadius: '10px',
    backgroundColor: '#f8fafc',
    color: '#6b7280',
    textAlign: 'center'
  }
};

export default CustomerPortal;
