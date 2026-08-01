import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import ReceiptModal from '../components/common/ReceiptModal';
import { formatPriceMK } from '../utils/formatPrice';

const POS = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [customerRequests, setCustomerRequests] = useState([]);
  const [customerPayments, setCustomerPayments] = useState([]);
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState(null);
  const [rejectingPaymentId, setRejectingPaymentId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [notification, setNotification] = useState('');
  const [notificationHistory, setNotificationHistory] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [activeAddedProductId, setActiveAddedProductId] = useState(null);

  useEffect(() => {
    loadData();

    const handleRequestCreated = async () => {
      await loadData();
      const nextNotification = {
        id: Date.now(),
        message: 'New customer order request received. Please review it on the POS screen.',
        createdAt: new Date().toLocaleTimeString()
      };
      setNotificationHistory((prev) => [nextNotification, ...prev].slice(0, 8));
      setNotification(nextNotification.message);
      setShowNotifications(true);
      setTimeout(() => setNotification(''), 4000);
    };

    const handleRequestUpdated = async () => {
      await loadData();
    };

    const handlePaymentCreated = async (e) => { 
      const payment = e?.detail || {};
      await loadData();
      const nextNotification = {
        id: Date.now(),
        message: `New customer payment request: ${formatPriceMK(payment?.amountRequested || payment?.amount || 0)} - review and confirm.`,
        createdAt: new Date().toLocaleTimeString()
      };
      setNotificationHistory((prev) => [nextNotification, ...prev].slice(0, 8));
      setNotification(nextNotification.message);
      setShowNotifications(true);
      setTimeout(() => setNotification(''), 4000);
    };

    const handleStorageEvent = async (event) => {
      if (event.key !== 'customer-portal-event' || !event.newValue) {
        return;
      }
      try {
        const payload = JSON.parse(event.newValue);
        if (!payload || !payload.type) {
          return;
        }

        if (payload.type === 'customer-payment-created') {
          await handlePaymentCreated({ detail: payload.detail });
        }
        if (payload.type === 'customer-request-created') {
          await handleRequestCreated();
        }
        if (payload.type === 'customer-request-updated') {
          await handleRequestUpdated();
        }
      } catch (error) {
        console.warn('Unable to parse customer portal storage event:', error);
      }
    };

    window.addEventListener('customer-request-created', handleRequestCreated);
    window.addEventListener('customer-request-updated', handleRequestUpdated);
    window.addEventListener('customer-payment-created', handlePaymentCreated);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('customer-request-created', handleRequestCreated);
      window.removeEventListener('customer-request-updated', handleRequestUpdated);
      window.removeEventListener('customer-payment-created', handlePaymentCreated);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await loadData();
      const nextNotification = { id: Date.now(), message: 'POS refreshed.', createdAt: new Date().toLocaleTimeString() };
      setNotificationHistory((prev) => [nextNotification, ...prev].slice(0, 8));
      setNotification(nextNotification.message);
      setTimeout(() => setNotification(''), 2500);
    } catch (err) {
      console.error('Failed to refresh:', err);
      setError('Could not refresh POS data.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setRefreshing(false);
    }
  };

  const emitCustomerPortalEvent = (type, detail = null) => {
    const eventDetail = { type, detail, timestamp: Date.now() };
    try {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch (error) {
      const event = document.createEvent('Event');
      event.initEvent(type, true, true);
      event.detail = detail;
      window.dispatchEvent(event);
    }

    try {
      const storageKey = 'customer-portal-event';
      localStorage.setItem(storageKey, JSON.stringify(eventDetail));
      setTimeout(() => localStorage.removeItem(storageKey), 500);
    } catch (error) {
      console.warn('Unable to persist POS customer portal event to localStorage:', error);
    }
  };

  const loadData = async () => {
    try {
      const [productsRes, customersRes, categoriesRes, requestsRes, paymentsRes] = await Promise.all([
        api.get('/products'),
        api.get('/customers'),
        api.get('/categories'),
        api.get('/customer-order-requests'),
        api.get('/customer-order-requests/payments')
      ]);
      setProducts(productsRes.data);
      setCustomers(customersRes.data);
      setCategories(categoriesRes.data);
      setCustomerRequests((requestsRes.data || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      setCustomerPayments(((paymentsRes.data || []).filter(p => (p.status || 'pending') === 'pending')).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    }
  };

  const handleConfirmPayment = async (paymentId) => {
    try {
      setConfirmingPaymentId(paymentId);
      await api.patch(`/customer-order-requests/payments/${paymentId}/confirm`);
      // remove the confirmed payment immediately from UI
      setCustomerPayments((prev) => prev.filter((p) => p._id !== paymentId));
      await loadData();
      const nextNotification = { id: Date.now(), message: 'Payment confirmed and applied.', createdAt: new Date().toLocaleTimeString() };
      setNotificationHistory((prev) => [nextNotification, ...prev].slice(0, 8));
      setNotification(nextNotification.message);
      setTimeout(() => setNotification(''), 4000);
      window.dispatchEvent(new Event('customer-request-updated'));
    } catch (err) {
      console.error('Failed to confirm payment:', err);
      setError('Could not confirm payment.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setConfirmingPaymentId(null);
    }
  };

  const handleRejectPayment = async (paymentId) => {
    try {
      setRejectingPaymentId(paymentId);
      await api.patch(`/customer-order-requests/payments/${paymentId}/reject`);
      // remove the rejected payment immediately from UI
      setCustomerPayments((prev) => prev.filter((p) => p._id !== paymentId));
      await loadData();
      const nextNotification = { id: Date.now(), message: 'Payment request rejected.', createdAt: new Date().toLocaleTimeString() };
      setNotificationHistory((prev) => [nextNotification, ...prev].slice(0, 8));
      setNotification(nextNotification.message);
      setTimeout(() => setNotification(''), 4000);
      window.dispatchEvent(new Event('customer-request-updated'));
    } catch (err) {
      console.error('Failed to reject payment:', err);
      setError('Could not reject the payment.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setRejectingPaymentId(null);
    }
  };

  const handleConfirmRequest = async (requestId) => {
    try {
      setConfirmingId(requestId);
      await api.patch(`/customer-order-requests/${requestId}/confirm`);
      await loadData();
      setNotification('');
      setShowNotifications(false);
      window.dispatchEvent(new Event('customer-request-updated'));
    } catch (err) {
      console.error('Failed to confirm request:', err);
      setError('Could not confirm the request.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      setRejectingId(requestId);
      await api.patch(`/customer-order-requests/${requestId}/reject`);
      await loadData();
      setNotification('');
      setShowNotifications(false);
      window.dispatchEvent(new Event('customer-request-updated'));
    } catch (err) {
      console.error('Failed to reject request:', err);
      setError('Could not reject the request.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setRejectingId(null);
    }
  };

  const playAddToCartSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.12);
      gainNode.gain.setValueAtTime(0.0001, context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      setTimeout(() => context.close().catch(() => {}), 250);
    } catch (err) {
      console.warn('Unable to play add-to-cart sound:', err);
    }
  };

  const addToCart = (product) => {
    if (product.currentStock <= 0) {
      setError(`⚠️ ${product.name} is out of stock!`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item._id === product._id);
      if (existing) {
        if (existing.quantity >= product.currentStock) {
          setError(`⚠️ Not enough stock for ${product.name}`);
          setTimeout(() => setError(''), 3000);
          return prev;
        }
        return prev.map(item =>
          item._id === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });

    setFeedbackMessage(`${product.name} added to cart`);
    setActiveAddedProductId(product._id);
    playAddToCartSound();

    window.setTimeout(() => {
      setActiveAddedProductId(null);
      setFeedbackMessage('');
    }, 700);
  };

  const removeFromCart = (productId) => {
    setCart(prev => {
      const existing = prev.find(item => item._id === productId);
      if (existing && existing.quantity === 1) {
        return prev.filter(item => item._id !== productId);
      }
      return prev.map(item =>
        item._id === productId
          ? { ...item, quantity: item.quantity - 1 }
          : item
      );
    });
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('Are you sure you want to clear the cart?')) {
      setCart([]);
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const checkout = async () => {
    if (cart.length === 0) {
      setError('Cart is empty!');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (paymentMethod === 'credit' && !canUseCreditPayment) {
        setError('Credit payments are only available for registered customer accounts.');
        setTimeout(() => setError(''), 5000);
        return;
      }

      const normalizedPaymentAmount = paymentMethod === 'credit'
        ? (Number.isFinite(Number(paymentAmount)) ? Number(paymentAmount) : 0)
        : subtotal;

      const orderData = {
        items: cart.map(item => ({
          product: item._id,
          quantity: item.quantity
        })),
        customer: selectedCustomer || null,
        paymentMethod: paymentMethod,
        amountPaid: normalizedPaymentAmount
      };

      const response = await api.post('/orders', orderData);
      
      const newOrder = response.data;
      const selectedCustomerAccount = selectedCustomerData
        ? {
            username: selectedCustomerData.accountUsername || selectedCustomerData.username || '',
            password: selectedCustomerData.accountPassword || ''
          }
        : null;

      const receiptCustomerAccount = selectedCustomerAccount?.username
        ? selectedCustomerAccount
        : newOrder.customerAccount || null;

      setReceiptOrder({
        ...newOrder,
        customerName: selectedCustomerData?.name || newOrder.customerName || 'Walk-in Customer',
        customerAccount: receiptCustomerAccount
      });
      if (selectedCustomer) {
        emitCustomerPortalEvent('customer-request-updated', {
          customerId: selectedCustomer,
          order: newOrder
        });
      }
      setSuccess(`✅ Order ${newOrder.orderNumber} completed!`);
      setCart([]);
      const keepCustomerSelected = paymentMethod === 'credit' && selectedCustomer;
      setPaymentAmount('');
      setPaymentMethod('cash');
      await loadData();
      if (keepCustomerSelected) {
        setSelectedCustomer(selectedCustomer);
      } else {
        setSelectedCustomer('');
      }
      
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.message || 'Checkout failed!');
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const normalizedSearch = productSearch.trim().toLowerCase();
  const filteredProducts = products
    .filter((product) => selectedCategory === 'all' || product.category?._id === selectedCategory || product.category === selectedCategory)
    .filter((product) => {
      if (!normalizedSearch) return true;
      return (
        product.name?.toLowerCase().includes(normalizedSearch) ||
        product.unit?.toLowerCase().includes(normalizedSearch) ||
        product.category?.name?.toLowerCase().includes(normalizedSearch)
      );
    });

  const paymentMethodOptions = [
    { value: 'cash', label: '💵 Cash' },
    { value: 'airtel_money', label: '📲 Airtel Money' },
    { value: 'mpamba', label: '📱 Mpamba' },
    { value: 'bank_account', label: '🏦 Bank Account' },
    { value: 'credit', label: '🧾 Credit' }
  ];

  const pendingRequests = customerRequests.filter((request) => request.status === 'pending');
  const selectedCustomerData = customers.find(customer => customer._id === selectedCustomer);
  const selectedCustomerCreditBalance = Number(selectedCustomerData?.creditBalance || 0);
  const isRegisteredCustomer = Boolean(selectedCustomerData?.accountUsername || selectedCustomerData?.accountUserId || selectedCustomerData?.username);
  const canUseCreditPayment = Boolean(selectedCustomer) && isRegisteredCustomer;

  return (
    <PageContainer title="🛒 Point of Sale">
      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}
      {notification && (
        <div style={styles.notificationToast}>
          <span style={styles.notificationIcon}>🔔</span>
          <span>{notification}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button
          style={{ ...styles.refreshBtn, ...(refreshing ? styles.refreshBtnLoading : {}) }}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : '🔁 Refresh'}
        </button>
      </div>

      <div style={styles.notificationPanel}>
        <button style={styles.notificationToggle} onClick={() => setShowNotifications((prev) => !prev)}>
          {showNotifications ? 'Hide recent alerts' : 'Show recent alerts'}
        </button>
        {showNotifications && (
          <div style={styles.notificationHistoryList}>
            {notificationHistory.length > 0 ? notificationHistory.map((item) => (
              <div key={item.id} style={styles.notificationHistoryItem}>
                <div style={styles.notificationHistoryText}>{item.message}</div>
                <div style={styles.notificationHistoryTime}>{item.createdAt}</div>
              </div>
            )) : (
              <div style={styles.notificationHistoryEmpty}>No alerts yet.</div>
            )}
          </div>
        )}
      </div>

      {pendingRequests.length > 0 && (
        <div style={{ marginBottom: '18px' }}>
          <UnifiedCard title="🛍️ Customer Requests">
            <div style={styles.requestList}>
              {pendingRequests.map((request) => (
                <div key={request._id} style={styles.requestItem}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.requestCustomer}>{request.customerName || 'Customer'}</div>
                    {request.items?.length > 0 ? (
                      <div style={styles.requestDetail}>{request.items.map((item) => `${item.productName || 'Product'} × ${item.quantity || 1}`).join(', ')}</div>
                    ) : (
                      <div style={styles.requestDetail}>Qty: {request.quantity || 1}</div>
                    )}
                    <div style={styles.requestDetail}>Due: {formatPriceMK(request.amountDue || request.totalAmount || 0)}</div>
                    <div style={styles.requestTime}>{new Date(request.createdAt).toLocaleString()}</div>
                  </div>
                  <div style={styles.requestActions}>
                    <span style={{ ...styles.statusBadge, ...styles.pending }}>
                      Pending
                    </span>
                    <button
                      style={styles.confirmBtn}
                      onClick={() => handleConfirmRequest(request._id)}
                      disabled={confirmingId === request._id || rejectingId === request._id}
                    >
                      {confirmingId === request._id ? 'Confirming...' : 'Confirm'}
                    </button>
                    <button
                      style={{ ...styles.confirmBtn, ...styles.rejectBtn }}
                      onClick={() => handleRejectRequest(request._id)}
                      disabled={confirmingId === request._id || rejectingId === request._id}
                    >
                      {rejectingId === request._id ? 'Rejecting...' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </UnifiedCard>
        </div>
      )}

      {customerPayments.length > 0 && (
        <div style={{ marginBottom: '18px' }}>
          <UnifiedCard title="💸 Customer Payment Requests">
            <div style={styles.requestList}>
              {customerPayments.map((p) => (
                <div key={p._id} style={styles.requestItem}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.requestCustomer}>{p.customerName || 'Customer'}</div>
                    <div style={styles.requestDetail}>Amount: {formatPriceMK(p.amount || p.amountRequested || 0)}</div>
                    <div style={styles.requestDetail}>Method: {p.paymentMethod || 'cash'}</div>
                    {p.paymentReference && (
                      <div style={styles.requestDetail}>Ref: {p.paymentReference}</div>
                    )}
                    <div style={styles.requestTime}>{new Date(p.createdAt).toLocaleString()}</div>
                  </div>
                  <div style={styles.requestActions}>
                    <span style={{ ...styles.statusBadge, ...styles.pending }}>{p.status || 'pending'}</span>
                    <button
                      style={styles.confirmBtn}
                      onClick={() => handleConfirmPayment(p._id)}
                      disabled={confirmingPaymentId === p._id || rejectingPaymentId === p._id}
                    >
                      {confirmingPaymentId === p._id ? 'Confirming...' : 'Confirm'}
                    </button>
                    <button
                      style={{ ...styles.confirmBtn, ...styles.rejectBtn }}
                      onClick={() => handleRejectPayment(p._id)}
                      disabled={confirmingPaymentId === p._id || rejectingPaymentId === p._id}
                    >
                      {rejectingPaymentId === p._id ? 'Rejecting...' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </UnifiedCard>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .pos-mobile-stack {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .pos-mobile-product-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            max-height: none !important;
            padding: 2px 0 !important;
          }
          .pos-mobile-category-filter {
            gap: 6px !important;
          }
          .pos-mobile-category-btn {
            padding: 7px 12px !important;
            font-size: 12px !important;
          }
          .pos-mobile-cart-item {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
            padding: 10px 0 !important;
          }
          .pos-mobile-action-buttons {
            flex-direction: row !important;
          }
          .pos-mobile-payment-options {
            flex-wrap: wrap !important;
          }
          .pos-mobile-payment-btn {
            flex: 1 1 calc(50% - 6px) !important;
          }
        }

        @media (max-width: 480px) {
          .pos-mobile-product-grid {
            grid-template-columns: 1fr !important;
          }
          .pos-mobile-payment-btn {
            flex-basis: 100% !important;
          }
          .pos-mobile-product-btn {
            min-height: 108px !important;
            padding: 10px !important;
          }
          .pos-mobile-cart-item-actions {
            width: 100% !important;
            justify-content: flex-end !important;
          }
        }
      `}</style>

      <div style={styles.posLayout} className="pos-mobile-stack">
        {/* Left: Product Grid */}
        <div style={styles.productSection} className="pos-mobile-product-section">
          <UnifiedCard title="SMART BAR Menu">
            <div style={styles.categoryFilter} className="pos-mobile-category-filter">
              <input
                type="search"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={styles.searchInput}
              />
              <button
                className="category-btn pos-mobile-category-btn"
                style={{
                  ...styles.categoryBtn,
                  ...(selectedCategory === 'all' ? styles.categoryBtnActive : {})
                }}
                onClick={() => setSelectedCategory('all')}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat._id}
                  className="category-btn pos-mobile-category-btn"
                  style={{
                    ...styles.categoryBtn,
                    ...(selectedCategory === cat._id ? styles.categoryBtnActive : {})
                  }}
                  onClick={() => setSelectedCategory(cat._id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div style={styles.productGrid} className="pos-mobile-product-grid">
              {filteredProducts.map((product, index) => (
                <button
                  key={product._id}
                  className={`fade-in delay-${(index % 6) + 1} pos-mobile-product-btn`}
                  style={{
                    ...styles.productBtn,
                    ...(product.currentStock <= 0 ? styles.productOutOfStock : {}),
                    ...(activeAddedProductId === product._id ? styles.productAdded : {})
                  }}
                  onClick={() => addToCart(product)}
                  disabled={product.currentStock <= 0}
                  onMouseEnter={(e) => {
                    if (product.currentStock > 0) {
                      e.currentTarget.style.transform = 'translateY(-6px)';
                      e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)';
                      e.currentTarget.style.borderColor = '#e94560';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                    e.currentTarget.style.borderColor = '#e0e0e0';
                  }}
                >
                  <div style={styles.productName}>{product.name}</div>
                  <div style={styles.productPrice}>{formatPriceMK(product.sellingPrice)}</div>
                  <div style={styles.productUnit}>{product.unit || 'piece'}</div>
                  <div style={styles.productStock}>
                    {product.currentStock > 0 ? `📦 ${product.currentStock}` : '❌ Out of Stock'}
                  </div>
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <div style={styles.emptyState}>No items found in the SMART BAR menu</div>
              )}
            </div>
          </UnifiedCard>
        </div>

        {/* Right: Cart */}
        <div style={styles.cartSection} className="pos-mobile-cart-section">
          <UnifiedCard title={`🛒 Cart (${totalItems} items)`}>
            {feedbackMessage && (
              <div style={styles.feedbackBanner}>{feedbackMessage}</div>
            )}
            <div style={styles.customerSection}>
              <select
                style={styles.customerSelect}
                value={selectedCustomer}
                onChange={(e) => {
                  const nextCustomerId = e.target.value;
                  const nextCustomer = customers.find((customer) => customer._id === nextCustomerId);
                  const nextRegistered = Boolean(nextCustomer?.accountUsername || nextCustomer?.accountUserId || nextCustomer?.username);
                  setSelectedCustomer(nextCustomerId);
                  if (paymentMethod === 'credit' && !nextRegistered) {
                    setPaymentMethod('cash');
                    setPaymentAmount('');
                  }
                }}
              >
                <option value="">Walk-in Customer</option>
                {customers.map(customer => (
                  <option key={customer._id} value={customer._id}>
                    {customer.name} - {customer.phone}
                  </option>
                ))}
              </select>
              {selectedCustomerData && (
                <div style={styles.customerBalanceChip}>
                  Credit balance: {formatPriceMK(selectedCustomerCreditBalance)}
                </div>
              )}
            </div>

            <div style={styles.cartItems}>
              {cart.length === 0 ? (
                <div style={styles.emptyCart}>🛒 Cart is empty</div>
              ) : (
                cart.map(item => (
                  <div key={item._id} style={styles.cartItem} className="pos-mobile-cart-item">
                    <div style={styles.cartItemInfo}>
                      <div style={styles.cartItemName}>{item.name}</div>
                      <div style={styles.cartItemPrice}>
                        {formatPriceMK(item.sellingPrice)} x {item.quantity}
                      </div>
                    </div>
                    <div style={styles.cartItemActions} className="pos-mobile-cart-item-actions">
                      <button
                        style={styles.cartItemBtn}
                        onClick={() => removeFromCart(item._id)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f0f0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                        }}
                      >
                        −
                      </button>
                      <span style={styles.cartItemQty}>{item.quantity}</span>
                      <button
                        style={styles.cartItemBtn}
                        onClick={() => addToCart(item)}
                        disabled={item.quantity >= item.currentStock}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f0f0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div style={styles.totals}>
                <div style={styles.totalRow}>
                  <span>Subtotal:</span>
                  <span style={styles.totalAmount}>{formatPriceMK(subtotal)}</span>
                </div>
                <div style={styles.totalRow}>
                  <span>Items:</span>
                  <span>{totalItems}</span>
                </div>
              </div>
            )}

            <div style={styles.paymentSection}>
              <label style={styles.paymentLabel}>Payment Method:</label>
              <div style={styles.paymentOptions} className="pos-mobile-payment-options">
                {paymentMethodOptions.map((method) => {
                  const isCredit = method.value === 'credit';
                  const disabled = isCredit && !canUseCreditPayment;
                  return (
                    <label
                      key={method.value}
                      className="payment-btn pos-mobile-payment-btn"
                      style={{
                        ...styles.paymentBtn,
                        ...(paymentMethod === method.value ? styles.paymentBtnActive : {}),
                        ...(disabled ? styles.paymentBtnDisabled : {})
                      }}
                    >
                      <input
                        type="radio"
                        name="pos-payment-method"
                        value={method.value}
                        checked={paymentMethod === method.value}
                        disabled={disabled}
                        style={styles.paymentRadioInput}
                        onChange={() => {
                          if (disabled) {
                            setError('Credit payments are only available for registered customer accounts.');
                            setTimeout(() => setError(''), 4000);
                            return;
                          }
                          setPaymentMethod(method.value);
                          if (method.value !== 'credit') {
                            setPaymentAmount('');
                          }
                        }}
                      />
                      <span>{method.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {!canUseCreditPayment && paymentMethod === 'credit' && (
              <div style={styles.creditSection}>
                <div style={styles.creditHint}>Credit payments are only available for registered customer accounts.</div>
              </div>
            )}

            {paymentMethod === 'credit' && canUseCreditPayment && (
              <div style={styles.creditSection}>
                <label style={styles.paymentLabel}>Amount Paid Now:</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  style={styles.creditInput}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={`Enter amount up to ${formatPriceMK(subtotal)}`}
                />
                <div style={styles.creditHint}>
                  Customer balance will be {formatPriceMK(Math.max(0, subtotal - (Number.isFinite(Number(paymentAmount)) ? Number(paymentAmount) : 0)) + selectedCustomerCreditBalance)} after this order.
                </div>
              </div>
            )}

            <div style={styles.actionButtons} className="pos-mobile-action-buttons">
              <button
                className="btn-modern btn-danger-modern"
                style={styles.checkoutBtn}
                onClick={clearCart}
                disabled={cart.length === 0}
                onMouseEnter={(e) => {
                  if (cart.length > 0) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(231, 76, 60, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                🗑️ Clear
              </button>
              <button
                className="btn-modern btn-success-modern"
                style={{
                  ...styles.checkoutBtn,
                  ...styles.checkoutBtnSuccess,
                  ...(loading ? styles.checkoutBtnLoading : {})
                }}
                onClick={checkout}
                disabled={cart.length === 0 || loading}
                onMouseEnter={(e) => {
                  if (cart.length > 0 && !loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(46, 204, 113, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {loading ? '⏳ Processing...' : `💰 Checkout ${formatPriceMK(subtotal)}`}
              </button>
            </div>
          </UnifiedCard>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptOrder && (
        <ReceiptModal 
          order={receiptOrder} 
          onClose={() => setReceiptOrder(null)} 
        />
      )}
    </PageContainer>
  );
};

const styles = {
  posLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
    gap: '20px',
    alignItems: 'start',
    width: '100%',
    overflowX: 'hidden'
  },
  productSection: {
    minHeight: '500px',
    width: '100%'
  },
  cartSection: {
    minHeight: '500px',
    width: '100%'
  },
  categoryFilter: {
    display: 'flex',
    gap: '8px',
    marginBottom: '15px',
    flexWrap: 'wrap'
  },
  categoryBtn: {
    padding: '6px 16px',
    borderRadius: '20px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.3s ease',
    minHeight: '38px'
  },
  categoryBtnActive: {
    backgroundColor: '#e94560',
    color: 'white',
    borderColor: '#e94560'
  },
  productGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '10px',
    maxHeight: '500px',
    overflowY: 'auto',
    padding: '2px',
    width: '100%'
  },
  productBtn: {
    padding: '12px',
    borderRadius: '12px',
    border: '1px solid #e0e0e0',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'center',
    width: '100%',
    minHeight: '120px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
  },
  productOutOfStock: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  productAdded: {
    transform: 'scale(1.02)',
    boxShadow: '0 0 0 2px #e94560 inset, 0 8px 20px rgba(233, 69, 96, 0.2)',
    backgroundColor: '#fff7f8'
  },
  feedbackBanner: {
    marginBottom: '10px',
    padding: '8px 10px',
    borderRadius: '8px',
    backgroundColor: '#fff5f7',
    color: '#e94560',
    fontSize: '13px',
    fontWeight: '600',
    border: '1px solid #ffd6df'
  },
  productName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1a1a2e'
  },
  productPrice: {
    fontSize: '16px',
    color: '#e94560',
    fontWeight: 'bold',
    marginTop: '4px'
  },
productUnit: {
  fontSize: '11px',
  color: '#999',
  marginTop: '2px',
  textTransform: 'capitalize'
},
  productStock: {
    fontSize: '12px',
    color: '#888',
    marginTop: '4px'
  },
  emptyState: {
    textAlign: 'center',
    color: '#888',
    padding: '40px 0',
    gridColumn: '1 / -1'
  },
  customerSection: {
    marginBottom: '15px'
  },
  customerBalanceChip: {
    marginTop: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: '13px',
    fontWeight: '600'
  },
  customerSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    backgroundColor: 'white'
  },
  cartItems: {
    maxHeight: '280px',
    overflowY: 'auto',
    marginBottom: '15px'
  },
  emptyCart: {
    textAlign: 'center',
    color: '#888',
    padding: '30px 0'
  },
  cartItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0'
  },
  cartItemInfo: {
    flex: 1
  },
  cartItemName: {
    fontSize: '14px',
    fontWeight: '500'
  },
  cartItemPrice: {
    fontSize: '12px',
    color: '#888'
  },
  cartItemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  cartItemBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease'
  },
  cartItemQty: {
    fontWeight: 'bold',
    minWidth: '20px',
    textAlign: 'center'
  },
  totals: {
    padding: '12px 0',
    borderTop: '2px solid #e0e0e0',
    marginBottom: '15px'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '16px',
    padding: '4px 0'
  },
  totalAmount: {
    fontWeight: 'bold',
    color: '#e94560',
    fontSize: '20px'
  },
  paymentSection: {
    marginBottom: '15px'
  },
  creditSection: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  creditInput: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px'
  },
  creditHint: {
    fontSize: '12px',
    color: '#666'
  },
  paymentLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '8px'
  },
  paymentOptions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  paymentBtn: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    flex: '1 1 140px',
    minHeight: '44px',
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  paymentRadioInput: {
    accentColor: '#e94560',
    margin: 0
  },
  paymentBtnActive: {
    backgroundColor: '#e94560',
    color: 'white',
    borderColor: '#e94560'
  },
  paymentBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
    backgroundColor: '#f8f8f8'
  },
  actionButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  checkoutBtn: {
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    width: '100%',
    minHeight: '48px'
  },
  checkoutBtnSuccess: {
    backgroundColor: '#2ecc71',
    color: 'white'
  },
  checkoutBtnLoading: {
    opacity: 0.7,
    cursor: 'wait'
  },
  notificationToast: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    borderRadius: '12px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    color: '#1f2937',
    marginBottom: '16px',
    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)'
  },
  notificationIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#e5f1ff',
    color: '#2563eb',
    fontSize: '16px'
  },
  notificationPanel: {
    marginBottom: '18px',
    padding: '12px 16px',
    borderRadius: '14px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    boxShadow: '0 6px 16px rgba(15, 23, 42, 0.04)'
  },
  notificationToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: '#f3f4f6',
    color: '#111827',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600'
  },
  notificationHistoryList: {
    marginTop: '12px',
    display: 'grid',
    gap: '10px'
  },
  notificationHistoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: '12px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e5e7eb'
  },
  notificationHistoryText: {
    color: '#111827',
    fontSize: '14px'
  },
  notificationHistoryTime: {
    color: '#6b7280',
    fontSize: '12px'
  },
  notificationHistoryEmpty: {
    color: '#6b7280',
    fontSize: '13px',
    textAlign: 'center',
    padding: '16px 0'
  },
  refreshBtn: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px'
  },
  refreshBtnLoading: {
    opacity: 0.7,
    cursor: 'wait'
  },
  requestList: {
    display: 'grid',
    gap: '12px'
  },
  requestItem: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '16px',
    borderRadius: '16px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    alignItems: 'flex-start'
  },
  requestCustomer: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#111827',
    marginBottom: '6px'
  },
  requestDetail: {
    fontSize: '13px',
    color: '#4b5563',
    marginBottom: '6px'
  },
  requestTime: {
    fontSize: '12px',
    color: '#6b7280'
  },
  requestActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    alignItems: 'flex-end'
  },
  statusBadge: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  confirmed: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    border: '1px solid #a7f3d0'
  },
  pending: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fcd34d'
  },
  confirmBtn: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#10b981',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '600',
    minWidth: '96px'
  },
  rejectBtn: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
    color: 'white'
  },
  error: {
    backgroundColor: '#fde8e8',
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #f5c6cb'
  },
  success: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #c3e6cb'
  }
};

export default POS;