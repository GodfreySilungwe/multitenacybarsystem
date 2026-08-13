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
  const { isGlobalOwner, isSales, isBarOwner, isOwner, user } = useAuth();
  const showInventoryCards = isBarOwner || user?.role === 'manager';
  const [stats, setStats] = useState({
    todaySales: 0,
    todaySalesProceeds: 0,
    todayCashSales: 0,
    todayCreditSales: 0,
    todayProfit: 0,
    totalOrders: 0,
    reversedOrders: 0,
    lowStock: 0,
    totalProducts: 0,
    totalCustomers: 0,
    customersServed: 0,
    totalItemsSold: 0,
    activeSalesAccounts: 0,
    allSalesAccounts: 0,
    totalBars: 0,
    activeBars: 0,
    suspendedBars: 0,
    deletedBars: 0,
    pendingApplications: 0,
    activeRatio: 0,
    pendingApplicationRatio: 0
  });
  const [globalBars, setGlobalBars] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [creditSettlementSummary, setCreditSettlementSummary] = useState([]);
  const [paymentMethodProceeds, setPaymentMethodProceeds] = useState([]);
  const [totalOutstandingCredit, setTotalOutstandingCredit] = useState(0);
  const [outstandingCreditInPeriod, setOutstandingCreditInPeriod] = useState(0);
  const [productSales, setProductSales] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [outstandingCustomers, setOutstandingCustomers] = useState([]);
  const [unpaidCredit, setUnpaidCredit] = useState(0);
  const [totalCreditSales, setTotalCreditSales] = useState(0);
  const [totalImmediateReceipts, setTotalImmediateReceipts] = useState(0);
  const [totalCreditCollected, setTotalCreditCollected] = useState(0);
  const [dateRange, setDateRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange, customStartDate, customEndDate]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchDashboardData();
    };

    window.addEventListener('payment-updated', handleRefresh);
    return () => window.removeEventListener('payment-updated', handleRefresh);
  }, [dateRange, customStartDate, customEndDate]);

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
        const allSalesAccounts = bars.reduce((sum, bar) => sum + (bar.activeSalesAccounts || 0), 0);

        const pendingApplicationsCount = applications.filter((app) => app.status === 'pending').length;
        const activeRatio = bars.length > 0 ? Math.round((activeBars / bars.length) * 100) : 0;
        const pendingApplicationRatio = bars.length > 0 ? Math.round((pendingApplicationsCount / bars.length) * 100) : 0;

        setStats((prev) => ({
          ...prev,
          totalBars: bars.length,
          activeBars,
          suspendedBars,
          deletedBars,
          allSalesAccounts,
          pendingApplications: pendingApplicationsCount,
          activeRatio,
          pendingApplicationRatio
        }));
        setGlobalBars(bars.slice(0, 5));
        setRecentOrders([]);
        setLowStockProducts([]);
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        const params = { range: dateRange };
        if (dateRange === 'custom') {
          if (customStartDate) params.startDate = customStartDate;
          if (customEndDate) params.endDate = customEndDate;
        }

        const [todayRes, productsRes, customersRes, lowStockRes, ordersRes, usersSummaryRes, summaryRes] = await Promise.all([
          api.get('/orders/today'),
          api.get('/products'),
          api.get('/customers'),
          api.get('/products/low-stock'),
          api.get('/orders'),
          api.get('/users/summary'),
          api.get('/orders/summary', { params })
        ].map((promise) => promise.catch((err) => err)));

        const todayData = todayRes instanceof Error ? { count: 0, totalSales: 0, totalProfit: 0 } : todayRes.data;
        const products = productsRes instanceof Error ? [] : productsRes.data || [];
        // Handle both array and paginated response formats
        const customersData = customersRes instanceof Error ? [] : customersRes.data || [];
        const customers = Array.isArray(customersData) ? customersData : customersData.items || [];
        const lowStock = lowStockRes instanceof Error ? [] : lowStockRes.data || [];
        // Handle both array and paginated response formats for orders
        const ordersData = ordersRes instanceof Error ? [] : ordersRes.data || [];
        const ordersArray = Array.isArray(ordersData) ? ordersData : ordersData.items || [];
        const recent = ordersArray.slice(0, 5);
        const userSummary = usersSummaryRes instanceof Error ? {} : usersSummaryRes.data || {};
        const summaryData = summaryRes instanceof Error ? {} : summaryRes.data || {};
        const activeSalesAccounts = Number(userSummary.activeSalesAccounts || 0);

        setStats({
          todaySales: summaryData.totalSales || 0,
          todaySalesProceeds: summaryData.totalSalesByMethodProceeds || summaryData.directSales || 0,
          todayCashSales: summaryData.totalImmediateReceipts || 0,
          todayCreditSales: summaryData.totalCreditSales || 0,
          todayProfit: summaryData.totalProfit || 0,
          totalOrders: summaryData.totalOrders || 0,
          reversedOrders: summaryData.reversedOrders || 0,
          lowStock: lowStock.length || 0,
          totalProducts: products.length || 0,
          totalCustomers: customers.length || 0,
          customersServed: summaryData.customersServedCount || 0,
          totalItemsSold: summaryData.totalQuantitySold || 0,
          activeSalesAccounts,
          totalBars: 0,
          activeBars: 0,
          suspendedBars: 0,
          deletedBars: 0,
          pendingApplications: 0
        });
        setRecentOrders(recent);
        setProductsList(products);
        setLowStockProducts(lowStock);
        setCreditSettlementSummary(summaryData.creditSettlementSummary || []);
        setPaymentMethodProceeds(summaryData.paymentMethodProceeds || []);
        setProductSales(summaryData.productSales || []);
        setOutstandingCustomers(summaryData.outstandingCustomers || []);
        setUnpaidCredit(summaryData.unpaidCredit || 0);
        setTotalCreditSales(summaryData.totalCreditSales || 0);
        setTotalImmediateReceipts(summaryData.directSales || summaryData.totalImmediateReceipts || 0);
        setTotalOutstandingCredit(summaryData.totalOutstandingCredit || 0);
        setOutstandingCreditInPeriod(summaryData.outstandingCreditInPeriod || 0);
        setStats((prev) => ({
          ...prev,
          todayCashSales: summaryData.directSales || summaryData.totalImmediateReceipts || 0
        }));
        setTotalCreditCollected(summaryData.customerPreviousBillsPaid || summaryData.totalCreditCollected || 0);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Could not load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const creditOutstandingAmount = unpaidCredit;

  const totalCustomerOutstandingBalance = outstandingCustomers.reduce((sum, customer) => sum + Number(customer.totalOutstandingBalance || 0), 0);
  const totalCustomerPeriodBalance = outstandingCustomers.reduce((sum, customer) => sum + Number(customer.periodOutstandingBalance || 0), 0);
  const totalCreditOrderCount = outstandingCustomers.reduce((sum, customer) => sum + Number(customer.ordersCount || 0), 0);
  const totalProductSoldQty = productSales.reduce((sum, item) => sum + Number(item.soldQuantity || 0), 0);
  const totalPurchaseOrdersQty = productSales.reduce((sum, item) => sum + Number(item.purchaseOrdersQty || 0), 0);
  const totalStartQty = productSales.reduce((sum, item) => sum + (item.startingQty !== null ? Number(item.startingQty || 0) : 0), 0);
  const totalClosingQty = productSales.reduce((sum, item) => sum + Number(item.closingQty || 0), 0);
  const totalProductSalesAmount = productSales.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const inventoryValueAtCost = (productsList || []).reduce((sum, p) => {
    const qty = Number(p.currentStock || 0);
    const cost = Number(p.costPrice || p.purchasePrice || 0);
    return sum + qty * cost;
  }, 0);

  const inventoryValueAtSelling = (productsList || []).reduce((sum, p) => {
    const qty = Number(p.currentStock || 0);
    const sell = Number(p.sellingPrice || p.price || 0);
    return sum + qty * sell;
  }, 0);
  const expectedHandoverValue = Number(stats.todaySales || 0) - Number(outstandingCreditInPeriod || 0) + Number(totalCreditCollected || 0);
  const outstandingCustomerCount = outstandingCustomers.length || 0;
  const totalCustomersServed = stats.customersServed || 0;
  const totalItemsSold = stats.totalItemsSold || totalProductSoldQty;

  const directPaymentMethodProceeds = paymentMethodProceeds.filter(
    (method) => String(method.method).toLowerCase() !== 'credit'
  );
  const creditByMethodProceeds = creditSettlementSummary || [];
  const totalDirectPaymentProceeds = directPaymentMethodProceeds.reduce(
    (sum, method) => sum + Number(method.totalAmount || 0),
    0
  );
  const totalCreditPaidByMethod = creditByMethodProceeds.reduce(
    (sum, method) => sum + Number(method.amount || 0),
    0
  );
  const outstandingCreditValue = Number(outstandingCreditInPeriod || 0);

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
              <StatsCard title="Active Ratio" value={`${stats.activeRatio}%`} icon={faChartLine} color="#1abc9c" />
            </div>
            <div className="fade-in delay-6" style={styles.statItem}>
              <StatsCard title="Pending Applications" value={stats.pendingApplications} icon={faClipboardCheck} color="#9b59b6" />
            </div>
            <div className="fade-in delay-7" style={styles.statItem}>
              <StatsCard title="Pending Ratio" value={`${stats.pendingApplicationRatio}%`} icon={faExclamationTriangle} color="#f39c12" />
            </div>
            <div className="fade-in delay-8" style={styles.statItem}>
              <StatsCard title="All Sales Accounts" value={stats.allSalesAccounts} icon={faUsers} color="#8e44ad" />
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
          <div style={styles.dateFilterRow}>
            <div style={styles.filters}>
              {['today', 'custom'].map((option) => (
                <button
                  key={option}
                  style={{
                    ...styles.filterBtn,
                    ...(dateRange === option ? styles.filterBtnActive : {})
                  }}
                  onClick={() => setDateRange(option)}
                >
                  {option === 'today' ? 'Today' : 'Custom'}
                </button>
              ))}
            </div>
            {dateRange === 'custom' && (
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
              </div>
            )}
          </div>

          {showInventoryCards && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div className="fade-in delay-0" style={styles.statItem}>
                <StatsCard title="Inventory Value (Cost)" value={inventoryValueAtCost} icon={faBox} color="#6c757d" isCurrency />
              </div>
              <div className="fade-in delay-0" style={styles.statItem}>
                <StatsCard title="Inventory Value (Selling)" value={inventoryValueAtSelling} icon={faBox} color="#28a745" isCurrency />
              </div>
            </div>
          )}

          <div style={styles.statsGrid}>
            <div className="fade-in delay-1" style={styles.statItem}>
              <StatsCard title="Total Sales" value={stats.todaySales} icon={faDollarSign} color="#e94560" isCurrency />
            </div>
            <div className="fade-in delay-2" style={styles.statItem}>
              <StatsCard title="Orders" value={stats.totalOrders} icon={faShoppingCart} color="#3498db" />
            </div>
            <div className="fade-in delay-3" style={styles.statItem}>
              <StatsCard title="Reversed" value={stats.reversedOrders} icon={faBox} color="#e74c3c" />
            </div>
            <div className="fade-in delay-4" style={styles.statItem}>
              <StatsCard title="Low Stock" value={stats.lowStock} icon={faExclamationTriangle} color="#f39c12" />
            </div>
            <div className="fade-in delay-5" style={styles.statItem}>
              <StatsCard title="Products" value={stats.totalProducts} icon={faTools} color="#9b59b6" />
            </div>
            <div className="fade-in delay-6" style={styles.statItem}>
              <StatsCard
                title="Collected Sales"
                subtitle="Total cash and card value collected from sales, including direct POS transactions and bill settlements."
                value={stats.todaySalesProceeds}
                icon={faDollarSign}
                color="#27ae60"
                isCurrency
              />
            </div>
            <div className="fade-in delay-7" style={styles.statItem}>
              <StatsCard
                title="POS DIRECT SALES"
                subtitle="Immediate on-the-spot sales recorded through the POS, excluding customer bill settlements."
                value={stats.todayCashSales}
                icon={faDollarSign}
                color="#2ecc71"
                isCurrency
              />
            </div>
            <div className="fade-in delay-8" style={styles.statItem}>
              <StatsCard
                title="POS Bill Management"
                subtitle="Payments received against customer bills and outstanding invoices processed through POS."
                value={stats.todayCreditSales}
                icon={faDollarSign}
                color="#8e44ad"
                isCurrency
              />
            </div>
            <div className="fade-in delay-9" style={styles.statItem}>
              <StatsCard title="Customers" value={stats.totalCustomers} icon={faUsers} color="#1abc9c" />
            </div>
            <div className="fade-in delay-10" style={styles.statItem}>
              <StatsCard title="Sales Accounts" value={stats.activeSalesAccounts} icon={faUsers} color="#9b59b6" />
            </div>
          </div>

          <div className="fade-in" style={{ marginBottom: '20px' }}>
            <UnifiedCard title="🧾 Handover Summary">
              <div style={styles.handoverGrid}>
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>Total Sales</span>
                  <span style={styles.metricValue}>{formatPriceMK(stats.todaySales)}</span>
                </div>
                {!isSales && (
                  <div style={styles.handoverMetric}>
                    <span style={styles.metricLabel}>Total Profit</span>
                    <span style={styles.metricValue}>{formatPriceMK(stats.todayProfit)}</span>
                  </div>
                )}
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>Orders Processed</span>
                  <span style={styles.metricValue}>{stats.totalOrders}</span>
                </div>
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>Items Sold</span>
                  <span style={styles.metricValue}>{totalItemsSold}</span>
                </div>
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>Customers Served</span>
                  <span style={styles.metricValue}>{totalCustomersServed}</span>
                </div>
                    <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>POS DIRECT SALES</span>
                  <span style={styles.metricValue}>{formatPriceMK(totalImmediateReceipts)}</span>
                </div>
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>POS Bill Management</span>
                  <span style={styles.metricValue}>{formatPriceMK(totalCreditSales)}</span>
                </div>
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>Outstanding Bills (this period)</span>
                  <span style={styles.metricValue}>{formatPriceMK(outstandingCreditInPeriod)}</span>
                </div>
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>Accumulated Bills (All)</span>
                  <span style={styles.metricValue}>{formatPriceMK(totalOutstandingCredit)}</span>
                </div>
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>Previous Bills Collected (Paid)</span>
                  <span style={styles.metricValue}>{formatPriceMK(totalCreditCollected)}</span>
                </div>
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>Expected Handover</span>
                  <span style={styles.metricValue}>{formatPriceMK(expectedHandoverValue)}</span>
                </div>
                <div style={styles.handoverMetric}>
                  <span style={styles.metricLabel}>Outstanding Customers</span>
                  <span style={styles.metricValue}>{outstandingCustomerCount}</span>
                </div>
              </div>
            </UnifiedCard>
          </div>


          <div className="fade-in" style={{ marginBottom: '20px' }}>
            <UnifiedCard title="💳 Payment Summary & Credit Breakdown">
              <p style={styles.sectionDescription}>This section separates direct receipt proceeds by method, outstanding customer credit, and bill repayment by credit payment method. Older credit payments without a recorded method are counted as Cash.</p>
              {(paymentMethodProceeds.length > 0 || creditByMethodProceeds.length > 0) ? (
                <>
                  <div style={styles.sectionTitleRow}>
                    <div style={styles.sectionTitle}>Direct Receipt Proceeds by Method</div>
                  </div>
                  {directPaymentMethodProceeds.length > 0 ? (
                    <div style={styles.tableWrapper}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th>Payment Method</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {directPaymentMethodProceeds.map((method) => (
                            <tr key={method.method} style={styles.tableRow}>
                              <td style={styles.orderNumber}>{method.method}</td>
                              <td style={styles.amount}>{formatPriceMK(method.totalAmount)}</td>
                            </tr>
                          ))}
                          <tr style={styles.tableRow}>
                            <td style={styles.orderNumber}><strong>Total</strong></td>
                            <td style={styles.amount}><strong>{formatPriceMK(totalDirectPaymentProceeds)}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={styles.emptyState}>
                      <p style={styles.emptyIcon}>💳</p>
                      <p style={styles.emptyText}>No direct payment proceeds recorded for this period</p>
                    </div>
                  )}

                  <div style={styles.creditSummaryRow}>
                    <div style={styles.creditSummaryLabel}>Outstanding Credit</div>
                    <div style={styles.creditSummaryValue}>{formatPriceMK(outstandingCreditValue)}</div>
                  </div>

                  {creditByMethodProceeds.length > 0 && (
                    <div style={{ marginTop: '18px' }}>
                      <div style={styles.sectionTitle}>Bill Repayment</div>
                      <div style={styles.disclaimerText}>Only payments that were applied to credit orders are included here. Older payments with no method recorded are counted as Cash.</div>
                      <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th>Payment Method</th>
                              <th>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {creditByMethodProceeds.map((method) => (
                              <tr key={method.method} style={styles.tableRow}>
                                <td style={styles.orderNumber}>{method.method}</td>
                                <td style={styles.amount}>{formatPriceMK(method.amount)}</td>
                              </tr>
                            ))}
                            <tr style={styles.tableRow}>
                              <td style={styles.orderNumber}><strong>Total</strong></td>
                              <td style={styles.amount}><strong>{formatPriceMK(totalCreditPaidByMethod)}</strong></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={styles.emptyState}>
                  <p style={styles.emptyIcon}>💳</p>
                  <p style={styles.emptyText}>No payment proceeds recorded for this period</p>
                </div>
              )}
            </UnifiedCard>
          </div>

          <div className="fade-in" style={{ marginBottom: '20px' }}>
            <UnifiedCard title="�📦 Product Sales Summary">
              {productSales.length > 0 ? (
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Start Qty</th>
                        <th>Purchase Order Qty</th>
                        <th>Sold Qty</th>
                        <th>Closing Qty</th>
                        <th>Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productSales.map((item) => (
                        <tr key={item.productId || item.name} style={styles.tableRow}>
                          <td style={styles.orderNumber}>{item.name}</td>
                          <td>{item.startingQty !== null ? item.startingQty : '-'}</td>
                          <td>{item.purchaseOrdersQty ? item.purchaseOrdersQty : '-'}</td>
                          <td>{item.soldQuantity}</td>
                          <td>{item.closingQty}</td>
                          <td style={styles.amount}>{formatPriceMK(item.totalAmount)}</td>
                        </tr>
                      ))}
                      <tr style={styles.tableRow}>
                        <td style={styles.orderNumber}><strong>Total (including unpaid bills) — Purchase Order Qty</strong></td>
                        <td>{totalStartQty}</td>
                        <td>{totalPurchaseOrdersQty ? totalPurchaseOrdersQty : '-'}</td>
                        <td>{totalProductSoldQty}</td>
                        <td>{totalClosingQty}</td>
                        <td style={styles.amount}><strong>{formatPriceMK(totalProductSalesAmount)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={styles.emptyState}>
                  <p style={styles.emptyIcon}>📦</p>
                  <p style={styles.emptyText}>No product sales for this period</p>
                </div>
              )}
            </UnifiedCard>
          </div>

          <div className="fade-in">
            <UnifiedCard title="🧾 Customers with Unsettled Bills">
              {outstandingCustomers.length > 0 ? (
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>Outstanding Balance (Total)</th>
                        <th>Outstanding Balance (Period)</th>
                        <th>Open Credit Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outstandingCustomers.map((customer) => (
                        <tr key={customer.customerId || customer.name} style={styles.tableRow}>
                          <td style={styles.orderNumber}>{customer.name}</td>
                          <td>{customer.phone || '-'}</td>
                          <td style={styles.amount}>{formatPriceMK(customer.totalOutstandingBalance || 0)}</td>
                          <td style={styles.amount}>{formatPriceMK(customer.periodOutstandingBalance || 0)}</td>
                          <td>{customer.ordersCount}</td>
                        </tr>
                      ))}
                      <tr style={styles.tableRow}>
                        <td style={styles.orderNumber}><strong>Total</strong></td>
                        <td>-</td>
                        <td style={styles.amount}><strong>{formatPriceMK(totalCustomerOutstandingBalance)}</strong></td>
                        <td style={styles.amount}><strong>{formatPriceMK(totalCustomerPeriodBalance)}</strong></td>
                        <td><strong>{totalCreditOrderCount}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={styles.emptyState}>
                  <p style={styles.emptyIcon}>🧾</p>
                  <p style={styles.emptyText}>No customers with unsettled bills for this period</p>
                </div>
              )}
            </UnifiedCard>
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
  handoverGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px'
  },
  creditSummaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    borderRadius: '12px',
    border: '1px solid #e6e8ed',
    backgroundColor: '#fff',
    marginTop: '18px'
  },
  creditSummaryLabel: {
    fontSize: '14px',
    color: '#374151',
    fontWeight: '600'
  },
  creditSummaryValue: {
    fontSize: '16px',
    color: '#1f2937',
    fontWeight: '700'
  },
  handoverMetric: {
    padding: '18px 16px',
    borderRadius: '16px',
    border: '1px solid #e6e8ed',
    backgroundColor: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
  },
  metricLabel: {
    display: 'block',
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '10px'
  },
  metricValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#111827'
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
  dateFilterRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  filters: {
    display: 'flex',
    gap: '10px'
  },
  filterBtn: {
    padding: '8px 16px',
    borderRadius: '999px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700'
  },
  filterBtnActive: {
    backgroundColor: '#e94560',
    color: 'white',
    borderColor: '#e94560'
  },
  customRangeRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '12px',
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
  sectionTitleRow: {
    marginBottom: '12px'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#111827'
  },
  disclaimerText: {
    marginTop: '8px',
    marginBottom: '12px',
    fontSize: '13px',
    color: '#555'
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