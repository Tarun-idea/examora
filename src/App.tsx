import React, { useState, useEffect, Suspense, lazy } from 'react';
import { examStore } from './services/examStore.ts';
import { resolveUiTheme } from './utils/uiThemes.ts';
import { WelcomeLandingPage } from './components/welcome/WelcomeLandingPage.tsx';
import { AuthPage } from './components/auth/AuthPage.tsx';

// Code-split authenticated shell & portal pages so Welcome + Auth load instantaneously
const AppSidebarLayout = lazy(() =>
  import('./components/AppSidebarLayout.tsx').then((m) => ({
    default: m.AppSidebarLayout,
  }))
);
const AdminDashboard = lazy(() =>
  import('./components/admin/AdminDashboard.tsx').then((m) => ({
    default: m.AdminDashboard,
  }))
);
const ExamManagement = lazy(() =>
  import('./components/admin/ExamManagement.tsx').then((m) => ({
    default: m.ExamManagement,
  }))
);
const QuestionBank = lazy(() =>
  import('./components/admin/QuestionBank.tsx').then((m) => ({
    default: m.QuestionBank,
  }))
);
const SubjectManagement = lazy(() =>
  import('./components/admin/SubjectManagement.tsx').then((m) => ({
    default: m.SubjectManagement,
  }))
);
const StudentManagement = lazy(() =>
  import('./components/admin/StudentManagement.tsx').then((m) => ({
    default: m.StudentManagement,
  }))
);
const LeaderboardPage = lazy(() =>
  import('./components/admin/LeaderboardPage.tsx').then((m) => ({
    default: m.LeaderboardPage,
  }))
);
const EvaluationStation = lazy(() =>
  import('./components/admin/EvaluationStation.tsx').then((m) => ({
    default: m.EvaluationStation,
  }))
);
const CertificateManagement = lazy(() =>
  import('./components/admin/CertificateManagement.tsx').then((m) => ({
    default: m.CertificateManagement,
  }))
);
const ViolationMonitoring = lazy(() =>
  import('./components/admin/ViolationMonitoring.tsx').then((m) => ({
    default: m.ViolationMonitoring,
  }))
);
const AdminSettingsPage = lazy(() =>
  import('./components/admin/AdminSettingsPage.tsx').then((m) => ({
    default: m.AdminSettingsPage,
  }))
);
const StudentDashboard = lazy(() =>
  import('./components/student/StudentDashboard.tsx').then((m) => ({
    default: m.StudentDashboard,
  }))
);
const ExamEnvironment = lazy(() =>
  import('./components/student/ExamEnvironment.tsx').then((m) => ({
    default: m.ExamEnvironment,
  }))
);
const StudentResultsView = lazy(() =>
  import('./components/student/StudentResultsView.tsx').then((m) => ({
    default: m.StudentResultsView,
  }))
);

class PageErrorBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { resetKey: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto my-12 rounded-3xl bg-[#0E1132] border border-rose-500/40 p-8 text-center space-y-4 shadow-xl">
          <h2 className="text-lg font-extrabold text-white">
            Something went wrong loading this view
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] text-white text-xs font-bold cursor-pointer"
          >
            Retry View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[260px] w-full">
    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0E1132] border border-purple-500/30 text-xs font-bold text-purple-200">
      <span className="w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
      <span>Loading module...</span>
    </div>
  </div>
);

