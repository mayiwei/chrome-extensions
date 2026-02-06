/**
 * Shared utilities for the Alertmanager Chrome Extension.
 */

const Utils = {
  /**
   * Severity levels and their display properties.
   */
  SEVERITY: {
    critical: { color: '#dc2626', bg: '#fef2f2', icon: '🔴', order: 0 },
    warning: { color: '#d97706', bg: '#fffbeb', icon: '🟡', order: 1 },
    info: { color: '#2563eb', bg: '#eff6ff', icon: '🔵', order: 2 },
    none: { color: '#6b7280', bg: '#f9fafb', icon: '⚪', order: 3 },
  },

  /**
   * Get severity display properties.
   * @param {string} severity
   * @returns {Object}
   */
  getSeverity(severity) {
    return this.SEVERITY[severity?.toLowerCase()] || this.SEVERITY.none;
  },

  /**
   * Format a date string relative to now.
   * @param {string} dateStr - ISO date string
   * @returns {string}
   */
  timeAgo(dateStr) {
    if (!dateStr) return 'N/A';
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diffMs = now - date;

    if (diffMs < 0) return 'in the future';

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ago`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  },

  /**
   * Format a date for display.
   * @param {string} dateStr
   * @returns {string}
   */
  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  },

  /**
   * Group alerts by a specific label.
   * @param {Array} alerts
   * @param {string} [groupBy='alertname']
   * @returns {Object} - { groupKey: alerts[] }
   */
  groupAlerts(alerts, groupBy = 'alertname') {
    const groups = {};
    alerts.forEach((alert) => {
      const key = alert.labels?.[groupBy] || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(alert);
    });
    return groups;
  },

  /**
   * Sort alerts by severity and then by start time.
   * @param {Array} alerts
   * @returns {Array}
   */
  sortAlerts(alerts) {
    return [...alerts].sort((a, b) => {
      const sevA = this.getSeverity(a.labels?.severity).order;
      const sevB = this.getSeverity(b.labels?.severity).order;
      if (sevA !== sevB) return sevA - sevB;
      // More recent alerts first
      return new Date(b.startsAt) - new Date(a.startsAt);
    });
  },

  /**
   * Filter alerts by text search.
   * @param {Array} alerts
   * @param {string} query
   * @returns {Array}
   */
  searchAlerts(alerts, query) {
    if (!query || !query.trim()) return alerts;
    const q = query.toLowerCase().trim();
    return alerts.filter((alert) => {
      const labels = Object.entries(alert.labels || {})
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
        .toLowerCase();
      const annotations = Object.values(alert.annotations || {}).join(' ').toLowerCase();
      return labels.includes(q) || annotations.includes(q);
    });
  },

  /**
   * Filter alerts by state.
   * @param {Array} alerts
   * @param {Object} stateFilter
   * @returns {Array}
   */
  filterByState(alerts, stateFilter = {}) {
    return alerts.filter((alert) => {
      const state = alert.status?.state;
      if (state === 'active' && stateFilter.active === false) return false;
      if (state === 'suppressed') {
        const isSilenced = alert.status?.silencedBy?.length > 0;
        const isInhibited = alert.status?.inhibitedBy?.length > 0;
        if (isSilenced && stateFilter.silenced === false) return false;
        if (isInhibited && stateFilter.inhibited === false) return false;
      }
      if (state === 'unprocessed' && stateFilter.unprocessed === false) return false;
      return true;
    });
  },

  /**
   * Get badge color based on alert severity counts.
   * @param {Array} alerts
   * @returns {string} - hex color for badge
   */
  getBadgeColor(alerts) {
    if (!alerts || alerts.length === 0) return '#4ade80'; // green
    const hasCritical = alerts.some(
      (a) => a.labels?.severity === 'critical' && a.status?.state === 'active'
    );
    const hasWarning = alerts.some(
      (a) => a.labels?.severity === 'warning' && a.status?.state === 'active'
    );
    if (hasCritical) return '#dc2626'; // red
    if (hasWarning) return '#d97706'; // amber
    return '#2563eb'; // blue
  },

  /**
   * Count active alerts (non-suppressed).
   * @param {Array} alerts
   * @returns {number}
   */
  countActiveAlerts(alerts) {
    return alerts.filter((a) => a.status?.state === 'active').length;
  },

  /**
   * Escape HTML to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Truncate string with ellipsis.
   * @param {string} str
   * @param {number} max
   * @returns {string}
   */
  truncate(str, max = 80) {
    if (!str || str.length <= max) return str || '';
    return str.substring(0, max) + '…';
  },

  /**
   * Debounce function.
   * @param {Function} fn
   * @param {number} delay
   * @returns {Function}
   */
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  /**
   * Check if a silence is currently active.
   * @param {Object} silence
   * @returns {boolean}
   */
  isSilenceActive(silence) {
    if (silence.status?.state === 'active') return true;
    const now = Date.now();
    const start = new Date(silence.startsAt).getTime();
    const end = new Date(silence.endsAt).getTime();
    return now >= start && now <= end;
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.Utils = Utils;
}
