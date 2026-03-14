import {BrowserRouter, Routes, Route, Navigate} from 'react-router-dom'
import {useLayoutEffect} from 'react'
import SettingsBar from './components/SettingsBar'
import CookieBanner from './components/CookieBanner/CookieBanner'
import PageTracker from './components/PageTracker'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import ModeratorRoute from './components/ModeratorRoute/ModeratorRoute'
import BroadcasterRoute from './components/BroadcasterRoute/BroadcasterRoute'
import HomePage from './pages/HomePage'
import ImpressumPage from './pages/ImpressumPage'
import DatenschutzPage from './pages/DatenschutzPage'
import StreamplanPage from './pages/StreamplanPage'
import StreamelementsPage from './pages/StreamelementsPage'
import BartclickerPage from './pages/BartclickerPage'
import ClipVotingPage from './pages/ClipVotingPage'
import ModeratePage from './pages/ModeratePage'
import ModerateVotingPage from './pages/ModerateVotingPage'
import ModerateStatisticsPage from './pages/ModerateStatisticsPage'
import ModerateSettingsPage from './pages/ModerateSettingsPage'
import NotFoundPage from './pages/NotFoundPage'
import './App.css'
import siteConfig from "./config/siteConfig.ts";

// Komponente für echte Browser-Redirects zu statischen HTML-Dateien
const RedirectToHtml: React.FC<{ to: string }> = ({ to }) => {
    useLayoutEffect(() => {
        window.location.href = to
    }, [to])
    return null
}
const {channel} = siteConfig.twitch
const {links: [instagram, youtube, discord, tiktok]} = siteConfig

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
                <Route path="/moderate" element={<ModeratorRoute><ModeratePage/></ModeratorRoute>}/>
                <Route path="/moderate/voting" element={<ModeratorRoute><ModerateVotingPage/></ModeratorRoute>}/>
                <Route path="/moderate/statistics"
                       element={<ModeratorRoute><ModerateStatisticsPage/></ModeratorRoute>}/>
                <Route path="/moderate/twitch"
                       element={<RedirectToHtml to={`https://www.twitch.tv/moderator/${channel}`}/>}/>
                <Route path="/moderate/settings"
                       element={<BroadcasterRoute><ModerateSettingsPage/></BroadcasterRoute>}/>

                {/* ── Alternative Pfade → Redirect ── */}
                <Route path="/actuator/data" element={<Navigate to="/moderate/statistics" replace/>}/>
                <Route path="/se" element={<Navigate to="/streamelements" replace/>}/>
                <Route path="/s" element={<Navigate to="/streamplan" replace/>}/>
                <Route path="/ob" element={<Navigate to="/onlybart" replace/>}/>
                <Route path="/bc" element={<Navigate to="/bartclicker" replace/>}/>
                <Route path="/cdm" element={<Navigate to="/clipdesmonats" replace/>}/>

                {/* ── Externe Links → Redirect ── */}
                <Route path="/twitch" element={<RedirectToHtml to={`https://www.twitch.tv/${channel}`}/>}/>
                <Route path="/insta" element={<RedirectToHtml to={`${instagram.url}`}/>}/>
                <Route path="/instagram" element={<RedirectToHtml to={`${instagram.url}`}/>}/>
                <Route path="/yt" element={<RedirectToHtml to={`${youtube.url}`}/>}/>
                <Route path="/youtube" element={<RedirectToHtml to={`${youtube.url}`}/>}/>
                <Route path="/dc" element={<RedirectToHtml to={`${discord.url}`}/>}/>
                <Route path="/discord" element={<RedirectToHtml to={`${discord.url}`}/>}/>
                <Route path="/tiktok" element={<RedirectToHtml to={`${tiktok.url}`}/>}/>


                {/* Custom Wünsche */}
                <Route path="/onlybart" element={<RedirectToHtml to="/ob.html"/>}/>
                <Route path="/onlybart/media" element={<RedirectToHtml to="/ob/media.html"/>}/>
                <Route path="/onlybart/photos" element={<RedirectToHtml to="/ob/photos.html"/>}/>
                <Route path="/onlybart/posts" element={<RedirectToHtml to="/ob/posts.html"/>}/>
                <Route path="/onlybart/videos" element={<RedirectToHtml to="/ob/videos.html"/>}/>

                <Route path="/rp" element={<RedirectToHtml to="https://github.com/HD1920x1080Media/Minecraft-Ressource-Pack/archive/refs/tags/latest.zip"/>}/>
                <Route path="/ressourcepack" element={<RedirectToHtml to="https://github.com/HD1920x1080Media/Minecraft-Ressource-Pack/archive/refs/tags/latest.zip"/>}/>
                <Route path="/tanggle" element={<RedirectToHtml to="http://tng.gl/c/hd1920x1080"/>}/>
                <Route path="/puzzle" element={<RedirectToHtml to="http://tng.gl/c/hd1920x1080"/>}/>
                <Route path="/nclip" element={<RedirectToHtml to="https://nclip.io/page/hd1920x1080"/>}/>

                <Route path="*" element={<NotFoundPage/>}/>
            </Routes>
            <CookieBanner/>
        </BrowserRouter>
    )
}

export default App
