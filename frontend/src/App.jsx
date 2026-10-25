import { Routes, Route, Navigate } from "react-router-dom"
import Layout from "./components/Layout"
import Console from "./pages/Console"
import Analysis from "./pages/Analysis"
import FanLayout from "./fan/FanLayout"
import Home from "./fan/Home"
import Vote from "./fan/Vote"
import Preorder from "./fan/Preorder"
import Verify from "./fan/Verify"
import Privacy from "./fan/Privacy"

export default function App() {
  return (
    <Routes>
      <Route element={<FanLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<Vote />} />
        <Route path="/preorder" element={<Preorder />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/verify/:serial" element={<Verify />} />
        <Route path="/privacy" element={<Privacy />} />
      </Route>
      <Route element={<Layout />}>
        <Route path="/studio" element={<Console />} />
        <Route path="/studio/analysis" element={<Analysis />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
