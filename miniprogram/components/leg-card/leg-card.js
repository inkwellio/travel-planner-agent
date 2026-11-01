Component({
  properties: { leg: { type: Object, value: {} } },
  data: { mode: 'bus', transit: null, message: '' },
  observers: {
    leg(leg) { leg = leg || {}; this.showMode(leg.preferredMode || (leg.subway ? 'subway' : 'bus'), leg); },
  },
  methods: {
    showMode(mode, input) {
      const leg = input || this.data.leg || {};
      const transit = mode === 'subway' ? leg.subway : mode === 'bus' ? leg.bus : null;
      const message = mode === 'driving'
        ? (leg.driving ? '' : '未查询到可用自驾方案。')
        : (transit ? '' : (leg.missing && leg.missing[mode]) || '未查询到可用公共交通方案。');
      this.setData({ mode, transit: transit || null, message });
    },
    onMode(e) { this.showMode(e.currentTarget.dataset.mode); },
    onRef(e) {
      const url = e.currentTarget.dataset.url;
      if (url) this.triggerEvent('ref', { url });
    },
  },
});
