/**
 * Expo Push Notification Service
 *
 * Stub using expo-server-sdk pattern.
 * Install expo-server-sdk when ready: npm install expo-server-sdk
 */

// Lazy-load Expo SDK — only fails if actually called without the package
let Expo;
try {
  ({ Expo } = require('expo-server-sdk'));
} catch (_) {
  Expo = null;
}

function getExpoClient() {
  if (!Expo) {
    throw new Error('expo-server-sdk not installed. Run: npm install expo-server-sdk');
  }
  return new Expo();
}

/**
 * Send push notifications to Expo push tokens.
 *
 * @param {string[]} tokens - Array of Expo push tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {Object} [data={}] - Extra data payload
 * @returns {Promise<Object>} Result with sent count and errors
 */
async function sendPushNotification(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) {
    return { sent: 0, errors: [] };
  }

  const expo = getExpoClient();

  // Build messages, filtering invalid tokens
  const messages = tokens
    .filter((token) => Expo.isExpoPushToken(token))
    .map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

  if (messages.length === 0) {
    return { sent: 0, errors: ['No valid Expo push tokens provided'] };
  }

  // Chunk to respect Expo's batch limits
  const chunks = expo.chunkPushNotifications(messages);
  const errors = [];
  let sent = 0;

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket) => {
        if (ticket.status === 'ok') {
          sent += 1;
        } else if (ticket.details?.error) {
          errors.push(ticket.details.error);
        }
      });
    } catch (err) {
      errors.push(err.message);
    }
  }

  return { sent, errors };
}

/**
 * Send a check-in reminder to a list of users.
 *
 * @param {string[]} tokens - Expo push tokens
 * @returns {Promise<Object>}
 */
async function sendCheckinReminder(tokens) {
  return sendPushNotification(
    tokens,
    'Time for your check-in',
    'Take 2 minutes to reflect on your wellbeing today.',
    { type: 'checkin_reminder' },
  );
}

/**
 * Notify manager of a team risk alert.
 *
 * @param {string[]} tokens - Manager Expo push tokens
 * @param {string} hazardCategory - Hazard category name
 * @returns {Promise<Object>}
 */
async function sendManagerRiskAlert(tokens, hazardCategory) {
  return sendPushNotification(
    tokens,
    'Team wellbeing alert',
    `Elevated signals detected in ${hazardCategory}. Review your dashboard.`,
    { type: 'risk_alert', hazardCategory },
  );
}

module.exports = {
  sendPushNotification,
  sendCheckinReminder,
  sendManagerRiskAlert,
};
