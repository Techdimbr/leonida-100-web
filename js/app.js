/* ==========================================================================
   LEONIDA TACTICAL COMPANION — CORE WEB APP LOGIC (app.js)
   100% Weighted Progress • Profit/Hour Calc • 1s Fence Finder • JSON Backup
   ========================================================================== */

(function () {
  const PROGRESS_KEY = 'leonida_progress_v2';
  let state = {
    checked: {},
    activeTab: 'checklist',
    statusFilter: 'all',
    groupFilter: 'all',
    searchQuery: '',
    fenceQuery: '',
    calcChapter: 3,
    calcMinutes: 60,
    calcMode: 'direct',
    datasets: {},
    economy: null,
    deferredPrompt: null
  };

  function loadProgress() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.checked = parsed.checked || parsed;
        }
      }
    } catch (_) {
      state.checked = {};
    }
  }

  function saveProgress() {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        version: '2.0',
        updatedAt: new Date().toISOString(),
        checked: state.checked
      })
    );
  }

  async function fetchJsonWithFallback(filename) {
    const paths = ['./data/' + filename, '../data/' + filename];
    for (const url of paths) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch (_) {}
    }
    throw new Error('Could not load ' + filename);
  }

  async function loadAllData() {
    const [pt, en, eco] = await Promise.all([
      fetchJsonWithFallback('checklist_pt.json'),
      fetchJsonWithFallback('checklist_en.json'),
      fetchJsonWithFallback('economy_routes.json')
    ]);
    state.datasets['pt-BR'] = pt;
    state.datasets['en-US'] = en;
    state.economy = eco;
  }

  function currentData() {
    return state.datasets[window.I18n.lang] || state.datasets['pt-BR'];
  }

  function formatMoney(val) {
    const isPt = window.I18n.lang === 'pt-BR';
    const rounded = Math.round(val);
    return (isPt ? 'US$ ' : '$') + rounded.toLocaleString(isPt ? 'pt-BR' : 'en-US');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ========================================================================
     1. WEIGHTED 100% PROGRESS BAR
     ======================================================================== */
  function renderProgress() {
    const data = currentData();
    if (!data) return;
    const items = data.checklist_100;
    let totalWeight = 0;
    let earnedWeight = 0;
    let doneCount = 0;

    items.forEach((item) => {
      totalWeight += item.weight;
      if (state.checked[item.id]) {
        earnedWeight += item.weight;
        doneCount += 1;
      }
    });

    const pct = totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    const pctEl = document.getElementById('progress-pct');
    const fillEl = document.getElementById('progress-fill');
    const countEl = document.getElementById('progress-count');

    if (pctEl) pctEl.textContent = pct + '%';
    if (fillEl) fillEl.style.width = pct + '%';
    if (countEl) countEl.textContent = `${doneCount} / ${items.length}`;
  }

  /* ========================================================================
     2. CHECKLIST 100% TAB
     ======================================================================== */
  function renderGroupFilters() {
    const data = currentData();
    const wrap = document.getElementById('group-pills');
    if (!data || !wrap) return;

    const groups = [{ id: 'all', label: window.I18n.t('filter_all') }];
    const seen = new Set();
    data.checklist_100.forEach((it) => {
      if (!seen.has(it.group)) {
        seen.add(it.group);
        groups.push({ id: it.group, label: it.group_label });
      }
    });

    wrap.innerHTML = groups
      .map(
        (g) =>
          `<button type="button" class="pill-btn ${state.groupFilter === g.id ? 'active' : ''}" data-group="${escapeHtml(g.id)}">${escapeHtml(g.label)}</button>`
      )
      .join('');

    wrap.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.groupFilter = btn.getAttribute('data-group');
        renderGroupFilters();
        renderChecklist();
      });
    });
  }

  function renderChecklist() {
    const data = currentData();
    const listEl = document.getElementById('checklist-container');
    if (!data || !listEl) return;

    const q = state.searchQuery.trim().toLowerCase();
    const filtered = data.checklist_100.filter((item) => {
      const isDone = !!state.checked[item.id];
      if (state.statusFilter === 'pending' && isDone) return false;
      if (state.statusFilter === 'done' && !isDone) return false;
      if (state.groupFilter !== 'all' && item.group !== state.groupFilter) return false;
      if (q) {
        const hay = `${item.title} ${item.target} ${item.tip} ${item.group_label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      listEl.innerHTML = `<div class="card"><p>${window.I18n.lang === 'pt-BR' ? 'Nenhum item encontrado com esse filtro.' : 'No checklist items match this filter.'}</p></div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((item) => {
        const isDone = !!state.checked[item.id];
        return `
          <div class="check-row ${isDone ? 'done' : ''}" data-item-id="${escapeHtml(item.id)}" role="checkbox" aria-checked="${isDone}" tabindex="0">
            <div class="check-box">${isDone ? '✓' : ''}</div>
            <div style="flex:1;">
              <div class="check-meta">
                <span class="tag tag-weight mono">${item.weight}%</span>
                <span class="tag tag-target">${escapeHtml(item.target)}</span>
                <span class="tag tag-target">${escapeHtml(item.group_label)}</span>
              </div>
              <div class="check-title">${escapeHtml(item.title)}</div>
              <div class="check-tip">${escapeHtml(item.tip)}</div>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.check-row').forEach((row) => {
      const toggle = () => {
        const id = row.getAttribute('data-item-id');
        state.checked[id] = !state.checked[id];
        saveProgress();
        renderProgress();
        renderChecklist();
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  /* ========================================================================
     3. PROFIT / HOUR CALCULATOR TAB
     ======================================================================== */
  function renderCalculator() {
    if (!state.economy) return;
    const isPt = window.I18n.lang === 'pt-BR';
    const mult = state.economy.meta.delegation_multiplier;
    const listEl = document.getElementById('calc-routes');
    if (!listEl) return;

    const available = state.economy.routes
      .filter((r) => r.chapter_min <= state.calcChapter)
      .map((r) => {
        const avgDirect = (r.payout_min + r.payout_max) / 2;
        const appliedMult = state.calcMode === 'delegate' && r.delegable ? mult : 1;
        const avgNet = avgDirect * appliedMult;
        const perHour = (avgNet / r.avg_minutes) * 60;
        const sessionRuns = Math.max(1, state.calcMinutes / r.avg_minutes);
        const sessionNet = avgNet * sessionRuns;
        const sessionDirect = avgDirect * sessionRuns;
        const sessionLoss = Math.max(0, sessionDirect - sessionNet);
        return { ...r, avgNet, perHour, sessionNet, sessionLoss };
      })
      .sort((a, b) => b.perHour - a.perHour);

    const best = available[0];
    const bestEl = document.getElementById('calc-best-name');
    const estEl = document.getElementById('calc-est-val');
    const lossEl = document.getElementById('calc-loss-val');
    const noteEl = document.getElementById('calc-delegation-note');

    if (best) {
      if (bestEl) bestEl.textContent = isPt ? best.name_pt : best.name_en;
      if (estEl) estEl.textContent = formatMoney(best.sessionNet);
      if (lossEl) {
        lossEl.textContent = best.sessionLoss > 0 ? '-' + formatMoney(best.sessionLoss) : formatMoney(0);
        lossEl.style.color = best.sessionLoss > 0 ? '#FB7185' : 'var(--emerald)';
      }
    }
    if (noteEl) {
      noteEl.textContent = isPt ? state.economy.meta.delegation_note_pt : state.economy.meta.delegation_note_en;
    }

    listEl.innerHTML = available
      .map((r, idx) => {
        const riskClass = r.risk === 'high' ? 'tag-danger' : r.risk === 'medium' ? 'tag-warn' : 'tag-ok';
        const riskTxt = window.I18n.t('risk_' + r.risk);
        const title = isPt ? r.name_pt : r.name_en;
        const req = isPt ? r.req_pt : r.req_en;
        const veh = isPt ? r.vehicle_pt : r.vehicle_en;
        const tip = isPt ? r.tip_pt : r.tip_en;
        const lossTag =
          r.sessionLoss > 0
            ? `<span class="tag tag-danger">-${Math.round((1 - mult) * 100)}% ${isPt ? 'DELEGADO' : 'DELEGATED'}</span>`
            : '';

        return `
          <article class="route-card">
            <div class="route-top">
              <div>
                <div class="check-meta">
                  <span class="tag tag-weight mono">#${idx + 1}</span>
                  <span class="tag tag-target mono">${isPt ? 'Cap.' : 'Ch.'} ${r.chapter_min}+</span>
                  <span class="tag ${riskClass}">${escapeHtml(riskTxt)}</span>
                  ${lossTag}
                </div>
                <h3 style="font-size:1.02rem; margin-top:4px;">${escapeHtml(title)}</h3>
              </div>
              <div class="route-rate mono">
                ${formatMoney(r.perHour)}<span style="display:block;font-size:0.72rem;color:var(--text-muted);font-weight:600;">/ ${isPt ? 'hora' : 'hour'}</span>
              </div>
            </div>
            <div style="font-size:0.84rem; color:var(--text-secondary);">
              <strong>${isPt ? 'Sessão' : 'Session'} (${state.calcMinutes} min):</strong>
              <span class="mono" style="color:var(--emerald);font-weight:800;">${formatMoney(r.sessionNet)}</span>
              &nbsp;•&nbsp;
              <strong>${isPt ? 'Média por golpe' : 'Avg / run'}:</strong>
              <span class="mono">${formatMoney(r.avgNet)}</span> (${r.avg_minutes} min)
            </div>
            <div style="font-size:0.82rem; color:var(--text-muted);">
              <strong>${isPt ? 'Requisito' : 'Requires'}:</strong> ${escapeHtml(req)} &nbsp;|&nbsp;
              <strong>${isPt ? 'Veículo' : 'Vehicle'}:</strong> ${escapeHtml(veh)}
            </div>
            <div class="check-tip" style="margin-top:2px;">${escapeHtml(tip)}</div>
          </article>
        `;
      })
      .join('');
  }

  /* ========================================================================
     4. FENCE FINDER (1 SECOND) & FAMILY SAVINGS TAB
     ======================================================================== */
  function renderFences() {
    const data = currentData();
    const listEl = document.getElementById('fences-container');
    const tiersEl = document.getElementById('savings-tiers-body');
    if (!data || !listEl) return;

    const isPt = window.I18n.lang === 'pt-BR';
    const q = state.fenceQuery.trim().toLowerCase();
    const rows = data.fences.filter((f) => {
      if (!q) return true;
      return `${f.item} ${f.buyer} ${f.location} ${f.tip}`.toLowerCase().includes(q);
    });

    listEl.innerHTML = rows
      .map(
        (f) => `
        <article class="card" style="padding:16px;">
          <div class="check-meta">
            <span class="tag tag-ok">${escapeHtml(f.buyer)}</span>
            <span class="tag tag-weight mono">${escapeHtml(f.price_range)}</span>
          </div>
          <h3 style="font-size:1rem; margin:6px 0 4px;">${escapeHtml(f.item)}</h3>
          <p style="font-size:0.84rem; margin-bottom:6px;">
            <strong>${isPt ? 'Local' : 'Location'}:</strong> ${escapeHtml(f.location)}<br/>
            <strong>${isPt ? 'Delegação' : 'Delegation'}:</strong> <span style="color:#FB7185;">${escapeHtml(f.delegation_loss)}</span>
          </p>
          <p style="font-size:0.84rem; color:var(--text-muted);">${escapeHtml(f.tip)}</p>
        </article>
      `
      )
      .join('');

    if (tiersEl) {
      tiersEl.innerHTML = data.family_savings_tiers
        .map(
          (t) => `
          <tr>
            <td><strong>${escapeHtml(t.tier)}</strong></td>
            <td class="mono">${formatMoney(t.savings_goal)}</td>
            <td class="mono">${formatMoney(t.checking_cap)}</td>
            <td>${escapeHtml(t.benefit)}</td>
          </tr>
        `
        )
        .join('');
    }
  }

  /* ========================================================================
     5. MISSABLES, STRANGERS & FREAKS, SECRETS TAB
     ======================================================================== */
  function renderAlertsAndSecrets() {
    const data = currentData();
    if (!data) return;
    const isPt = window.I18n.lang === 'pt-BR';

    const missEl = document.getElementById('missables-container');
    const sfEl = document.getElementById('sf-container');
    const secEl = document.getElementById('secrets-container');

    if (missEl) {
      missEl.innerHTML = data.missables_alerts
        .map(
          (m) => `
          <article class="alert-card ${m.severity === 'critical' ? 'critical' : ''}">
            <div class="check-meta">
              <span class="tag ${m.severity === 'critical' ? 'tag-danger' : 'tag-warn'}">${isPt ? 'CAP.' : 'CH.'} ${m.chapter}</span>
              <strong style="font-size:0.95rem;">${escapeHtml(m.title)}</strong>
            </div>
            <p style="font-size:0.86rem; color:var(--text-secondary); margin-top:4px;">${escapeHtml(m.detail)}</p>
          </article>
        `
        )
        .join('');
    }

    if (sfEl) {
      sfEl.innerHTML = data.strangers_freaks
        .map(
          (s, idx) => `
          <article class="card" style="padding:14px 16px;">
            <div class="check-meta">
              <span class="tag tag-weight mono">#0${idx + 1}</span>
              <strong style="font-size:0.95rem;">${escapeHtml(s.name)}</strong>
            </div>
            <p style="font-size:0.84rem; margin-top:4px;"><strong>${isPt ? 'Gatilho' : 'Trigger'}:</strong> ${escapeHtml(s.trigger)}</p>
            <p style="font-size:0.84rem; color:var(--emerald); margin-top:2px;">${escapeHtml(s.reward)}</p>
          </article>
        `
        )
        .join('');
    }

    if (secEl) {
      secEl.innerHTML = data.secrets_highlights
        .map(
          (sec) => `
          <article class="card" style="padding:14px 16px;">
            <strong style="font-size:0.95rem; color:var(--cyan);">${escapeHtml(sec.name)}</strong>
            <p style="font-size:0.84rem; margin-top:4px;"><strong>${isPt ? 'Local' : 'Location'}:</strong> ${escapeHtml(sec.location)}</p>
            <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:2px;">${escapeHtml(sec.reward)}</p>
          </article>
        `
        )
        .join('');
    }
  }

  /* ========================================================================
     6. JSON EXPORT / IMPORT / RESET
     ======================================================================== */
  function wireBackupControls() {
    const expBtn = document.getElementById('btn-export-json');
    const impBtn = document.getElementById('btn-import-json');
    const impInput = document.getElementById('import-file-input');
    const resetBtn = document.getElementById('btn-reset-progress');

    if (expBtn) {
      expBtn.addEventListener('click', () => {
        const blob = new Blob(
          [JSON.stringify({ version: '2.0', exportedAt: new Date().toISOString(), checked: state.checked }, null, 2)],
          { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leonida-100-backup.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }

    if (impBtn && impInput) {
      impBtn.addEventListener('click', () => impInput.click());
      impInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          state.checked = parsed.checked || parsed;
          saveProgress();
          renderProgress();
          renderChecklist();
          alert(window.I18n.lang === 'pt-BR' ? 'Backup importado com sucesso!' : 'Backup imported successfully!');
        } catch (_) {
          alert(window.I18n.lang === 'pt-BR' ? 'Arquivo JSON inválido.' : 'Invalid JSON backup file.');
        }
        impInput.value = '';
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const msg =
          window.I18n.lang === 'pt-BR'
            ? 'Tem certeza que deseja zerar todo o seu progresso salvo?'
            : 'Are you sure you want to reset all saved checklist progress?';
        if (confirm(msg)) {
          state.checked = {};
          saveProgress();
          renderProgress();
          renderChecklist();
        }
      });
    }
  }

  function wireUI() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        state.activeTab = target;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + target));
      });
    });

    // Status filter
    const statusSel = document.getElementById('status-filter');
    if (statusSel) {
      statusSel.addEventListener('change', (e) => {
        state.statusFilter = e.target.value;
        renderChecklist();
      });
    }

    // Search checklist
    const searchIn = document.getElementById('checklist-search');
    if (searchIn) {
      searchIn.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderChecklist();
      });
    }

    // Search fences
    const fenceIn = document.getElementById('fence-search');
    if (fenceIn) {
      fenceIn.addEventListener('input', (e) => {
        state.fenceQuery = e.target.value;
        renderFences();
      });
    }

    // Calculator inputs
    const chSel = document.getElementById('calc-chapter');
    const timeSel = document.getElementById('calc-minutes');
    const modeSel = document.getElementById('calc-mode');
    if (chSel) chSel.addEventListener('change', (e) => { state.calcChapter = Number(e.target.value); renderCalculator(); });
    if (timeSel) timeSel.addEventListener('change', (e) => { state.calcMinutes = Number(e.target.value); renderCalculator(); });
    if (modeSel) modeSel.addEventListener('change', (e) => { state.calcMode = e.target.value; renderCalculator(); });

    // PWA install button
    const installBtn = document.getElementById('btn-pwa-install');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      if (installBtn) installBtn.style.display = 'inline-flex';
    });
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!state.deferredPrompt) return;
        state.deferredPrompt.prompt();
        await state.deferredPrompt.userChoice;
        state.deferredPrompt = null;
        installBtn.style.display = 'none';
      });
    }

    wireBackupControls();
  }

  function renderAll() {
    renderProgress();
    renderGroupFilters();
    renderChecklist();
    renderCalculator();
    renderFences();
    renderAlertsAndSecrets();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    window.I18n.init();
    loadProgress();
    wireUI();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    try {
      await loadAllData();
      renderAll();
    } catch (err) {
      const box = document.getElementById('checklist-container');
      if (box) box.innerHTML = `<div class="alert-card critical"><strong>Error loading data:</strong> ${escapeHtml(err.message)}</div>`;
    }

    window.addEventListener('leonida:langchange', () => {
      renderAll();
    });
  });
})();
