/**
 * Chrome Storage Wrapper
 * Handles persistent storage for extension settings and cached data.
 */

const DEFAULT_SETTINGS = {
  instances: [],
  activeInstanceId: null,
  pollInterval: 30, // seconds
  enableNotifications: true,
  enableBadge: true,
  theme: 'light',
  defaultFilter: {
    active: true,
    silenced: true,
    inhibited: true,
    unprocessed: true,
  },
};

/**
 * @typedef {Object} AlertmanagerInstance
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} url - Alertmanager base URL (e.g. http://localhost:9093)
 * @property {'none'|'basic'|'bearer'} authType - Authentication type
 * @property {string} [username] - Basic auth username
 * @property {string} [password] - Basic auth password
 * @property {string} [token] - Bearer token
 */

const Storage = {
  /**
   * Get all settings, merging with defaults.
   * @returns {Promise<Object>}
   */
  async getSettings() {
    const data = await chrome.storage.sync.get('settings');
    return { ...DEFAULT_SETTINGS, ...data.settings };
  },

  /**
   * Save settings (partial update supported).
   * @param {Object} partial
   * @returns {Promise<void>}
   */
  async saveSettings(partial) {
    const current = await this.getSettings();
    const merged = { ...current, ...partial };
    await chrome.storage.sync.set({ settings: merged });
  },

  /**
   * Get all configured Alertmanager instances.
   * @returns {Promise<AlertmanagerInstance[]>}
   */
  async getInstances() {
    const settings = await this.getSettings();
    return settings.instances || [];
  },

  /**
   * Add a new Alertmanager instance.
   * @param {AlertmanagerInstance} instance
   * @returns {Promise<void>}
   */
  async addInstance(instance) {
    const settings = await this.getSettings();
    instance.id = instance.id || crypto.randomUUID();
    settings.instances.push(instance);
    if (!settings.activeInstanceId) {
      settings.activeInstanceId = instance.id;
    }
    await this.saveSettings(settings);
  },

  /**
   * Update an existing Alertmanager instance.
   * @param {string} id
   * @param {Partial<AlertmanagerInstance>} updates
   * @returns {Promise<void>}
   */
  async updateInstance(id, updates) {
    const settings = await this.getSettings();
    const idx = settings.instances.findIndex((i) => i.id === id);
    if (idx !== -1) {
      settings.instances[idx] = { ...settings.instances[idx], ...updates };
      await this.saveSettings(settings);
    }
  },

  /**
   * Remove an Alertmanager instance.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async removeInstance(id) {
    const settings = await this.getSettings();
    settings.instances = settings.instances.filter((i) => i.id !== id);
    if (settings.activeInstanceId === id) {
      settings.activeInstanceId = settings.instances[0]?.id || null;
    }
    await this.saveSettings(settings);
  },

  /**
   * Get the currently active instance.
   * @returns {Promise<AlertmanagerInstance|null>}
   */
  async getActiveInstance() {
    const settings = await this.getSettings();
    if (!settings.activeInstanceId) return null;
    return settings.instances.find((i) => i.id === settings.activeInstanceId) || null;
  },

  /**
   * Set the active instance by ID.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async setActiveInstance(id) {
    await this.saveSettings({ activeInstanceId: id });
  },

  /**
   * Cache alerts in local storage (not sync, to avoid quota).
   * @param {string} instanceId
   * @param {Array} alerts
   * @returns {Promise<void>}
   */
  async cacheAlerts(instanceId, alerts) {
    await chrome.storage.local.set({
      [`alerts_${instanceId}`]: {
        alerts,
        timestamp: Date.now(),
      },
    });
  },

  /**
   * Get cached alerts for an instance.
   * @param {string} instanceId
   * @returns {Promise<{alerts: Array, timestamp: number}|null>}
   */
  async getCachedAlerts(instanceId) {
    const data = await chrome.storage.local.get(`alerts_${instanceId}`);
    return data[`alerts_${instanceId}`] || null;
  },

  /**
   * Cache silences in local storage.
   * @param {string} instanceId
   * @param {Array} silences
   * @returns {Promise<void>}
   */
  async cacheSilences(instanceId, silences) {
    await chrome.storage.local.set({
      [`silences_${instanceId}`]: {
        silences,
        timestamp: Date.now(),
      },
    });
  },

  /**
   * Get cached silences for an instance.
   * @param {string} instanceId
   * @returns {Promise<{silences: Array, timestamp: number}|null>}
   */
  async getCachedSilences(instanceId) {
    const data = await chrome.storage.local.get(`silences_${instanceId}`);
    return data[`silences_${instanceId}`] || null;
  },

  /**
   * Store known alert fingerprints for new-alert detection.
   * @param {string} instanceId
   * @param {string[]} fingerprints
   * @returns {Promise<void>}
   */
  async setKnownFingerprints(instanceId, fingerprints) {
    await chrome.storage.local.set({
      [`fingerprints_${instanceId}`]: fingerprints,
    });
  },

  /**
   * Get known alert fingerprints.
   * @param {string} instanceId
   * @returns {Promise<string[]>}
   */
  async getKnownFingerprints(instanceId) {
    const data = await chrome.storage.local.get(`fingerprints_${instanceId}`);
    return data[`fingerprints_${instanceId}`] || [];
  },
};

// Make available to both modules and non-module scripts
if (typeof globalThis !== 'undefined') {
  globalThis.Storage = Storage;
}
