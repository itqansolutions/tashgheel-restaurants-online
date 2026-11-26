// Per-page Tailwind settings, copied from the inline tailwind.config that each page used with the CDN script.
const forms = require('@tailwindcss/forms');
const typography = require('@tailwindcss/typography');
const cq = require('@tailwindcss/container-queries');
const ar = require('@tailwindcss/aspect-ratio');
const custom = {
  index: { darkMode: 'class', extend: { colors: { primary: '#10b981', navy: '#0f172a', 'field-blue': '#eef2ff' }, fontFamily: { sans: ['Plus Jakarta Sans', 'sans-serif'] } }, plugins: [forms, typography, cq] },
  pos: { darkMode: 'class', extend: { colors: { primary: '#1e293b', accent: '#f59e0b', success: '#22c55e', danger: '#ef4444', 'background-light': '#f1f5f9', 'background-dark': '#0f172a' }, fontFamily: { sans: ['Inter', 'sans-serif'] }, borderRadius: { DEFAULT: '12px' } }, plugins: [forms, typography, cq] },
  tables: { darkMode: 'class', extend: { colors: { primary: '#1e293b', accent: '#f59e0b' }, fontFamily: { sans: ['Inter', 'sans-serif'] } }, plugins: [forms, typography] },
  reports: { extend: {}, plugins: [forms, typography, ar] },
};
const pages = ['admin','backup','customers','dine-in','expenses','index','inventory','kitchen','online_ordering','pos','products','receipts','reports','salesmen','super-admin','table-order','tables','vendors'];
module.exports = { pages, custom };
