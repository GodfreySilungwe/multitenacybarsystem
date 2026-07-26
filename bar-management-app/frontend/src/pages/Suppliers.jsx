import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import Button from '../components/common/Button';

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      const res = await api.get('/suppliers');
      setSuppliers(res.data);
    } catch (err) {
      console.error('Error loading suppliers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier._id}`, formData);
      } else {
        await api.post('/suppliers', formData);
      }
      setShowForm(false);
      setEditingSupplier(null);
      setFormData({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' });
      await loadSuppliers();
    } catch (err) {
      console.error('Error saving supplier:', err);
      alert('Failed to save supplier');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    try {
      await api.delete(`/suppliers/${id}`);
      await loadSuppliers();
    } catch (err) {
      console.error('Error deleting supplier:', err);
      alert('Failed to delete supplier');
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || ''
    });
    setShowForm(true);
  };

  if (loading) {
    return (
      <PageContainer title="🏷️ Suppliers">
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>Loading suppliers...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="🏷️ Supplier Management">
      <div style={styles.header}>
        <p style={styles.subtitle}>Manage your product suppliers</p>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Close' : '+ Add Supplier'}
        </Button>
      </div>

      {showForm && (
        <div className="fade-in">
          <UnifiedCard title={editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}>
            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Supplier Name *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Contact Person</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Phone *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Email</label>
                  <input
                    type="email"
                    style={styles.input}
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
                <div style={styles.formGroup} className="full-width">
                  <label style={styles.label}>Address</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                  />
                </div>
                <div style={styles.formGroup} className="full-width">
                  <label style={styles.label}>Notes</label>
                  <textarea
                    style={{...styles.input, minHeight: '60px'}}
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  />
                </div>
              </div>
              <div style={styles.formActions}>
                <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit">{editingSupplier ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </UnifiedCard>
        </div>
      )}

      <div style={styles.supplierGrid}>
        {suppliers.map((supplier, index) => (
          <div 
            key={supplier._id}
            className={`fade-in delay-${(index % 6) + 1}`}
            style={styles.supplierCard}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-6px)';
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
            }}
          >
            <div style={styles.supplierHeader}>
              <div>
                <h3 style={styles.supplierName}>{supplier.name}</h3>
                {supplier.contactPerson && (
                  <p style={styles.contactPerson}>👤 {supplier.contactPerson}</p>
                )}
              </div>
              <div style={styles.supplierActions}>
                <button style={styles.editBtn} onClick={() => handleEdit(supplier)}>✏️</button>
                <button style={styles.deleteBtn} onClick={() => handleDelete(supplier._id)}>🗑️</button>
              </div>
            </div>
            <div style={styles.supplierDetails}>
              <span>📱 {supplier.phone}</span>
              {supplier.email && <span>✉️ {supplier.email}</span>}
              {supplier.address && <span>📍 {supplier.address}</span>}
            </div>
          </div>
        ))}
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
  supplierGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
    width: '100%'
  },
  supplierCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    border: '1px solid #f0f0f0',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  },
  supplierHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: '12px'
  },
  supplierName: {
    margin: '0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a2e'
  },
  contactPerson: {
    margin: '4px 0 0 0',
    color: '#666',
    fontSize: '14px'
  },
  supplierActions: {
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
  supplierDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingTop: '12px',
    borderTop: '1px solid #f0f0f0',
    fontSize: '14px',
    color: '#666'
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
    transition: 'border 0.3s ease',
    fontFamily: 'inherit'
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
  
  .full-width {
    grid-column: 1 / -1;
  }
`;
document.head.appendChild(styleSheet);

export default Suppliers;