import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import type { Role } from "./lib/types";
import HowItWorks from "./pages/HowItWorks";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import SettingsPage from "./pages/Settings";
import ProfAnalytics from "./pages/professor/Analytics";
import ProfDashboard from "./pages/professor/Dashboard";
import ProfInsights from "./pages/professor/Insights";
import ProfModules from "./pages/professor/Modules";
import ProfReviews from "./pages/professor/Reviews";
import RubricBuilder from "./pages/professor/RubricBuilder";
import RubricImport from "./pages/professor/RubricImport";
import Assignments from "./pages/student/Assignments";
import Checklist from "./pages/student/Checklist";
import Coach from "./pages/student/Coach";
import Compare from "./pages/student/Compare";
import CriterionDetail from "./pages/student/CriterionDetail";
import StudentDashboard from "./pages/student/Dashboard";
import DraftEditor from "./pages/student/DraftEditor";
import DraftView from "./pages/student/DraftView";
import History from "./pages/student/History";
import NewAssessment from "./pages/student/NewAssessment";
import Progress from "./pages/student/Progress";
import Results from "./pages/student/Results";
import RubricPreview from "./pages/student/RubricPreview";

function Guard({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === "professor" ? "/professor" : "/student"} replace />;
  return <Layout>{children}</Layout>;
}

const TITLES: [RegExp, string][] = [
  [/^\/student\/results/, "Assessment results"], [/^\/student\/coach/, "Learning coach"], [/^\/student\/new/, "New assessment"],
  [/^\/student\/compare/, "Draft comparison"], [/^\/professor\/analytics/, "Class analytics"], [/^\/professor/, "Lecturer"],
  [/^\/student/, "Student"], [/^\/settings/, "Accessibility settings"],
];

export default function App() {
  const loc = useLocation();
  useEffect(() => {
    const t = TITLES.find(([re]) => re.test(loc.pathname))?.[1];
    document.title = t ? `${t} · GradeGuide AI` : "GradeGuide AI";
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  const S = (el: ReactNode) => <Guard role="student">{el}</Guard>;
  const P = (el: ReactNode) => <Guard role="professor">{el}</Guard>;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/student" element={S(<StudentDashboard />)} />
      <Route path="/student/new" element={S(<NewAssessment />)} />
      <Route path="/student/assignments" element={S(<Assignments />)} />
      <Route path="/student/rubric/:id" element={S(<RubricPreview />)} />
      <Route path="/student/draft/:id" element={S(<DraftView />)} />
      <Route path="/student/edit/:assignmentId" element={S(<DraftEditor />)} />
      <Route path="/student/results/:id" element={S(<Results />)} />
      <Route path="/student/results/:id/criterion/:ratingId" element={S(<CriterionDetail />)} />
      <Route path="/student/coach/:areaId" element={S(<Coach />)} />
      <Route path="/student/checklist" element={S(<Checklist />)} />
      <Route path="/student/compare/:fromId/:toId" element={S(<Compare />)} />
      <Route path="/student/progress" element={S(<Progress />)} />
      <Route path="/student/history" element={S(<History />)} />
      <Route path="/professor" element={P(<ProfDashboard />)} />
      <Route path="/professor/modules" element={P(<ProfModules />)} />
      <Route path="/professor/rubrics/import" element={P(<RubricImport />)} />
      <Route path="/professor/rubrics/:section" element={P(<RubricBuilder />)} />
      <Route path="/professor/analytics" element={P(<ProfAnalytics />)} />
      <Route path="/professor/insights" element={P(<ProfInsights />)} />
      <Route path="/professor/reviews" element={P(<ProfReviews />)} />
      <Route path="/settings" element={<Guard><SettingsPage /></Guard>} />
      <Route path="/how-it-works" element={<Guard><HowItWorks /></Guard>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
