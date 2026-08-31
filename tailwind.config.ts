import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Manager surface: dark, financial, serious
        manager: {
          bg: "#0b0e14",
          surface: "#131722",
          surface2: "#1a2030",
          border: "#232a3d",
          text: "#e7ecf5",
          muted: "#8b95ac",
          accent: "#16c784", // money green
          danger: "#f0576a",
          warn: "#f3a73c",
        },
        // Employee surface: darker, high-energy
        rewards: {
          bg: "#0c0a17",
          surface: "#171229",
          surface2: "#1f1836",
          border: "#2d2450",
          text: "#f3f0ff",
          muted: "#a79bd1",
          purple: "#8b5cf6",
          pink: "#ec4899",
          blue: "#3b82f6",
          green: "#22d3ee",
          gold: "#fbbf24",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
