import { useState, useEffect } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import PageContainer from './PageContainer';
import Button from '../components/common/Button';
import UnifiedCard from '../components/common/UnifiedCard';
import { formatPriceMK } from '../utils/formatPrice';
import { confirmTypedDelete } from '../utils/confirmation';

const Customers = () => {
  const { user: currentUser } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [nextKey, setNextKey] = useState(null);
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    customersWithCredit: 0,
    totalCreditOutstanding: 0,
    topCreditAccounts: []
  });
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [settleAmounts, setSettleAmounts] = useState({});
  const [settleMethods, setSettleMethods] = useState({});
  const [settleReferences, setSettleReferences] = useState({});
  const [settleLoading, setSettleLoading] = useState({});
  const [settlements, setSettlements] = useState([]);
  const [settlementConfirmation, setSettlementConfirmation] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    gender: 'Male',
    creditBalance: '0'
  });

  useEffect(() => {
    loadCustomers({ reset: true });
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      loadCustomers({ reset: true });
    };

    window.addEventListener('payment-updated', handleRefresh);
    return () => window.removeEventListener('payment-updated', handleRefresh);
  }, []);

  const loadCustomers = async ({ reset = false, lastKey = null } = {}) => {
    const loadingStartedAt = Date.now();

    try {
      setLoadError('');
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params = {
        limit: 5
      };

      if (!reset && lastKey) {
        params.lastKey = lastKey;
      }

      const customersRes = await api.get('/customers', { params });
      const customersData = customersRes.data || {};
      const items = Array.isArray(customersData) ? customersData : customersData.items || [];

      setCustomers((prev) => (reset ? items : [...prev, ...items]));
      setNextKey(customersData.nextKey || null);
      setHasMore(Boolean(customersData.nextKey));
      if (reset) {
        setLoading(false);
      }

      const [summaryResult, paymentsResult] = await Promise.allSettled([
        api.get('/customers/summary'),
        api.get('/customer-order-requests/payments')
      ]);

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value.data || summary);
      }
      if (paymentsResult.status === 'fulfilled') {
        const paymentsData = paymentsResult.value.data || [];
        const paymentRecords = Array.isArray(paymentsData) ? paymentsData : (paymentsData.payments || []);
        setSettlements(paymentRecords);
      }
    } catch (err) {
      console.error('Error loading customers:', err);
      setLoadError(err.response?.data?.message || 'Could not load customers. Please try again.');
    } finally {
      if (reset) {
        const remainingLoadingTime = 1000 - (Date.now() - loadingStartedAt);
        if (remainingLoadingTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingLoadingTime));
        }
      }
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreCustomers = async () => {
    if (!nextKey) return;
    await loadCustomers({ reset: false, lastKey: nextKey });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer._id}`, formData);
      } else {
        const response = await api.post('/customers', {
          ...formData,
          password: `${formData.phone}${Math.floor(Math.random() * 90 + 10)}`
        });
        if (response.data?.credentials) {
          alert(`Customer account created. Username: ${response.data.credentials.username} Password: ${response.data.credentials.password}`);
        }
      }
      setShowForm(false);
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', gender: 'Male', creditBalance: '0' });
      await loadCustomers({ reset: true });
    } catch (err) {
      console.error('Error saving customer:', err);
      alert('Failed to save customer');
    }
  };

  const handleDelete = async (id) => {
    if (!confirmTypedDelete('delete this customer')) return;
    try {
      await api.delete(`/customers/${id}`);
      await loadCustomers({ reset: true });
    } catch (err) {
      console.error('Error deleting customer:', err);
      alert('Failed to delete customer');
    }
  };

  const handleSettleBill = async (customer) => {
    const rawAmount = settleAmounts[customer._id] ?? '';
    const amount = Number(rawAmount);
    const paymentMethod = settleMethods[customer._id] || 'cash';
    const paymentReference = settleReferences[customer._id] || '';

    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    if (paymentMethod !== 'cash' && !paymentReference.trim()) {
      alert('Please enter a transaction reference or payer name for this payment method');
      return;
    }

    try {
      setSettleLoading(prev => ({ ...prev, [customer._id]: true }));
      const res = await api.post(`/customers/${customer._id}/pay`, {
        amount,
        paymentMethod,
        paymentReference: paymentReference.trim()
      });

      // Check if settlement was denied (skipped because of wrong sales account)
      if (res.data?.skipped) {
        alert(res.data?.message || 'This bill can only be settled by the sales account that created it.');
        return;
      }

      // Check if amount exceeded max settleable amount for this user's sales account
      if (res.data?.maxAmount !== undefined && res.data?.maxAmount < amount) {
        alert(`You can only settle up to ${formatPriceMK(res.data.maxAmount)} MK from your sales account.\n\nOther amounts must be settled by the sales accounts that created them.`);
        return;
      }

      const updatedCustomer = res.data;
      setCustomers(prev => prev.map(item => (item._id === customer._id ? updatedCustomer : item)));
      setSettleAmounts(prev => ({ ...prev, [customer._id]: '' }));
      setSettleReferences(prev => ({ ...prev, [customer._id]: '' }));
      setSettleMethods(prev => ({ ...prev, [customer._id]: 'cash' }));
      setSuccessMessage(`✓ Settlement successful for ${customer.name} • ${formatPriceMK(amount)}`);
      setTimeout(() => setSuccessMessage(null), 4000);
      window.dispatchEvent(new Event('payment-updated'));
    } catch (err) {
      console.error('Error settling customer balance:', err);
      const errorMsg = err.response?.data?.message || 'Failed to process payment';
      const maxAmount = err.response?.data?.maxAmount;
      
      if (maxAmount !== undefined) {
        alert(`${errorMsg}\n\nMax amount you can settle: ${formatPriceMK(maxAmount)} MK`);
      } else {
        alert(errorMsg);
      }
    } finally {
      setSettleLoading(prev => ({ ...prev, [customer._id]: false }));
    }
  };

  const paymentMethodsOptions = [
    { value: 'cash', label: 'Cash' },
    { value: 'airtel_money', label: 'Airtel Money' },
    { value: 'mpamba', label: 'Mpamba' },
    { value: 'bank_account', label: 'Bank Account' }
  ];

  const totalOutstandingCredit = summary.totalCreditOutstanding || 0;
  const customersWithCredit = summary.customersWithCredit || 0;

  if (loading) {
    return (
      <PageContainer title="👤 Customers">
        <p>Loading customers...</p>
      </PageContainer>
    );
  }

  if (loadError && customers.length === 0) {
    return (
      <PageContainer title="👤 Customers">
        <p>{loadError}</p>
        <Button type="button" onClick={() => loadCustomers({ reset: true })}>Retry</Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="👤 Customers">
      <div className="customer-shell">
        <div style={styles.header} className="customer-header">
          <div>
            <p style={styles.subtitle}>Manage your customers</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Close' : '+ Add Customer'}
          </Button>
        </div>

        <div style={styles.creditSummaryBar} className="customer-summary-bar">
          <div>
            <h3 style={styles.creditSummaryTitle}>Outstanding Credit</h3>
            <p style={styles.creditSummaryText}>Total owed by customers: {formatPriceMK(totalOutstandingCredit)}</p>
            <p style={styles.creditSummaryText}>Customers with balances: {customersWithCredit}</p>
          </div>
          <div style={styles.creditSummaryBadge}>{formatPriceMK(totalOutstandingCredit)}</div>
        </div>

        {showForm && (
          <UnifiedCard title={editingCustomer ? 'Edit Customer' : 'Add New Customer'} style={styles.formCard}>
            <form onSubmit={handleSubmit} style={styles.form} className="customer-form">
              <div style={styles.formGrid} className="customer-form-grid">
                <div style={styles.formGroup} className="customer-form-group">
                  <label style={styles.label}>Full Name *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    className="customer-input"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div style={styles.formGroup} className="customer-form-group">
                  <label style={styles.label}>Phone Number *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    className="customer-input"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div style={styles.formGroup} className="customer-form-group">
                  <label style={styles.label}>Gender *</label>
                  <select
                    required
                    style={styles.input}
                    className="customer-input"
                    value={formData.gender}
                    onChange={(e) => setFormData({...formData, gender: e.target.value})}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div style={styles.formGroup} className="customer-form-group">
                  <label style={styles.label}>Starting Credit Balance (MK)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    style={styles.input}
                    className="customer-input"
                    value={formData.creditBalance}
                    onChange={(e) => setFormData({...formData, creditBalance: e.target.value})}
                  />
                </div>
              </div>
              <div style={styles.formActions} className="customer-form-actions">
                <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit">{editingCustomer ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </UnifiedCard>
        )}

        {successMessage && (
          <div style={styles.successBanner}>
            {successMessage}
          </div>
        )}

        <div className="customer-grid">
          {customers.map((customer, index) => (
            <div
              key={customer._id}
              className={`fade-in delay-${(index % 6) + 1} customer-card customer-card--interactive`}
              style={styles.customerCard}
            >
              <div style={styles.customerHeader} className="customer-card__header">
                <div style={styles.customerMeta}>
                  <h3 style={styles.customerName}>{customer.name}</h3>
                  <p style={styles.customerPhone}>📱 {customer.phone}</p>
                  <p style={styles.customerGender}>⚧️ {customer.gender}</p>
                </div>
                <div style={styles.customerActions} className="customer-card__actions">
                  <button
                    style={styles.editBtn}
                    className="customer-action-btn"
                    onClick={() => {
                      setEditingCustomer(customer);
                      setFormData({
                        name: customer.name,
                        phone: customer.phone,
                        gender: customer.gender,
                        creditBalance: customer.creditBalance || 0
                      });
                      setShowForm(true);
                    }}
                  >
                    ✏️
                  </button>
                  <button style={styles.deleteBtn} className="customer-action-btn customer-action-btn--danger" onClick={() => handleDelete(customer._id)}>
                    🗑️
                  </button>
                </div>
              </div>
              <div style={styles.customerStats} className="customer-card__stats">
                <span>💰 Total Spent: {formatPriceMK(customer.totalSpent || 0)}</span>
                <span>⭐ Loyalty Points: {customer.loyaltyPoints || 0}</span>
              </div>
              {(customer.accountUsername || customer.accountUserId || customer.username || customer.accountPassword || customer.password) && (
                <div style={styles.accountBox} className="customer-card__account">
                  <div style={styles.accountLabel}>Account Login</div>
                  <div style={styles.accountInfo}>Username: <strong>{customer.accountUsername || customer.username || '—'}</strong></div>
                  <div style={{ ...styles.accountInfo, wordBreak: 'break-all' }}>Password: <strong>{customer.accountPassword || customer.password || '—'}</strong></div>
                </div>
              )}
              <div style={styles.balanceBox} className="customer-card__balance">
                <span style={styles.balanceLabel}>Outstanding Credit</span>
                <span style={styles.balanceValue}>{formatPriceMK(customer.creditBalance || 0)}</span>
              </div>
              <div style={styles.settlementSection} className="customer-card__settlements">
                <div style={styles.creditHistoryHeader}>Recent settlements</div>
                {(settlements || []).filter((entry) => String(entry.customerId || '') === String(customer._id)).slice(0, 5).map((entry) => (
                  <div key={entry._id} style={styles.creditHistoryItem}>
                    <div style={styles.creditHistoryTopRow}>
                      <span style={styles.creditHistoryDate}>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</span>
                      <span style={styles.creditHistoryOrder}>{entry.paymentMethod || 'cash'}</span>
                    </div>
                    <div style={styles.creditHistoryMeta}>
                      <span>Amount: {formatPriceMK(entry.amount || 0)}</span>
                      <span style={styles.approverBadge}>Sales: {entry.approvedBy || entry.processedByName || entry.salesAccount || '—'}</span>
                    </div>
                    <div style={styles.creditHistoryMeta}>
                      <span>Status: {entry.status || 'confirmed'}</span>
                    </div>
                    {entry.reference || entry.paymentReference ? <div style={styles.creditHistoryProducts}>{entry.reference || entry.paymentReference}</div> : null}
                  </div>
                ))}
                {!(settlements || []).some((entry) => String(entry.customerId || '') === String(customer._id)) && (
                  <div style={styles.creditHistoryProducts}>No settlement history yet.</div>
                )}
              </div>
              {(customer.creditSummary || []).length > 0 && (
                <div style={styles.creditHistorySection} className="customer-card__credit-history">
                  <div style={styles.creditHistoryHeader}>Unpaid credit purchases</div>
                  {/* Per-account breakdown summary */}
                  <div style={styles.accountBreakdownSection}>
                    <div style={styles.accountBreakdownTitle}>Credit by sales account:</div>
                    {(() => {
                      const byAccount = {};
                      (customer.creditSummary || []).forEach((entry) => {
                        const account = entry.processedByName || entry.salesAccount || 'Sales account';
                        if (!byAccount[account]) {
                          byAccount[account] = { total: 0, count: 0 };
                        }
                        byAccount[account].total += Number(entry.balanceDue || 0);
                        byAccount[account].count += 1;
                      });
                      return Object.entries(byAccount).map(([account, data]) => (
                        <div key={account} style={styles.accountBreakdownRow}>
                          <span style={styles.accountName}>{account}</span>
                          <span style={styles.accountAmount}>{formatPriceMK(data.total)} ({data.count} bill{data.count !== 1 ? 's' : ''})</span>
                        </div>
                      ));
                    })()}
                  </div>
                  {customer.creditSummary.map((entry) => (
                    <div key={entry._id} style={styles.creditHistoryItem}>
                      <div style={styles.creditHistoryTopRow}>
                        <span style={styles.creditHistoryDate}>{entry.date || '—'}</span>
                        <span style={styles.creditHistoryOrder}>{entry.orderNumber}</span>
                      </div>
                      <div style={styles.creditHistoryProducts}>
                        {entry.products.map((product, index) => (
                          <div key={`${entry._id}-${index}`} style={styles.creditHistoryProductRow}>
                            <span>{product.name}</span>
                            <span>x{product.quantity}</span>
                          </div>
                        ))}
                      </div>
                      <div style={styles.creditHistoryMeta}>
                        <span>Balance: {formatPriceMK(entry.balanceDue || 0)}</span>
                        <span>Paid: {formatPriceMK(entry.amountPaid || 0)}</span>
                      </div>
                      <div style={styles.creditHistoryMeta}>
                        <span>Sales account: {entry.processedByName || entry.salesAccount || 'Sales account'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {Number(customer.creditBalance || 0) > 0 && (
                <div style={styles.paymentSection} className="customer-card__payment">
                  <label style={styles.paymentLabel}>Settle this bill</label>
                  <div style={styles.paymentRadios}>
                    {paymentMethodsOptions.map((method) => (
                      <label
                        key={method.value}
                        style={{
                          ...styles.paymentRadioLabel,
                          ...(settleMethods[customer._id] === method.value ? styles.paymentRadioLabelActive : {})
                        }}
                      >
                        <input
                          type="radio"
                          name={`payment-method-${customer._id}`}
                          value={method.value}
                          checked={(settleMethods[customer._id] || 'cash') === method.value}
                          onChange={(e) => setSettleMethods(prev => ({ ...prev, [customer._id]: e.target.value }))}
                          style={styles.radioInput}
                        />
                        {method.label}
                      </label>
                    ))}
                  </div>
                  {settleMethods[customer._id] && settleMethods[customer._id] !== 'cash' && (
                    <input
                      type="text"
                      style={styles.paymentReferenceInput}
                      value={settleReferences[customer._id] || ''}
                      onChange={(e) => setSettleReferences(prev => ({ ...prev, [customer._id]: e.target.value }))}
                      placeholder="customer name or ref"
                    />
                  )}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    max={customer.creditBalance || 0}
                    style={styles.paymentInput}
                    className="customer-input"
                    value={settleAmounts[customer._id] ?? ''}
                    onChange={(e) => setSettleAmounts(prev => ({ ...prev, [customer._id]: e.target.value }))}
                    placeholder="Amount to pay"
                  />
                  <button
                    style={{
                      ...styles.settleBtn,
                      ...(settleLoading[customer._id] ? styles.settleBtnLoading : {})
                    }}
                    onClick={() => handleSettleBill(customer)}
                    disabled={Boolean(settleLoading[customer._id])}
                  >
                    {settleLoading[customer._id] ? (
                      <>
                        <span style={styles.spinner}></span>
                        {'Settling...'}
                      </>
                    ) : (
                      'Settle bill'
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {hasMore && (
          <div style={styles.loadMoreWrapper}>
            <button
              type="button"
              style={styles.loadMoreBtn}
              onClick={loadMoreCustomers}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Load more customers'}
            </button>
          </div>
        )}
      </div>
    </PageContainer>
  );
};

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '18px',
    flexWrap: 'wrap',
    gap: '12px',
    width: '100%'
  },
  subtitle: {
    fontSize: '15px',
    color: '#6b7280',
    margin: 0,
    fontWeight: '500'
  },
  creditSummaryBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 18px',
    borderRadius: '14px',
    backgroundColor: '#fff5f5',
    border: '1px solid #f5c2c7',
    marginBottom: '20px',
    gap: '12px',
    flexWrap: 'wrap'
  },
  creditSummaryTitle: {
    margin: '0 0 4px 0',
    color: '#b91c1c',
    fontSize: '16px'
  },
  creditSummaryText: {
    margin: '2px 0',
    color: '#7f1d1d',
    fontSize: '13px'
  },
  creditSummaryBadge: {
    padding: '10px 14px',
    borderRadius: '999px',
    backgroundColor: '#e94560',
    color: 'white',
    fontWeight: '700',
    fontSize: '15px'
  },
  formCard: {
    padding: '20px 24px',
    marginBottom: '20px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '16px',
    width: '100%'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #d8dce6',
    backgroundColor: '#fafafa',
    color: '#111827',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    flexWrap: 'wrap'
  },
  customerCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    border: '1px solid #f0f0f0',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minHeight: '100%'
  },
  customerMeta: {
    flex: 1,
    minWidth: 0
  },
  customerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px'
  },
  customerName: {
    margin: '0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a2e'
  },
  customerPhone: {
    margin: '5px 0 0 0',
    color: '#666',
    fontSize: '14px'
  },
  customerGender: {
    margin: '2px 0 0 0',
    color: '#888',
    fontSize: '13px'
  },
  customerActions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0
  },
  editBtn: {
    background: '#fef2f2',
    border: '1px solid #fbcaca',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '6px 8px',
    borderRadius: '8px',
    transition: 'background 0.3s ease'
  },
  deleteBtn: {
    background: '#fff1f2',
    border: '1px solid #fbcada',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '6px 8px',
    borderRadius: '8px',
    transition: 'background 0.3s ease'
  },
  customerStats: {
    paddingTop: '10px',
    borderTop: '1px solid #f0f0f0',
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '13px',
    color: '#666'
  },
  accountBox: {
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  accountLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  accountInfo: {
    fontSize: '13px',
    color: '#4b5563'
  },
  balanceBox: {
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px'
  },
  balanceLabel: {
    fontSize: '13px',
    color: '#7f1d1d',
    fontWeight: '600'
  },
  balanceValue: {
    fontSize: '15px',
    color: '#b91c1c',
    fontWeight: '700'
  },
  settlementSection: {
    border: '1px solid #f3d8df',
    borderRadius: '12px',
    padding: '10px 12px',
    backgroundColor: '#fff9fa',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  creditHistorySection: {
    border: '1px solid #f3d8df',
    borderRadius: '12px',
    padding: '10px 12px',
    backgroundColor: '#fff9fa',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  creditHistoryHeader: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#b91c1c'
  },
  creditHistoryItem: {
    borderTop: '1px solid #f6dce2',
    paddingTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  creditHistoryTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap'
  },
  creditHistoryDate: {
    fontSize: '12px',
    color: '#6b7280'
  },
  creditHistoryOrder: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#1a1a2e'
  },
  creditHistoryProducts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  creditHistoryProductRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '12px',
    color: '#4b5563'
  },
  creditHistoryMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    flexWrap: 'wrap',
    fontSize: '12px',
    color: '#7f1d1d'
  },
  approverBadge: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    padding: '2px 8px',
    borderRadius: '999px',
    fontWeight: '700'
  },
  accountBreakdownSection: {
    paddingTop: '8px',
    paddingBottom: '8px',
    borderBottom: '1px solid #f6dce2',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  accountBreakdownTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#7f1d1d',
    marginBottom: '4px'
  },
  accountBreakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    backgroundColor: '#fef2f2',
    fontSize: '12px'
  },
  accountName: {
    fontWeight: '600',
    color: '#4b5563',
    flex: 1
  },
  accountAmount: {
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'right'
  },
  paymentSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '4px'
  },
  paymentLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563'
  },
  paymentInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #d8dce6',
    backgroundColor: '#fafafa',
    color: '#111827',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  paymentMethodSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #d8dce6',
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  paymentReferenceInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #d8dce6',
    backgroundColor: '#fafafa',
    color: '#111827',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  settleBtn: {
    width: '100%',
    border: 'none',
    borderRadius: '10px',
    backgroundColor: '#10b981',
    color: 'white',
    padding: '12px 0',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '8px'
  },
  loadMoreWrapper: {
    display: 'flex',
    justifyContent: 'center',
    padding: '18px 0'
  },
  loadMoreBtn: {
    minWidth: '220px',
    padding: '10px 18px',
    borderRadius: '999px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    color: '#111827',
    cursor: 'pointer',
    fontWeight: '700',
    transition: 'all 0.2s ease'
  },
  spinner: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid white',
    animation: 'spin 0.6s linear infinite',
    marginRight: '4px',
    verticalAlign: 'middle'
  },
  successBanner: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: '#10b981',
    color: 'white',
    padding: '14px 18px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
    fontSize: '14px',
    fontWeight: '600',
    zIndex: 9999,
    animation: 'slideIn 0.3s ease'
  }
};

const spinKeyframes = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;

if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-customers-keyframes', 'true');
  styleEl.textContent = spinKeyframes;
  if (!document.querySelector('style[data-customers-keyframes]')) {
    document.head.appendChild(styleEl);
  }
}

export default Customers;