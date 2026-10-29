import { createContext, useState, useContext, useEffect } from 'react';
import api from '../api/api';
import { cacheBusinessSettings } from '../utils/businessSettings';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Set auth token in axios headers
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('token', token);
    } else {
      delete api.defaults.headers.common['Authorization'];
      localStorage.removeItem('token');
    }
  }, [token]);

  useEffect(() => {
    if (user?.barId) {
      localStorage.setItem('activeBarId', String(user.barId));
    } else {
      localStorage.removeItem('activeBarId');
    }
  }, [user?.barId]);

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      if (token) {
        try {
          const res = await api.get('/auth/me');
          if (res.data?.barId) {
            localStorage.setItem('activeBarId', String(res.data.barId));
            try {
              const settingsResponse = await api.get('/business-settings');
              cacheBusinessSettings(res.data.barId, settingsResponse.data);
            } catch (settingsError) {
              console.error('Unable to load current bar currency settings:', settingsError);
            }
          }
          setUser(res.data);
        } catch (err) {
          console.error('Error loading user:', err);
          setToken(null);
          setUser(null);
        }
      }
    };

    setLoading(false);
    loadUser();
  }, [token]);

  // Login
  const login = async (username, password) => {
    try {
      setError(null);
      const res = await api.post('/auth/login', { username, password });
      const { token: authToken, user: authUser } = res.data;
      if (authUser?.barId) {
        localStorage.setItem('activeBarId', String(authUser.barId));
        try {
          const settingsResponse = await api.get('/business-settings', {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          cacheBusinessSettings(authUser.barId, settingsResponse.data);
        } catch (settingsError) {
          console.error('Unable to load current bar currency settings:', settingsError);
        }
      }
      setToken(authToken);
      setUser(authUser);
      return { success: true, token: authToken, user: authUser };
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const acceptSession = (authToken, authUser) => {
    setError(null);
    localStorage.setItem('token', authToken);
    api.defaults.headers.common.Authorization = `Bearer ${authToken}`;
    setToken(authToken);
    setUser(authUser);
  };

  // Register
  const register = async (userData) => {
    try {
      setError(null);
      const res = await api.post('/auth/register', userData);
      const { token: authToken, user: authUser } = res.data;
      if (authUser?.barId) {
        localStorage.setItem('activeBarId', String(authUser.barId));
        try {
          const settingsResponse = await api.get('/business-settings', {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          cacheBusinessSettings(authUser.barId, settingsResponse.data);
        } catch (settingsError) {
          console.error('Unable to load current bar currency settings:', settingsError);
        }
      }
      setToken(authToken);
      setUser(authUser);
      return { success: true, token: authToken, user: authUser };
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Logout
  const logout = () => {
    setToken(null);
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      error,
      login,
      acceptSession,
      register,
      logout,
      isAuthenticated: Boolean(token),
      isOwner: user?.role === 'owner',
      isBarOwner: user?.role === 'owner' && !!user?.barId,
      isGlobalOwner: user?.role === 'owner' && !user?.barId,
      isSales: user?.role === 'sales',
      isManager: user?.role === 'manager'
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;