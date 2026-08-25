import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import Button from '../components/common/Button';
import AvatarUpload from '../components/common/AvatarUpload';
import { useAuth } from '../context/AuthContext';
import { confirmTypedDelete } from '../utils/confirmation';

const Settings = () => {
  const { user } = useAuth();
  const isBarOwner = user?.role === 'owner' && !!user?.barId;
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [avatar, setAvatar] = useState(null);
  
  // Profile state
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    fullName: '',
    role: ''
  });

  // Password state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [teamForm, setTeamForm] = useState({
    username: '',
    email: '',
    password: '',
    fullName: ''
  });
  const [teamUsers, setTeamUsers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);

  // Business settings state
  const [business, setBusiness] = useState({
    name: 'Bar Manager',
    address: '123 Main Street, Lilongwe',
    phone: '+265 999 123 456',
    email: 'info@barmanager.com',
    taxId: '',
    currency: 'MK',
    receiptFooter: 'Thank you for your business!'
  });

  // Load user profile from localStorage on mount
  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (!user?.role) {
      return;
    }

    if (isBarOwner) {
      loadTeamUsers();
    } else {
      setTeamUsers([]);
    }
  }, [isBarOwner]);

  const loadProfile = async () => {
    try {
      // Check if profile exists in localStorage
      const savedProfile = localStorage.getItem('userProfile');
      
      console.log('Saved profile from localStorage:', savedProfile);
      
      if (savedProfile) {
        const parsedProfile = JSON.parse(savedProfile);
        console.log('Parsed profile:', parsedProfile);
        
        setProfile({
          username: parsedProfile.username || 'admin',
          email: parsedProfile.email || 'admin@bar.com',
          fullName: parsedProfile.fullName || 'Admin User',
          role: parsedProfile.role || 'admin'
        });
        
        // Load avatar if exists - THIS IS THE FIX
        if (parsedProfile.avatar) {
          console.log('Loading avatar from localStorage');
          setAvatar(parsedProfile.avatar);
        } else {
          setAvatar(null);
        }
      } else {
        // Default profile
        setProfile({
          username: 'admin',
          email: 'admin@bar.com',
          fullName: 'Admin User',
          role: 'admin'
        });
        setAvatar(null);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
      // Set default profile
      setProfile({
        username: 'admin',
        email: 'admin@bar.com',
        fullName: 'Admin User',
        role: 'admin'
      });
      setAvatar(null);
    }
  };

  const handleAvatarChange = async (file) => {
    if (!file) {
      setAvatar(null);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await api.post('/uploads/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const uploadedUrl = response.data?.url || response.data?.imageUrl;
      if (!uploadedUrl) {
        throw new Error('No image URL returned from server');
      }

      setAvatar(uploadedUrl);
      setMessage('✅ Profile photo uploaded successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setError('❌ Failed to upload profile photo');
      setTimeout(() => setError(''), 3000);
    }
  };

  const loadTeamUsers = async () => {
    if (!isBarOwner) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setTeamUsers([]);
        return;
      }

      const res = await api.get('/users');
      setTeamUsers((res.data || []).filter((entry) => entry.role === 'sales' && entry._id !== user?._id));
    } catch (err) {
      console.error('Error loading team accounts:', err);
      if (err.response?.status === 401) {
        setTeamUsers([]);
      }
    }
  };

  const handleResetTeamPassword = async (id) => {
    const newPassword = window.prompt('Enter a new password for this manager account (minimum 6 characters):');

    if (!newPassword) {
      return;
    }

    if (newPassword.length < 6) {
      setError('❌ Password must be at least 6 characters');
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      const response = await api.patch(`/users/${id}/reset-password`, { newPassword });
      const resetPassword = response.data?.password || newPassword;
      setMessage(`✅ Password reset successfully. New password: ${resetPassword}`);
      await loadTeamUsers();
      setTimeout(() => setMessage(''), 6000);
    } catch (err) {
      console.error('Error resetting team password:', err);
      setError(err.response?.data?.message || '❌ Failed to reset password');
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleCreateSalesAccount = async (e) => {
    e.preventDefault();
    setTeamLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await api.post('/users', {
        ...teamForm,
        role: 'sales'
      });

      const credentials = response.data?.credentials;
      const createdUsername = credentials?.username || teamForm.username;
      const createdPassword = credentials?.password || teamForm.password;

      setMessage(`✅ Sales account created successfully. Username: ${createdUsername} Password: ${createdPassword}`);
      setTeamForm({ username: '', email: '', password: '', fullName: '' });
      await loadTeamUsers();
      setTimeout(() => setMessage(''), 6000);
    } catch (err) {
      console.error('Error creating sales account:', err);
      setError(err.response?.data?.message || '❌ Failed to create sales account');
      setTimeout(() => setError(''), 4000);
    } finally {
      setTeamLoading(false);
    }
  };

  const handleDeleteTeamUser = async (id) => {
    if (!confirmTypedDelete('delete this sales account')) {
      return;
    }

    try {
      await api.delete(`/users/${id}`);
      setMessage('✅ Sales account deleted');
      await loadTeamUsers();
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error('Error deleting team account:', err);
      setError(err.response?.data?.message || '❌ Failed to delete sales account');
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      // Save profile data including avatar to localStorage
      const profileData = {
        ...profile,
        avatar: avatar
      };
      
      console.log('Saving profile data:', profileData);
      
      // Save to localStorage
      localStorage.setItem('userProfile', JSON.stringify(profileData));
      
      setMessage('✅ Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('❌ Failed to update profile');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('❌ Passwords do not match');
      setTimeout(() => setError(''), 3000);
      setLoading(false);
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError('❌ Password must be at least 6 characters');
      setTimeout(() => setError(''), 3000);
      setLoading(false);
      return;
    }

    try {
      await api.patch('/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      setMessage('✅ Password changed successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Password change failed:', err);
      setError(err.response?.data?.message || '❌ Failed to change password');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleBusinessUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      localStorage.setItem('businessSettings', JSON.stringify(business));
      setMessage('✅ Business settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError('❌ Failed to save settings');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Load business settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('businessSettings');
    if (saved) {
      setBusiness(JSON.parse(saved));
    }
  }, []);

  const tabs = [
    { id: 'profile', label: '👤 Profile', delay: 1 },
    ...(isBarOwner ? [{ id: 'team', label: '👥 Team', delay: 2 }] : []),
    { id: 'password', label: '🔒 Password', delay: isBarOwner ? 3 : 2 },
    { id: 'business', label: '🏢 Business', delay: isBarOwner ? 4 : 3 }
  ];

  return (
    <PageContainer title="⚙️ Settings">
      {message && (
        <div className="fade-in" style={styles.success}>{message}</div>
      )}
      {error && (
        <div className="fade-in" style={styles.error}>{error}</div>
      )}

      {/* Tab Navigation with Animations */}
      <div style={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`fade-in delay-${tab.delay}`}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {})
            }}
            onClick={() => setActiveTab(tab.id)}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = '#f0f0f0';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="fade-in">
          <UnifiedCard title="👤 User Profile">
            <form onSubmit={handleProfileUpdate} style={styles.form}>
              {/* Avatar Upload - Full width */}
              <div style={{...styles.formGroup, gridColumn: '1 / -1', alignItems: 'center'}}>
                <label style={styles.label}>Profile Photo</label>
                <AvatarUpload 
                  currentImage={avatar}
                  onImageChange={handleAvatarChange}
                  name={profile.fullName}
                />
              </div>

              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Full Name *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    value={profile.fullName}
                    onChange={(e) => setProfile({...profile, fullName: e.target.value})}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Username *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    value={profile.username}
                    onChange={(e) => setProfile({...profile, username: e.target.value})}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Email *</label>
                  <input
                    type="email"
                    required
                    style={styles.input}
                    value={profile.email}
                    onChange={(e) => setProfile({...profile, email: e.target.value})}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Role</label>
                  <input
                    type="text"
                    style={{...styles.input, backgroundColor: '#f5f5f5', cursor: 'not-allowed'}}
                    value={profile.role}
                    disabled
                  />
                  <span style={styles.helperText}>Role cannot be changed</span>
                </div>
              </div>
              <div style={styles.formActions}>
                <Button 
                  type="submit" 
                  disabled={loading}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 15px rgba(233, 69, 96, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {loading ? 'Saving...' : 'Update Profile'}
                </Button>
              </div>
            </form>
          </UnifiedCard>
        </div>
      )}

      {activeTab === 'team' && isBarOwner && (
        <div className="fade-in">
          <UnifiedCard title="👥 Manage Managers & Sales Accounts">
            <form onSubmit={handleCreateSalesAccount} style={styles.form}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Full Name *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    value={teamForm.fullName}
                    onChange={(e) => setTeamForm({ ...teamForm, fullName: e.target.value })}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Preferred Username *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    value={teamForm.username}
                    onChange={(e) => setTeamForm({ ...teamForm, username: e.target.value })}
                    placeholder="Choose a unique username"
                  />
                  <span style={styles.helperText}>Usernames are shared across all bars and must be unique.</span>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Email *</label>
                  <input
                    type="email"
                    required
                    style={styles.input}
                    value={teamForm.email}
                    onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Password *</label>
                  <input
                    type="password"
                    required
                    style={styles.input}
                    value={teamForm.password}
                    onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })}
                  />
                </div>
              </div>
              <div style={styles.formActions}>
                <Button type="submit" disabled={teamLoading}>
                  {teamLoading ? 'Creating...' : 'Create Sales Account'}
                </Button>
              </div>
            </form>

            <div style={{ marginTop: '18px' }}>
              <div style={styles.sectionTitle}>Existing managers</div>
              {teamUsers.length > 0 ? (
                <div style={styles.teamList}>
                  {teamUsers.map((member) => (
                    <div key={member._id} style={styles.teamCard}>
                      <div>
                        <div style={styles.teamName}>{member.fullName || member.username}</div>
                        <div style={styles.teamMeta}>{member.email}</div>
                        <div style={styles.teamMeta}>@{member.username}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <Button variant="secondary" onClick={() => handleResetTeamPassword(member._id)}>
                          Reset Password
                        </Button>
                        <Button variant="secondary" onClick={() => handleDeleteTeamUser(member._id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.helperText}>No manager accounts created yet.</div>
              )}
            </div>
          </UnifiedCard>
        </div>
      )}

      {/* Password Tab */}
      {activeTab === 'password' && (
        <div className="fade-in">
          <UnifiedCard title="🔒 Change Password">
            <form onSubmit={handlePasswordChange} style={styles.form}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Current Password *</label>
                  <input
                    type="password"
                    required
                    style={styles.input}
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                    placeholder="Enter current password"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>New Password *</label>
                  <input
                    type="password"
                    required
                    style={styles.input}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                    placeholder="Min 6 characters"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Confirm New Password *</label>
                  <input
                    type="password"
                    required
                    style={styles.input}
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                    placeholder="Confirm new password"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>
              <div style={styles.formActions}>
                <Button 
                  type="submit" 
                  disabled={loading}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 15px rgba(233, 69, 96, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {loading ? 'Changing...' : 'Change Password'}
                </Button>
              </div>
            </form>
          </UnifiedCard>
        </div>
      )}

      {/* Business Tab */}
      {activeTab === 'business' && (
        <div className="fade-in">
          <UnifiedCard title="🏢 Business Settings">
            <form onSubmit={handleBusinessUpdate} style={styles.form}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Business Name *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    value={business.name}
                    onChange={(e) => setBusiness({...business, name: e.target.value})}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Address</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={business.address}
                    onChange={(e) => setBusiness({...business, address: e.target.value})}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Phone *</label>
                  <input
                    type="text"
                    required
                    style={styles.input}
                    value={business.phone}
                    onChange={(e) => setBusiness({...business, phone: e.target.value})}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Email</label>
                  <input
                    type="email"
                    style={styles.input}
                    value={business.email}
                    onChange={(e) => setBusiness({...business, email: e.target.value})}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Tax ID</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={business.taxId}
                    onChange={(e) => setBusiness({...business, taxId: e.target.value})}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Currency</label>
                  <select
                    style={styles.input}
                    value={business.currency}
                    onChange={(e) => setBusiness({...business, currency: e.target.value})}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <option value="MK">MK - Malawi Kwacha</option>
                    <option value="$">$ - US Dollar</option>
                    <option value="€">€ - Euro</option>
                    <option value="£">£ - British Pound</option>
                    <option value="R">R - South African Rand</option>
                  </select>
                </div>
                <div style={{...styles.formGroup, gridColumn: '1 / -1'}}>
                  <label style={styles.label}>Receipt Footer Message</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={business.receiptFooter}
                    onChange={(e) => setBusiness({...business, receiptFooter: e.target.value})}
                    placeholder="Thank you for your business!"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#e94560';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#ddd';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>
              <div style={styles.formActions}>
                <Button 
                  type="submit" 
                  disabled={loading}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 15px rgba(233, 69, 96, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {loading ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </form>
          </UnifiedCard>
        </div>
      )}
    </PageContainer>
  );
};

const styles = {
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  tab: {
    padding: '10px 24px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#666',
    borderRadius: '8px',
    transition: 'all 0.3s ease'
  },
  tabActive: {
    backgroundColor: '#e94560',
    color: 'white'
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
    transition: 'all 0.3s ease',
    outline: 'none',
    fontFamily: 'inherit'
  },
  helperText: {
    fontSize: '12px',
    color: '#888',
    marginTop: '2px'
  },
  formActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    marginTop: '10px'
  },
  success: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #c3e6cb'
  },
  error: {
    backgroundColor: '#fde8e8',
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #f5c6cb'
  }
};

export default Settings;