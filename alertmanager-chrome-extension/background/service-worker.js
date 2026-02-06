importScripts('../lib/storage.js', '../lib/alertmanager-api.js', '../lib/utils.js');

const ALARM_NAME = 'alertmanager-poll';
const NOTIFICATION_ID_PREFIX = 'am-alert-';

async function updateBadge(alerts, enabled) {
  if (!enabled) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  const activeCount = Utils.countActiveAlerts(alerts);
  const text = activeCount > 0 ? String(activeCount) : '';
  const color = Utils.getBadgeColor(alerts);

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
}

async function pollAlerts() {
  const instance = await Storage.getActiveInstance();
  if (!instance) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  let settings;
  try {
    settings = await Storage.getSettings();
  } catch (err) {
    console.error('[Alertmanager Monitor] Failed to read settings:', err.message);
    return;
  }

  let alerts;
  try {
    alerts = await AlertmanagerAPI.getAlerts(instance, settings.defaultFilter);
    await Storage.cacheAlerts(instance.id, alerts);
  } catch (err) {
    console.error('[Alertmanager Monitor] Poll failed:', err.message);
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
    await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
    return;
  }

  try {
    await updateBadge(alerts, settings.enableBadge);
  } catch (err) {
    console.error('[Alertmanager Monitor] Badge update failed:', err.message);
  }

  if (settings.enableNotifications) {
    try {
      await checkForNewAlerts(instance.id, alerts);
    } catch (err) {
      console.error('[Alertmanager Monitor] Notification check failed:', err.message);
    }
  }

  try {
    const silences = await AlertmanagerAPI.getSilences(instance);
    await Storage.cacheSilences(instance.id, silences);
  } catch (err) {
    console.error('[Alertmanager Monitor] Silences fetch failed:', err.message);
  }
}

async function checkForNewAlerts(instanceId, alerts) {
  const knownFingerprints = await Storage.getKnownFingerprints(instanceId);
  const currentFingerprints = alerts.map((a) => a.fingerprint);

  const newAlerts = alerts.filter(
    (a) => a.status?.state === 'active' && !knownFingerprints.includes(a.fingerprint)
  );

  if (newAlerts.length > 0 && knownFingerprints.length > 0) {
    for (const alert of newAlerts.slice(0, 5)) {
      const severity = alert.labels?.severity || 'unknown';
      const alertname = alert.labels?.alertname || 'Alert';
      const summary = alert.annotations?.summary || 'New alert fired';

      chrome.notifications.create(`${NOTIFICATION_ID_PREFIX}${alert.fingerprint}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `[${severity.toUpperCase()}] ${alertname}`,
        message: summary,
        priority: severity === 'critical' ? 2 : 1,
      });
    }

    if (newAlerts.length > 5) {
      chrome.notifications.create(`${NOTIFICATION_ID_PREFIX}batch`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Alertmanager Monitor',
        message: `${newAlerts.length} new alerts detected`,
        priority: 1,
      });
    }
  }

  await Storage.setKnownFingerprints(instanceId, currentFingerprints);
}

async function setupAlarm() {
  const settings = await Storage.getSettings();
  const intervalMinutes = Math.max(settings.pollInterval / 60, 0.5);

  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 0.1,
    periodInMinutes: intervalMinutes,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollAlerts();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
  pollAlerts();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
  pollAlerts();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) {
    setupAlarm();
    pollAlerts();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith(NOTIFICATION_ID_PREFIX)) {
    chrome.action.openPopup?.() || chrome.windows.getCurrent((w) => {
      chrome.action.setPopup({ popup: 'popup/popup.html' });
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'pollNow') {
    pollAlerts().then(() => sendResponse({ success: true })).catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === 'getAlerts') {
    (async () => {
      const instance = await Storage.getActiveInstance();
      if (!instance) { sendResponse({ success: false, error: 'No active instance' }); return; }
      try {
        const alerts = await AlertmanagerAPI.getAlerts(instance, message.filter);
        sendResponse({ success: true, data: alerts });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }
  if (message.action === 'getSilences') {
    (async () => {
      const instance = await Storage.getActiveInstance();
      if (!instance) { sendResponse({ success: false, error: 'No active instance' }); return; }
      try {
        const silences = await AlertmanagerAPI.getSilences(instance);
        sendResponse({ success: true, data: silences });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }
});
