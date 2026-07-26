import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import Button from '../components/common/Button';
import { formatPriceMK } from '../utils/formatPrice';

const Inventory = () => {
  const [products, setProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    product: '',
    type: 'wastage',
    quantity: '',
    reason: ''
  });
  const [summary, setSummary] = useState([]);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [productsRes, adjustmentsRes, summaryRes] = await Promise.all([
        api.get('/products'),
        api.get('/inventory'),
        api.get('/inventory/summary')
      ]);
      setProducts(productsRes.data);
      setAdjustments(adjustmentsRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      await api.post('/inventory', {
        product: formData.product,
        type: formData.type,
        quantity: parseInt(formData.quantity),
        reason: formData.reason
      });
      setSuccess('✅ Adjustment created successfully!');
      setShowForm(false);
      setFormData({ product: '', type: 'wastage', quantity: '', reason: '' });
      await loadData();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Error creating adjustment:', err);
      setError(err.response?.data?.message || 'Failed to create adjustment');
      setTimeout(() => setError(''), 5000);
    }
  };

  const getTypeLabel = (type) => {
    const labels = {
      wastage: '🚫 Wastage',
      damage: '💔 Damage',
      return: '🔄 Return',
      restock: '📦 Restock',
      count_correction: '✏️ Count Correction'
    };
    return labels[type] || type;
  };

  const getTypeColor = (type) => {
    const colors = {
      wastage: '#e74c3c',
      damage: '#e67e22',
      return: '#f39c12',
      restock: '#2ecc71',
      count_correction: '#3498db'
    };
    return colors[type] || '#888';
  };

  const getTypeIcon = (type) => {
    const icons = {
      wastage: '🚫',
      damage: '💔',
      return: '🔄',
      restock: '📦',
      count_correction: '✏️'
    };
    return icons[type] || '📋';
  };

  if (loading) {
    return (
      <PageContainer title="📦 Inventory">
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading inventory data...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="📦 Inventory Adjustments">
      <div style={styles.header}>
        <p style={styles.subtitle}>Track wastage, damages, and stock adjustments</p>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Close' : '+ New Adjustment'}
        </Button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}

      {/* Summary Cards with Animations */}
      <div style={styles.summaryGrid}>
        {summary.map((item, index) => (
          <div 
            key={item._id} 
            className={`fade-in delay-${(index % 6) + 1}`}
            style={{
              ...styles.summaryCard, 
              borderLeft: `4px solid ${getTypeColor(item._id)}`,
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
            <div style={styles.summaryIcon}>{getTypeIcon(item._id)}</div>
            <div>
              <span style={styles.summaryLabel}>{getTypeLabel(item._id)}</span>
              <span style={styles.summaryValue}>{item.totalQuantity}</span>
              <span style={styles.summaryCount}>{item.count} entries</span>
            </div>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="fade-in">
          <UnifiedCard title="New Inventory Adjustment">
            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Product *</label>
                  <select
                    required
                    style={styles.input}
                    value={formData.product}
                    onChange={(e) => setFormData({...formData, product: e.target.value})}
                  >
                    <option value="">Select Product</option>
                    {products.map(p => (
                      <option key={p._id} value={p._id}>
                        {p.name} (Stock: {p.currentStock})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Adjustment Type *</label>
                  <select
                    required
                    style={styles.input}
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="wastage">🚫 Wastage (spoiled)</option>
                    <option value="damage">💔 Damage (broken)</option>
                    <option value="return">🔄 Return to supplier</option>
                    <option value="restock">📦 Restock</option>
                    <option value="count_correction">✏️ Count Correction</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Quantity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    style={styles.input}
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                    placeholder="Enter quantity"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Reason *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    placeholder="Why is this adjustment needed?"
                  />
                </div>
              </div>
              <div style={styles.formActions}>
                <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit">Create Adjustment</Button>
              </div>
            </form>
          </UnifiedCard>
        </div>
      )}

      {/* Adjustments List */}
      <div className="fade-in">
        <UnifiedCard title="📋 Adjustment History">
          {adjustments.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyIcon}>📋</p>
              <p style={styles.emptyText}>No adjustments recorded yet</p>
              <p style={styles.emptySubtext}>Start tracking inventory adjustments</p>
            </div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Previous Stock</th>
                    <th>New Stock</th>
                    <th>Reason</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adj, index) => (
                    <tr 
                      key={adj._id} 
                      className={`fade-in delay-${(index % 6) + 1}`}
                      style={styles.tableRow}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8f9fa';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={styles.productName}>{adj.product?.name || 'Unknown'}</td>
                      <td>
                        <span style={{
                          ...styles.typeBadge,
                          backgroundColor: getTypeColor(adj.type) + '20',
                          color: getTypeColor(adj.type)
                        }}>
                          {getTypeLabel(adj.type)}
                        </span>
                      </td>
                      <td style={{
                        color: adj.type === 'restock' ? '#2ecc71' : '#e74c3c',
                        fontWeight: 'bold'
                      }}>
                        {adj.type === 'restock' ? '+' : '-'}{adj.quantity}
                      </td>
                      <td>{adj.previousStock}</td>
                      <td style={{ fontWeight: 'bold', color: '#1a1a2e' }}>{adj.newStock}</td>
                      <td style={styles.reason}>{adj.reason}</td>
                      <td style={styles.date}>{new Date(adj.createdAt).toLocaleString()}</td>
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
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '20px',
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
    marginBottom: '2px'
  },
  summaryValue: {
    display: 'block',
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1a1a2e'
  },
  summaryCount: {
    display: 'block',
    fontSize: '11px',
    color: '#aaa',
    marginTop: '2px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px'
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    transition: 'border 0.3s ease'
  },
  formActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end'
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
  productName: {
    fontWeight: '500',
    color: '#1a1a2e'
  },
  typeBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '500',
    display: 'inline-block'
  },
  reason: {
    maxWidth: '150px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#666'
  },
  date: {
    fontSize: '12px',
    color: '#888',
    whiteSpace: 'nowrap'
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

export default Inventory;