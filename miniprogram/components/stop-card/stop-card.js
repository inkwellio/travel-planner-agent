Component({
  properties: { card: { type: Object, value: {} } },
  data: { failed: false },
  observers: {
    'card.photo'() { this.setData({ failed: false }); },
  },
  methods: {
    onErr() { this.setData({ failed: true }); },
    onMove(e) {
      const dir = Number(e.currentTarget.dataset.dir);
      this.triggerEvent('move', { index: this.data.card.index, dir });
    },
    onRemove() {
      this.triggerEvent('remove', { index: this.data.card.index });
    },
    onRef(e) {
      const url = e.currentTarget.dataset.url;
      if (url) this.triggerEvent('ref', { url });
    },
  },
});
