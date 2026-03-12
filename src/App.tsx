import {BrowserRouter, Routes, Route, Navigate} from 'react-router-dom'
import SettingsBar from './components/SettingsBar'
import CookieBanner from './components/CookieBanner/CookieBanner'
import PageTracker from './components/PageTracker'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import ModeratorRoute from './components/ModeratorRoute/ModeratorRoute'
import HomePage from './pages/HomePage'
import ImpressumPage from './pages/ImpressumPage'
import DatenschutzPage from './pages/DatenschutzPage'
import StreamplanPage from './pages/StreamplanPage'
import StreamelementsPage from './pages/StreamelementsPage'
import BartclickerPage from './pages/BartclickerPage'
import ClipVotingPage from './pages/ClipVotingPage'
import ModerateVotingPage from './pages/ModerateVotingPage'
import ModerateStatisticsPage from './pages/ModerateStatisticsPage'
import NotFoundPage from './pages/NotFoundPage'
import './App.css'

function App() {
    return (
        <BrowserRouter>
            <SettingsBar/>
            <PageTracker/>
            <Routes>
                <Route path="/" element={<HomePage/>}/>
                <Route path="/impressum" element={<ImpressumPage/>}/>
                <Route path="/datenschutz" element={<DatenschutzPage/>}/>
                <Route path="/streamplan" element={<StreamplanPage/>}/>
                <Route path="/streamelements" element={<StreamelementsPage/>}/>

                {/* ── Login zum Aufrufen nötig ── */}
                <Route path="/bartclicker" element={<ProtectedRoute><BartclickerPage/></ProtectedRoute>}/>

                {/* ── Seite öffentlich, Voting braucht Login ── */}
                <Route path="/clipdesmonats" element={<ClipVotingPage/>}/>

                {/* ── Moderatoren-Bereich (Twitch-Mods + Streamer) ── */}
                <Route path="/moderate/voting" element={<ModeratorRoute><ModerateVotingPage/></ModeratorRoute>}/>
                <Route path="/moderate/statistics"
                       element={<ModeratorRoute><ModerateStatisticsPage/></ModeratorRoute>}/>

                {/* ── Alternative Pfade → Redirect ── */}
                <Route path="/actuator/data" element={<Navigate to="/moderate/statistics" replace/>}/>

                <Route path="*" element={<NotFoundPage/>}/>
            </Routes>
            <CookieBanner/>
        </BrowserRouter>
    )
}

export default App
