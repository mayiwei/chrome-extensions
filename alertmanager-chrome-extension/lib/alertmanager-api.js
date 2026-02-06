/**
 * Alertmanager API v2 Client
 * Handles all communication with Alertmanager instances.
 */

const AlertmanagerAPI = {
  /**
   * Build authorization headers based on instance auth config.
   * @param {Object} instance - AlertmanagerInstance
   * @returns {Object} headers
   */
  _buildHeaders(instance) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (instance.authType === 'basic' && instance.username) {
      headers['Authorization'] =
        'Basic ' + btoa(`${instance.username}:${instance.password || ''}`);
    } else if (instance.authType === 'bearer' && instance.token) {
      headers['Authorization'] = `Bearer ${instance.token}`;
    }

    return headers;
  },

  /**
   * Normalize the base URL (strip trailing slash).
   * @param {string} url
   * @returns {string}
   */
  _normalizeUrl(url) {
    return url.replace(/\/+$/, '');
  },

  /**
   * Make a fetch request with error handling.
   * @param {string} url
   * @param {Object} headers
   * @param {number} [timeout=10000]
   * @returns {Promise<any>}
   */
  async _fetch(url, headers, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Fetch alerts from an Alertmanager instance.
   * @param {Object} instance - AlertmanagerInstance
   * @param {Object} [filter] - Filter options
   * @param {boolean} [filter.active=true]
   * @param {boolean} [filter.silenced=true]
   * @param {boolean} [filter.inhibited=true]
   * @param {boolean} [filter.unprocessed=true]
   * @param {string} [filter.filter] - Label matcher expression
   * @param {string} [filter.receiver] - Receiver regex
   * @returns {Promise<Array>}
   */
  async getAlerts(instance, filter = {}) {
    const baseUrl = this._normalizeUrl(instance.url);
    const url = new URL(`${baseUrl}/api/v2/alerts`);

    // Set query params
    const params = {
      active: filter.active !== undefined ? filter.active : true,
      silenced: filter.silenced !== undefined ? filter.silenced : true,
      inhibited: filter.inhibited !== undefined ? filter.inhibited : true,
      unprocessed: filter.unprocessed !== undefined ? filter.unprocessed : true,
    };

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    if (filter.filter) {
      // filter param can be repeated for multiple matchers
      const filters = Array.isArray(filter.filter) ? filter.filter : [filter.filter];
      filters.forEach((f) => url.searchParams.append('filter', f));
    }

    if (filter.receiver) {
      url.searchParams.set('receiver', filter.receiver);
    }

    const headers = this._buildHeaders(instance);
    return await this._fetch(url.toString(), headers);
  },

  /**
   * Fetch silences from an Alertmanager instance.
   * @param {Object} instance - AlertmanagerInstance
   * @param {string} [filterParam] - Optional filter
   * @returns {Promise<Array>}
   */
  async getSilences(instance, filterParam) {
    const baseUrl = this._normalizeUrl(instance.url);
    const url = new URL(`${baseUrl}/api/v2/silences`);

    if (filterParam) {
      const filters = Array.isArray(filterParam) ? filterParam : [filterParam];
      filters.forEach((f) => url.searchParams.append('filter', f));
    }

    const headers = this._buildHeaders(instance);
    return await this._fetch(url.toString(), headers);
  },

  /**
   * Fetch Alertmanager status.
   * @param {Object} instance - AlertmanagerInstance
   * @returns {Promise<Object>}
   */
  async getStatus(instance) {
    const baseUrl = this._normalizeUrl(instance.url);
    const url = `${baseUrl}/api/v2/status`;
    const headers = this._buildHeaders(instance);
    return await this._fetch(url, headers);
  },

  /**
   * Test connectivity to an Alertmanager instance.
   * @param {Object} instance - AlertmanagerInstance
   * @returns {Promise<{success: boolean, message: string, version?: string}>}
   */
  async testConnection(instance) {
    try {
      const status = await this.getStatus(instance);
      return {
        success: true,
        message: 'Connected successfully',
        version: status.versionInfo?.version || 'unknown',
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.AlertmanagerAPI = AlertmanagerAPI;
}
