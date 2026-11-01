import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  envDir: '..', // 读取仓库根目录 .env 中的 VITE_* 变量
  server: {
    // 默认 host=localhost 在本机只绑 [::1]，127.0.0.1 会连接被拒。true 走双栈，两者都能进，代理目标不变。
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/_AMapService': 'http://localhost:8787',
      // 页面导航仍由 Vite 回 index.html；fetch 不带 text/html，继续转到 API。
      '/admin': {
        target: 'http://localhost:8787',
        bypass(req) {
          if (req.headers.accept?.includes('text/html')) return '/index.html';
        },
      },
    },
  },
});
