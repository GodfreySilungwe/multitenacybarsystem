import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import Button from '../components/common/Button';
import UnifiedCard from '../components/common/UnifiedCard';
import BatchProductForm from '../components/common/BatchProductForm';
import { formatPriceMK } from '../utils/formatPrice';
import { confirmTypedDelete } from '../utils/confirmation';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    costPrice: '',
    sellingPrice: '',
    currentStock: '',
    lowStockThreshold: '5',
    unit: 'piece'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories')
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const productData = {
        name: formData.name,
        category: formData.category,
        costPrice: parseFloat(formData.costPrice),
        sellingPrice: parseFloat(formData.sellingPrice),
        currentStock: parseInt(formData.currentStock),
        lowStockThreshold: parseInt(formData.lowStockThreshold),
        unit: formData.unit || 'piece'
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct._id}`, productData);
      } else {
        await api.post('/products', productData);
      }
      
      setShowForm(false);
      setEditingProduct(null);
      setFormData({
        name: '',
        category: '',
        costPrice: '',
        sellingPrice: '',
        currentStock: '',
        lowStockThreshold: '5',
        unit: 'piece'
      });
      await loadData();
    } catch (err) {
      console.error('Error saving product:', err);
      alert('Failed to save product');
    }
  };

  const handleDelete = async (id) => {
    if (!confirmTypedDelete('delete this product')) return;
    try {
      await api.delete(`/products/${id}`);
      await loadData();
    } catch (err) {
      console.error('Error deleting product:', err);
      alert('Failed to delete product');
    }
  };

  const handleBatchSubmit = async (batch) => {
    await api.post('/products/batch', { products: batch });
    setShowBatchForm(false);
    await loadData();
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category?._id || product.category,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      currentStock: product.currentStock,
      lowStockThreshold: product.lowStockThreshold,
      unit: product.unit || 'piece'
    });
    setShowForm(true);
  };

  const getUnitIcon = (unit) => {
    const icons = {
      piece: '🧊',
      shot: '🥃',
      glass: '🍷',
      bottle: '🍾',
      can: '🥫',
      mug: '🍺',
      pitcher: '🍻',
      case: '📦',
      packet: '📦'
    };
    return icons[unit] || '📦';
  };

  const filteredProducts = products.filter((product) => {
    const searchValue = searchTerm.trim().toLowerCase();
    if (!searchValue) return true;

    return [product.name, product.category?.name, product.unit]
      .some((value) => String(value || '').toLowerCase().includes(searchValue));
  });

  if (loading) {
    return (
          <PageContainer title="🍹 SMART BAR Products">
        <p>Loading products...</p>
      </PageContainer>
    );
  }

  return (
      <PageContainer title="🍹 SMART BAR Products">
      <div style={styles.header}>
          <p style={styles.subtitle}>Manage your SMART BAR inventory</p>
        <div style={styles.headerActions}>
          <input
            type="search"
            aria-label="Search products"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          <Button onClick={() => { setShowForm(!showForm); setShowBatchForm(false); }}>
            {showForm ? '✕ Close' : '+ Add Product'}
          </Button>
          <Button variant="secondary" onClick={() => { setShowBatchForm(!showBatchForm); setShowForm(false); }}>
            {showBatchForm ? '✕ Close batch' : '+ Batch Add'}
          </Button>
        </div>
      </div>

      {showBatchForm && (
        <BatchProductForm
          categories={categories}
          onComplete={handleBatchSubmit}
          onCancel={() => setShowBatchForm(false)}
        />
      )}

      {showForm && (
        <UnifiedCard title={editingProduct ? 'Edit Product' : 'Add New Product'}>
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.formGrid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Product Name *</label>
                <input
                  type="text"
                  required
                  style={styles.input}
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Category *</label>
                <select
                  required
                  style={styles.input}
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat._id} value={cat._id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Cost Price (MK) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  style={styles.input}
                  value={formData.costPrice}
                  onChange={(e) => setFormData({...formData, costPrice: e.target.value})}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Selling Price (MK) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  style={styles.input}
                  value={formData.sellingPrice}
                  onChange={(e) => setFormData({...formData, sellingPrice: e.target.value})}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Current Stock *</label>
                <input
                  type="number"
                  required
                  min="0"
                  style={styles.input}
                  value={formData.currentStock}
                  onChange={(e) => setFormData({...formData, currentStock: e.target.value})}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Low Stock Threshold</label>
                <input
                  type="number"
                  min="0"
                  style={styles.input}
                  value={formData.lowStockThreshold}
                  onChange={(e) => setFormData({...formData, lowStockThreshold: e.target.value})}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Unit</label>
                <select
                  style={styles.input}
                  name="unit"
                  value={formData.unit}
                  onChange={(e) => setFormData({...formData, unit: e.target.value})}
                >
                  <option value="piece">🧊 Piece</option>
                  <option value="shot">🥃 Shot</option>
                  <option value="glass">🍷 Glass</option>
                  <option value="bottle">🍾 Bottle</option>
                  <option value="can">🥫 Can</option>
                  <option value="mug">🍺 Mug</option>
                  <option value="pitcher">🍻 Pitcher</option>
                  <option value="case">📦 Case</option>
                  <option value="packet">📦 Packet</option>
                </select>
              </div>
            </div>
            <div style={styles.formActions}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit">{editingProduct ? 'Update' : 'Create'}</Button>
            </div>
          </form>
        </UnifiedCard>
      )}

      <div style={styles.productGrid}>
        {filteredProducts.map((product, index) => (
          <div 
            key={product._id} 
            className={`fade-in delay-${(index % 6) + 1}`}
            style={styles.productCard}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-6px)';
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)';
              e.currentTarget.style.borderColor = '#e94560';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
              e.currentTarget.style.borderColor = '#f0f0f0';
            }}
          >
            <div style={styles.productHeader}>
              <div>
                <h3 style={styles.productName}>{product.name}</h3>
                <span style={styles.productUnit}>
                  {getUnitIcon(product.unit)} {product.unit || 'piece'}
                </span>
              </div>
              <div style={styles.productActions}>
                <button style={styles.editBtn} onClick={() => handleEdit(product)}>✏️</button>
                <button style={styles.deleteBtn} onClick={() => handleDelete(product._id)}>🗑️</button>
              </div>
            </div>
            <div style={styles.productDetails}>
              <span style={styles.productCategory}>📁 {product.category?.name || 'No Category'}</span>
              <span style={styles.productPrice}>💰 {formatPriceMK(product.sellingPrice)}</span>
              <span style={styles.productCost}>Cost: {formatPriceMK(product.costPrice)}</span>
              <span style={product.currentStock <= product.lowStockThreshold ? styles.productStockLow : styles.productStock}>
                📦 Stock: {product.currentStock}
              </span>
            </div>
            <div style={styles.profitBar}>
              <div style={{
                ...styles.profitFill,
                width: `${(product.sellingPrice - product.costPrice) / product.sellingPrice * 100}%`
              }} />
              <span style={styles.profitText}>
                Profit: {formatPriceMK(product.sellingPrice - product.costPrice)} per unit
              </span>
            </div>
          </div>
        ))}
      </div>
      {filteredProducts.length === 0 && (
        <p style={styles.emptyMessage}>No products match your search.</p>
      )}
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
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  searchInput: {
    minWidth: '240px',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px'
  },
  subtitle: {
    fontSize: '16px',
    color: '#888',
    margin: 0
  },
  productGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
    width: '100%'
  },
  emptyMessage: {
    color: '#888',
    textAlign: 'center',
    padding: '24px'
  },
  productCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '18px 22px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    border: '1px solid #f0f0f0',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  },
  productHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start'
  },
  productName: {
    margin: '0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a2e'
  },
  productUnit: {
    fontSize: '12px',
    color: '#888',
    display: 'block',
    marginTop: '2px'
  },
  productActions: {
    display: 'flex',
    gap: '8px'
  },
  editBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background 0.3s ease'
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background 0.3s ease'
  },
  productDetails: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginTop: '10px',
    fontSize: '14px'
  },
  productCategory: {
    color: '#666'
  },
  productPrice: {
    fontWeight: 'bold',
    color: '#e94560'
  },
  productCost: {
    color: '#888'
  },
  productStock: {
    color: '#2ecc71',
    fontWeight: '500'
  },
  productStockLow: {
    color: '#e74c3c',
    fontWeight: 'bold'
  },
  profitBar: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid #f0f0f0',
    position: 'relative'
  },
  profitFill: {
    height: '4px',
    backgroundColor: '#2ecc71',
    borderRadius: '2px',
    transition: 'width 0.5s ease'
  },
  profitText: {
    fontSize: '12px',
    color: '#888',
    display: 'block',
    marginTop: '4px'
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
  }
};

export default Products;