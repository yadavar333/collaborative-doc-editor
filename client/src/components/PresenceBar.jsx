// Pantone-inspired avatar colours (muted, professional)
const PALETTE = ['#1B3D6E','#5A7A3A','#8B4B2E','#4A6B8A','#6B4A7A','#2E6B5A'];

function colorForUser(uid) {
  let h = 0;
  for (const c of (uid || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function PresenceBar({ users = {}, currentUser }) {
  const uids = Object.keys(users);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: -4,
      }}>
        {uids.map((uid, i) => (
          <div
            key={uid}
            title={uid}
            style={{
              width:        28,
              height:       28,
              borderRadius: 'var(--radius)',
              background:   colorForUser(uid),
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              color:        '#FFFFFF',
              fontSize:     11,
              fontWeight:   700,
              letterSpacing: '0.02em',
              border:       uid === currentUser
                ? '2px solid var(--text)'
                : '2px solid var(--bg-card)',
              marginLeft:   i > 0 ? -6 : 0,
              position:     'relative',
              zIndex:       uids.length - i,
              boxShadow:    'var(--shadow-sm)',
            }}
          >
            {uid.slice(0, 2).toUpperCase()}
          </div>
        ))}
      </div>
      <span style={{
        fontSize: 11,
        color: 'var(--text-3)',
        fontWeight: 500,
        marginLeft: uids.length > 0 ? 4 : 0,
      }}>
        {uids.length} online
      </span>
    </div>
  );
}
