const { groupTrips } = require('../../utils/format');

Component({
  properties: {
    rows: { type: Array, value: [] },
    activeId: { type: String, value: '' },
    deletingId: { type: String, value: '' },
    modeText: { type: String, value: '' },
  },
  data: { query: '', groups: [], miss: false, empty: false, pending: '' },
  observers: {
    rows() { this.refresh(); },
  },
  lifetimes: {
    attached() { this.refresh(); },
  },
  methods: {
    refresh() {
      const view = groupTrips(this.data.rows || [], this.data.query);
      this.setData({ groups: view.groups, miss: view.miss, empty: view.empty });
    },
    onQuery(e) {
      this.setData({ query: e.detail.value });
      this.refresh();
    },
    onClose() { this.triggerEvent('close'); },
    noop() {},
    onCreate() { this.triggerEvent('create'); },
    onSelect(e) {
      const id = e.currentTarget.dataset.id;
      if (this.data.pending === id) return;
      this.triggerEvent('select', { id });
    },
    onAsk(e) { this.setData({ pending: e.currentTarget.dataset.id }); },
    onCancel() { this.setData({ pending: '' }); },
    onRemove(e) {
      const id = e.currentTarget.dataset.id;
      this.triggerEvent('remove', { id });
      this.setData({ pending: '' });
    },
    onPrivacy() { this.triggerEvent('privacy'); },
  },
});
