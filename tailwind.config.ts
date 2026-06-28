// @author: claude | phase: 0 | contract: design-tokens
// ================================================================
// 37工具箱 Tailwind 配置 — 设计 Token
// 颜色使用 CSS 变量以实现 light/dark 主题无缝切换。
// 所有组件禁止硬编码色值，必须通过 Tailwind class 引用。
// ================================================================

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],

  // 暗色主题为默认，亮色主题通过 .light class 切换 CSS 变量
  darkMode: 'class',

  theme: {
    extend: {
      // ---- 颜色 ----
      // 全部指向 CSS 变量，组件引用如: bg-bg-primary, text-text-secondary,
      // border-border, bg-accent, text-status-error 等
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          sidebar: 'var(--bg-sidebar)',
          chrome: 'var(--bg-chrome)',
          hover: 'var(--bg-hover)',
          active: 'var(--bg-active)',
        },
        border: {
          DEFAULT: 'var(--border)',
          light: 'var(--border-light)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          subtle: 'var(--accent-subtle)',
          cyan: 'var(--accent-cyan)',
          'cyan-subtle': 'var(--accent-cyan-subtle)',
          ivory: 'var(--accent-ivory)',
        },
        status: {
          success: 'var(--success)',
          error: 'var(--error)',
          warning: 'var(--warning)',
          info: 'var(--info)',
        },
      },

      // ---- 字体 ----
      fontFamily: {
        ui: ["'Inter'", '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ["'JetBrains Mono'", "'Fira Code'", '"Cascadia Code"', 'monospace'],
      },

      // ---- 字号（带行高）----
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.4' }],
        xs: ['13px', { lineHeight: '1.5' }],
        sm: ['14px', { lineHeight: '1.5' }],
        base: ['14px', { lineHeight: '1.5' }],
        lg: ['16px', { lineHeight: '1.4' }],
        xl: ['20px', { lineHeight: '1.3' }],
      },

      // ---- 圆角 ----
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },

      // ---- 阴影 ----
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },

      // ---- 动画 ----
      transitionDuration: {
        DEFAULT: '150ms',
      },

      // ---- 侧边栏宽度 ----
      // 用于 Tailwind 的 w-56 等工具类覆盖
      width: {
        sidebar: '224px',
      },
    },
  },

  plugins: [],
};

export default config;
