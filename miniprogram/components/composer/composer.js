Component({
  properties: {
    value: { type: String, value: '' },
    busy: { type: Boolean, value: false },
    cooldown: { type: Number, value: 0 },
    footer: { type: String, value: '' },
    ready: { type: Boolean, value: false },
  },
  data: { text: '', focus: false },
  observers: {
    value(v) {
      if (v !== this.data.text) this.setData({ text: v || '' });
    },
  },
  methods: {
    onInput(e) {
      const text = e.detail.value;
      this.setData({ text });
      this.triggerEvent('draft', { value: text });
    },
    onFocus() { this.setData({ focus: true }); },
    onBlur() { this.setData({ focus: false }); },
    onKb(e) { this.triggerEvent('keyboard', { height: (e.detail && e.detail.height) || 0 }); },
    onSend() {
      if (this.data.busy || this.data.cooldown > 0) return;
      const text = String(this.data.text || '').trim();
      // 没字也没目的地：交给页面提示。有目的地则允许空文本，由页面按规划参数拼诉求。
      if (!text && !this.data.ready) {
        this.triggerEvent('send', { text: '' });
        return;
      }
      this.setData({ text: '' });
      this.triggerEvent('draft', { value: '' });
      this.triggerEvent('send', { text });
    },
  },
});
