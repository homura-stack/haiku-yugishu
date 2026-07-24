/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        washi: '#f4ecdd',       // 和紙（背景）
        'washi-dark': '#e6d9bf', // 生成りの濃いめ（札）
        sumi: '#241f1c',        // 墨（文字）
        'sumi-soft': '#6b625a', // 淡い墨（副文字）
        shu: '#b7282e',         // 朱（アクセント）
      },
      fontFamily: {
        mincho: ['"Yu Mincho"', '"YuMincho"', '"Hiragino Mincho ProN"', '"Noto Serif JP"', 'serif'],
      },
    },
  },
  plugins: [],
};
