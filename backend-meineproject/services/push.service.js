require('dotenv').config();
const webpush = require('web-push');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

webpush.setVapidDetails(
  'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function addSubscription(subscription) {
  try {
    const endpoint = subscription.endpoint;
    if (!endpoint) return;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { keys: subscription.keys },
      create: { endpoint, keys: subscription.keys }
    });
    console.log(`Push Subscription upserted for endpoint: ${endpoint}`);
  } catch (err) {
    console.error('Failed to save push subscription to DB:', err);
  }
}

async function sendGeofencePushAlert(workerId, distance) {
  try {
    const subs = await prisma.pushSubscription.findMany();
    if (!subs || subs.length === 0) {
      console.warn('⚠️ No active push subscriptions found in DB.');
      return;
    }

    const payload = JSON.stringify({
      notification: {
        title: '⚠️ GEOFENCE BREACH ALERT',
        body: `Worker #${workerId} is ${distance}m away from the site perimeter!`,
        icon: '/favicon.ico',
        vibrate: [200, 100, 200],
        data: {
          onActionClick: {
            default: { operation: 'openWindow', url: 'http://localhost:8081' }
          }
        }
      }
    });

    console.log(`Dispatching push notification to ${subs.length} registered subscriber(s)...`);

    for (const sub of subs) {
      const subObj = { endpoint: sub.endpoint, keys: sub.keys };
      try {
        await webpush.sendNotification(subObj, payload);
        console.log(`✅ Push delivered successfully to endpoint: ${sub.endpoint}`);
      } catch (err) {
        console.error(`❌ Push delivery failed (Status ${err.statusCode || 'N/A'}) for ${sub.endpoint}:`, err.message || err);
        if (err.statusCode === 410 || err.statusCode === 404) {
          try {
            await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
            console.log(`Removed expired push subscription: ${sub.endpoint}`);
          } catch (delErr) {
            console.error('Failed to remove expired subscription from DB:', delErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error while sending push alerts:', err);
  }
}

module.exports = { addSubscription, sendGeofencePushAlert };