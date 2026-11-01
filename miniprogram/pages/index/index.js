const api = require('../../services/api');
const config = require('../../config');
const { NEED_DESTINATION, hasDestination, messageFromParams } = require('../../utils/ask');
const { derive, activeDraft, selectionFrom } = require('../../utils/present');
const { exportPages } = require('../../utils/export-image');

function strip(view) {
  const trip = Object.assign({}, view);
  delete trip.catalog;
  return trip;
}

function metrics() {
  const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  let menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
  const statusPx = win.statusBarHeight || 20;
  if (!menu || !menu.width) {
    menu = { top: statusPx + 6, height: 32, left: (win.windowWidth || 375) - 96, width: 88 };
  }
  const navPx = Math.max(44, (menu.top - statusPx) * 2 + menu.height);
  const headerPx = statusPx + navPx;
  const safeBottom = win.safeArea ? Math.max(0, (win.screenHeight || win.windowHeight) - win.safeArea.bottom) : 0;
  const windowPx = win.windowHeight || win.screenHeight || 700;
  const peekPx = 64 + safeBottom;
  const fullPx = Math.max(peekPx + 120, windowPx - headerPx);
  const halfPx = Math.round(windowPx * 0.5);
  const capsulePx = Math.max(12, (win.windowWidth || 375) - menu.left + 8);
  return { statusPx, headerPx, peekPx, halfPx, fullPx, capsulePx, safeBottom };
}

