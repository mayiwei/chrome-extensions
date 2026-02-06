(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const dom = {
    instanceList: $('#instanceList'),
    addInstanceBtn: $('#addInstanceBtn'),
    formOverlay: $('#instanceFormOverlay'),
    formTitle: $('#formTitle'),
    formInstanceId: $('#formInstanceId'),
    formName: $('#formName'),
    formUrl: $('#formUrl'),
    formAuthType: $('#formAuthType'),
    basicAuthFields: $('#basicAuthFields'),
    bearerAuthFields: $('#bearerAuthFields'),
    formUsername: $('#formUsername'),
    formPassword: $('#formPassword'),
    formToken: $('#formToken'),
    formError: $('#formError'),
    formCancelBtn: $('#formCancelBtn'),
    formSaveBtn: $('#formSaveBtn'),
    pollInterval: $('#pollInterval'),
    enableBadge: $('#enableBadge'),
    enableNotifications: $('#enableNotifications'),
    defActive: $('#defActive'),
    defSilenced: $('#defSilenced'),
    defInhibited: $('#defInhibited'),
    defUnprocessed: $('#defUnprocessed'),
    extVersion: $('#extVersion'),
    saveSettingsBtn: $('#saveSettingsBtn'),
    saveStatus: $('#saveStatus'),
    toast: $('#toast'),
    exportConfigBtn: $('#exportConfigBtn'),
    importConfigBtn: $('#importConfigBtn'),
    importFileInput: $('#importFileInput'),
    importConfirmOverlay: $('#importConfirmOverlay'),
    importPreview: $('#importPreview'),
    importCredentialsWarning: $('#importCredentialsWarning'),
    importCancelBtn: $('#importCancelBtn'),
    importConfirmBtn: $('#importConfirmBtn'),
  };

  function showToast(message, type) {
    dom.toast.textContent = message;
    dom.toast.className = `toast show ${type}`;
    setTimeout(() => { dom.toast.className = 'toast'; }, 2500);
  }

  function openForm(instance) {
    dom.formTitle.textContent = instance ? 'Edit Instance' : 'Add Instance';
    dom.formInstanceId.value = instance?.id || '';
    dom.formName.value = instance?.name || '';
    dom.formUrl.value = instance?.url || '';
    dom.formAuthType.value = instance?.authType || 'none';
    dom.formUsername.value = instance?.username || '';
    dom.formPassword.value = instance?.password || '';
    dom.formToken.value = instance?.token || '';
    dom.formError.textContent = '';
    updateAuthFields();
    dom.formOverlay.classList.add('show');
    dom.formName.focus();
  }

  function closeForm() {
    dom.formOverlay.classList.remove('show');
  }

  function updateAuthFields() {
    const authType = dom.formAuthType.value;
    dom.basicAuthFields.style.display = authType === 'basic' ? 'block' : 'none';
    dom.bearerAuthFields.style.display = authType === 'bearer' ? 'block' : 'none';
  }

  function validateForm() {
    dom.formError.textContent = '';
    dom.formName.classList.remove('invalid');
    dom.formUrl.classList.remove('invalid');

    const name = dom.formName.value.trim();
    const url = dom.formUrl.value.trim();

    if (!name) {
      dom.formName.classList.add('invalid');
      dom.formError.textContent = 'Instance name is required';
      return null;
    }
    if (!url) {
      dom.formUrl.classList.add('invalid');
      dom.formError.textContent = 'Alertmanager URL is required';
      return null;
    }

    try {
      new URL(url);
    } catch {
      dom.formUrl.classList.add('invalid');
      dom.formError.textContent = 'Invalid URL format (e.g. http://localhost:9093)';
      return null;
    }

    const instance = {
      name,
      url: url.replace(/\/+$/, ''),
      authType: dom.formAuthType.value,
    };

    if (instance.authType === 'basic') {
      instance.username = dom.formUsername.value.trim();
      instance.password = dom.formPassword.value;
    } else if (instance.authType === 'bearer') {
      instance.token = dom.formToken.value.trim();
    }

    const existingId = dom.formInstanceId.value;
    if (existingId) instance.id = existingId;

    return instance;
  }

  async function saveInstance() {
    const instance = validateForm();
    if (!instance) return;

    dom.formSaveBtn.disabled = true;
    dom.formSaveBtn.textContent = 'Saving...';

    try {
      if (instance.id) {
        await Storage.updateInstance(instance.id, instance);
      } else {
        await Storage.addInstance(instance);
      }
      closeForm();
      showToast('Instance saved', 'success');
      await renderInstances();
    } catch (err) {
      dom.formError.textContent = 'Failed to save: ' + err.message;
    } finally {
      dom.formSaveBtn.disabled = false;
      dom.formSaveBtn.textContent = 'Save';
    }
  }

  async function deleteInstance(id, name) {
    if (!confirm(`Delete instance "${name}"? This cannot be undone.`)) return;

    try {
      await Storage.removeInstance(id);
      showToast('Instance deleted', 'success');
      await renderInstances();
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
  }

  async function testConnection(id) {
    const instances = await Storage.getInstances();
    const instance = instances.find((i) => i.id === id);
    if (!instance) return;

    const resultEl = document.querySelector(`[data-test-result="${id}"]`);
    if (resultEl) {
      resultEl.textContent = 'Testing...';
      resultEl.className = 'test-result';
    }

    const result = await AlertmanagerAPI.testConnection(instance);

    if (resultEl) {
      if (result.success) {
        resultEl.textContent = `✓ Connected (v${result.version})`;
        resultEl.className = 'test-result ok';
      } else {
        resultEl.textContent = `✗ ${result.message}`;
        resultEl.className = 'test-result err';
      }
    }
  }

  async function setActive(id) {
    await Storage.setActiveInstance(id);
    showToast('Active instance changed', 'success');
    await renderInstances();
  }

  async function renderInstances() {
    const instances = await Storage.getInstances();
    const settings = await Storage.getSettings();

    if (instances.length === 0) {
      dom.instanceList.innerHTML = `
        <div class="empty-instances">
          <div class="empty-icon">📡</div>
          <p>No Alertmanager instances configured</p>
          <p style="font-size:12px;margin-top:4px">Click "Add Instance" to get started</p>
        </div>`;
      return;
    }

    dom.instanceList.innerHTML = instances
      .map((inst) => {
        const isActive = inst.id === settings.activeInstanceId;
        const authLabel = inst.authType === 'none' ? '' : `<span class="instance-auth-badge">${Utils.escapeHtml(inst.authType)}</span>`;

        return `<div class="instance-card ${isActive ? 'active-instance' : ''}">
          <div class="instance-info">
            <div class="instance-name">
              ${isActive ? '<span class="active-star" title="Active">★</span>' : ''}
              ${Utils.escapeHtml(inst.name)}
              ${authLabel}
            </div>
            <div class="instance-url">${Utils.escapeHtml(inst.url)}</div>
            <div class="test-result" data-test-result="${Utils.escapeHtml(inst.id)}"></div>
          </div>
          <div class="instance-actions">
            ${!isActive ? `<button class="btn btn-sm btn-secondary" data-action="activate" data-id="${inst.id}">Set Active</button>` : ''}
            <button class="btn btn-sm btn-secondary" data-action="test" data-id="${inst.id}">Test</button>
            <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${inst.id}">Edit</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${inst.id}" data-name="${Utils.escapeHtml(inst.name)}">Delete</button>
          </div>
        </div>`;
      })
      .join('');
  }

  async function loadSettings() {
    const settings = await Storage.getSettings();
    dom.pollInterval.value = settings.pollInterval;
    dom.enableBadge.checked = settings.enableBadge;
    dom.enableNotifications.checked = settings.enableNotifications;
    dom.defActive.checked = settings.defaultFilter.active;
    dom.defSilenced.checked = settings.defaultFilter.silenced;
    dom.defInhibited.checked = settings.defaultFilter.inhibited;
    dom.defUnprocessed.checked = settings.defaultFilter.unprocessed;

    const manifest = chrome.runtime.getManifest();
    dom.extVersion.textContent = manifest.version;
  }

  async function saveSettings() {
    const pollInterval = Math.min(300, Math.max(10, parseInt(dom.pollInterval.value, 10) || 30));
    dom.pollInterval.value = pollInterval;

    await Storage.saveSettings({
      pollInterval,
      enableBadge: dom.enableBadge.checked,
      enableNotifications: dom.enableNotifications.checked,
      defaultFilter: {
        active: dom.defActive.checked,
        silenced: dom.defSilenced.checked,
        inhibited: dom.defInhibited.checked,
        unprocessed: dom.defUnprocessed.checked,
      },
    });

    showToast('Settings saved', 'success');
    dom.saveStatus.textContent = 'Saved ✓';
    setTimeout(() => { dom.saveStatus.textContent = ''; }, 2000);
  }

  async function exportConfig() {
    try {
      const settings = await Storage.getSettings();
      const manifest = chrome.runtime.getManifest();
      const exportData = {
        exportVersion: 1,
        exportDate: new Date().toISOString(),
        extensionVersion: manifest.version,
        settings: {
          instances: settings.instances,
          activeInstanceId: settings.activeInstanceId,
          pollInterval: settings.pollInterval,
          enableNotifications: settings.enableNotifications,
          enableBadge: settings.enableBadge,
          theme: settings.theme,
          defaultFilter: settings.defaultFilter,
        },
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alertmanager-config-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Configuration exported', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  }

  let pendingImportData = null;

  function validateImportData(data) {
    if (!data || typeof data !== 'object') return 'Invalid file: not a JSON object';
    if (data.exportVersion !== 1) return 'Unsupported export version';
    if (!data.settings || typeof data.settings !== 'object') return 'Invalid file: missing settings';

    const s = data.settings;
    if (!Array.isArray(s.instances)) return 'Invalid file: instances must be an array';

    for (let i = 0; i < s.instances.length; i++) {
      const inst = s.instances[i];
      if (!inst.name || typeof inst.name !== 'string') return `Invalid instance at index ${i}: missing name`;
      if (!inst.url || typeof inst.url !== 'string') return `Invalid instance at index ${i}: missing url`;
      try { new URL(inst.url); } catch { return `Invalid instance at index ${i}: malformed URL "${inst.url}"`; }
      if (inst.authType && !['none', 'basic', 'bearer'].includes(inst.authType)) {
        return `Invalid instance at index ${i}: unknown authType "${inst.authType}"`;
      }
    }

    if (s.pollInterval !== undefined) {
      const pi = Number(s.pollInterval);
      if (isNaN(pi) || pi < 10 || pi > 300) return 'Invalid pollInterval (must be 10–300)';
    }

    return null;
  }

  function hasCredentials(data) {
    return (data.settings.instances || []).some(
      (inst) => inst.password || inst.token
    );
  }

  function buildImportPreview(data) {
    const s = data.settings;
    const items = [
      { label: 'Instances', value: `${(s.instances || []).length} configured` },
      { label: 'Poll Interval', value: `${s.pollInterval || 30}s` },
      { label: 'Badge', value: s.enableBadge !== false ? 'Enabled' : 'Disabled' },
      { label: 'Notifications', value: s.enableNotifications !== false ? 'Enabled' : 'Disabled' },
    ];

    if (data.exportDate) {
      items.unshift({ label: 'Exported', value: new Date(data.exportDate).toLocaleString() });
    }

    return items
      .map((item) =>
        `<div class="import-preview-item"><span class="import-preview-label">${Utils.escapeHtml(item.label)}</span><span class="import-preview-value">${Utils.escapeHtml(item.value)}</span></div>`
      )
      .join('');
  }

  function handleImportFile(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      showToast('File too large (max 1MB)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch {
        showToast('Invalid JSON file', 'error');
        return;
      }

      const error = validateImportData(data);
      if (error) {
        showToast(error, 'error');
        return;
      }

      pendingImportData = data;
      dom.importPreview.innerHTML = buildImportPreview(data);
      dom.importCredentialsWarning.style.display = hasCredentials(data) ? 'flex' : 'none';
      dom.importConfirmOverlay.classList.add('show');
    };
    reader.onerror = () => showToast('Failed to read file', 'error');
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (!pendingImportData) return;

    try {
      const s = pendingImportData.settings;
      const sanitized = {
        instances: (s.instances || []).map((inst) => ({
          id: inst.id || crypto.randomUUID(),
          name: String(inst.name).trim(),
          url: String(inst.url).trim().replace(/\/+$/, ''),
          authType: ['none', 'basic', 'bearer'].includes(inst.authType) ? inst.authType : 'none',
          ...(inst.authType === 'basic' ? { username: String(inst.username || ''), password: String(inst.password || '') } : {}),
          ...(inst.authType === 'bearer' ? { token: String(inst.token || '') } : {}),
        })),
        activeInstanceId: s.activeInstanceId || null,
        pollInterval: Math.min(300, Math.max(10, parseInt(s.pollInterval, 10) || 30)),
        enableNotifications: s.enableNotifications !== false,
        enableBadge: s.enableBadge !== false,
        theme: s.theme === 'dark' ? 'dark' : 'light',
        defaultFilter: {
          active: s.defaultFilter?.active !== false,
          silenced: s.defaultFilter?.silenced !== false,
          inhibited: s.defaultFilter?.inhibited !== false,
          unprocessed: s.defaultFilter?.unprocessed !== false,
        },
      };

      if (sanitized.activeInstanceId && !sanitized.instances.find((i) => i.id === sanitized.activeInstanceId)) {
        sanitized.activeInstanceId = sanitized.instances[0]?.id || null;
      }

      await chrome.storage.sync.set({ settings: sanitized });

      closeImportConfirm();
      await renderInstances();
      await loadSettings();
      showToast('Configuration imported successfully', 'success');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  }

  function closeImportConfirm() {
    dom.importConfirmOverlay.classList.remove('show');
    pendingImportData = null;
    dom.importFileInput.value = '';
  }

  function bindEvents() {
    dom.addInstanceBtn.addEventListener('click', () => openForm(null));
    dom.formCancelBtn.addEventListener('click', closeForm);
    dom.formSaveBtn.addEventListener('click', saveInstance);
    dom.formAuthType.addEventListener('change', updateAuthFields);

    dom.formOverlay.addEventListener('click', (e) => {
      if (e.target === dom.formOverlay) closeForm();
    });

    $$('.toggle-vis').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (target.type === 'password') {
          target.type = 'text';
          btn.textContent = 'Hide';
        } else {
          target.type = 'password';
          btn.textContent = 'Show';
        }
      });
    });

    dom.instanceList.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'edit') {
        const instances = await Storage.getInstances();
        const inst = instances.find((i) => i.id === id);
        if (inst) openForm(inst);
      } else if (action === 'delete') {
        await deleteInstance(id, btn.dataset.name);
      } else if (action === 'test') {
        await testConnection(id);
      } else if (action === 'activate') {
        await setActive(id);
      }
    });

    dom.saveSettingsBtn.addEventListener('click', saveSettings);

    dom.exportConfigBtn.addEventListener('click', exportConfig);
    dom.importConfigBtn.addEventListener('click', () => dom.importFileInput.click());
    dom.importFileInput.addEventListener('change', (e) => handleImportFile(e.target.files[0]));
    dom.importCancelBtn.addEventListener('click', closeImportConfirm);
    dom.importConfirmBtn.addEventListener('click', confirmImport);
    dom.importConfirmOverlay.addEventListener('click', (e) => {
      if (e.target === dom.importConfirmOverlay) closeImportConfirm();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (dom.importConfirmOverlay.classList.contains('show')) {
          closeImportConfirm();
        } else if (dom.formOverlay.classList.contains('show')) {
          closeForm();
        }
      }
    });
  }

  async function init() {
    await renderInstances();
    await loadSettings();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
