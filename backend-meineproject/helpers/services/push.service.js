require('dotenv').config();
const webpush = require('web-push');

webpush.setVapidDetails(
  'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

let pushSubscriptions = [];

function addSubscription(subscription) {
  const exists = pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
  if (!exists) {
    pushSubscriptions.push(subscription);
    console.log(`Push Subscription registered successfully! Active subscriptions count: ${pushSubscriptions.length}`);
  }
}

function sendGeofencePushAlert(workerId, distance) {
  if (pushSubscriptions.length === 0) {
    console.warn('⚠️ No active push subscriptions found in memory! Make sure the browser page on http://localhost:8081 is open.');
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

  console.log(`Dispatching push notification to ${pushSubscriptions.length} registered subscriber(s)...`);

  pushSubscriptions.forEach((sub, index) => {
    webpush.sendNotification(sub, payload)
      .then(() => console.log(`✅ Push delivered successfully to client #${index + 1}`))
      .catch(err => {
        console.error(`❌ Push delivery failed (Status ${err.statusCode || 'N/A'}):`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          pushSubscriptions.splice(index, 1);
        }
      });
  });
}

module.exports = { addSubscription, sendGeofencePushAlert };