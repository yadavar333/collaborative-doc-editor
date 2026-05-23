import { createContext, useState, useCallback } from 'react';

export const AuthContext = createContext(null);

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user,  setUser]  = useState(() => {
    const t = localStorage.getItem('token');
    if (!t) return null;
    const claims = parseJwt(t);
    // JWT payload uses `userId`; normalise to `id` so the rest of the app
    // always reads user.id regardless of how auth state was initialised.
    return claims ? { id: claims.userId, email: claims.email } : null;
  });

  const login = useCallback((newToken, userData) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
