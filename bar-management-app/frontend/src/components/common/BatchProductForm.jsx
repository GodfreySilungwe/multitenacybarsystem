/* eslint-disable react/prop-types */
import { useState } from 'react';
import Button from './Button';
import UnifiedCard from './UnifiedCard';
import { formatPriceMK } from '../../utils/formatPrice';
import { calculateUnitCost, createBatchRows } from '../../utils/productBatch';

const commonCategories = ['Beer', 'Brandy', 'Cider', 'Cream', 'Energy', 'Juice', 'Minerals', 'Other', 'Spirits', 'Vodka', 'Water', 'Whiskey', 'Wine'];

const purchaseUnits = [
  ['bottle', 'Bottle', 1],
  ['six-pack', 'Six-pack', 6],
  ['case', 'Case', 24],
  ['crate', 'Crate', 20],
  ['carton', 'Carton', 20]
];
const sellingUnits = ['bottle', 'shot', 'glass', 'can', 'packet', 'piece'];

const BatchProductForm = ({ categories, onComplete, onCancel }) => {
  const [rows, setRows] = useState(createBatchRows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');

  const updateRow = (id, field, value) => {
    setRows((currentRows) => currentRows.map((row) => {
      if (row.id !== id) return row;
      if (field === 'purchaseUnit') {
        const option = purchaseUnits.find(([unit]) => unit === value);
        return { ...row, purchaseUnit: value, conversionQuantity: option?.[2] || 1 };
      }
      return { ...row, [field]: value };
    }));
  };

  const applyCategory = () => {
    if (!bulkCategory) return;
    setRows((currentRows) => currentRows.map((row) => row.selected ? { ...row, category: bulkCategory } : row));
  };

  const toggleAll = (selected) => setRows((currentRows) => currentRows.map((row) => ({ ...row, selected })));

  const categoryOptions = [...new Map([
    ...commonCategories.map((name) => [name.toLowerCase(), { _id: `common-${name}`, name }]),
    ...categories.map((category) => [String(category.name).toLowerCase(), category])
  ]).values()];
  const visibleRows = rows
    .filter((row) => row.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    .sort((left, right) => sortDirection === 'asc' ? left.name.localeCompare(right.name) : right.name.localeCompare(left.name));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const selectedRows = rows.filter((row) => row.selected);
    if (!selectedRows.length) {
      setError('Select at least one product.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onComplete(selectedRows.map((row) => {
        const product = { ...row };
        delete product.id;
        delete product.selected;
        return product;
      }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to create products.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <UnifiedCard title="Batch Add Products">
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.toolbar}>
          <span>{rows.filter((row) => row.selected).length} of {rows.length} selected</span>
          <button type="button" onClick={() => toggleAll(true)}>Select all</button>
          <button type="button" onClick={() => toggleAll(false)}>Clear all</button>
          <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)} style={styles.bulkSelect}>
            <option value="">Apply category to selected...</option>
            {categoryOptions.map((category) => <option key={category._id} value={category.name}>{category.name}</option>)}
          </select>
          <Button type="button" onClick={applyCategory} variant="secondary">Apply</Button>
          <input type="search" aria-label="Search batch products" placeholder="Search products..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} style={styles.searchInput} />
          <Button type="button" variant="secondary" onClick={() => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')}>Sort {sortDirection === 'asc' ? 'A-Z' : 'Z-A'}</Button>
        </div>
        {error && <div role="alert" style={styles.error}>{error}</div>}
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr><th style={styles.headerCell} /><th style={styles.headerCell}>Product</th><th style={styles.headerCell}>Category *</th><th style={styles.headerCell}>Order unit</th><th style={styles.headerCell}>Order Unit cost *</th><th style={styles.headerCell}>Selling unit</th><th style={styles.headerCell}># Shots/Glasses/Bottles *</th><th style={styles.headerCell}>Cost / unit</th><th style={styles.headerCell}>Selling price *</th><th style={styles.headerCell}>Stock *</th><th style={styles.headerCell}>Low stock</th></tr></thead>
            <tbody>{visibleRows.map((row) => {
              const unitCost = calculateUnitCost(row);
              return <tr key={row.id} style={!row.selected ? styles.disabledRow : undefined}>
                <td><input type="checkbox" checked={row.selected} onChange={(event) => updateRow(row.id, 'selected', event.target.checked)} /></td>
                <td style={styles.name}>{row.name}</td>
                <td><select required={row.selected} disabled={!row.selected} value={row.category} onChange={(event) => updateRow(row.id, 'category', event.target.value)}><option value="">Select</option>{categoryOptions.map((category) => <option key={category._id} value={category.name}>{category.name}</option>)}</select></td>
                <td><select disabled={!row.selected} value={row.purchaseUnit} onChange={(event) => updateRow(row.id, 'purchaseUnit', event.target.value)}>{purchaseUnits.map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}</select></td>
                <td><input required={row.selected} disabled={!row.selected} type="number" min="0" step="0.01" value={row.purchaseCost} onChange={(event) => updateRow(row.id, 'purchaseCost', event.target.value)} /></td>
                <td><select disabled={!row.selected} value={row.sellingUnit} onChange={(event) => updateRow(row.id, 'sellingUnit', event.target.value)}>{sellingUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></td>
                <td><input required={row.selected} disabled={!row.selected} type="number" min="1" step="1" value={row.conversionQuantity} onChange={(event) => updateRow(row.id, 'conversionQuantity', event.target.value)} /></td>
                <td style={styles.calculated}>{unitCost === null ? '-' : formatPriceMK(unitCost)}</td>
                <td><input required={row.selected} disabled={!row.selected} type="number" min="0" step="0.01" value={row.sellingPrice} onChange={(event) => updateRow(row.id, 'sellingPrice', event.target.value)} /></td>
                <td><input required={row.selected} disabled={!row.selected} type="number" min="0" step="1" value={row.currentStock} onChange={(event) => updateRow(row.id, 'currentStock', event.target.value)} /></td>
                <td><input disabled={!row.selected} type="number" min="0" step="1" value={row.lowStockThreshold} onChange={(event) => updateRow(row.id, 'lowStockThreshold', event.target.value)} /></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div style={styles.actions}><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create selected products'}</Button></div>
      </form>
    </UnifiedCard>
  );
};

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px' },
  searchInput: { minWidth: '180px', padding: '8px', border: '1px solid #ddd', borderRadius: '6px' },
  bulkSelect: { marginLeft: 'auto', padding: '8px' },
  error: { padding: '10px', color: '#9b1c1c', backgroundColor: '#fff1f1', border: '1px solid #f3b4b4', borderRadius: '6px' },
  tableWrap: { maxHeight: '520px', overflow: 'auto', border: '1px solid #e5e5e5' },
  table: { borderCollapse: 'collapse', minWidth: '1500px', width: '100%', fontSize: '12px' },
  headerCell: { position: 'sticky', top: 0, zIndex: 1, backgroundColor: '#fff', boxShadow: '0 1px 0 #d9d9d9', whiteSpace: 'nowrap' },
  name: { minWidth: '190px', fontWeight: '600' },
  disabledRow: { opacity: 0.45 },
  calculated: { whiteSpace: 'nowrap', color: '#26734d', fontWeight: '600' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' }
};

export default BatchProductForm;