Page({
  data: {
    loading: true,
    loadError: '',
    offline: false,
    modeText: '',
    nav: 'plan',
    drawer: false,
    headerPx: 88,
    statusPx: 44,
    capsulePx: 96,
    peekPx: 64,
    halfPx: 360,
    fullPx: 640,
    sheetPx: 64,
    sheetOpen: false,
    composerOn: true,
    composerValue: '',
    keyboardPx: 0,
    stageBottomPx: 64,
    scrollInto: '',
    messages: [],
    busy: false,
    streaming: false,
    cooldown: 0,
    selectedCount: 0,
    sample: true,
    footer: '',
    draft: null,
    sheetTitle: '规划结果',
    exportHeight: 400,
    tripRows: [],
    activeId: '',
    deletingId: '',
    linkToast: '',
    linkTitle: '',
    hasTrip: false,
    state: { destination: '', days: 2, preferences: [], prefsLabel: '偏好', pace: '轻松', companions: '独自' },
  },

  onLoad() {
    this.trip = null;
    this.catalog = {};
    this.trips = [];
    this.selected = {};
    this.notices = [];
    this.dayIdx = 0;
    this.draftText = '';
    this.busy = false;
    this.streaming = false;
    this.cooldown = 0;
    this.sample = true;
    this.offline = false;
    this.loadError = '';
    this.loading = true;
    this.modeText = '';
    this.deletingId = '';
    this._msgN = 0;
    const box = metrics();
    this.peekPx = box.peekPx;
    this.fullPx = box.fullPx;
    this.setData(Object.assign({ stageBottomPx: box.peekPx, sheetPx: box.peekPx }, box));
    this.boot();
  },

  onUnload() { this.clearCooldown(); },

  sync() {
    const view = derive({
      trip: this.trip,
      catalog: this.catalog,
      selected: this.selected,
      notices: this.notices,
      dayIdx: this.dayIdx,
      trips: this.trips,
      streaming: !!this.streaming,
      busy: !!this.busy,
      cooldown: this.cooldown || 0,
      sample: this.sample !== false,
      offline: !!this.offline,
      loadError: this.loadError || '',
      loading: !!this.loading,
      modeText: this.modeText || '',
      deletingId: this.deletingId || '',
    });
    const prev = this._msgN || 0;
    this._msgN = view.messages.length;
    if (view.messages.length !== prev) {
      this.setData(Object.assign({ scrollInto: '' }, view), () => {
        this.setData({ scrollInto: 'bottom-anchor' });
      });
    } else this.setData(view);
  },

  setTrip(trip) {
    const prev = this.trip;
    this.trip = trip;
    const prevLen = prev && prev.messages ? prev.messages.length : -1;
    const nextLen = trip && trip.messages ? trip.messages.length : 0;
    if (!prev || prev.id !== trip.id || prevLen !== nextLen) this.selected = selectionFrom(trip);
    if (!prev || prev.activeVersion !== trip.activeVersion) this.dayIdx = 0;
    this.sync();
  },

  takeView(view) {
    this.catalog = Object.assign({}, this.catalog || {}, view.catalog || {});
    this.setTrip(strip(view));
  },

  async boot() {
    this.loading = true;
    this.loadError = '';
    this.sync();
    try {
      const health = await api.health();
      this.offline = false;
      this.sample = !!health.sample;
      this.modeText = 'LLM:' + health.llm + ' · 地图:' + health.map + ' · 搜索:' + health.search;
    } catch (e) {
      this.offline = true;
      this.modeText = '后端未连接';
    }
    try {
      const list = await api.trips();
      this.trips = list || [];
      const view = this.trips.length ? await api.getTrip(this.trips[0].id) : await api.createTrip();
      if (!this.trips.length) this.trips = [strip(view)];
      this.catalog = view.catalog || {};
      this.loading = false;
      this.offline = false;
      if (this.modeText === '后端未连接') this.modeText = '已连接';
      this.setTrip(strip(view));
    } catch (e) {
      this.loading = false;
      this.offline = true;
      this.loadError = '连不上行程服务。请确认本机已 npm run dev，且 miniprogram/config.js 的 baseUrl 可访问。';
      this.sync();
    }
  },

  notify(text) {
    this.notices = (this.notices || []).concat([{ id: 'n' + Date.now() + Math.floor(Math.random() * 1000), role: 'assistant', text }]);
    this.sync();
  },

  clearCooldown() {
    if (this._cd) { clearInterval(this._cd); this._cd = null; }
  },

  startCooldown(sec) {
    this.clearCooldown();
    this.cooldown = sec;
    this.sync();
    this._cd = setInterval(() => {
      this.cooldown -= 1;
      if (this.cooldown <= 0) { this.cooldown = 0; this.clearCooldown(); }
      this.sync();
    }, 1000);
  },

  handleLimit(err) {
    if (!err || err.status !== 429) return false;
    if (err.code === 'daily') this.notify('今天的规划次数已用完，明天再来');
    else {
      this.notify('规划得有点快，稍等几秒再试');
      this.startCooldown(err.retryAfter || 10);
    }
    return true;
  },

  refreshList() {
    return api.trips().then(rows => { this.trips = rows || []; this.sync(); }).catch(() => {});
  },

  onHeaderTap() {
    if (this.data.drawer) this.closeDrawer();
  },

  onMenu() {
    if (this.data.drawer) this.closeDrawer();
    else this.openDrawer();
  },

  onNav(e) {
    if (e.currentTarget.dataset.nav === 'trips') this.openDrawer();
    else this.closeDrawer();
  },

  openDrawer() {
    this.setData({
      drawer: true,
      nav: 'trips',
      composerOn: false,
      composerValue: this.draftText || '',
    });
  },

  closeDrawer() {
    this.setData({
      drawer: false,
      nav: 'plan',
      composerOn: !this.data.sheetOpen,
      composerValue: this.draftText || '',
    });
  },

  onDraft(e) { this.draftText = e.detail.value || ''; },

  onKeyboard(e) {
    const h = Number(e.detail.height) || 0;
    this.setData({ keyboardPx: h, stageBottomPx: h > 0 ? h : this.peekPx });
  },

  async onSend(e) {
    let text = String((e.detail && e.detail.text) || '').trim();
    if (!this.trip || this.busy || this.streaming || this.cooldown > 0) return;
    if (this._save) { try { await this._save; } catch { return; } }
    if (!text) {
      if (!hasDestination(this.trip.state)) { this.notify(NEED_DESTINATION); return; }
      text = messageFromParams(this.trip.state);
    }
    this.notices = [];
    const prev = this.trip;
    this.draftText = '';
    this.busy = true;
    this.setTrip(Object.assign({}, prev, {
      messages: (prev.messages || []).concat([{ id: 'tmp', role: 'user', text }]),
    }));
    try {
      const view = await api.chat(prev.id, text);
      this.takeView(view);
      this.refreshList();
    } catch (err) {
      this.trip = prev;
      this.busy = false;
      if (err && err.status === 0) this.offline = true;
      if (!this.handleLimit(err)) this.notify('出了点问题，请稍后再试');
      else this.sync();
    } finally {
      this.busy = false;
      this.sync();
    }
  },

  onToggle(e) {
    const id = e.detail && e.detail.id;
    if (!id || this.streaming) return;
    const next = Object.assign({}, this.selected);
    if (next[id]) delete next[id];
    else next[id] = true;
    this.selected = next;
    this.sync();
  },

  onQuick(e) { this.onSend({ detail: { text: e.currentTarget.dataset.text } }); },

  openSheet() {
    this.setData({
      sheetPx: this.fullPx,
      sheetOpen: true,
      composerOn: false,
      composerValue: this.draftText || '',
      keyboardPx: 0,
      stageBottomPx: this.peekPx,
    });
  },

  onToggleSheet() {
    const open = !this.data.sheetOpen;
    this.setData({
      sheetPx: open ? this.fullPx : this.peekPx,
      sheetOpen: open,
      composerOn: !open && !this.data.drawer,
      composerValue: this.draftText || '',
    });
  },

  onSheetSnap(payload) {
    const detail = payload && payload.detail && payload.detail.height != null ? payload.detail : payload;
    const src = detail && detail.height != null ? detail : {};
    const h = Math.round(Number(src.height) || this.peekPx);
    const open = h > this.peekPx + 8;
    this.setData({
      sheetPx: h,
      sheetOpen: open,
      composerOn: !open && !this.data.drawer,
      composerValue: this.draftText || '',
    });
  },

  async onGenerate() {
    if (!this.trip || this.streaming || this.busy || this.cooldown > 0) return;
    const ids = Object.keys(this.selected).filter(id => this.selected[id]);
    if (!ids.length) return;
    const tripId = this.trip.id;
    const prevVersion = this.trip.activeVersion;
    this.streaming = true;
    this.sync();
    this.openSheet();
    const onEvent = (event) => {
      const trip = this.trip;
      if (!trip || trip.id !== tripId || !event) return;
      if (event.type === 'assign') {
        const versions = (trip.versions || []).filter(v => v.version !== event.version).concat([{
          version: event.version,
          createdAt: new Date().toISOString(),
          note: '生成中',
          days: event.days,
          complete: false,
        }]);
        this.setTrip(Object.assign({}, trip, { activeVersion: event.version, versions }));
      } else if (event.type === 'day') {
        const versions = (trip.versions || []).map(v => v.version === event.version
          ? Object.assign({}, v, { days: (v.days || []).map(d => d.day === event.day.day ? event.day : d) })
          : v);
        this.setTrip(Object.assign({}, trip, { versions }));
      } else if (event.type === 'done' && event.trip.id === tripId) this.takeView(event.trip);
      else if (event.type === 'error') {
        this.notify(event.code === 'daily' ? '今天的规划次数已用完，明天再来' : (event.message || '生成失败，请稍后再试'));
        api.getTrip(tripId).then(view => { if (this.trip && this.trip.id === tripId) this.takeView(view); }).catch(() => {});
      }
    };
    try {
      const result = await api.plan(tripId, ids, onEvent);
      if (!result.events) onEvent({ type: 'done', version: null, trip: await api.getTrip(tripId) });
    } catch (err) {
      if (err && err.status === 0) this.offline = true;
      if (!this.handleLimit(err)) {
        try {
          const view = await api.getTrip(tripId);
          if (!this.trip || this.trip.id !== tripId) return;
          const done = (view.versions || []).some(v => v.complete && v.version !== prevVersion);
          if (done) onEvent({ type: 'done', trip: view });
          else this.notify('生成失败，请稍后再试');
        } catch (e) {
          this.notify('生成失败，请稍后再试');
        }
      }
    } finally {
      this.streaming = false;
      this.sync();
    }
  },

  onPatch(e) {
    if (!this.trip || this.streaming) return Promise.resolve();
    const patch = e.detail || {};
    const id = this.trip.id;
    const prev = this.trip;
    const state = Object.assign({}, prev.state, patch);
    if (patch.preferences) delete state.categoryPreference;
    if (typeof state.destination === 'string') state.destination = state.destination.trim();
    this.trip = Object.assign({}, prev, { state });
    this.sync();
    const run = (this._save || Promise.resolve()).catch(() => {}).then(async () => {
      if (!this.trip || this.trip.id !== id) return;
      try {
        this.takeView(await api.patchState(id, patch));
        this.refreshList();
      } catch (err) {
        if (this.trip && this.trip.id === id && this.trip.state === state) this.trip = prev;
        if (err && err.status === 0) this.offline = true;
        this.notify('规划参数没有保存，请再选一次');
        this.sync();
        throw err;
      }
    });
    this._save = run.then(() => {}, () => {});
    return run;
  },

  onDay(e) { this.dayIdx = Number(e.currentTarget.dataset.index) || 0; this.sync(); },

  onVersion(e) {
    const draft = this.data.draft;
    if (!draft || this.streaming) return;
    const version = (this.trip.versions || []).slice().sort((a, b) => a.version - b.version)[Number(e.detail.value)];
    if (version) this.activate(version.version);
  },

  async activate(version) {
    if (!this.trip || this.streaming) return;
    try { this.takeView(await api.activate(this.trip.id, version)); }
    catch (err) { this.notify('出了点问题，请稍后再试'); }
  },

  async editDay(day, attractionIds, note) {
    if (!this.trip || this.streaming) return;
    this.busy = true;
    this.sync();
    try { this.takeView(await api.edit(this.trip.id, day, attractionIds, note)); }
    catch (err) { if (!this.handleLimit(err)) this.notify('调整失败，请稍后再试'); }
    finally { this.busy = false; this.sync(); }
  },

  onMoveStop(e) {
    const draft = activeDraft(this.trip);
    if (!draft || !draft.complete) return;
    const day = draft.days[Math.min(this.dayIdx, draft.days.length - 1)];
    const ids = ((day && day.stops) || []).map(s => s.attractionId);
    const index = Number(e.detail.index);
    const dir = Number(e.detail.dir);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    const next = ids.slice();
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    this.editDay(day.day, next, '调整第 ' + day.day + ' 天顺序');
  },

  onRemoveStop(e) {
    const draft = activeDraft(this.trip);
    if (!draft || !draft.complete) return;
    const day = draft.days[Math.min(this.dayIdx, draft.days.length - 1)];
    const ids = ((day && day.stops) || []).map(s => s.attractionId);
    const index = Number(e.detail.index);
    if (ids.length <= 1 || !ids[index]) return;
    const name = ((this.catalog[ids[index]] || {}).name || '').split('·')[0];
    ids.splice(index, 1);
    this.editDay(day.day, ids, '删除' + name);
  },

  onRef(e) {
    const url = e.detail && e.detail.url;
    if (url) this.setData({ linkToast: url, linkTitle: '来源链接' });
  },

  async onShare() {
    const draft = activeDraft(this.trip);
    if (!this.trip || !draft || !draft.complete || this.streaming) return;
    try {
      const snap = await api.share(this.trip.id);
      const origin = String(config.webOrigin || '').replace(/\/$/, '');
      this.setData({ linkToast: origin + '/s/' + snap.id, linkTitle: '只读链接' });
    } catch (err) {
      this.notify((err && err.message) || '分享失败，请稍后再试');
    }
  },

  async onExport() {
    const draft = activeDraft(this.trip);
    if (!this.trip || !draft || !draft.complete || this.streaming || this.exporting) return;
    this.exporting = true;
    wx.showLoading({ title: '正在生成图片', mask: true });
    try {
      const pages = exportPages(this.trip, draft, this.catalog);
      if (!pages.length) throw new Error('没有可导出的路线');
      const files = [];
      for (const page of pages) {
        await new Promise(resolve => this.setData({ exportHeight: page.height }, resolve));
        const ctx = wx.createCanvasContext('routeExport', this);
        ctx.setFillStyle('#f7f6f2');
        ctx.fillRect(0, 0, 375, page.height);
        for (const line of page.lines) {
          ctx.setFillStyle(line.color);
          ctx.setFontSize(line.size);
          ctx.fillText(line.text, 24, line.y);
        }
        await new Promise(resolve => ctx.draw(false, resolve));
        const file = await new Promise((resolve, reject) => wx.canvasToTempFilePath({
          canvasId: 'routeExport', width: 375, height: page.height,
          destWidth: 750, destHeight: page.height * 2, fileType: 'png',
          success: resolve, fail: reject,
        }, this));
        files.push(file.tempFilePath);
      }
      wx.hideLoading();
      wx.previewImage({ current: files[0], urls: files });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '图片生成失败，请重试', icon: 'none' });
    } finally {
      this.exporting = false;
    }
  },

  onCloseLink() { this.setData({ linkToast: '', linkTitle: '' }); },

  async onSelectTrip(e) {
    const id = e.detail && e.detail.id;
    if (!id || !this.trip) return;
    if (this.streaming || this.busy) { this.notify('正在处理当前行程，请完成后再切换'); return; }
    this.notices = [];
    this.busy = true;
    this.sync();
    try {
      this.takeView(await api.getTrip(id));
      this.closeDrawer();
    } catch (err) {
      this.notify('出了点问题，请稍后再试');
    } finally {
      this.busy = false;
      this.sync();
    }
  },

  async onNewTrip() {
    if (this.streaming || this.busy) { this.notify('正在处理当前行程，请完成后再新建'); return; }
    this.busy = true;
    this.notices = [];
    this.sync();
    try {
      const view = await api.createTrip();
      this.catalog = view.catalog || {};
      this.setTrip(strip(view));
      this.refreshList();
      this.closeDrawer();
    } catch (err) {
      this.notify('出了点问题，请稍后再试');
    } finally {
      this.busy = false;
      this.sync();
    }
  },

  async onRemoveTrip(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    if (this.streaming || this.busy) { this.notify('正在处理当前行程，完成后再删除'); return; }
    this.deletingId = id;
    this.sync();
    try { await api.deleteTrip(id); }
    catch (err) {
      this.deletingId = '';
      this.notify('删除失败，请稍后再试');
      return;
    }
    const rest = (this.trips || []).filter(t => t.id !== id);
    this.deletingId = '';
    if (!this.trip || this.trip.id !== id) { this.trips = rest; this.sync(); return; }
    if (rest.length) {
      this.notices = [];
      this.trips = rest;
      try { this.takeView(await api.getTrip(rest[0].id)); }
      catch (err) { this.notify('出了点问题，请稍后再试'); }
      return;
    }
    try {
      const created = await api.createTrip();
      this.notices = [{ id: 'n' + Date.now(), role: 'assistant', text: '上一条行程已删除。下面是一条新的空白行程。' }];
      this.trips = [strip(created)];
      this.catalog = created.catalog || {};
      this.setTrip(strip(created));
    } catch (err) {
      this.notify('出了点问题，请稍后再试');
    }
  },

  onPrivacy() { wx.navigateTo({ url: '/pages/privacy/privacy' }); },

  noop() {},
});
