import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isLoggedIn } from './api'
import Login from './pages/Login'
import FirmList from './pages/FirmList'
import FirmDetail from './pages/FirmDetail'
import ReviewQueue from './pages/ReviewQueue'
import OutreachLog from './pages/OutreachLog'
import SyncManager from './pages/SyncManager'
import Layout from './components/Layout'

function PrivateRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Navigate to="/firms" replace />} />
          <Route path="firms" element={<FirmList />} />
          <Route path="firms/:id" element={<FirmDetail />} />
          <Route path="review" element={<ReviewQueue />} />
          <Route path="outreach" element={<OutreachLog />} />
          <Route path="sync" element={<SyncManager />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
