const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'medium', 
  onClick, 
  disabled = false,
  type = 'button',
  fullWidth = false 
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.button,
        ...styles[variant],
        ...styles[size],
        ...(fullWidth && styles.fullWidth),
        ...(disabled && styles.disabled)
      }}
    >
      {children}
    </button>
  );
};

const styles = {
  button: {
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'all 0.3s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  primary: {
    backgroundColor: '#e94560',
    color: 'white'
  },
  secondary: {
    backgroundColor: '#1a1a2e',
    color: 'white'
  },
  success: {
    backgroundColor: '#2ecc71',
    color: 'white'
  },
  danger: {
    backgroundColor: '#e74c3c',
    color: 'white'
  },
  warning: {
    backgroundColor: '#f39c12',
    color: 'white'
  },
  small: {
    padding: '6px 12px',
    fontSize: '12px'
  },
  medium: {
    padding: '10px 20px',
    fontSize: '14px'
  },
  large: {
    padding: '14px 28px',
    fontSize: '16px'
  },
  fullWidth: {
    width: '100%'
  },
  disabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  }
};

export default Button;