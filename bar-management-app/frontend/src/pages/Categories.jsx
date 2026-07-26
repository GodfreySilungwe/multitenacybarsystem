import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import Button from '../components/common/Button';
import UnifiedCard from '../components/common/UnifiedCard';

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data);
    } catch (err) {
      console.error('Error loading categories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await api.put(`/categories/${editingCategory._id}`, formData);
      } else {
        await api.post('/categories', formData);
      }
      setShowForm(false);
      setEditingCategory(null);
      setFormData({ name: '', description: '' });
      await loadCategories();
    } catch (err) {
      console.error('Error saving category:', err);
      alert('Failed to save category');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await api.delete(`/categories/${id}`);
      await loadCategories();
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Failed to delete category');
    }
  };

  if (loading) {
    return (
      <PageContainer title="📁 Categories">
        <p>Loading categories...</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="📁 Categories">
      <div style={styles.header}>
        <p style={styles.subtitle}>Manage your product categories</p>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Close' : '+ Add Category'}
        </Button>
      </div>

      {showForm && (
        <UnifiedCard title={editingCategory ? 'Edit Category' : 'Add New Category'}>
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Category Name *</label>
              <input
                type="text"
                required
                style={styles.input}
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <input
                type="text"
                style={styles.input}
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>
            <div style={styles.formActions}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit">{editingCategory ? 'Update' : 'Create'}</Button>
            </div>
          </form>
        </UnifiedCard>
      )}

      <div style={styles.categoryGrid}>
        {categories.map((category, index) => (
          <div 
            key={category._id} 
            className={`fade-in delay-${(index % 6) + 1}`}
            style={styles.categoryCard}
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
            <div style={styles.categoryHeader}>
              <div>
                <h3 style={styles.categoryName}>{category.name}</h3>
                {category.description && (
                  <p style={styles.categoryDescription}>{category.description}</p>
                )}
              </div>
              <div style={styles.categoryActions}>
                <button 
                  style={styles.editBtn} 
                  onClick={() => {
                    setEditingCategory(category);
                    setFormData({ name: category.name, description: category.description || '' });
                    setShowForm(true);
                  }}
                >
                  ✏️
                </button>
                <button style={styles.deleteBtn} onClick={() => handleDelete(category._id)}>
                  🗑️
                </button>
              </div>
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
  categoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
    width: '100%'
  },
  categoryCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    border: '1px solid #f0f0f0',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  },
  categoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start'
  },
  categoryName: {
    margin: '0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a2e'
  },
  categoryDescription: {
    margin: '5px 0 0 0',
    color: '#888',
    fontSize: '14px'
  },
  categoryActions: {
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
  form: {
    display: 'flex',
    flexDirection: 'column',
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
    fontSize: '14px'
  },
  formActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end'
  }
};

export default Categories;