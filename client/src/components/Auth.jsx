import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

export default function Auth() {
  const [tab, setTab]       = useState('login');
  const [email, setEmail]   = useState('');
  const [pass, setPass]     = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate  = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={outer}>
      <div style={card}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>✏️ CollabDoc</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
          Real-time collaborative editing
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {['login', 'register'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                ...tabBtn,
                ...(tab === t ? { background: '#6366f1', color: '#fff' } : {}),
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email" placeholder="Email" value={email} required
            onChange={(e) => setEmail(e.target.value)} style={inputStyle}
          />
          <input
            type="password" placeholder="Password (min 6 chars)" value={pass} required
            onChange={(e) => setPass(e.target.value)} style={inputStyle}
          />
          {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={loading} style={submitBtn}>
            {loading ? 'Loading…' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

const outer      = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8fc' };
const card       = { background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,.08)', width: 360 };
const tabBtn     = { flex: 1, padding: '8px 0', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#f9fafb', color: '#374151' };
const inputStyle = { padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' };
const submitBtn  = { padding: '11px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 15 };
