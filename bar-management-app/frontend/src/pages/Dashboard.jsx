import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDollarSign, 
  faChartLine, 
  faShoppingCart, 
  faExclamationTriangle, 
  faBox, 
  faUsers,
  faClock,
  faTools
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/api';
import StatsCard from '../components/common/StatsCard';
import UnifiedCard from '../components/common/UnifiedCard';
import PageContainer from './PageContainer';
import { formatPriceMK } from '../utils/formatPrice';

const Dashboard = () => {
  const [stats, setStats] = useState({
    todaySales: 0,
    todayProfit: 0,
    totalOrders: 0,
    reversedOrders: 0,
    lowStock: 0,
    totalProducts: 0,
    totalCustomers: 0
  });
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

      let todayData = { count: 0, totalSales: 0, totalProfit: 0 };
      try {
        const todayRes = await api.get('/orders/today');
        todayData = todayRes.data;
      } catch (err) {
        console.log('No orders yet:', err.message);
      }
      
      let products = [];
      try {
        const productsRes = await api.get('/products');
        products = productsRes.data;
      } catch (err) {
        console.log('No products:', err.message);
      }
      
      let customers = [];
      try {
        const customersRes = await api.get('/customers');
        customers = customersRes.data;
      } catch (err) {
        console.log('No customers:', err.message);
      }
      
      let lowStock = [];
      try {
        const lowStockRes = await api.get('/products/low-stock');
        lowStock = lowStockRes.data;
      } catch (err) {
        console.log('No low stock:', err.message);
      }
      
      let recent = [];
      try {
        const ordersRes = await api.get('/orders');
        recent = ordersRes.data.slice(0, 5);
      } catch (err) {
        console.log('No orders:', err.message);
      }

      setStats({
        todaySales: todayData.totalSales || 0,
        todayProfit: todayData.totalProfit || 0,
        totalOrders: todayData.count || 0,
        reversedOrders: todayData.reversedCount || 0,
        lowStock: lowStock.length || 0,
        totalProducts: products.length || 0,
        totalCustomers: customers.length || 0
      });

      setRecentOrders(recent);
      setLowStockProducts(lowStock);
      setLastUpdated(new Date().toLocaleTimeString());
      
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
      {/* Welcome Section */}
      <div style={styles.welcomeSection}>
        <div>
          <p style={styles.subtitle}>Welcome back! Here's your SMART BAR overview for today.</p>
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

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        <div className="fade-in delay-1" style={styles.statItem}>
          <StatsCard 
            title="Today's Sales" 
            value={stats.todaySales}
            icon={faDollarSign}
            color="#e94560" 
            isCurrency={true}
          />
        </div>
        <div className="fade-in delay-2" style={styles.statItem}>
          <StatsCard 
            title="Today's Profit" 
            value={stats.todayProfit}
            icon={faChartLine}
            color="#2ecc71" 
            isCurrency={true}
          />
        </div>
        <div className="fade-in delay-3" style={styles.statItem}>
          <StatsCard 
            title="Orders Today" 
            value={stats.totalOrders} 
            icon={faShoppingCart}
            color="#3498db" 
            isCurrency={false}
          />
        </div>
        <div className="fade-in delay-4" style={styles.statItem}>
          <StatsCard 
            title="Reversed Today" 
            value={stats.reversedOrders} 
            icon={faBox}
            color="#e74c3c" 
            isCurrency={false}
          />
        </div>
        <div className="fade-in delay-5" style={styles.statItem}>
          <StatsCard 
            title="Low Stock" 
            value={stats.lowStock} 
            icon={faExclamationTriangle}
            color="#f39c12" 
            isCurrency={false}
          />
        </div>
        <div className="fade-in delay-6" style={styles.statItem}>
          <StatsCard 
            title="Total Products" 
            value={stats.totalProducts} 
            icon={faTools}
            color="#9b59b6" 
            isCurrency={false}
          />
        </div>
        <div className="fade-in delay-6" style={styles.statItem}>
          <StatsCard 
            title="Total Customers" 
            value={stats.totalCustomers} 
            icon={faUsers}
            color="#1abc9c" 
            isCurrency={false}
          />
        </div>
      </div>

      {/* Low Stock Alert */}
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
                    <span style={styles.lowStockQty}>
                      📦 Current: {product.currentStock}
                    </span>
                    <span style={styles.lowStockThreshold}>
                      ⚠️ Threshold: {product.lowStockThreshold}
                    </span>
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
                  {product.currentStock === 0 && (
                    <span style={styles.outOfStockBadge}>OUT OF STOCK</span>
                  )}
                </div>
              ))}
            </div>
          </UnifiedCard>
        </div>
      )}

      {/* Recent Orders */}
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
                        {order.reversed && (
                          <span style={styles.orderBadge}>Reversed</span>
                        )}
                      </td>
                      <td>{order.customer?.name || 'Walk-in'}</td>
                      <td>{order.items.length} items</td>
                      <td style={styles.amount}>{formatPriceMK(order.totalAmount)}</td>
                      <td style={styles.profit}>+{formatPriceMK(order.profit)}</td>
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
                      <td style={styles.time}>{new Date(order.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </UnifiedCard>
      </div>
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
  orderBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '8px',
    padding: '3px 8px',
    borderRadius: '999px',
    backgroundColor: '#fde2e2',
    color: '#991b1b',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.6px'
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