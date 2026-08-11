import { useCallback, useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import PageContainer from './PageContainer';
import { formatPriceMK } from '../utils/formatPrice';

const paymentTypeOptions = [
  { value: 'all', label: 'All requests' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'reversed', label: 'Reversed' }
];

const paymentMethodLabels = {
  cash: 'Cash',
  airtel_money: 'Airtel Money',
  mpamba: 'Mpamba',
  bank_account: 'Bank Account',
  credit: 'Credit'
};

const PaymentHistory = () => {
  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const canManagePayments = ['owner', 'sales', 'manager'].includes(user?.role) && Boolean(user?.barId);
  const PAGE_SIZE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, customerFilter, payments]);

  useEffect(() => {
    const loadPayments = async () => {
      try {
        const res = await api.get('/customer-order-requests/payments', { params: { summary: true } });
        const data = res.data || {};
        setPayments(Array.isArray(data.payments) ? data.payments : []);
      } catch (err) {
        console.error('Failed to load payments', err);
      } finally {
        setLoading(false);
      }
    };

    loadPayments();
  }, []);

  const customerOptions = useMemo(() => {
    const names = new Set((payments || []).map((entry) => entry.customerName || 'Walk-in customer'));
    return Array.from(names).sort();
  }, [payments]);

  const filteredPayments = useMemo(() => {
    return (payments || [])
      .filter((entry) => {
        const matchesStatus = filter === 'all' ? true : entry.status === filter;
        const matchesCustomer = customerFilter === 'all' ? true : (entry.customerName || 'Walk-in customer') === customerFilter;
        return matchesStatus && matchesCustomer;
      });
  }, [customerFilter, filter, payments]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const paginatedPayments = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredPayments.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredPayments]);

  const formatMethodLabel = useCallback((method) => {
    const key = String(method || 'cash').toLowerCase();
    return paymentMethodLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }, []);

  const groupPaymentsByMethod = useCallback((paymentItems = []) => {
    const aggregates = paymentItems.reduce((acc, payment) => {
      const amount = Number(payment.amount || 0);
      if (amount <= 0) return acc;
      const method = formatMethodLabel(payment.paymentMethod || 'cash');
      acc[method] = (acc[method] || 0) + amount;
      return acc;
    }, {});

    return Object.keys(aggregates)
      .map((method) => ({ method, amount: aggregates[method] }))
      .sort((a, b) => b.amount - a.amount);
  }, [formatMethodLabel]);

  const summaryCards = useMemo(() => {
    const totals = {
      pending: 0,
      confirmed: 0,
      rejected: 0,
      reversed: 0
    };

    (filteredPayments || []).forEach((entry) => {
      const status = entry.status || 'pending';
      if (totals[status] !== undefined) {
        totals[status] += Number(entry.amount || entry.amountRequested || entry.amountApplied || 0);
      }
    });

    return [
      { label: 'Pending requests', value: totals.pending, color: '#e94560' },
      { label: 'Confirmed payments', value: totals.confirmed, color: '#3498db' },
      { label: 'Rejected requests', value: totals.rejected, color: '#2ecc71' },
      { label: 'Reversed payments', value: totals.reversed, color: '#f39c12' }
    ];
  }, [filteredPayments]);

  const directSalesByMethod = useMemo(() => {
    return groupPaymentsByMethod(payments.filter((entry) => entry.source === 'pos_sale'));
  }, [payments, groupPaymentsByMethod]);

  const billManagementPaidByMethod = useMemo(() => {
    return groupPaymentsByMethod(payments.filter((entry) => entry.source === 'bill_settlement' && entry.status === 'confirmed'));
  }, [payments, groupPaymentsByMethod]);

  const outstandingCreditAmount = useMemo(() => {
    return payments
      .filter((entry) => entry.source === 'bill_settlement' && entry.status === 'pending')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  }, [payments]);

  const handlePaymentAction = async (entry, action) => {
    if (!window.confirm(`Are you sure you want to ${action} this payment request?`)) return;

    let payload = {};
    if (['confirm', 'reject', 'reverse'].includes(action)) {
      const password = window.prompt('Enter the current sales account password to continue:');
      if (!password) {
        return;
      }
      payload.password = password;
    }

    try {
      const res = await api.patch(`/customer-order-requests/payments/${entry._id}/${action}`, payload);
      setPayments((prev) => prev.map((item) => (item._id === entry._id ? res.data.paymentRequest || res.data : item)));
      window.dispatchEvent(new Event('payment-updated'));
    } catch (err) {
      console.error(`Failed to ${action} payment`, err);
      alert(err.response?.data?.message || `Failed to ${action} payment request`);
    }
  };

  const handleExport = () => {
    const rows = filteredPayments.map((entry) => ({
      customer: entry.customerName || 'Walk-in customer',
      source: entry.source || (entry.recordType === 'order_payment' ? 'POS sale' : 'Bill settlement'),
      amount: Number(entry.amount || entry.amountRequested || entry.amountApplied || 0),
      paymentMethod: entry.paymentMethod || 'cash',
      status: entry.status || 'pending',
      reference: entry.reference || entry.paymentReference || '—',
      approvedBy: entry.approvedBy || entry.processedByName || entry.approvedByName || '—',
      date: entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'
    }));

    const csv = [
      ['Customer', 'Amount', 'Payment Method', 'Status', 'Reference', 'Approved By', 'Date'],
      ...rows.map((row) => [row.customer, row.amount, row.paymentMethod, row.status, row.reference, row.approvedBy, row.date])
    ]
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, 'payment-history.csv');
  };

  return (
    <PageContainer title="💳 Payment History">
      <div style={styles.card}>
        <div style={styles.toolbar}>
          <div>
            <h3 style={styles.title}>Settlement history</h3>
            <p style={styles.subtitle}>Track all payments, approvals and references in one place.</p>
          </div>
          <div style={styles.filterRow}>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={styles.select}>
              {paymentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} style={styles.select}>
              <option value="all">All customers</option>
              {customerOptions.map((customer) => (
                <option key={customer} value={customer}>{customer}</option>
              ))}
            </select>
            <button type="button" onClick={handleExport} style={styles.exportBtn}>Export Excel</button>
          </div>
        </div>

        <div style={styles.summaryGrid}>
          {summaryCards.map((card) => (
            <div key={card.label} style={{ ...styles.summaryCard, borderColor: card.color }}>
              <div style={{ ...styles.summaryDot, backgroundColor: card.color }} />
              <div>
                <div style={styles.summaryLabel}>{card.label}</div>
                <div style={styles.summaryValue}>{formatPriceMK(card.value)}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={styles.methodSummaryCard}>
          <div style={styles.methodSummaryHeader}>
            <div style={styles.methodSummaryTitle}>💳 Sales Proceeds Summary</div>
            <div style={styles.methodSummarySub}>Direct sales, confirmed bill settlements, and outstanding credit balances.</div>
          </div>
          <div style={styles.methodSummaryBody}>
            <div style={styles.methodSummarySection}>
              <div style={styles.methodSummarySectionTitle}>Direct sales by method</div>
              {(directSalesByMethod.length > 0 ? directSalesByMethod : [{ method: 'No direct sales yet', amount: 0 }]).map((item) => (
                <div key={item.method} style={styles.methodSummaryRow}>
                  <span>{item.method}</span>
                  <strong>{formatPriceMK(item.amount)}</strong>
                </div>
              ))}
            </div>

            <div style={styles.methodSummarySection}>
              <div style={styles.methodSummarySectionTitle}>Bill management paid by method</div>
              {(billManagementPaidByMethod.length > 0 ? billManagementPaidByMethod : [{ method: 'No paid settlements yet', amount: 0 }]).map((item) => (
                <div key={item.method} style={styles.methodSummaryRow}>
                  <span>{item.method}</span>
                  <strong>{formatPriceMK(item.amount)}</strong>
                </div>
              ))}
            </div>

            <div style={styles.methodSummarySection}>
              <div style={styles.methodSummarySectionTitle}>Outstanding credit</div>
              <div style={styles.methodSummaryRow}>
                <span>Total pending bill amount</span>
                <strong>{formatPriceMK(outstandingCreditAmount)}</strong>
              </div>
            </div>
          </div>
        </div>
        {loading ? (
          <p>Loading payments...</p>
        ) : filteredPayments.length === 0 ? (
          <p style={styles.empty}>No payment records found.</p>
        ) : (
          <>
            <div style={styles.list}>
              {paginatedPayments.map((entry) => (
                <div key={entry._id} style={styles.item}>
                  <div style={styles.row}>
                    <div>
                      <div style={styles.customerName}>{entry.customerName || 'Walk-in customer'}</div>
                      <div style={styles.meta}>Method: {entry.paymentMethod || 'cash'}</div>
                    </div>
                    <div style={styles.amount}>{formatPriceMK(entry.amount || entry.amountRequested || entry.amountApplied || 0)}</div>
                  </div>
                  <div style={styles.row}>
                    <div style={styles.meta}>Type: {entry.source === 'pos_sale' ? 'POS sale' : entry.source === 'bill_settlement' ? 'Bill settlement' : 'Account payment'}</div>
                    <div style={styles.meta}>Processed by: {entry.approvedBy || entry.processedByName || entry.approvedByName || '—'}</div>
                  </div>
                  <div style={styles.row}>
                    <div style={styles.meta}>{entry.reference || 'No reference provided'}</div>
                    <div style={styles.meta}>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</div>
                  </div>
                  {canManagePayments && entry.source === 'bill_settlement' && entry.status === 'pending' && (
                    <div style={styles.actionsRow}>
                      <button type="button" onClick={() => handlePaymentAction(entry, 'confirm')} style={styles.confirmBtn}>Confirm</button>
                      <button type="button" onClick={() => handlePaymentAction(entry, 'reject')} style={styles.rejectBtn}>Reject</button>
                    </div>
                  )}
                  {canManagePayments && entry.source === 'bill_settlement' && entry.status === 'confirmed' && (
                    <div style={styles.actionsRow}>
                      <button type="button" onClick={() => handlePaymentAction(entry, 'reverse')} style={styles.reverseBtn}>Reverse</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={styles.pagination}>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{
                  ...styles.pageBtn,
                  ...(currentPage === 1 ? styles.pageBtnDisabled : {})
                }}
              >
                Previous
              </button>
              <span style={styles.pageInfo}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={{
                  ...styles.pageBtn,
                  ...(currentPage === totalPages ? styles.pageBtnDisabled : {})
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
};

const styles = {
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap'
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '18px',
    color: '#111827'
  },
  subtitle: {
    margin: 0,
    color: '#6b7280',
    fontSize: '13px'
  },
  filterRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  select: {
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    minWidth: '220px'
  },
  exportBtn: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    fontWeight: '700',
    cursor: 'pointer'
  },
  reverseBtn: {
    padding: '8px 12px',
    borderRadius: '10px',
    border: '1px solid #f59e0b',
    backgroundColor: '#fff7ed',
    color: '#b45309',
    fontWeight: '700',
    cursor: 'pointer'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    marginBottom: '16px'
  },
  summaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#fafafa'
  },
  summaryDot: {
    width: '10px',
    height: '10px',
    borderRadius: '999px'
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#6b7280'
  },
  summaryValue: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#111827'
  },
  methodSummaryCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    padding: '16px',
    backgroundColor: '#ffffff',
    marginBottom: '16px'
  },
  methodSummaryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px'
  },
  methodSummaryTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#111827'
  },
  methodSummarySub: {
    fontSize: '13px',
    color: '#6b7280',
    lineHeight: 1.4
  },
  methodSummaryBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px'
  },
  methodSummarySection: {
    display: 'grid',
    gap: '10px'
  },
  methodSummarySectionTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#111827',
    marginBottom: '8px'
  },
  methodSummaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: '#f8fafc'
  },
  methodSummaryFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid #e5e7eb'
  },
  methodSummaryTotalLabel: {
    fontSize: '14px',
    color: '#6b7280'
  },
  methodSummaryTotalValue: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#111827'
  },
  actionsRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '12px'
  },
  confirmBtn: {
    padding: '8px 14px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#2ecc71',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '700'
  },
  rejectBtn: {
    padding: '8px 14px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '700'
  },
  empty: {
    color: '#6b7280',
    margin: 0
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  item: {
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '12px 14px',
    backgroundColor: '#fafafa'
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '6px'
  },
  customerName: {
    fontWeight: '700',
    color: '#111827'
  },
  meta: {
    fontSize: '13px',
    color: '#6b7280'
  },
  amount: {
    fontWeight: '700',
    color: '#e94560'
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginTop: '18px'
  },
  pageBtn: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#111827',
    cursor: 'pointer',
    fontWeight: '700'
  },
  pageBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  pageInfo: {
    fontWeight: '700',
    color: '#111827'
  }
};

export default PaymentHistory;
