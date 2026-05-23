import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const publisher  = createClient({ url: REDIS_URL });
const subscriber = createClient({ url: REDIS_URL });

// Surface errors without crashing the process.
publisher.on('error',  (err) => console.error('[redis:pub]', err.message));
subscriber.on('error', (err) => console.error('[redis:sub]', err.message));

// Connect once at startup. redis v4 handles reconnections automatically —
// never call connect() again; the "Socket already opened" errors were caused
// by the old ensureConnected() helper re-calling connect() after auth failures.
publisher.connect().catch((err) =>
  console.error('[redis:pub] initial connect failed:', err.message),
);
subscriber.connect().catch((err) =>
  console.error('[redis:sub] initial connect failed:', err.message),
);

/**
 * Publish a document update to all instances subscribed to this doc channel.
 */
export async function publishDocUpdate(documentId, messagePayload) {
  await publisher.publish(`doc:${documentId}`, JSON.stringify(messagePayload));
}

/**
 * Subscribe to a document channel.
 */
export async function subscribeToDoc(documentId, callback) {
  await subscriber.subscribe(`doc:${documentId}`, (raw) => {
    try {
      callback(JSON.parse(raw));
    } catch (err) {
      console.error('[redis] message parse error', err);
    }
  });
}

/**
 * Unsubscribe from a document channel.
 */
export async function unsubscribeFromDoc(documentId) {
  await subscriber.unsubscribe(`doc:${documentId}`).catch(() => {});
}
