import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ControllerProvider } from './store/useController';

import WelcomePage from './pages/WelcomePage';
import LoginPage from './pages/LoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import HomePage from './pages/HomePage';
import ReadyToFlyPage from './pages/ReadyToFlyPage';
import StartSessionPage from './pages/StartSessionPage';
import LocalWeatherPage from './pages/LocalWeatherPage';
import LocalWeatherSessionPage from './pages/LocalWeatherSessionPage';
import LiveSessionPage from './pages/LiveSessionPage';
import PickupPiecePage from './pages/PickupPiecePage';
import DoneFlyingPage from './pages/DoneFlyingPage';
import BeforeBedPage from './pages/BeforeBedPage';
import SessionSummaryPage from './pages/SessionSummaryPage';
import AskQuestionPage from './pages/AskQuestionPage';
import CustomerInputPage from './pages/CustomerInputPage';
import OtherInfoPage from './pages/OtherInfoPage';
import DailySchedulePage from './pages/DailySchedulePage';
import StarlingWorkPatternPage from './pages/StarlingWorkPatternPage';
import WeeklySchedulePage from './pages/WeeklySchedulePage';
import WorkProtocolPage from './pages/WorkProtocolPage';
import SiteInfoPage from './pages/SiteInfoPage';
import ContactInfoPage from './pages/ContactInfoPage';
import EquipmentPage from './pages/EquipmentPage';
import HandlerMetricsPage from './pages/HandlerMetricsPage';
import FlightHoursPage from './pages/FlightHoursPage';
import PatrolSummaryPage from './pages/PatrolSummaryPage';
import StarlingTimelinePage from './pages/StarlingTimelinePage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminUserDetailPage from './pages/AdminUserDetailPage';
import AdminSpreadsheetPage from './pages/AdminSpreadsheetPage';
import AdminFalconLogsPage from './pages/AdminFalconLogsPage';

export default function App() {
  return (
    <BrowserRouter>
      <ControllerProvider>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin-login" element={<AdminLoginPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/ready-to-fly" element={<ReadyToFlyPage />} />
          <Route path="/start-session" element={<StartSessionPage />} />
          <Route path="/local-weather" element={<LocalWeatherPage />} />
          <Route path="/local-weather-session" element={<LocalWeatherSessionPage />} />
          <Route path="/live-session/:sessionId" element={<LiveSessionPage />} />
          <Route path="/pickup-piece/:sessionId" element={<PickupPiecePage />} />
          <Route path="/done-flying/:sessionId" element={<DoneFlyingPage />} />
          <Route path="/before-bed" element={<BeforeBedPage />} />
          <Route path="/session-summary/:sessionId" element={<SessionSummaryPage />} />
          <Route path="/ask-question" element={<AskQuestionPage />} />
          <Route path="/customer-input" element={<CustomerInputPage />} />
          <Route path="/other-info" element={<OtherInfoPage />} />
          <Route path="/daily-schedule" element={<DailySchedulePage />} />
          <Route path="/starling-work-pattern" element={<StarlingWorkPatternPage />} />
          <Route path="/weekly-schedule" element={<WeeklySchedulePage />} />
          <Route path="/work-protocol" element={<WorkProtocolPage />} />
          <Route path="/site-info" element={<SiteInfoPage />} />
          <Route path="/contact-info" element={<ContactInfoPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/handler-metrics" element={<HandlerMetricsPage />} />
          <Route path="/flight-hours" element={<FlightHoursPage />} />
          <Route path="/patrol-summary" element={<PatrolSummaryPage />} />
          <Route path="/starling-timeline" element={<StarlingTimelinePage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin-user/:handlerId" element={<AdminUserDetailPage />} />
          <Route path="/admin-spreadsheet/:handlerId/:falconId" element={<AdminSpreadsheetPage />} />
          <Route path="/admin-falcon-logs" element={<AdminFalconLogsPage />} />
        </Routes>
      </ControllerProvider>
    </BrowserRouter>
  );
}
