Component({
  properties: {
    card: { type: Object, value: {} },
  },
  data: { failed: false },
  observers: {
    'card.photo'() { this.setData({ failed: false }); },
  },
  methods: {
    onErr() { this.setData({ failed: true }); },
    onToggle() {
      const id = this.data.card && this.data.card.id;
      if (id) this.triggerEvent('toggle', { id });
    },
  },
});
