import { Routes, Route, Navigate } from "react-router-dom"
import Layout from "./components/Layout"
import Console from "./pages/Console"
import FanLayout from "./fan/FanLayout"
import Home from "./fan/Home"
import Vote from "./fan/Vote"
import Preorder from "./fan/Preorder"
import Verify from "./fan/Verify"

// Fans see the bright app at "/". Studios use the dark console at "/studio".
export default function App() {
  return (
    <Routes>
      <Route element={<FanLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<Vote />} />
        <Route path="/preorder" element={<Preorder />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/verify/:serial" element={<Verify />} />
      </Route>
      <Route element={<Layout />}>
        <Route path="/studio" element={<Console />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
