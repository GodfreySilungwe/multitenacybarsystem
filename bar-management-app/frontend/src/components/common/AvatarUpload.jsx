import { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';

const AvatarUpload = ({ currentImage, onImageChange, name }) => {
  const [preview, setPreview] = useState(currentImage || null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setPreview(currentImage || null);
  }, [currentImage]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxSize: 5242880, // 5MB
    noClick: true, // Prevent default click behavior - we handle it manually
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        const previewUrl = URL.createObjectURL(file);
        setPreview(previewUrl);
        onImageChange(file);
      }
    },
    onDropRejected: (fileRejections) => {
      const error = fileRejections[0]?.errors[0]?.message;
      alert(error || 'File rejected. Please upload an image file.');
    }
  });

  // Handle manual click on the dropzone
  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onImageChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div style={styles.container}>
      <div
        {...getRootProps()}
        onClick={handleClick}
        style={{
          ...styles.dropzone,
          ...(isDragActive ? styles.dropzoneActive : {}),
          ...(preview ? styles.hasPreview : {})
        }}
        onMouseEnter={(e) => {
          if (!preview) {
            e.currentTarget.style.borderColor = '#e94560';
            e.currentTarget.style.backgroundColor = '#fde8e8';
          } else {
            e.currentTarget.style.borderColor = '#e94560';
          }
        }}
        onMouseLeave={(e) => {
          if (!preview && !isDragActive) {
            e.currentTarget.style.borderColor = '#ddd';
            e.currentTarget.style.backgroundColor = '#f8f9fa';
          } else if (preview && !isDragActive) {
            e.currentTarget.style.borderColor = '#2ecc71';
            e.currentTarget.style.backgroundColor = '#f8f9fa';
          }
        }}
      >
        <input {...getInputProps()} ref={fileInputRef} />
        {preview ? (
          <div style={styles.previewContainer}>
            <img src={preview} alt={name || 'Profile'} style={styles.previewImage} />
            <div style={styles.overlay}>
              <span style={styles.overlayText}>📷 Change</span>
            </div>
          </div>
        ) : (
          <div style={styles.placeholder}>
            <div style={styles.avatarIcon}>👤</div>
            <p style={styles.placeholderText}>
              {isDragActive ? 'Drop image here...' : 'Click or drag to upload photo'}
            </p>
            <p style={styles.placeholderSubtext}>JPG, PNG, GIF up to 5MB</p>
          </div>
        )}
      </div>
      
      {preview && (
        <button
          type="button"
          style={styles.removeBtn}
          onClick={handleRemove}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e74c3c';
            e.currentTarget.style.color = 'white';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
            e.currentTarget.style.color = '#e74c3c';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          🗑️ Remove Photo
        </button>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '15px'
  },
  dropzone: {
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    border: '3px dashed #ddd',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    backgroundColor: '#f8f9fa',
    overflow: 'hidden',
    position: 'relative'
  },
  dropzoneActive: {
    borderColor: '#e94560',
    backgroundColor: '#fde8e8'
  },
  hasPreview: {
    border: '3px solid #2ecc71',
    borderStyle: 'solid'
  },
  previewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '50%'
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
    transition: 'opacity 0.3s ease'
  },
  overlayText: {
    color: 'white',
    fontSize: '14px',
    fontWeight: 'bold'
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px'
  },
  avatarIcon: {
    fontSize: '48px',
    marginBottom: '8px'
  },
  placeholderText: {
    fontSize: '12px',
    color: '#888',
    textAlign: 'center',
    margin: 0
  },
  placeholderSubtext: {
    fontSize: '10px',
    color: '#bbb',
    textAlign: 'center',
    margin: '4px 0 0 0'
  },
  removeBtn: {
    padding: '6px 16px',
    borderRadius: '20px',
    border: '1px solid #e74c3c',
    backgroundColor: 'white',
    color: '#e74c3c',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.3s ease',
    fontWeight: '500'
  }
};

export default AvatarUpload;