Component({
  options: {
    virtualHost: true,
    styleIsolation: 'apply-shared',
  },
  properties: {
    height: { type: Number, value: 64 },
    peek: { type: Number, value: 64 },
    half: { type: Number, value: 320 },
    full: { type: Number, value: 640 },
    open: { type: Boolean, value: false },
    title: { type: String, value: '' },
  },
  methods: {
    onSnap(payload) {
      this.triggerEvent('snap', payload || {});
    },
    onToggle() {
      this.triggerEvent('toggle');
    },
  },
});
