import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export default function Auth() {
  const [tab, setTab]         = useState('login');
  const [email, setEmail]     = useState('');
  const [pass, setPass]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const { login }   = useContext(AuthContext);
  const { theme, toggle } = useTheme();
  const navigate    = useNavigate();

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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px',
    }}>
      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="ui-btn ui-btn-ghost ui-btn-sm"
        style={{ position: 'fixed', top: 16, right: 16 }}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
      </button>

      <div style={{
        width: '100%',
        maxWidth: 380,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '36px 32px',
        boxShadow: 'var(--shadow-md)',
      }}>
        {/* Wordmark */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
          }}>
            <div style={{
              width: 28, height: 28,
              background: 'var(--accent)',
              borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'var(--accent-fg)', fontSize: 14, fontWeight: 700 }}>C</span>
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              CollabDoc
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
            Real-time collaborative editing
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          background: 'var(--bg-secondary)',
          padding: 3,
          borderRadius: 'var(--radius)',
          marginBottom: 24,
        }}>
          {['login', 'register'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '7px 0',
                border: 'none',
                borderRadius: 'calc(var(--radius) - 1px)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                letterSpacing: '0.01em',
                transition: 'background 0.12s, color 0.12s, box-shadow 0.12s',
                background: tab === t ? 'var(--bg-card)' : 'transparent',
                color: tab === t ? 'var(--text)' : 'var(--text-2)',
                boxShadow: tab === t ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {t === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            className="ui-input"
          />
          <input
            type="password"
            placeholder="Password (min 6 chars)"
            value={pass}
            required
            onChange={(e) => setPass(e.target.value)}
            className="ui-input"
          />

          {error && (
            <div style={{
              padding: '8px 10px',
              background: 'var(--danger-muted)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius)',
              color: 'var(--danger)',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="ui-btn ui-btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '10px' }}
          >
            {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
