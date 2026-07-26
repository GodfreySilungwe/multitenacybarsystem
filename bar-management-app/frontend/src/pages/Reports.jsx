import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import ExportButton from '../components/common/ExportButton';
import { formatPriceMK } from '../utils/formatPrice';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('week');
  const [reportData, setReportData] = useState({
    sales: [],
    topProducts: [],
    categorySales: [],
    dailySales: [],
    paymentMethods: [],
    creditAccounts: [],
    totalSales: 0,
    totalProfit: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    totalCreditOutstanding: 0
  });

  useEffect(() => {
    loadReportData();
  }, [dateRange]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      setError(null);

      const ordersRes = await api.get('/orders');
      const orders = ordersRes.data;
      const customersRes = await api.get('/customers');
      const customers = customersRes.data || [];
      const productsRes = await api.get('/products');

      const now = new Date();
      let startDate = new Date();
      
      if (dateRange === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (dateRange === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else if (dateRange === 'month') {
        startDate.setMonth(now.getMonth() - 1);
      } else if (dateRange === 'year') {
        startDate.setFullYear(now.getFullYear() - 1);
      }

      const filteredOrders = orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startDate && !order.reversed;
      });

      const totalSales = filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const totalProfit = filteredOrders.reduce((sum, o) => sum + o.profit, 0);
      const totalOrders = filteredOrders.length;
      const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

      const dailySalesMap = {};
      filteredOrders.forEach(order => {
        const date = new Date(order.createdAt).toLocaleDateString();
        if (!dailySalesMap[date]) {
          dailySalesMap[date] = { sales: 0, profit: 0, count: 0 };
        }
        dailySalesMap[date].sales += order.totalAmount;
        dailySalesMap[date].profit += order.profit;
        dailySalesMap[date].count += 1;
      });

      const dailySales = Object.keys(dailySalesMap).map(date => ({
        date,
        sales: dailySalesMap[date].sales,
        profit: dailySalesMap[date].profit,
        count: dailySalesMap[date].count
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      const productSalesMap = {};
      filteredOrders.forEach(order => {
        order.items.forEach(item => {
          const productName = item.product?.name || 'Unknown';
          if (!productSalesMap[productName]) {
            productSalesMap[productName] = { quantity: 0, revenue: 0 };
          }
          productSalesMap[productName].quantity += item.quantity;
          productSalesMap[productName].revenue += item.subtotal;
        });
      });

      const topProducts = Object.keys(productSalesMap)
        .map(name => ({
          name,
          quantity: productSalesMap[name].quantity,
          revenue: productSalesMap[name].revenue
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const categorySalesMap = {};
      filteredOrders.forEach(order => {
        order.items.forEach(item => {
          const categoryName = item.product?.category?.name || 'Uncategorized';
          if (!categorySalesMap[categoryName]) {
            categorySalesMap[categoryName] = 0;
          }
          categorySalesMap[categoryName] += item.subtotal;
        });
      });

      const categorySales = Object.keys(categorySalesMap)
        .map(name => ({
          name,
          revenue: categorySalesMap[name]
        }))
        .sort((a, b) => b.revenue - a.revenue);

      const paymentMethodsMap = {};
      filteredOrders.forEach(order => {
        const method = order.paymentMethod || 'unknown';
        if (!paymentMethodsMap[method]) {
          paymentMethodsMap[method] = { count: 0, amount: 0 };
        }
        paymentMethodsMap[method].count += 1;
        paymentMethodsMap[method].amount += order.totalAmount;
      });

      const paymentMethods = Object.keys(paymentMethodsMap).map(method => ({
        method: method.replace('_', ' '),
        count: paymentMethodsMap[method].count,
        amount: paymentMethodsMap[method].amount
      }));

      const creditAccounts = customers
        .filter(customer => Number(customer.creditBalance || 0) > 0)
        .map(customer => ({
          name: customer.name,
          phone: customer.phone,
          balance: Number(customer.creditBalance || 0)
        }))
        .sort((a, b) => b.balance - a.balance);

      const totalCreditOutstanding = creditAccounts.reduce((sum, customer) => sum + customer.balance, 0);

      setReportData({
        sales: filteredOrders,
        topProducts,
        categorySales,
        dailySales,
        paymentMethods,
        creditAccounts,
        totalSales,
        totalProfit,
        totalOrders,
        averageOrderValue,
        totalCreditOutstanding
      });

    } catch (err) {
      console.error('Error loading report data:', err);
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const dailySalesChartData = {
    labels: reportData.dailySales.map(d => d.date),
    datasets: [
      {
        label: 'Sales (MK)',
        data: reportData.dailySales.map(d => d.sales),
        backgroundColor: 'rgba(233, 69, 96, 0.6)',
        borderColor: '#e94560',
        borderWidth: 2,
        tension: 0.4,
        fill: true
      },
      {
        label: 'Profit (MK)',
        data: reportData.dailySales.map(d => d.profit),
        backgroundColor: 'rgba(46, 204, 113, 0.6)',
        borderColor: '#2ecc71',
        borderWidth: 2,
        tension: 0.4,
        fill: true
      }
    ]
  };

  const topProductsChartData = {
    labels: reportData.topProducts.map(p => p.name),
    datasets: [
      {
        label: 'Revenue (MK)',
        data: reportData.topProducts.map(p => p.revenue),
        backgroundColor: [
          '#e94560', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
          '#1abc9c', '#e67e22', '#2c3e50', '#e74c3c', '#00bcd4'
        ],
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  const categoryChartData = {
    labels: reportData.categorySales.map(c => c.name),
    datasets: [
      {
        label: 'Revenue (MK)',
        data: reportData.categorySales.map(c => c.revenue),
        backgroundColor: [
          '#e94560', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
          '#1abc9c', '#e67e22', '#2c3e50'
        ],
        borderWidth: 1
      }
    ]
  };

  const paymentChartData = {
    labels: reportData.paymentMethods.map(p => p.method),
    datasets: [
      {
        label: 'Transactions',
        data: reportData.paymentMethods.map(p => p.count),
        backgroundColor: ['#2ecc71', '#3498db', '#f39c12', '#9b59b6'],
        borderWidth: 1
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: { size: 12 },
          usePointStyle: true,
          padding: 20
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return 'MK ' + value.toLocaleString();
          }
        }
      }
    }
  };

  if (loading) {
    return (
      <PageContainer title="📊 Reports">
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading report data...</p>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer title="📊 Reports">
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.retryBtn} onClick={loadReportData}>Retry</button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="📊 Reports & Analytics">
      {/* Date Range Filter & Export Buttons */}
      <div style={styles.filterContainer}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Date Range:</label>
          <div style={styles.filterButtons}>
            {['today', 'week', 'month', 'year'].map((range, index) => (
              <button
                key={range}
                className={`fade-in delay-${(index % 4) + 1}`}
                style={{
                  ...styles.filterBtn,
                  ...(dateRange === range ? styles.filterBtnActive : {})
                }}
                onClick={() => setDateRange(range)}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button 
          style={styles.refreshBtn} 
          onClick={loadReportData}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e94560';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#e94560';
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Export Buttons */}
      <div style={styles.exportSection}>
        <ExportButton type="sales" label="Export Sales (Excel)" icon="📊" variant="success" />
        <ExportButton type="sales-pdf" label="Export Sales (PDF)" icon="📄" variant="info" />
        <ExportButton type="inventory" label="Export Inventory" icon="📦" variant="warning" />
        <ExportButton type="customers" label="Export Customers" icon="👤" variant="secondary" />
      </div>
      <div style={styles.exportNote}>
        🧾 Sales exports exclude reversed orders and reflect active sales only.
      </div>

      {/* Summary Cards with Animations */}
      <div style={styles.summaryGrid}>
        {[
          { title: 'Total Sales', value: formatPriceMK(reportData.totalSales), icon: '💰', color: '#e94560', delay: 1 },
          { title: 'Total Profit', value: formatPriceMK(reportData.totalProfit), icon: '📈', color: '#2ecc71', delay: 2 },
          { title: 'Total Orders', value: reportData.totalOrders, icon: '🛒', color: '#3498db', delay: 3 },
          { title: 'Average Order', value: formatPriceMK(reportData.averageOrderValue), icon: '📊', color: '#9b59b6', delay: 4 },
          { title: 'Outstanding Credit', value: formatPriceMK(reportData.totalCreditOutstanding), icon: '🧾', color: '#f39c12', delay: 5 },
          { title: 'Credit Customers', value: reportData.creditAccounts.length, icon: '👥', color: '#1abc9c', delay: 6 }
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
              <p style={styles.summaryLabel}>{item.title}</p>
              <p style={styles.summaryValue}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {reportData.creditAccounts.length > 0 && (
        <div className="fade-in delay-5" style={{ marginBottom: '20px' }}>
          <UnifiedCard title="🧾 Customer Credit Accounts">
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Outstanding Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.creditAccounts.map((customer, index) => (
                    <tr key={index} style={styles.tableRow}>
                      <td style={styles.productName}>{customer.name}</td>
                      <td>{customer.phone}</td>
                      <td style={styles.revenue}>{formatPriceMK(customer.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </UnifiedCard>
        </div>
      )}

      {/* Charts Grid with Animations */}
      <div style={styles.chartsGrid}>
        <div className="fade-in delay-1" style={styles.chartWrapper}>
          <UnifiedCard title="📈 Daily Sales & Profit Trend" style={styles.chartCard}>
            <div style={styles.chartContainer}>
              {reportData.dailySales.length > 0 ? (
                <Line data={dailySalesChartData} options={chartOptions} />
              ) : (
                <div style={styles.noData}>
                  <p style={styles.noDataIcon}>📊</p>
                  <p>No sales data available for this period</p>
                </div>
              )}
            </div>
          </UnifiedCard>
        </div>

        <div className="fade-in delay-2" style={styles.chartWrapper}>
          <UnifiedCard title="🏆 Top Selling Products" style={styles.chartCard}>
            <div style={styles.chartContainer}>
              {reportData.topProducts.length > 0 ? (
                <Bar data={topProductsChartData} options={{
                  ...chartOptions,
                  plugins: {
                    ...chartOptions.plugins,
                    legend: { display: false }
                  }
                }} />
              ) : (
                <div style={styles.noData}>
                  <p style={styles.noDataIcon}>🏆</p>
                  <p>No product data available</p>
                </div>
              )}
            </div>
          </UnifiedCard>
        </div>

        <div className="fade-in delay-3" style={styles.chartWrapper}>
          <UnifiedCard title="📁 Sales by Category" style={styles.chartCard}>
            <div style={styles.chartContainer}>
              {reportData.categorySales.length > 0 ? (
                <Pie data={categoryChartData} options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'right',
                      labels: { font: { size: 11 } }
                    }
                  }
                }} />
              ) : (
                <div style={styles.noData}>
                  <p style={styles.noDataIcon}>📁</p>
                  <p>No category data available</p>
                </div>
              )}
            </div>
          </UnifiedCard>
        </div>

        <div className="fade-in delay-4" style={styles.chartWrapper}>
          <UnifiedCard title="💳 Payment Methods" style={styles.chartCard}>
            <div style={styles.chartContainer}>
              {reportData.paymentMethods.length > 0 ? (
                <Pie data={paymentChartData} options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'right',
                      labels: { font: { size: 11 } }
                    }
                  }
                }} />
              ) : (
                <div style={styles.noData}>
                  <p style={styles.noDataIcon}>💳</p>
                  <p>No payment data available</p>
                </div>
              )}
            </div>
          </UnifiedCard>
        </div>
      </div>

      {/* Top Products Table */}
      {reportData.topProducts.length > 0 && (
        <div className="fade-in delay-5">
          <UnifiedCard title="📋 Top Products Details">
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Quantity Sold</th>
                    <th>Revenue</th>
                    <th>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.topProducts.map((product, index) => (
                    <tr 
                      key={index}
                      style={styles.tableRow}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8f9fa';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={styles.rank}>{index + 1}</td>
                      <td style={styles.productName}>{product.name}</td>
                      <td>{product.quantity}</td>
                      <td style={styles.revenue}>{formatPriceMK(product.revenue)}</td>
                      <td>
                        <div style={styles.percentBar}>
                          <div style={{
                            ...styles.percentFill,
                            width: `${(product.revenue / reportData.totalSales) * 100}%`,
                            backgroundColor: index === 0 ? '#e94560' : 
                                          index === 1 ? '#3498db' : 
                                          index === 2 ? '#2ecc71' : '#f39c12'
                          }} />
                          <span style={styles.percentText}>
                            {((product.revenue / reportData.totalSales) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </UnifiedCard>
        </div>
      )}
    </PageContainer>
  );
};

const styles = {
  filterContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '15px'
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  filterLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  filterButtons: {
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
  refreshBtn: {
    padding: '8px 20px',
    borderRadius: '8px',
    border: '2px solid #e94560',
    backgroundColor: 'transparent',
    color: '#e94560',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease'
  },
  exportSection: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '25px',
    padding: '15px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  exportNote: {
    marginTop: '14px',
    padding: '12px 16px',
    borderRadius: '12px',
    backgroundColor: '#e8f8f5',
    color: '#0f766e',
    fontSize: '13px',
    border: '1px solid #8ed1c2'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
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
    cursor: 'pointer'
  },
  summaryIcon: {
    fontSize: '32px'
  },
  summaryLabel: {
    fontSize: '13px',
    color: '#888',
    margin: '0 0 4px 0'
  },
  summaryValue: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1a1a2e',
    margin: 0
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '20px',
    width: '100%'
  },
  chartWrapper: {
    width: '100%'
  },
  chartCard: {
    marginBottom: '0'
  },
  chartContainer: {
    height: '280px',
    width: '100%',
    position: 'relative'
  },
  noData: {
    textAlign: 'center',
    color: '#888',
    padding: '40px 0',
    fontSize: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%'
  },
  noDataIcon: {
    fontSize: '48px',
    marginBottom: '10px'
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
  rank: {
    fontWeight: 'bold',
    color: '#888',
    textAlign: 'center'
  },
  productName: {
    fontWeight: '500',
    color: '#1a1a2e'
  },
  revenue: {
    fontWeight: 'bold',
    color: '#2ecc71'
  },
  percentBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  percentFill: {
    height: '8px',
    borderRadius: '4px',
    minWidth: '20px',
    transition: 'width 0.5s ease'
  },
  percentText: {
    fontSize: '12px',
    color: '#888',
    minWidth: '45px'
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
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    padding: '20px'
  },
  errorIcon: {
    fontSize: '48px',
    marginBottom: '15px'
  },
  errorText: {
    fontSize: '16px',
    color: '#e74c3c',
    marginBottom: '15px'
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

export default Reports;