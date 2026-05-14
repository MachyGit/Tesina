import { useState, useEffect, createContext, useContext } from 'react';
import { getUser, isLoggedIn, logout as doLogout } from '../services/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const logged = await isLoggedIn();
      if (logged) setUser(await getUser());
      setLoading(false);
    })();
  }, []);

  const logout = async () => {
    await doLogout();
    setUser(null);
  };

  const refresh = async () => setUser(await getUser());

  return (
    <AuthContext.Provider value={{ user, loading, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
