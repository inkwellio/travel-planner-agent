import { createRoot } from 'react-dom/client';
import App from './App';
import { AdminApp } from './admin/AdminApp';
import { SharePage } from './pages/SharePage';
import { PrintPage } from './pages/PrintPage';
// 标题字体：Noto Serif SC 分片子集（unicode-range 按需加载，font-display: swap）
import '@fontsource/noto-serif-sc/600.css';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/500.css';
import '@fontsource/noto-sans-sc/600.css';
import './theme.css';
import './styles.css';

// 主题：默认 D「宣纸青瓷」（index.html data-theme="d"）；E/F 保留在 theme.css 未对外暴露

// 轻量路由：/admin 管理后台（不进主站顶栏）；/s/:shareId 只读分享；/print/:tripId?v= 导出 PDF；其余为主应用
const path = location.pathname;
const admin = path === '/admin' || path.startsWith('/admin/');
const share = path.match(/^\/s\/([A-Za-z0-9_-]{10,64})$/);
const print = path.match(/^\/print\/([0-9a-f-]{36})$/);
const qs = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(
  admin ? <AdminApp />
    : share ? <SharePage sid={share[1]} />
    : print ? <PrintPage tripId={print[1]} version={qs.get('v') ? Number(qs.get('v')) : undefined} auto={qs.get('auto') !== '0'} />
    : <App />,
);
