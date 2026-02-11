const COLORS = ['#6366f1','#ec4899','#10b981','#f59e0b','#3b82f6','#ef4444'];

function colorForUser(uid) {
  let h = 0;
  for (const c of (uid || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

export default function PresenceBar({ users = {}, currentUser }) {
  const uids = Object.keys(users);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#6b7280', marginRight: 4 }}>
        {uids.length} online
      </span>
      {uids.map((uid) => (
        <div
          key={uid}
          title={uid}
          style={{
            width:        32,
            height:       32,
            borderRadius: '50%',
            background:   colorForUser(uid),
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            color:        '#fff',
            fontSize:     12,
            fontWeight:   700,
            border:       uid === currentUser ? '2px solid #111' : 'none',
          }}
        >
          {uid.slice(0, 2).toUpperCase()}
        </div>
      ))}
    </div>
  );
}
