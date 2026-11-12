import { createBrowserRouter } from "react-router";
import { LandingPage } from "../pages/LandingPage";
import { AuthPage } from "../pages/AuthPage";
import { SessionPage } from "../pages/SessionPage";
import { HistoryPage } from "../pages/HistoryPage";
import { SettingsPage } from "../pages/SettingsPage";

export const router = createBrowserRouter([
  { path: "/", Component: LandingPage },
  { path: "/login", Component: AuthPage },
  { path: "/session", Component: SessionPage },
  { path: "/history", Component: HistoryPage },
  { path: "/settings", Component: SettingsPage },
  { path: "*", Component: LandingPage },
]);
