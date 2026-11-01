const PREFS = ['自然风光', '人文历史', '美食', '茶文化', '亲子', '小众', '夜景'];

Component({
  properties: {
    state: { type: Object, value: {} },
    disabled: { type: Boolean, value: false },
  },
  data: {
    open: '',
    dest: '',
    prefOn: {},
    prefs: PREFS,
  },
  observers: {
    disabled(v) { if (v && this.data.open) this.setData({ open: '' }); },
    state(s) {
      const prefOn = {};
      ((s && s.preferences) || []).forEach(p => { prefOn[p] = true; });
      const patch = { prefOn };
      if (this.data.open !== 'destination') patch.dest = (s && s.destination) || '';
      this.setData(patch);
    },
  },
  methods: {
    commitDest() {
      const next = String(this.data.dest || '').trim();
      const prev = String((this.data.state && this.data.state.destination) || '').trim();
      if (next !== prev) this.triggerEvent('patch', { destination: next });
    },
    onChip(e) {
      if (this.data.disabled) return;
      const key = e.currentTarget.dataset.key;
      if (this.data.open === 'destination') this.commitDest();
      const open = this.data.open === key ? '' : key;
      const patch = { open };
      if (open === 'destination') patch.dest = (this.data.state && this.data.state.destination) || '';
      this.setData(patch);
    },
    onDest(e) { this.setData({ dest: e.detail.value }); },
    onDestBlur() { this.commitDest(); },
    onDestConfirm() { this.commitDest(); this.setData({ open: '' }); },
    onPref(e) {
      const p = e.currentTarget.dataset.v;
      const cur = (this.data.state && this.data.state.preferences) || [];
      const has = cur.indexOf(p) >= 0;
      const preferences = has ? cur.filter(x => x !== p) : cur.concat([p]);
      this.triggerEvent('patch', { preferences });
    },
    onDone() {
      if (this.data.open === 'destination') this.commitDest();
      this.setData({ open: '' });
    },
  },
});