export function App() {
  const [storeState, setStoreState] = useState(() => examStore.getState());
  const [showWelcomePage, setShowWelcomePage] = useState<boolean>(true);
  const [authInitialRole, setAuthInitialRole] = useState<'admin' | 'student'>('admin');

  const [currentTab, setCurrentTab] = useState<string>('admin-dashboard');
  const [selectedQuestionExamId, setSelectedQuestionExamId] = useState<string | undefined>(
    undefined
  );
  const [openCreateExamInit, setOpenCreateExamInit] = useState<boolean>(false);

  // Active live exam session or result inspection for student
  const [activeExamSessionId, setActiveExamSessionId] = useState<string | null>(null);
  const [viewingResultAttemptId, setViewingResultAttemptId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = examStore.subscribe(() => {
      setStoreState({ ...examStore.getState() });
    });
    return unsub;
  }, []);

  // Sync UI Theme Color & Dark Mode on root html element across all pages
  const activeUiThemeObj = resolveUiTheme(storeState.settings.uiTheme);
  const isDarkMode = !activeUiThemeObj.isLight;
  const accentColor = storeState.settings.accentColor || 'blue';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.setAttribute('data-accent', accentColor);
    document.documentElement.setAttribute('data-ui-theme', activeUiThemeObj.id);
    document.documentElement.setAttribute(
      'data-theme-mode',
      activeUiThemeObj.isLight ? 'light' : 'dark'
    );
  }, [isDarkMode, accentColor, activeUiThemeObj.id, activeUiThemeObj.isLight]);

  // Poll for Timed Auto-Publishing of scheduled exam results every 30 seconds (paused in background tabs)
  useEffect(() => {
    examStore.checkTimedAutoPublish();
    const timer = setInterval(() => {
      if (!document.hidden) {
        examStore.checkTimedAutoPublish();
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Keep currentTab aligned when user switches between Admin and Student
  useEffect(() => {
    if (storeState.currentUser.role === 'admin' && currentTab.startsWith('student-')) {
      setCurrentTab('admin-dashboard');
      setActiveExamSessionId(null);
      setViewingResultAttemptId(null);
    } else if (storeState.currentUser.role === 'student' && currentTab.startsWith('admin-')) {
      setCurrentTab('student-dashboard');
    }
  }, [storeState.currentUser.role, currentTab]);

  const currentUser = storeState.currentUser;
  const isAdmin = currentUser.role === 'admin';

  // =========================================================
  // STAGE 1 & STAGE 2: UNAUTHENTICATED WORKFLOW
  // =========================================================
  if (!storeState.isAuthenticated) {
    if (showWelcomePage) {
      return (
        <PageErrorBoundary resetKey="welcome">
          <WelcomeLandingPage
            onNavigateToLogin={(role = 'admin') => {
              setAuthInitialRole(role);
              setShowWelcomePage(false);
            }}
          />
        </PageErrorBoundary>
      );
    }

    return (
      <PageErrorBoundary resetKey={`auth-${authInitialRole}`}>
        <AuthPage
          initialRole={authInitialRole}
          onBackToWelcome={() => setShowWelcomePage(true)}
          onSuccess={(role) => {
            const freshState = examStore.getState();
            setStoreState({ ...freshState });
            setCurrentTab(role === 'admin' ? 'admin-dashboard' : 'student-dashboard');
          }}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => examStore.toggleThemeMode()}
        />
      </PageErrorBoundary>
    );
  }

  // =========================================================
  // PROCTORED EXAM ENVIRONMENT (FULL-SCREEN LOCK FOR STUDENT)
  // =========================================================
  const activeSessionExam = activeExamSessionId
    ? storeState.exams.find((e) => e.id === activeExamSessionId)
    : undefined;
  const isSessionExamDraft =
    activeSessionExam &&
    String(activeSessionExam.status || '').trim().toLowerCase() === 'draft';

  if (!isAdmin && activeExamSessionId && !isSessionExamDraft) {
    return (
      <PageErrorBoundary resetKey={`exam-${activeExamSessionId}`}>
        <Suspense fallback={<PageLoader />}>
          <ExamEnvironment
            examId={activeExamSessionId}
            studentId={currentUser.id}
            onExit={() => setActiveExamSessionId(null)}
            onViewResults={(attemptId) => {
              setActiveExamSessionId(null);
              setViewingResultAttemptId(attemptId);
            }}
          />
        </Suspense>
      </PageErrorBoundary>
    );
  }

  // =========================================================
  // STAGE 3: STRUCTURED SIDEBAR & DASHBOARD SHELL
  // =========================================================
  return (
    <Suspense fallback={<PageLoader />}>
      <AppSidebarLayout
        currentUser={currentUser}
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setOpenCreateExamInit(false);
          setViewingResultAttemptId(null);
        }}
        onLogout={() => {
          setActiveExamSessionId(null);
          setViewingResultAttemptId(null);
          examStore.logout();
          setShowWelcomePage(false);
        }}
      >
        <PageErrorBoundary resetKey={`${currentTab}-${viewingResultAttemptId || ''}`}>
          <Suspense fallback={<PageLoader />}>
          {isAdmin ? (
            <>
              {currentTab === 'admin-dashboard' && (
                <AdminDashboard
                  onNavigate={(tab) => {
                    setCurrentTab(tab);
                    setOpenCreateExamInit(false);
                  }}
                  onOpenCreateExam={() => {
                    setOpenCreateExamInit(true);
                    setCurrentTab('admin-exams');
                  }}
                />
              )}

              {currentTab === 'admin-exams' && (
                <ExamManagement
                  viewMode="exams"
                  showCreateModalInit={openCreateExamInit}
                  onNavigateToQuestions={(examId) => {
                    setSelectedQuestionExamId(examId);
                    setCurrentTab('admin-questions');
                  }}
                />
              )}

              {currentTab === 'admin-questions' && (
                <QuestionBank initialExamId={selectedQuestionExamId} />
              )}

              {currentTab === 'admin-subjects' && <SubjectManagement />}

              {currentTab === 'admin-students' && <StudentManagement />}

              {currentTab === 'admin-evaluations' && (
                <EvaluationStation viewMode="evaluations" />
              )}

              {currentTab === 'admin-leaderboard' && <LeaderboardPage />}

              {currentTab === 'admin-certificates' && <CertificateManagement />}

              {currentTab === 'admin-violations' && <ViolationMonitoring />}

              {currentTab === 'admin-settings' && <AdminSettingsPage />}
            </>
          ) : viewingResultAttemptId ? (
            <StudentResultsView
              attemptId={viewingResultAttemptId}
              onBack={() => setViewingResultAttemptId(null)}
            />
          ) : (
            <StudentDashboard
              currentUser={currentUser}
              activeTab={currentTab}
              onSelectTab={(tab) => setCurrentTab(tab)}
              onStartExam={(examId) => {
                const targetExam = examStore
                  .getState()
                  .exams.find((e) => e.id === examId);
                if (
                  !targetExam ||
                  String(targetExam.status || '').trim().toLowerCase() === 'draft'
                ) {
                  return;
                }
                examStore.startOrResumeAttempt(examId, currentUser.id, false);
                setActiveExamSessionId(examId);
              }}
              onViewResults={(attemptId) => setViewingResultAttemptId(attemptId)}
            />
          )}
          </Suspense>
        </PageErrorBoundary>
      </AppSidebarLayout>
    </Suspense>
  );
}

export default App;
