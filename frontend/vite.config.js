import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },

  test: {
    // Use jsdom so React components can render without a real browser
    environment: "jsdom",
    globals: true,
    // Run the setup file that wires up @testing-library/jest-dom matchers
    setupFiles: ["./src/__tests__/setup.ts"],
    // Don't transform node_modules except packages that ship ESM-only
    server: {
      deps: {
        inline: ["@testing-library/jest-dom"],
      },
    },
  },
})
