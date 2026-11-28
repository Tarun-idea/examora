import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  HelpCircle,
  ClipboardCheck,
  Award,
  Trophy,
  ShieldAlert,
  Settings,
  LogOut,
  Menu,
  Search,
  Bell,
  ChevronDown,
  Clock,
  CheckCircle2,
  X,
  Calendar,
} from 'lucide-react';
import { UserProfile, examStore } from '../services/examStore.ts';
import { InstitutionalHeaderBrand } from './common/InstitutionalHeaderBrand.tsx';
import { GlobalFooter } from './common/GlobalFooter.tsx';

interface AppSidebarLayoutProps {
  currentUser: UserProfile;
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const AppSidebarLayout: React.FC<AppSidebarLayoutProps> = ({
  currentUser,
  currentTab,
  onSelectTab,
  onLogout,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);

  const isAdmin = currentUser.role === 'admin';
  const state = examStore.getState();
  const collegeLogoUrl = state.settings.collegeLogoUrl || '';

  const formattedToday = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const adminNavItems: NavItem[] = [
    { id: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'admin-students', label: 'Students', icon: Users },
    { id: 'admin-subjects', label: 'Subjects', icon: BookOpen },
    { id: 'admin-exams', label: 'Examinations', icon: FileText },
    { id: 'admin-questions', label: 'Question Bank', icon: HelpCircle },
    { id: 'admin-evaluations', label: 'Evaluation', icon: ClipboardCheck },
    { id: 'admin-leaderboard', label: 'Results', icon: Trophy },
    { id: 'admin-certificates', label: 'Certificates', icon: Award },
    { id: 'admin-violations', label: 'Violations', icon: ShieldAlert },
    { id: 'admin-settings', label: 'Settings', icon: Settings },
  ];

  const studentNavItems: NavItem[] = [
    { id: 'student-dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'student-exams', label: 'My Examinations', icon: FileText },
    { id: 'student-upcoming', label: 'Upcoming Exams', icon: Clock },
    { id: 'student-history', label: 'Exam History', icon: CheckCircle2 },
    { id: 'student-results', label: 'Published Results', icon: Trophy },
    { id: 'student-certificates', label: 'Certificates', icon: Award },
    { id: 'student-profile', label: 'Student Profile', icon: Users },
  ];

  const navItems = isAdmin ? adminNavItems : studentNavItems;

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    if (isAdmin) {
      if (q.includes('student') || q.includes('stu')) {
        onSelectTab('admin-students');
      } else if (q.includes('subject') || q.includes('python') || q.includes('dbms')) {
        onSelectTab('admin-subjects');
      } else if (q.includes('question') || q.includes('mcq')) {
        onSelectTab('admin-questions');
      } else if (q.includes('violation') || q.includes('tab')) {
        onSelectTab('admin-violations');
      } else if (q.includes('eval') || q.includes('grade') || q.includes('sub')) {
        onSelectTab('admin-evaluations');
      } else if (q.includes('cert')) {
        onSelectTab('admin-certificates');
      } else {
        onSelectTab('admin-exams');
      }
    } else {
      if (q.includes('result') || q.includes('score')) {
        onSelectTab('student-results');
      } else if (q.includes('cert')) {
        onSelectTab('student-certificates');
      } else if (q.includes('prof')) {
        onSelectTab('student-profile');
      } else if (q.includes('upcom')) {
        onSelectTab('student-upcoming');
      } else if (q.includes('hist')) {
        onSelectTab('student-history');
      } else {
        onSelectTab('student-exams');
      }
    }
  };

  const renderNavContent = (expanded: boolean, closeMobileOnSelect = false) => (
    <>
      <nav aria-label="Sidebar Navigation" className="p-3 space-y-1.5 flex-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={!expanded ? item.label : undefined}
              onClick={() => {
                onSelectTab(item.id);
                if (closeMobileOnSelect) setMobileDrawerOpen(false);
              }}
              className={`w-full flex items-center ${
                expanded ? 'gap-3 px-4' : 'justify-center px-2'
              } py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
                active
                  ? 'sidebar-nav-active text-white border-purple-300/40'
                  : 'border-transparent text-slate-300 hover:bg-purple-500/12 hover:text-white'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? 'text-white' : 'text-slate-400'
                }`}
              />
              {expanded && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom Logout Button (Matches Screenshot 2) */}
      <div className="p-3 border-t border-purple-500/20 shrink-0">
        <button
          type="button"
          title={!expanded ? 'Logout' : undefined}
          onClick={onLogout}
          className={`w-full flex items-center ${
            expanded ? 'gap-3 px-4' : 'justify-center px-2'
          } py-2.5 rounded-full bg-[#11153A] hover:bg-red-500/15 border border-purple-500/25 hover:border-red-500/35 text-slate-200 hover:text-red-300 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {expanded && <span>Logout</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="h-screen overflow-hidden bg-[#07081B] text-slate-100 flex flex-col">
      {/* Workspace Top Header Bar (Exact Match to Screenshot 2 — No Theme Switcher) */}
      <header className="shrink-0 z-40 bg-[#0A0D27] border-b border-purple-500/25 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 ml-0 mt-0 h-[92.8px]">
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          {/* Mobile Drawer Trigger */}
          <button
            type="button"
            aria-label="Open Navigation Menu"
            onClick={() => setMobileDrawerOpen(true)}
            className="lg:hidden p-2 rounded-xl bg-[#141842] border border-purple-500/30 text-slate-200 hover:bg-[#1D225C] transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Desktop Sidebar Collapse Toggle */}
          <button
            type="button"
            aria-label="Toggle Sidebar"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:inline-flex p-2.5 rounded-xl bg-[#141842] border border-purple-500/30 text-slate-200 hover:text-white hover:bg-[#1D225C] transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>

          <InstitutionalHeaderBrand
            logoUrl={collegeLogoUrl}
            arenaSubtitle={isAdmin ? 'Admin Arena' : 'Student Arena'}
            compact
            workspaceHeader
          />
        </div>

        {/* Center-Right Search & Controls */}
        <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
          <form
            onSubmit={handleGlobalSearchSubmit}
            className="relative hidden md:block shrink-0"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search anything (exams, students, subjects)..."
              className="w-[300px] h-[36.5875px] pl-9 pr-4 py-2 rounded-full bg-[#11153A] border border-purple-500/30 focus:border-purple-400 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none transition-colors"
            />
          </form>

          {/* Date Pill */}
          <div className="hidden xl:inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#11153A] border border-purple-500/30 text-xs font-bold text-slate-200 whitespace-nowrap">
            <Calendar className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>{formattedToday}</span>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
              className="relative p-2.5 rounded-full bg-[#11153A] border border-purple-500/30 text-slate-200 hover:text-white hover:bg-[#1D225C] transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {state.activities.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-purple-600 text-white text-[10px] font-bold font-mono flex items-center justify-center">
                  {state.activities.length > 9 ? '9+' : state.activities.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-88 bg-[#0E1132] rounded-2xl shadow-2xl border border-purple-500/30 p-4 z-[100]">
                <div className="flex items-center justify-between pb-2.5 border-b border-purple-500/20">
                  <span className="text-xs font-bold text-white">
                    Notifications ({state.activities.length})
                  </span>
                  <div className="flex items-center gap-3">
                    {state.activities.length > 0 && (
                      <button
                        type="button"
                        onClick={() => examStore.clearAllActivities()}
                        className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-white cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-purple-500/15">
                  {state.activities.length > 0 ? (
                    state.activities.map((act) => (
                      <div
                        key={act.id}
                        className="py-2.5 flex items-start justify-between gap-2.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-slate-200 font-medium leading-snug">
                            {act.text}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {act.timeAgo}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Remove notification"
                          title="Remove notification"
                          onClick={() => examStore.deleteActivity(act.id)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 text-center text-xs text-slate-400">
                      No notifications right now.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
              className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-full bg-[#11153A] border border-purple-500/30 hover:border-purple-400/50 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                {(currentUser.name || 'A').charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-white leading-none max-w-[120px] truncate">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">
                  {isAdmin ? 'ADMINISTRATOR' : currentUser.studentId || 'STUDENT'}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-[#0E1132] rounded-2xl shadow-2xl border border-purple-500/30 p-1.5 z-[100]">
                <div className="px-3 py-2 border-b border-purple-500/20">
                  <div className="text-xs font-bold text-white truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {currentUser.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onSelectTab(isAdmin ? 'admin-settings' : 'student-profile');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-200 hover:bg-purple-500/15 transition-colors cursor-pointer mt-1"
                >
                  {isAdmin ? 'General Settings' : 'Student Profile'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/12 transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/75"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside className="relative w-64 max-w-[82vw] h-full bg-[#0A0D27] border-r border-purple-500/25 flex flex-col z-10">
            <div className="px-4 py-3.5 border-b border-purple-500/20 flex items-center justify-between">
              <span className="text-sm font-extrabold text-white">
                Exam
                <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  Flow
                </span>
              </span>
              <button
                type="button"
                aria-label="Close Navigation Menu"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-purple-500/15 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderNavContent(true, true)}
          </aside>
        </div>
      )}

      {/* Main Split Body: Desktop Collapsible Sidebar + Content Viewport */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <aside
          className={`hidden lg:flex ${
            sidebarOpen ? 'w-56' : 'w-[70px]'
          } h-full bg-[#0A0D27] border-r border-purple-500/20 text-slate-100 flex-col justify-between transition-all duration-200 shrink-0 select-none z-20 overflow-y-auto`}
        >
          {renderNavContent(sidebarOpen, false)}
        </aside>

        {/* Scrollable Content Viewport */}
        <main className="flex-1 h-full overflow-y-auto min-w-0 flex flex-col justify-between">
          <div className="p-5 sm:p-7 flex-1">{children}</div>
          <GlobalFooter className="mt-10" />
        </main>
      </div>
    </div>
  );
};
