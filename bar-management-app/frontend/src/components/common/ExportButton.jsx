import { useState } from 'react';
import api from '../../api/api';
import { saveAs } from 'file-saver';

const ExportButton = ({ type, label, icon = '📤', variant = 'primary' }) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);

    try {
      let endpoint = '';
      let filename = '';

      switch(type) {
        case 'sales':
          endpoint = '/export/sales/excel';
          filename = 'sales_report.xlsx';
          break;
        case 'inventory':
          endpoint = '/export/inventory/excel';
          filename = 'inventory_report.xlsx';
          break;
        case 'customers':
          endpoint = '/export/customers/excel';
          filename = 'customers_report.xlsx';
          break;
        case 'sales-pdf':
          endpoint = '/export/sales/pdf';
          filename = 'sales_report.pdf';
          break;
        default:
          throw new Error('Unknown export type');
      }

      const response = await api.get(endpoint, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream'
      });

      saveAs(blob, filename);
      
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #2ecc71;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
      `;
      successMsg.textContent = `✅ ${label} exported successfully!`;
      document.body.appendChild(successMsg);
      setTimeout(() => successMsg.remove(), 3000);

    } catch (err) {
      console.error('Export error:', err);
      
      const errorMsg = document.createElement('div');
      errorMsg.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #e74c3c;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
      `;
      errorMsg.textContent = `❌ Failed to export ${label}: ${err.message}`;
      document.body.appendChild(errorMsg);
      setTimeout(() => errorMsg.remove(), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      style={{
        ...styles.button,
        ...styles[variant],
        ...(loading ? styles.loading : {})
      }}
      onClick={handleExport}
      disabled={loading}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {loading ? '⏳ Exporting...' : `${icon} ${label}`}
    </button>
  );
};

const styles = {
  button: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px'
  },
  primary: {
    backgroundColor: '#e94560',
    color: 'white'
  },
  success: {
    backgroundColor: '#2ecc71',
    color: 'white'
  },
  info: {
    backgroundColor: '#3498db',
    color: 'white'
  },
  warning: {
    backgroundColor: '#f39c12',
    color: 'white'
  },
  secondary: {
    backgroundColor: '#6c757d',
    color: 'white'
  },
  loading: {
    opacity: 0.7,
    cursor: 'wait'
  }
};

// Add keyframe animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(styleSheet);

export default ExportButton;