import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const publisher  = createClient({ url: REDIS_URL });
const subscriber = createClient({ url: REDIS_URL });

let connected = false;

async function ensureConnected() {
  if (connected) return;
  await publisher.connect();
  await subscriber.connect();
  connected = true;
  console.log('[redis] connected');
}

/**
 * Publish a document update to all instances subscribed to this doc channel.
 * @param {string} documentId
 * @param {object} messagePayload
 */
export async function publishDocUpdate(documentId, messagePayload) {
  await ensureConnected();
  await publisher.publish(`doc:${documentId}`, JSON.stringify(messagePayload));
}

/**
 * Subscribe to a document channel. Triggers callback on every message.
 * @param {string}   documentId
 * @param {Function} callback - receives the parsed payload object
 */
export async function subscribeToDoc(documentId, callback) {
  await ensureConnected();
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
 * @param {string} documentId
 */
export async function unsubscribeFromDoc(documentId) {
  await ensureConnected();
  await subscriber.unsubscribe(`doc:${documentId}`);
}
