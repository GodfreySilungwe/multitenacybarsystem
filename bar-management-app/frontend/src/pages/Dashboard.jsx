import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDollarSign, 
  faChartLine, 
  faShoppingCart, 
  faExclamationTriangle, 
  faBox, 
  faUsers,
  faClock,
  faTools,
  faBuilding,
  faClipboardList,
  faClipboardCheck
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/api';
import StatsCard from '../components/common/StatsCard';
import UnifiedCard from '../components/common/UnifiedCard';
import PageContainer from './PageContainer';
import { formatPriceMK } from '../utils/formatPrice';

const Dashboard = () => {
  const { isGlobalOwner } = useAuth();
  const [stats, setStats] = useState({
    todaySales: 0,
    todayProfit: 0,
    totalOrders: 0,
    reversedOrders: 0,
    lowStock: 0,
    totalProducts: 0,
    totalCustomers: 0,
    totalBars: 0,
    activeBars: 0,
    suspendedBars: 0,
    deletedBars: 0,
    pendingApplications: 0
  });
  const [globalBars, setGlobalBars] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isGlobalOwner) {
        const [barsRes, applicationsRes] = await Promise.all([
          api.get('/bars'),
          api.get('/bar-applications')
        ]);

        const bars = barsRes.data || [];
        const applications = applicationsRes.data || [];
        const activeBars = bars.filter((bar) => bar.status === 'active').length;
        const suspendedBars = bars.filter((bar) => bar.status === 'suspended').length;
        const deletedBars = bars.filter((bar) => bar.status === 'deleted').length;

        setStats((prev) => ({
          ...prev,
          totalBars: bars.length,
          activeBars,
          suspendedBars,
          deletedBars,
          pendingApplications: applications.filter((app) => app.status === 'pending').length
        }));
        setGlobalBars(bars.slice(0, 5));
        setRecentOrders([]);
        setLowStockProducts([]);
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        const [todayRes, productsRes, customersRes, lowStockRes, ordersRes] = await Promise.all([
          api.get('/orders/today'),
          api.get('/products'),
          api.get('/customers'),
          api.get('/products/low-stock'),
          api.get('/orders')
        ].map((promise) => promise.catch((err) => err)));

        const todayData = todayRes instanceof Error ? { count: 0, totalSales: 0, totalProfit: 0 } : todayRes.data;
        const products = productsRes instanceof Error ? [] : productsRes.data || [];
        const customers = customersRes instanceof Error ? [] : customersRes.data || [];
        const lowStock = lowStockRes instanceof Error ? [] : lowStockRes.data || [];
        const recent = ordersRes instanceof Error ? [] : (ordersRes.data || []).slice(0, 5);

        setStats({
          todaySales: todayData.totalSales || 0,
          todayProfit: todayData.totalProfit || 0,
          totalOrders: todayData.count || 0,
          reversedOrders: todayData.reversedCount || 0,
          lowStock: lowStock.length || 0,
          totalProducts: products.length || 0,
          totalCustomers: customers.length || 0,
          totalBars: 0,
          activeBars: 0,
          suspendedBars: 0,
          deletedBars: 0,
          pendingApplications: 0
        });
        setRecentOrders(recent);
        setLowStockProducts(lowStock);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Could not load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <PageContainer title="📊 Dashboard">
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading your dashboard...</p>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer title="📊 Dashboard">
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <h2 style={styles.errorTitle}>{error}</h2>
          <p style={styles.errorSubtitle}>Please check your connection and try again</p>
          <button style={styles.retryBtn} onClick={fetchDashboardData}>Retry</button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="📊 Dashboard">
      <div style={styles.welcomeSection}>
        <div>
          <p style={styles.subtitle}>Welcome back! Here's your SMART BAR overview.</p>
          {lastUpdated && (
            <p style={styles.lastUpdated}>
              <FontAwesomeIcon icon={faClock} style={{ marginRight: '6px' }} />
              Last updated: {lastUpdated}
            </p>
          )}
        </div>
        <button style={styles.refreshBtn} onClick={fetchDashboardData}>
          🔄 Refresh
        </button>
      </div>

      {isGlobalOwner ? (
        <>
          <div style={styles.statsGrid}>
            <div className="fade-in delay-1" style={styles.statItem}>
              <StatsCard title="Total Bars" value={stats.totalBars} icon={faBuilding} color="#3498db" />
            </div>
            <div className="fade-in delay-2" style={styles.statItem}>
              <StatsCard title="Active Bars" value={stats.activeBars} icon={faClipboardList} color="#2ecc71" />
            </div>
            <div className="fade-in delay-3" style={styles.statItem}>
              <StatsCard title="Suspended Bars" value={stats.suspendedBars} icon={faExclamationTriangle} color="#f39c12" />
            </div>
            <div className="fade-in delay-4" style={styles.statItem}>
              <StatsCard title="Deleted Bars" value={stats.deletedBars} icon={faBox} color="#e74c3c" />
            </div>
            <div className="fade-in delay-5" style={styles.statItem}>
              <StatsCard title="Pending Applications" value={stats.pendingApplications} icon={faClipboardCheck} color="#9b59b6" />
            </div>
          </div>

          <UnifiedCard title="Bar Creation Summary">
            <p style={styles.infoText}>Global owners create bars using the Bars page with this form:</p>
            <ul style={styles.bulletList}>
              <li>Bar Name</li>
              <li>Bar Code</li>
              <li>Description</li>
              <li>Admin Username</li>
              <li>Admin Email</li>
              <li>Admin Password</li>
              <li>Admin Full Name</li>
              <li>Admin Phone</li>
            </ul>
            <p style={styles.infoText}>After creation, bars can be suspended, deleted, or restored from the Bars page.</p>
          </UnifiedCard>

          <UnifiedCard title="Recent Bars">
            {globalBars.length === 0 ? (
              <p style={styles.emptyStateText}>No bars available yet.</p>
            ) : (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Code</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalBars.map((bar) => (
                      <tr key={bar._id || bar.id} style={styles.tableRow}>
                        <td style={styles.orderNumber}>{bar.name}</td>
                        <td>{bar.code || '-'}</td>
                        <td>{bar.status || 'active'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </UnifiedCard>
        </>
      ) : (
        <>
          <div style={styles.statsGrid}>
            <div className="fade-in delay-1" style={styles.statItem}>
              <StatsCard title="Today's Sales" value={stats.todaySales} icon={faDollarSign} color="#e94560" isCurrency />
            </div>
            <div className="fade-in delay-2" style={styles.statItem}>
              <StatsCard title="Today's Profit" value={stats.todayProfit} icon={faChartLine} color="#2ecc71" isCurrency />
            </div>
            <div className="fade-in delay-3" style={styles.statItem}>
              <StatsCard title="Orders Today" value={stats.totalOrders} icon={faShoppingCart} color="#3498db" />
            </div>
            <div className="fade-in delay-4" style={styles.statItem}>
              <StatsCard title="Reversed Today" value={stats.reversedOrders} icon={faBox} color="#e74c3c" />
            </div>
            <div className="fade-in delay-5" style={styles.statItem}>
              <StatsCard title="Low Stock" value={stats.lowStock} icon={faExclamationTriangle} color="#f39c12" />
            </div>
            <div className="fade-in delay-6" style={styles.statItem}>
              <StatsCard title="Total Products" value={stats.totalProducts} icon={faTools} color="#9b59b6" />
            </div>
            <div className="fade-in delay-7" style={styles.statItem}>
              <StatsCard title="Total Customers" value={stats.totalCustomers} icon={faUsers} color="#1abc9c" />
            </div>
          </div>

          {lowStockProducts.length > 0 && (
            <div className="fade-in">
              <UnifiedCard title="⚠️ Low Stock Alert">
                <div style={styles.lowStockGrid}>
                  {lowStockProducts.map(product => (
                    <div key={product._id} style={styles.lowStockItem}>
                      <div style={styles.lowStockHeader}>
                        <span style={styles.lowStockName}>{product.name}</span>
                        <span style={styles.lowStockCategory}>{product.category?.name}</span>
                      </div>
                      <div style={styles.lowStockDetails}>
                        <span style={styles.lowStockQty}>📦 Current: {product.currentStock}</span>
                        <span style={styles.lowStockThreshold}>⚠️ Threshold: {product.lowStockThreshold}</span>
                      </div>
                      <div style={styles.lowStockBar}>
                        <div
                          style={{
                            ...styles.lowStockBarFill,
                            width: `${Math.min((product.currentStock / product.lowStockThreshold) * 100, 100)}%`,
                            backgroundColor: product.currentStock === 0 ? '#e74c3c' : '#f39c12'
                          }}
                        />
                      </div>
                      {product.currentStock === 0 && <span style={styles.outOfStockBadge}>OUT OF STOCK</span>}
                    </div>
                  ))}
                </div>
              </UnifiedCard>
            </div>
          )}

          <div className="fade-in">
            <UnifiedCard title="📋 Recent Orders">
              {recentOrders.length === 0 ? (
                <div style={styles.emptyState}>
                  <p style={styles.emptyIcon}>🛒</p>
                  <p style={styles.emptyText}>No orders yet today</p>
                  <p style={styles.emptySubtext}>Start serving drinks and bar items to see orders here</p>
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
                        <th>Profit</th>
                        <th>Payment</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map(order => (
                        <tr key={order._id} style={styles.tableRow}>
                          <td style={styles.orderNumber}>
                            {order.orderNumber}
                            {order.reversed && <span style={styles.orderBadge}>Reversed</span>}
                          </td>
                          <td>{order.customer?.name || 'Walk-in'}</td>
                          <td>{order.items.length} items</td>
                          <td style={styles.amount}>{formatPriceMK(order.totalAmount)}</td>
                          <td style={styles.profit}>+{formatPriceMK(order.profit)}</td>
                          <td>
                            <span style={{
                              ...styles.paymentBadge,
                              ...(order.paymentMethod === 'cash' ? styles.cash : order.paymentMethod === 'card' ? styles.card : styles.mobile)
                            }}>
                              {order.paymentMethod.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={styles.time}>{new Date(order.createdAt).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </UnifiedCard>
          </div>
        </>
      )}
    </PageContainer>
  );
};

const styles = {
  welcomeSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '25px',
    flexWrap: 'wrap',
    gap: '15px'
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 5px 0'
  },
  lastUpdated: {
    fontSize: '13px',
    color: '#999',
    margin: '0'
  },
  refreshBtn: {
    padding: '8px 20px',
    borderRadius: '25px',
    border: '2px solid #e94560',
    backgroundColor: 'transparent',
    color: '#e94560',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
    width: '100%'
  },
  statItem: {
    width: '100%'
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
    width: '50px',
    height: '50px',
    border: '4px solid #f0f0f0',
    borderTop: '4px solid #e94560',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    padding: '20px',
    textAlign: 'center'
  },
  errorIcon: {
    fontSize: '56px',
    marginBottom: '20px'
  },
  errorTitle: {
    fontSize: '24px',
    color: '#e74c3c',
    marginBottom: '10px'
  },
  errorSubtitle: {
    fontSize: '16px',
    color: '#888',
    marginBottom: '20px'
  },
  retryBtn: {
    padding: '10px 30px',
    backgroundColor: '#e94560',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.3s ease'
  },
  infoText: {
    color: '#444',
    lineHeight: '1.7',
    marginBottom: '12px'
  },
  bulletList: {
    marginLeft: '20px',
    color: '#444',
    marginBottom: '12px'
  },
  emptyStateText: {
    padding: '20px 0',
    color: '#666'
  },
  lowStockGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '15px'
  },
  lowStockItem: {
    padding: '16px',
    backgroundColor: '#fef9e7',
    borderRadius: '12px',
    border: '1px solid #f39c12',
    position: 'relative'
  },
  lowStockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  lowStockName: {
    fontWeight: 'bold',
    fontSize: '15px',
    color: '#1a1a2e'
  },
  lowStockCategory: {
    fontSize: '12px',
    color: '#888',
    backgroundColor: '#f0f0f0',
    padding: '2px 10px',
    borderRadius: '12px'
  },
  lowStockDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px'
  },
  lowStockQty: {
    fontSize: '13px',
    color: '#666'
  },
  lowStockThreshold: {
    fontSize: '13px',
    color: '#666'
  },
  lowStockBar: {
    height: '6px',
    backgroundColor: '#f0f0f0',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  lowStockBarFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.5s ease'
  },
  outOfStockBadge: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    backgroundColor: '#e74c3c',
    color: 'white',
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '10px',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  requestList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  requestItem: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: '10px',
    backgroundColor: '#fff8f8',
    border: '1px solid #f5c2c7'
  },
  requestCustomer: {
    fontWeight: '700',
    color: '#1a1a2e'
  },
  requestDetail: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '2px'
  },
  requestMeta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px'
  },
  confirmBtn: {
    padding: '6px 10px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#2ecc71',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
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
  pending: {
    backgroundColor: '#fef3c7',
    color: '#92400e'
  },
  requestTime: {
    fontSize: '12px',
    color: '#888',
    whiteSpace: 'nowrap'
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
  amount: {
    fontWeight: 'bold',
    color: '#2ecc71'
  },
  profit: {
    color: '#3498db',
    fontWeight: '500'
  },
  time: {
    color: '#888',
    fontSize: '13px'
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

export default Dashboard;