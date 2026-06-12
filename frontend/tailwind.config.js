/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:       '#020817',
        bgSec:    '#050B18',
        bgCard:   '#071426',
        bgSide:   '#06101F',
        bgHover:  '#0D1F38',
        cyan:     '#00E5FF',
        blue:     '#009DFF',
        green:    '#00FF9D',
        purple:   '#9D5CFF',
        orange:   '#FFB020',
        red:      '#FF3D71',
        textPri:  '#E6F1FF',
        textSec:  '#7B91B0',
        border:   '#1A2744',
        // Legacy
        background:'#020817',
        card:      '#071426',
        text:      '#E6F1FF',
        accent:    '#00E5FF',
        critical:  '#FF3D71',
        high:      '#FFB020',
        medium:    '#F59E0B',
        low:       '#00FF9D',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['Orbitron', 'sans-serif'],
        cyber:   ['Rajdhani', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
