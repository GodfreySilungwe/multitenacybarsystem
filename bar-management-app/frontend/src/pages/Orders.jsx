import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import { formatPriceMK } from '../utils/formatPrice';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextKey, setNextKey] = useState(null);
  const [filter, setFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [reversingOrderId, setReversingOrderId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    totalQuantitySold: 0,
    averageItemsPerOrder: 0,
    grossMarginRatio: 0
  });

  useEffect(() => {
    loadOrders({ reset: true });
  }, [filter, customStartDate, customEndDate]);

  const buildOrderParams = (options = {}) => {
    const params = {
      limit: 20
    };

    if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      params.startDate = today.toISOString();
    }

    if (filter === 'custom' && customStartDate) {
      params.startDate = new Date(customStartDate).toISOString();
    }

    if (filter === 'custom' && customEndDate) {
      params.endDate = new Date(`${customEndDate}T23:59:59`).toISOString();
    }

    if (options.lastKey) {
      params.lastKey = options.lastKey;
    }

    return params;
  };

  const loadOrders = async ({ reset = false, lastKey = null } = {}) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params = buildOrderParams({ lastKey: reset ? null : lastKey });
      const summaryParams = {
        range: filter === 'all' ? 'all' : filter,
        ...(filter === 'custom' && customStartDate ? { startDate: customStartDate } : {}),
        ...(filter === 'custom' && customEndDate ? { endDate: customEndDate } : {})
      };

      const [ordersRes, summaryRes] = await Promise.all([
        api.get('/orders', { params }),
        api.get('/orders/summary', { params: summaryParams })
      ]);

      const responseData = ordersRes.data || {};
      const items = Array.isArray(responseData) ? responseData : responseData.items || [];
      const next = responseData.nextKey || null;
      const summaryData = summaryRes.data || {};

      setOrders((prev) => (reset ? items : [...prev, ...items]));
      setSummary({
        totalSales: summaryData.totalSales || 0,
        totalOrders: summaryData.totalOrders || 0,
        averageOrderValue: summaryData.averageOrderValue || 0,
        totalQuantitySold: summaryData.totalQuantitySold || 0,
        averageItemsPerOrder: summaryData.averageItemsPerOrder || 0,
        grossMarginRatio: summaryData.grossMarginRatio || 0
      });
      setNextKey(next);
      setHasMore(Boolean(next));
    } catch (err) {
      console.error('Error loading orders:', err);
      setError('Failed to load orders');
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreOrders = async () => {
    if (!nextKey) return;
    await loadOrders({ reset: false, lastKey: nextKey });
  };

  const getFilteredOrders = () => orders;

  const handleCustomRangeApply = () => {
    if (filter !== 'custom') {
      setFilter('custom');
      return;
    }
    loadOrders({ reset: true });
  };

  const reverseOrder = async (orderId) => {
    try {
      if (!window.confirm('Are you sure you want to reverse this sale? This will restore stock and adjust customer balances.')) return;
      setReversingOrderId(orderId);
      await api.post(`/orders/${orderId}/reverse`, { reason: 'Accidental sale reversal' });
      setSuccess('✅ Order reversed successfully');
      await loadOrders({ reset: true });
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Error reversing order:', err);
      setError(err.response?.data?.message || 'Failed to reverse order');
      setTimeout(() => setError(''), 5000);
    } finally {
      setReversingOrderId(null);
    }
  };

  const toggleExpand = (orderId) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
  };

  const filteredOrders = getFilteredOrders();
  const totalSales = summary.totalSales || 0;
  const totalOrders = summary.totalOrders || filteredOrders.length;

  if (loading) {
    return (
      <PageContainer title="📋 Orders">
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading orders...</p>
        </div>
      </PageContainer>
    );
  }

  // show success/error messages
  const MessageBar = () => (
    <div>
      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}
    </div>
  );

  return (
    <PageContainer title="📋 Orders">
      <div style={styles.header}>
        <p style={styles.subtitle}>View all orders and transactions</p>
        <div style={styles.filters}>
          {['all', 'today', 'custom'].map((filterOption, index) => (
            <button
              key={filterOption}
              className={`fade-in delay-${(index % 4) + 1}`}
              style={{
                ...styles.filterBtn,
                ...(filter === filterOption ? styles.filterBtnActive : {})
              }}
              onClick={() => setFilter(filterOption)}
              onMouseEnter={(e) => {
                if (filter !== filterOption) {
                  e.currentTarget.style.backgroundColor = '#f0f0f0';
                }
              }}
              onMouseLeave={(e) => {
                if (filter !== filterOption) {
                  e.currentTarget.style.backgroundColor = 'white';
                }
              }}
            >
              {filterOption === 'custom' ? 'Custom' : filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filter === 'custom' && (
        <div style={styles.customRangeRow}>
          <label style={styles.customRangeLabel}>
            Start
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              style={styles.dateInput}
            />
          </label>
          <label style={styles.customRangeLabel}>
            End
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              style={styles.dateInput}
            />
          </label>
          <button style={styles.applyCustomBtn} onClick={handleCustomRangeApply}>Apply</button>
        </div>
      )}

      {/* Summary Cards with Animations */}
      <div style={styles.summary}>
        {[
          { label: 'Total Orders', value: totalOrders, icon: '📋', color: '#3498db', delay: 1 },
          { label: 'Total Sales', value: formatPriceMK(totalSales), icon: '💰', color: '#2ecc71', delay: 2 }
        ].map((item, index) => (
          <div 
            key={index}
            className={`fade-in delay-${item.delay}`}
            style={{
              ...styles.summaryCard,
              borderLeft: `4px solid ${item.color}`,
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            }}
          >
            <span style={styles.summaryIcon}>{item.icon}</span>
            <div>
              <span style={styles.summaryLabel}>{item.label}</span>
              <span style={styles.summaryValue}>{item.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Orders List */}
      <div className="fade-in">
        <MessageBar />
        <UnifiedCard title={`Orders (${totalOrders})`}>
          {filteredOrders.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyIcon}>📋</p>
              <p style={styles.emptyText}>No orders found</p>
              <p style={styles.emptySubtext}>Orders will appear here once you start selling</p>
            </div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order, index) => (
                    <>
                      <tr 
                        key={order._id}
                        className={`fade-in delay-${(index % 6) + 1}`}
                        style={styles.tableRow}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <td style={styles.orderNumber}>{order.orderNumber}</td>
                        <td>{order.customer?.name || 'Walk-in'}</td>
                        <td>
                          <span style={styles.itemCount}>
                            {order.items.length} item{order.items.length > 1 ? 's' : ''}
                          </span>
                        </td>
                        <td style={styles.amount}>{formatPriceMK(order.totalAmount)}</td>
                        <td>
                          <span style={{
                            ...styles.paymentBadge,
                            ...(order.paymentMethod === 'cash' ? styles.cash : 
                                order.paymentMethod === 'card' ? styles.card : 
                                styles.mobile)
                          }}>
                            {order.paymentMethod.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            ...styles.statusBadge,
                            ...(order.reversed ? styles.statusReversed : order.status === 'completed' ? styles.statusCompleted : styles.statusPartial)
                          }}>
                            {order.reversed ? 'Reversed' : (order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : (order.paymentStatus === 'paid' ? 'Completed' : 'Partial'))}
                          </span>
                        </td>
                        <td style={styles.date}>{new Date(order.createdAt).toLocaleString()}</td>
                        <td>
                          <button
                            style={styles.detailsBtn}
                            onClick={() => toggleExpand(order._id)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#e94560';
                              e.currentTarget.style.color = 'white';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'white';
                              e.currentTarget.style.color = '#333';
                            }}
                          >
                            {expandedOrder === order._id ? '▲ Hide' : '▼ View'}
                          </button>
                        </td>
                      </tr>
                      {expandedOrder === order._id && (
                        <tr className="fade-in delay-1">
                          <td colSpan="8" style={styles.detailsRow}>
                            <div style={styles.orderDetails}>
                              <h4 style={styles.detailsTitle}>📦 Order Items</h4>
                              {order.items.map((item, itemIndex) => (
                                <div 
                                  key={itemIndex} 
                                  style={{
                                    ...styles.orderItem,
                                    ...(itemIndex === order.items.length - 1 ? styles.orderItemLast : {})
                                  }}
                                >
                                  <span style={styles.itemName}>
                                    {item.product?.name || item.productName || item.product || 'Product'}
                                  </span>
                                  <span style={styles.itemQuantity}>
                                    × {item.quantity}
                                  </span>
                                  <span style={styles.itemPrice}>
                                    {formatPriceMK(item.priceAtSale)}
                                  </span>
                                  <span style={styles.itemSubtotal}>
                                    = {formatPriceMK(item.subtotal)}
                                  </span>
                                </div>
                              ))}
                              <div style={styles.orderTotal}>
                                <span>Total: {formatPriceMK(order.totalAmount)}</span>
                              </div>
                              <div style={{ marginTop: '10px' }}>
                                <button
                                  style={styles.reverseBtn}
                                  onClick={() => reverseOrder(order._id)}
                                  disabled={reversingOrderId === order._id || order.reversed}
                                >
                                  {order.reversed ? 'Already reversed' : (reversingOrderId === order._id ? 'Reversing...' : 'Reverse Sale')}
                                </button>
                              </div>
                              {order.reversed && (
                                <div style={styles.reversalInfo}>
                                  <strong>Reversed:</strong> {new Date(order.reversedAt).toLocaleString()}<br />
                                  <strong>Reason:</strong> {order.reversalReason || 'Sale reversed'}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
              {hasMore && (
                <div style={styles.loadMoreWrapper}>
                  <button style={styles.loadMoreBtn} onClick={loadMoreOrders} disabled={loadingMore}>
                    {loadingMore ? 'Loading…' : 'Load more orders'}
                  </button>
                </div>
              )}
            </div>
          )}
        </UnifiedCard>
      </div>
    </PageContainer>
  );
};

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '10px',
    width: '100%'
  },
  subtitle: {
    fontSize: '16px',
    color: '#888',
    margin: 0
  },
  filters: {
    display: 'flex',
    gap: '8px'
  },
  filterBtn: {
    padding: '6px 16px',
    borderRadius: '20px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.3s ease'
  },
  filterBtnActive: {
    backgroundColor: '#e94560',
    color: 'white',
    borderColor: '#e94560'
  },
  customRangeRow: {
    display: 'flex',
    alignItems: 'end',
    gap: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  customRangeLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    color: '#555',
    fontWeight: '600'
  },
  dateInput: {
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #d9d9d9',
    fontSize: '14px'
  },
  applyCustomBtn: {
    padding: '9px 16px',
    borderRadius: '8px',
    border: '1px solid #e94560',
    backgroundColor: '#e94560',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '700'
  },
  summary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '15px',
    marginBottom: '20px',
    width: '100%'
  },
  summaryCard: {
    backgroundColor: 'white',
    padding: '18px 20px',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  summaryIcon: {
    fontSize: '32px'
  },
  summaryLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#888',
    marginBottom: '2px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  summaryValue: {
    display: 'block',
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#1a1a2e'
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 0'
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '10px'
  },
  emptyText: {
    fontSize: '18px',
    color: '#666',
    marginBottom: '5px'
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#999'
  },
  tableWrapper: {
    overflowX: 'auto',
    width: '100%'
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
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  },
  tableRow: {
    transition: 'background 0.2s ease',
    cursor: 'pointer'
  },
  orderNumber: {
    fontWeight: 'bold',
    color: '#1a1a2e'
  },
  itemCount: {
    color: '#666',
    fontSize: '13px'
  },
  amount: {
    fontWeight: 'bold',
    color: '#2ecc71'
  },
  profit: {
    color: '#3498db',
    fontWeight: '500'
  },
  date: {
    fontSize: '12px',
    color: '#888',
    whiteSpace: 'nowrap'
  },
  paymentBadge: {
    padding: '4px 14px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'capitalize',
    display: 'inline-block'
  },
  cash: {
    backgroundColor: '#d5f5e3',
    color: '#27ae60'
  },
  card: {
    backgroundColor: '#d6eaf8',
    color: '#2e86c1'
  },
  mobile: {
    backgroundColor: '#fdebd0',
    color: '#e67e22'
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  statusCompleted: {
    backgroundColor: '#d1fae5',
    color: '#166534'
  },
  statusPartial: {
    backgroundColor: '#fef3c7',
    color: '#92400e'
  },
  statusReversed: {
    backgroundColor: '#fee2e2',
    color: '#991b1b'
  },
  reversalInfo: {
    marginTop: '14px',
    padding: '12px',
    borderRadius: '12px',
    backgroundColor: '#fff1f2',
    border: '1px solid #f5c2c7',
    color: '#842029',
    fontSize: '13px'
  },
  detailsBtn: {
    padding: '4px 12px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.3s ease'
  },
  detailsRow: {
    backgroundColor: '#f8f9fa',
    padding: '0'
  },
  orderDetails: {
    padding: '16px 20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px'
  },
  detailsTitle: {
    margin: '0 0 12px 0',
    fontSize: '15px',
    color: '#1a1a2e'
  },
  orderItem: {
    display: 'flex',
    gap: '12px',
    padding: '6px 0',
    borderBottom: '1px solid #eee',
    fontSize: '14px'
  },
  orderItemLast: {
    borderBottom: 'none'
  },
  itemName: {
    flex: 2,
    fontWeight: '500'
  },
  itemQuantity: {
    flex: 0.5,
    color: '#666'
  },
  itemPrice: {
    flex: 1,
    color: '#666'
  },
  itemSubtotal: {
    flex: 1,
    fontWeight: 'bold',
    color: '#1a1a2e'
  },
  orderTotal: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '2px solid #ddd',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '16px',
    fontWeight: 'bold'
  },
  reverseBtn: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px'
  },
  error: {
    backgroundColor: '#fde8e8',
    color: '#e74c3c',
    padding: '10px 12px',
    borderRadius: '8px',
    marginBottom: '12px'
  },
  success: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '10px 12px',
    borderRadius: '8px',
    marginBottom: '12px'
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    color: '#888'
  },
  loadingText: {
    marginTop: '20px',
    fontSize: '16px',
    color: '#999'
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #f0f0f0',
    borderTop: '4px solid #e94560',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};

// Add keyframe animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .fade-in {
    animation: fadeInUp 0.6s ease forwards;
    opacity: 0;
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .delay-1 { animation-delay: 0.05s; }
  .delay-2 { animation-delay: 0.1s; }
  .delay-3 { animation-delay: 0.15s; }
  .delay-4 { animation-delay: 0.2s; }
  .delay-5 { animation-delay: 0.25s; }
  .delay-6 { animation-delay: 0.3s; }
`;
document.head.appendChild(styleSheet);

export default Orders;