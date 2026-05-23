import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// When DATABASE_URL is set (Neon, Render Postgres, etc.) use it directly.
// Otherwise fall back to individual host/user/… env vars for local Docker dev.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'collab_doc',
    });

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export const query = (text, params) => pool.query(text, params);
export default pool;
