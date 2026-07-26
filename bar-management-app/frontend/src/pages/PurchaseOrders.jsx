import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import Button from '../components/common/Button';
import { formatPriceMK } from '../utils/formatPrice';

const PurchaseOrders = () => {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    supplier: '',
    items: [{ product: '', quantity: '', costPrice: '' }],
    expectedDelivery: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [ordersRes, suppliersRes, productsRes] = await Promise.all([
        api.get('/purchase-orders'),
        api.get('/suppliers'),
        api.get('/products')
      ]);
      setOrders(ordersRes.data);
      setSuppliers(suppliersRes.data);
      setProducts(productsRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { product: '', quantity: '', costPrice: '' }]
    });
  };

  const handleRemoveItem = (index) => {
    if (formData.items.length === 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const items = formData.items.filter(item => item.product && item.quantity && item.costPrice);
      if (items.length === 0) {
        setError('Please add at least one item');
        setTimeout(() => setError(''), 5000);
        return;
      }

      const orderData = {
        supplier: formData.supplier,
        items: items.map(item => ({
          product: item.product,
          quantity: parseInt(item.quantity),
          costPrice: parseFloat(item.costPrice)
        })),
        expectedDelivery: formData.expectedDelivery || null,
        notes: formData.notes
      };

      await api.post('/purchase-orders', orderData);
      setSuccess('✅ Purchase order created successfully!');
      setShowForm(false);
      setFormData({
        supplier: '',
        items: [{ product: '', quantity: '', costPrice: '' }],
        expectedDelivery: '',
        notes: ''
      });
      await loadData();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Error creating purchase order:', err);
      setError(err.response?.data?.message || 'Failed to create purchase order');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleUpdateStatus = async (orderId, status) => {
    try {
      await api.put(`/purchase-orders/${orderId}/status`, { status });
      setSuccess(`✅ Order status updated to ${status}`);
      await loadData();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update status');
      setTimeout(() => setError(''), 5000);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#f39c12',
      ordered: '#3498db',
      received: '#2ecc71',
      cancelled: '#e74c3c'
    };
    return colors[status] || '#888';
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: '⏳ Pending',
      ordered: '📦 Ordered',
      received: '✅ Received',
      cancelled: '❌ Cancelled'
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <PageContainer title="📦 Purchase Orders">
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading purchase orders...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="📦 Purchase Orders">
      <div style={styles.header}>
        <p style={styles.subtitle}>Manage supplier purchase orders</p>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Close' : '+ New Purchase Order'}
        </Button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}

      {showForm && (
        <div className="fade-in">
          <UnifiedCard title="Create Purchase Order">
            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Supplier *</label>
                <select
                  required
                  style={styles.input}
                  value={formData.supplier}
                  onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div style={styles.itemsSection}>
                <label style={styles.label}>Items *</label>
                {formData.items.map((item, index) => (
                  <div key={index} style={styles.itemRow}>
                    <select
                      required
                      style={{...styles.input, flex: 2}}
                      value={item.product}
                      onChange={(e) => handleItemChange(index, 'product', e.target.value)}
                    >
                      <option value="">Select Product</option>
                      {products.map(p => (
                        <option key={p._id} value={p._id}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      required
                      placeholder="Qty"
                      style={{...styles.input, flex: 1}}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    />
                    <input
                      type="number"
                      required
                      placeholder="Cost Price"
                      style={{...styles.input, flex: 1}}
                      value={item.costPrice}
                      onChange={(e) => handleItemChange(index, 'costPrice', e.target.value)}
                    />
                    <button
                      type="button"
                      style={styles.removeBtn}
                      onClick={() => handleRemoveItem(index)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fde8e8';
                        e.currentTarget.style.borderColor = '#e74c3c';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                        e.currentTarget.style.borderColor = '#ddd';
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <Button variant="secondary" onClick={handleAddItem} size="small">
                  + Add Item
                </Button>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Expected Delivery</label>
                <input
                  type="date"
                  style={styles.input}
                  value={formData.expectedDelivery}
                  onChange={(e) => setFormData({...formData, expectedDelivery: e.target.value})}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Notes</label>
                <textarea
                  style={{...styles.input, minHeight: '60px'}}
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                />
              </div>

              <div style={styles.formActions}>
                <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit">Create Order</Button>
              </div>
            </form>
          </UnifiedCard>
        </div>
      )}

      <div style={styles.ordersGrid}>
        {orders.length === 0 ? (
          <div className="fade-in" style={styles.emptyState}>
            <p style={styles.emptyIcon}>📦</p>
            <p style={styles.emptyText}>No purchase orders yet</p>
            <p style={styles.emptySubtext}>Create your first purchase order</p>
          </div>
        ) : (
          orders.map((order, index) => (
            <div 
              key={order._id}
              className={`fade-in delay-${(index % 6) + 1}`}
              style={styles.orderCard}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)';
                e.currentTarget.style.borderColor = '#e94560';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                e.currentTarget.style.borderColor = '#f0f0f0';
              }}
            >
              <div style={styles.orderHeader}>
                <div>
                  <h3 style={styles.orderNumber}>{order.orderNumber}</h3>
                  <p style={styles.supplierName}>🏷️ {order.supplier?.name}</p>
                </div>
                <div>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: getStatusColor(order.status) + '20',
                    color: getStatusColor(order.status)
                  }}>
                    {getStatusLabel(order.status)}
                  </span>
                </div>
              </div>

              <div style={styles.orderDetails}>
                <div style={styles.orderItems}>
                  {order.items.map((item, idx) => (
                    <div key={idx} style={styles.orderItem}>
                      <span>{item.product?.name || item.productName || item.product || 'Product'}</span>
                      <span>{item.quantity} × {formatPriceMK(item.costPrice)}</span>
                      <span>= {formatPriceMK(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div style={styles.orderTotal}>
                  <span><strong>Total:</strong> {formatPriceMK(order.totalAmount)}</span>
                  {order.expectedDelivery && (
                    <span>📅 Expected: {new Date(order.expectedDelivery).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              <div style={styles.orderActions}>
                {order.status === 'pending' && (
                  <>
                    <button
                      style={{...styles.actionBtn, ...styles.orderedBtn}}
                      onClick={() => handleUpdateStatus(order._id, 'ordered')}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#2980b9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#3498db';
                      }}
                    >
                      📦 Mark Ordered
                    </button>
                    <button
                      style={{...styles.actionBtn, ...styles.receivedBtn}}
                      onClick={() => handleUpdateStatus(order._id, 'received')}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#27ae60';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#2ecc71';
                      }}
                    >
                      ✅ Mark Received
                    </button>
                  </>
                )}
                {order.status === 'ordered' && (
                  <button
                    style={{...styles.actionBtn, ...styles.receivedBtn}}
                    onClick={() => handleUpdateStatus(order._id, 'received')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#27ae60';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#2ecc71';
                    }}
                  >
                    ✅ Mark Received
                  </button>
                )}
                {(order.status === 'pending' || order.status === 'ordered') && (
                  <button
                    style={{...styles.actionBtn, ...styles.cancelBtn}}
                    onClick={() => handleUpdateStatus(order._id, 'cancelled')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#c0392b';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#e74c3c';
                    }}
                  >
                    ❌ Cancel
                  </button>
                )}
              </div>
            </div>
          ))
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
  ordersGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    width: '100%'
  },
  orderCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    border: '1px solid #f0f0f0',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: '12px'
  },
  orderNumber: {
    margin: '0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a2e'
  },
  supplierName: {
    margin: '4px 0 0 0',
    color: '#666',
    fontSize: '14px'
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '500',
    display: 'inline-block'
  },
  orderDetails: {
    paddingTop: '12px',
    borderTop: '1px solid #f0f0f0'
  },
  orderItems: {
    marginBottom: '10px'
  },
  orderItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '14px',
    color: '#666',
    borderBottom: '1px solid #f8f9fa'
  },
  orderTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: '8px',
    fontSize: '14px',
    borderTop: '1px solid #e0e0e0',
    flexWrap: 'wrap',
    gap: '5px'
  },
  orderActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #f0f0f0',
    flexWrap: 'wrap'
  },
  actionBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
    transition: 'all 0.3s ease'
  },
  orderedBtn: {
    backgroundColor: '#3498db',
    color: 'white'
  },
  receivedBtn: {
    backgroundColor: '#2ecc71',
    color: 'white'
  },
  cancelBtn: {
    backgroundColor: '#e74c3c',
    color: 'white'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px'
  },
  itemsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  itemRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center'
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    transition: 'border 0.3s ease',
    fontFamily: 'inherit'
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  removeBtn: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.3s ease'
  },
  formActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end'
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
  emptyState: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '60px 0'
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

export default PurchaseOrders;