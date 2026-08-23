import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 法務ページ（プライバシーポリシー・利用規約）は index.html とは別の HTML なので、
// 入口として明示しないと Vite の出力（dist/）に入らない。
// 入れ忘れると配信先で 404 になる。実際に giga-school.com で起きた。
// public/ に置いて素通しにする手もあるが、それだと Vite が中身を検査しないため、
// 壊れたリンクや読み込めない参照に気づけないまま配ることになる。
const htmlEntry = (name) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: htmlEntry('index'),
        privacy: htmlEntry('privacy'),
        terms: htmlEntry('terms'),
      },
    },
  },
});
