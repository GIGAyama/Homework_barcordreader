import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AppErrorBoundary from './AppErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

// 📲 PWA: Service Worker の登録は src/PwaPrompts.jsx の <UpdateBanner /> が行う。
//    登録と「あたらしい ばんが あります」の案内を別々の場所に置くと、
//    更新が入ったのに誰にも気づかれない状態になりやすいので、一体にしてある。
