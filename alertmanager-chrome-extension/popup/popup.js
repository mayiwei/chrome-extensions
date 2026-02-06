(function () {
  'use strict';

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  const dom = {
    connectionDot: $('#connectionDot'),
    instanceSelector: $('#instanceSelector'),
    refreshBtn: $('#refreshBtn'),
    settingsBtn: $('#settingsBtn'),
    searchInput: $('#searchInput'),
    filterActive: $('#filterActive'),
    filterSilenced: $('#filterSilenced'),
    filterInhibited: $('#filterInhibited'),
    groupBySelect: $('#groupBySelect'),
    alertSummary: $('#alertSummary'),
    alertList: $('#alertList'),
    silenceList: $('#silenceList'),
    statusContent: $('#statusContent'),
    loadingOverlay: $('#loadingOverlay'),
    detailOverlay: $('#detailOverlay'),
    detailBack: $('#detailBack'),
    detailContent: $('#detailContent'),
  };

  let currentAlerts = [];
  let currentSilences = [];
  let currentSeverityFilter = 'all';
  let isLoading = false;

  function showLoading(show) {
    isLoading = show;
    dom.loadingOverlay.classList.toggle('show', show);
  }

  function setConnection(ok) {
    dom.connectionDot.className = 'connection-dot ' + (ok ? 'ok' : 'err');
    dom.connectionDot.title = ok ? 'Connected' : 'Connection error';
  }

  async function populateInstanceSelector() {
    const instances = await Storage.getInstances();
    const settings = await Storage.getSettings();
    dom.instanceSelector.innerHTML = '';

    if (instances.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No instances';
      opt.disabled = true;
      dom.instanceSelector.appendChild(opt);
      return;
    }

    instances.forEach((inst) => {
      const opt = document.createElement('option');
      opt.value = inst.id;
      opt.textContent = inst.name || inst.url;
      if (inst.id === settings.activeInstanceId) opt.selected = true;
      dom.instanceSelector.appendChild(opt);
    });
  }

  function renderAlertSummary(alerts) {
    const active = alerts.filter((a) => a.status?.state === 'active').length;
    const silenced = alerts.filter((a) => (a.status?.silencedBy?.length || 0) > 0).length;
    const inhibited = alerts.filter((a) => (a.status?.inhibitedBy?.length || 0) > 0).length;
    dom.alertSummary.innerHTML =
      `<span style="color:var(--clr-success);font-weight:600">${active} active</span> · ` +
      `<span style="color:var(--clr-warning)">${silenced} silenced</span> · ` +
      `<span style="color:var(--clr-muted)">${inhibited} inhibited</span> · ` +
      `<span>${alerts.length} total</span>`;
  }

  function getVisibleAlerts() {
    let alerts = [...currentAlerts];
    alerts = Utils.filterByState(alerts, {
      active: dom.filterActive.checked,
      silenced: dom.filterSilenced.checked,
      inhibited: dom.filterInhibited.checked,
    });
    if (currentSeverityFilter !== 'all') {
      alerts = alerts.filter((a) => a.labels?.severity === currentSeverityFilter);
    }
    const query = dom.searchInput.value;
    if (query) {
      alerts = Utils.searchAlerts(alerts, query);
    }
    alerts = Utils.sortAlerts(alerts);
    return alerts;
  }

  function renderAlertList() {
    const alerts = getVisibleAlerts();
    renderAlertSummary(alerts);

    if (alerts.length === 0) {
      if (currentAlerts.length === 0) {
        dom.alertList.innerHTML = renderEmpty('📭', 'No alerts', 'All clear — no alerts are currently firing.');
      } else {
        dom.alertList.innerHTML = renderEmpty('🔍', 'No matches', 'Try adjusting your filters or search query.');
      }
      return;
    }

    const groupBy = dom.groupBySelect.value;
    if (!groupBy) {
      dom.alertList.innerHTML = alerts.map(renderAlertCard).join('');
      return;
    }

    const groups = Utils.groupAlerts(alerts, groupBy);
    const sortedGroups = Object.entries(groups).sort((a, b) => {
      const maxSevA = Math.min(...a[1].map((al) => Utils.getSeverity(al.labels?.severity).order));
      const maxSevB = Math.min(...b[1].map((al) => Utils.getSeverity(al.labels?.severity).order));
      return maxSevA - maxSevB;
    });

    dom.alertList.innerHTML = sortedGroups
      .map(
        ([name, groupAlerts]) =>
          `<div class="alert-group">
            <div class="group-header" data-group="${Utils.escapeHtml(name)}">
              <div><span class="chevron">▼</span>${Utils.escapeHtml(name)}</div>
              <span class="group-count">${groupAlerts.length}</span>
            </div>
            <div class="group-body">${groupAlerts.map(renderAlertCard).join('')}</div>
          </div>`
      )
      .join('');
  }

  function renderAlertCard(alert) {
    const sev = Utils.getSeverity(alert.labels?.severity);
    const state = alert.status?.state || 'active';
    const alertname = Utils.escapeHtml(alert.labels?.alertname || 'Unknown');
    const summary = Utils.escapeHtml(Utils.truncate(alert.annotations?.summary || '', 80));
    const time = Utils.timeAgo(alert.startsAt);
    const fp = Utils.escapeHtml(alert.fingerprint || '');

    const importantLabels = Object.entries(alert.labels || {})
      .filter(([k]) => k !== 'alertname' && k !== 'severity')
      .slice(0, 4)
      .map(([k, v]) => `<span class="label-tag">${Utils.escapeHtml(k)}=${Utils.escapeHtml(Utils.truncate(v, 30))}</span>`)
      .join('');

    return `<div class="alert-card" data-fingerprint="${fp}">
      <div class="alert-sev-strip" style="background:${sev.color}"></div>
      <div class="alert-body">
        <div class="alert-top">
          <span class="alert-name">${alertname}</span>
          <span class="alert-badge ${state}">${state}</span>
        </div>
        ${summary ? `<div class="alert-summary-text">${summary}</div>` : ''}
        ${importantLabels ? `<div class="alert-labels">${importantLabels}</div>` : ''}
        <div class="alert-time">🕐 ${time}</div>
      </div>
    </div>`;
  }

  function renderEmpty(icon, title, sub) {
    return `<div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-text">${title}</div>
      <div class="empty-sub">${sub}</div>
    </div>`;
  }

  function renderError(msg) {
    return `<div class="error-state">
      <div class="error-icon">⚠️</div>
      <div class="error-text">${Utils.escapeHtml(msg)}</div>
      <button class="retry-btn" id="retryBtn">Retry</button>
    </div>`;
  }

  function showAlertDetail(fingerprint) {
    const alert = currentAlerts.find((a) => a.fingerprint === fingerprint);
    if (!alert) return;

    const sev = Utils.getSeverity(alert.labels?.severity);
    const state = alert.status?.state || 'active';

    const labelsHtml = Object.entries(alert.labels || {})
      .map(
        ([k, v]) =>
          `<span class="detail-kv-item"><span class="kv-key">${Utils.escapeHtml(k)}</span>=<span class="kv-val">${Utils.escapeHtml(v)}</span></span>`
      )
      .join('');

    const annotationsHtml = Object.entries(alert.annotations || {})
      .map(([k, v]) => {
        let val = Utils.escapeHtml(v);
        if (k.toLowerCase().includes('url') || v.startsWith('http')) {
          val = `<a href="${Utils.escapeHtml(v)}" target="_blank" rel="noopener">${val}</a>`;
        }
        return `<div class="detail-annotation">
          <div class="detail-annotation-key">${Utils.escapeHtml(k)}</div>
          <div class="detail-annotation-val">${val}</div>
        </div>`;
      })
      .join('');

    const receiversHtml = (alert.receivers || []).map((r) => Utils.escapeHtml(r.name)).join(', ') || 'N/A';

    const generatorLink = alert.generatorURL
      ? `<a href="${Utils.escapeHtml(alert.generatorURL)}" target="_blank" rel="noopener">${Utils.escapeHtml(Utils.truncate(alert.generatorURL, 60))}</a>`
      : 'N/A';

    dom.detailContent.innerHTML = `
      <div class="detail-section">
        <div class="detail-name" style="color:${sev.color}">${sev.icon} ${Utils.escapeHtml(alert.labels?.alertname || 'Alert')}</div>
        <div class="detail-status-row">
          <span class="alert-badge ${state}">${state}</span>
          <span style="font-size:11px;color:var(--clr-muted)">Severity: ${Utils.escapeHtml(alert.labels?.severity || 'none')}</span>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Labels</div>
        <div class="detail-kv">${labelsHtml}</div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Annotations</div>
        ${annotationsHtml || '<div style="font-size:12px;color:var(--clr-muted)">No annotations</div>'}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Metadata</div>
        <div class="detail-meta">
          <div class="detail-meta-row"><span class="detail-meta-key">Started</span><span>${Utils.formatDate(alert.startsAt)}</span></div>
          <div class="detail-meta-row"><span class="detail-meta-key">Ends</span><span>${Utils.formatDate(alert.endsAt)}</span></div>
          <div class="detail-meta-row"><span class="detail-meta-key">Updated</span><span>${Utils.formatDate(alert.updatedAt)}</span></div>
          <div class="detail-meta-row"><span class="detail-meta-key">Fingerprint</span><span>${Utils.escapeHtml(alert.fingerprint)}</span></div>
          <div class="detail-meta-row"><span class="detail-meta-key">Receivers</span><span>${receiversHtml}</span></div>
          <div class="detail-meta-row"><span class="detail-meta-key">Generator</span><span>${generatorLink}</span></div>
          ${alert.status?.silencedBy?.length ? `<div class="detail-meta-row"><span class="detail-meta-key">Silenced By</span><span>${alert.status.silencedBy.map((s) => Utils.escapeHtml(s)).join(', ')}</span></div>` : ''}
          ${alert.status?.inhibitedBy?.length ? `<div class="detail-meta-row"><span class="detail-meta-key">Inhibited By</span><span>${alert.status.inhibitedBy.map((s) => Utils.escapeHtml(s)).join(', ')}</span></div>` : ''}
        </div>
      </div>`;

    dom.detailOverlay.classList.add('show');
  }

  function renderSilences() {
    if (currentSilences.length === 0) {
      dom.silenceList.innerHTML = renderEmpty('🔇', 'No silences', 'No active or pending silences found.');
      return;
    }

    const sorted = [...currentSilences].sort((a, b) => {
      const order = { active: 0, pending: 1, expired: 2 };
      return (order[a.status?.state] || 3) - (order[b.status?.state] || 3);
    });

    dom.silenceList.innerHTML = sorted
      .map((s) => {
        const state = s.status?.state || 'expired';
        const matchersHtml = (s.matchers || [])
          .map((m) => {
            const op = m.isRegex ? (m.isEqual !== false ? '=~' : '!~') : m.isEqual !== false ? '=' : '!=';
            return `<span class="silence-matcher">${Utils.escapeHtml(m.name)}${op}${Utils.escapeHtml(m.value)}</span>`;
          })
          .join('');

        const timeInfo =
          state === 'active'
            ? `Expires ${Utils.timeAgo(s.endsAt).replace(' ago', '')} from now`
            : `${Utils.formatDate(s.startsAt)} → ${Utils.formatDate(s.endsAt)}`;

        return `<div class="silence-card">
          <div class="silence-top">
            <span class="silence-status ${state}">${state}</span>
            <span class="silence-created-by">${Utils.escapeHtml(s.createdBy || 'unknown')}</span>
          </div>
          ${s.comment ? `<div class="silence-comment">${Utils.escapeHtml(s.comment)}</div>` : ''}
          <div class="silence-matchers">${matchersHtml}</div>
          <div class="silence-time">${timeInfo}</div>
        </div>`;
      })
      .join('');
  }

  async function renderStatus() {
    const instance = await Storage.getActiveInstance();
    if (!instance) {
      dom.statusContent.innerHTML = renderEmpty('⚙️', 'No instance configured', 'Go to Settings to add an Alertmanager instance.');
      return;
    }

    try {
      const status = await AlertmanagerAPI.getStatus(instance);
      const activeCount = currentAlerts.filter((a) => a.status?.state === 'active').length;
      const silencedCount = currentAlerts.filter((a) => (a.status?.silencedBy?.length || 0) > 0).length;

      dom.statusContent.innerHTML = `
        <div class="status-card">
          <div class="status-card-title">Connection</div>
          <div class="status-row"><span class="status-label">Instance</span><span class="status-value">${Utils.escapeHtml(instance.name)}</span></div>
          <div class="status-row"><span class="status-label">URL</span><span class="status-value">${Utils.escapeHtml(instance.url)}</span></div>
          <div class="status-row"><span class="status-label">Status</span><span class="status-value ok">Connected</span></div>
        </div>
        <div class="status-card">
          <div class="status-card-title">Alertmanager Info</div>
          <div class="status-row"><span class="status-label">Version</span><span class="status-value">${Utils.escapeHtml(status.versionInfo?.version || 'N/A')}</span></div>
          <div class="status-row"><span class="status-label">Uptime</span><span class="status-value">${Utils.escapeHtml(status.uptime || 'N/A')}</span></div>
          <div class="status-row"><span class="status-label">Cluster Status</span><span class="status-value">${Utils.escapeHtml(status.cluster?.status || 'N/A')}</span></div>
          <div class="status-row"><span class="status-label">Peers</span><span class="status-value">${status.cluster?.peers?.length || 0}</span></div>
        </div>
        <div class="status-card">
          <div class="status-card-title">Alert Statistics</div>
          <div class="status-row"><span class="status-label">Total Alerts</span><span class="status-value">${currentAlerts.length}</span></div>
          <div class="status-row"><span class="status-label">Active</span><span class="status-value" style="color:var(--clr-critical)">${activeCount}</span></div>
          <div class="status-row"><span class="status-label">Silenced</span><span class="status-value" style="color:var(--clr-warning)">${silencedCount}</span></div>
          <div class="status-row"><span class="status-label">Active Silences</span><span class="status-value">${currentSilences.filter((s) => s.status?.state === 'active').length}</span></div>
        </div>`;

      setConnection(true);
    } catch (err) {
      dom.statusContent.innerHTML = `
        <div class="status-card">
          <div class="status-card-title">Connection</div>
          <div class="status-row"><span class="status-label">Instance</span><span class="status-value">${Utils.escapeHtml(instance.name)}</span></div>
          <div class="status-row"><span class="status-label">URL</span><span class="status-value">${Utils.escapeHtml(instance.url)}</span></div>
          <div class="status-row"><span class="status-label">Status</span><span class="status-value err">Error: ${Utils.escapeHtml(err.message)}</span></div>
        </div>`;
      setConnection(false);
    }
  }

  async function fetchData() {
    const instance = await Storage.getActiveInstance();
    if (!instance) {
      currentAlerts = [];
      currentSilences = [];
      setConnection(false);
      dom.alertList.innerHTML = renderEmpty(
        '⚙️',
        'No instance configured',
        'Click the ⚙ button to add an Alertmanager instance.'
      );
      dom.alertSummary.innerHTML = '';
      return;
    }

    showLoading(true);
    try {
      const [alerts, silences] = await Promise.all([
        AlertmanagerAPI.getAlerts(instance),
        AlertmanagerAPI.getSilences(instance),
      ]);

      currentAlerts = alerts || [];
      currentSilences = silences || [];

      await Storage.cacheAlerts(instance.id, currentAlerts);
      await Storage.cacheSilences(instance.id, currentSilences);

      setConnection(true);
      renderAlertList();
      renderSilences();
    } catch (err) {
      setConnection(false);
      const cached = await Storage.getCachedAlerts(instance.id);
      if (cached && cached.alerts.length > 0) {
        currentAlerts = cached.alerts;
        renderAlertList();
        dom.alertSummary.innerHTML += ` <span style="color:var(--clr-warning)">(cached)</span>`;
      } else {
        dom.alertList.innerHTML = renderError(err.message);
        dom.alertSummary.innerHTML = '';
      }

      const cachedSilences = await Storage.getCachedSilences(instance.id);
      if (cachedSilences) {
        currentSilences = cachedSilences.silences;
        renderSilences();
      }
    } finally {
      showLoading(false);
    }
  }

  function bindEvents() {
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach((t) => t.classList.remove('active'));
        $$('.tab-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        $(`#${target}Tab`).classList.add('active');

        if (target === 'status') renderStatus();
      });
    });

    dom.instanceSelector.addEventListener('change', async () => {
      await Storage.setActiveInstance(dom.instanceSelector.value);
      fetchData();
    });

    dom.refreshBtn.addEventListener('click', () => {
      if (!isLoading) fetchData();
    });

    dom.settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    const debouncedRender = Utils.debounce(() => renderAlertList(), 200);
    dom.searchInput.addEventListener('input', debouncedRender);

    [dom.filterActive, dom.filterSilenced, dom.filterInhibited].forEach((cb) => {
      cb.addEventListener('change', () => renderAlertList());
    });

    $$('.sev-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.sev-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentSeverityFilter = btn.dataset.severity;
        renderAlertList();
      });
    });

    dom.groupBySelect.addEventListener('change', () => renderAlertList());

    dom.alertList.addEventListener('click', (e) => {
      const card = e.target.closest('.alert-card');
      if (card) {
        showAlertDetail(card.dataset.fingerprint);
        return;
      }

      const groupHeader = e.target.closest('.group-header');
      if (groupHeader) {
        groupHeader.classList.toggle('collapsed');
      }

      const retryBtn = e.target.closest('#retryBtn');
      if (retryBtn) {
        fetchData();
      }
    });

    dom.detailBack.addEventListener('click', () => {
      dom.detailOverlay.classList.remove('show');
    });
  }

  async function init() {
    await populateInstanceSelector();
    bindEvents();
    await fetchData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
