import React from 'react';
import {
  ArrowRight,
  Play,
  TrendingUp,
  Trophy,
  BarChart3,
  Zap,
  ShieldCheck,
  Code2,
  ClipboardCheck,
  Award,
  CheckCircle2,
  Clock,
  FileText,
  Users,
} from 'lucide-react';
import { examStore } from '../../services/examStore.ts';
import { InstitutionalHeaderBrand } from '../common/InstitutionalHeaderBrand.tsx';
import { GlobalFooter } from '../common/GlobalFooter.tsx';

interface WelcomeLandingPageProps {
  onNavigateToLogin: (role?: 'admin' | 'student') => void;
}

export const WelcomeLandingPage: React.FC<WelcomeLandingPageProps> = ({
  onNavigateToLogin,
}) => {
  const state = examStore.getState();
  const collegeLogoUrl = state.settings.collegeLogoUrl || '';

  const enrolledStudentsCount =
    state.publicSummary?.enrolledStudentsCount ?? state.students.length;
  const liveExamsCount =
    state.publicSummary?.liveExamsCount ??
    state.exams.filter(
      (e) => String(e.status || '').trim().toLowerCase() !== 'draft'
    ).length;

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const capabilities = [
    {
      icon: Code2,
      title: 'Multi-Format Question Papers',
      description:
        'Combine MCQ, descriptive answers, and live programming tasks across C, C++, Python, Java, JavaScript, and SQL in one timed exam.',
    },
    {
      icon: ShieldCheck,
      title: '3-Strike Proctoring Lockdown',
      description:
        'Enforces fullscreen mode, blocks escape and shortcut keys, logs tab switches in real time, and auto-submits when limits are reached.',
    },
    {
      icon: ClipboardCheck,
      title: 'Instant Grading & Review',
      description:
        'Objective questions and coding test cases grade automatically while faculty finalize descriptive scripts inside the Evaluation Station.',
    },
    {
      icon: Award,
      title: 'Hall Tickets & Bulk Certificates',
      description:
        'Generate printable student Hall Tickets and export verifiable merit certificates grouped by Section A–L as a single PDF.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#07081B] text-slate-50 selection:bg-purple-500/30 selection:text-white overflow-x-hidden relative flex flex-col">
      {/* Top Institutional Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-purple-500/20 bg-[#080B24]/95">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-3.5 sm:py-4 flex items-center justify-between gap-4 sm:gap-6">
          <InstitutionalHeaderBrand logoUrl={collegeLogoUrl} heroHeader />

          {/* Centered Pill Navigation */}
          <nav
            aria-label="Welcome Page Navigation"
            className="hidden lg:flex items-center gap-7 xl:gap-8 px-7 py-2.5 rounded-full bg-[#0C0F2E] border border-purple-500/35 text-[13px] font-bold text-slate-100"
          >
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('welcome-capabilities')}
              className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              About &amp; Team
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('welcome-contact-section')}
              className="text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              Contact Us
            </button>
          </nav>

          {/* Right Login Controls */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateToLogin('student')}
              className="px-5 py-2.5 rounded-full bg-[#131742] hover:bg-[#1C215C] border border-purple-400/35 text-[13px] font-bold text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Student Login
            </button>

            <button
              type="button"
              onClick={() => onNavigateToLogin('admin')}
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] hover:from-[#9333EA] hover:to-[#6366F1] text-[13px] font-bold text-white shadow-[0_0_24px_0_rgba(124,58,237,0.7)] transition-all cursor-pointer whitespace-nowrap"
            >
              Admin Login
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-14">
        {/* Signature Cosmic Hero Frame (Exact Match to Screenshot 1) */}
        <section
          className="relative rounded-[28px] border border-purple-500/30 overflow-hidden px-6 sm:px-12 lg:px-16 py-12 sm:py-16 lg:py-20"
          style={{
            background:
              'radial-gradient(ellipse 65% 55% at 75% 20%, rgba(109, 40, 217, 0.34), transparent 62%), linear-gradient(135deg, #090C26 0%, #101038 55%, #160F42 100%)',
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
            {/* Left Column: Hero Copy, CTAs & Metrics */}
            <div className="lg:col-span-6 space-y-7">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#161543] border border-purple-400/35 text-xs font-bold text-slate-200">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Learn • Practice • Compete</span>
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-[68px] font-black tracking-tight leading-[1.03]">
                <span className="block text-white">Dream Big.</span>
                <span className="block bg-gradient-to-r from-[#A855F7] via-[#8B5CF6] to-[#38BDF8] bg-clip-text text-transparent">
                  Crack It.
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-300 max-w-lg leading-relaxed">
                Your ultimate platform for university examinations, coding competitions,
                proctored evaluations, and verifiable achievement certificates.
              </p>

              {/* Primary & Secondary Role Pill CTAs */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigateToLogin('student')}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] hover:from-[#9333EA] hover:to-[#6366F1] text-white font-bold text-sm shadow-[0_0_26px_-2px_rgba(124,58,237,0.65)] transition-all cursor-pointer whitespace-nowrap"
                >
                  <span>Start Practicing</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateToLogin('admin')}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-[#13143C] hover:bg-[#1C1E54] border border-purple-400/35 text-white font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 text-slate-200" />
                  <span>Admin Control Center</span>
                </button>
              </div>

              {/* Divider + Live Stats Row */}
              <div className="pt-7 border-t border-purple-500/20 flex flex-wrap items-center gap-7 sm:gap-9">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-lg font-extrabold text-white font-mono tabular-nums leading-none">
                      {enrolledStudentsCount}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Enrolled Students
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center text-purple-400 shrink-0">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-lg font-extrabold text-white font-mono tabular-nums leading-none">
                      {liveExamsCount}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Live Examinations
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shrink-0">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-lg font-extrabold text-white font-mono tabular-nums leading-none">
                      A–L
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Cohort Sections
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Glowing Code Sandbox & Floating Metric Visual */}
            <div className="lg:col-span-6 flex items-center justify-center relative py-6">
              <div className="relative w-full max-w-[460px] flex items-center justify-center">
                {/* Circular Cosmic Backdrop Glow */}
                <div
                  aria-hidden="true"
                  className="w-72 h-72 sm:w-80 sm:h-80 rounded-full border border-indigo-400/25 shadow-[0_0_90px_10px_rgba(99,102,241,0.28)]"
                  style={{
                    background:
                      'radial-gradient(circle at 45% 40%, rgba(99, 102, 241, 0.35), rgba(30, 27, 75, 0.5) 68%, transparent 100%)',
                  }}
                />

                {/* Top-Left Floating Live Sync Card */}
                <div className="absolute -top-2 left-0 sm:left-2 w-40 rounded-2xl bg-[#0D1333] border border-cyan-400/35 p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.55)] z-20">
                  <div className="flex items-center justify-between text-[11px] font-bold mb-3">
                    <span className="text-cyan-300">Live Sync</span>
                    <span className="text-cyan-400">Active</span>
                  </div>
                  <div className="flex items-end gap-2 h-11">
                    <div className="flex-1 h-4 rounded-sm bg-purple-600/80" />
                    <div className="flex-1 h-6 rounded-sm bg-violet-500" />
                    <div className="flex-1 h-8 rounded-sm bg-indigo-400" />
                    <div className="flex-1 h-11 rounded-sm bg-cyan-400" />
                  </div>
                </div>

                {/* Top-Right Floating Merit Certified Card */}
                <div className="absolute -top-2 right-0 sm:right-2 w-36 rounded-2xl bg-[#141236] border border-amber-400/35 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.55)] flex flex-col items-center justify-center gap-2 z-20">
                  <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.55)]">
                    <Trophy className="w-5 h-5 text-[#141236]" />
                  </div>
                  <span className="text-[11px] font-bold text-amber-400 whitespace-nowrap">
                    Merit Certified
                  </span>
                </div>

                {/* Center Laptop / Sandbox Editor Window */}
                <div className="absolute bottom-2 inset-x-4 sm:inset-x-8 flex flex-col items-center z-10">
                  <div className="w-full max-w-[300px] rounded-2xl bg-[#0B1130] border border-cyan-400/45 shadow-[0_18px_48px_rgba(0,0,0,0.65)] p-4">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      </div>
                      <span className="text-[11px] font-mono text-cyan-300/90">
                        examflow_sandbox.py
                      </span>
                    </div>

                    <div className="flex items-center justify-center py-5">
                      <span className="text-4xl font-black font-mono tracking-tight bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 bg-clip-text text-transparent">
                        &lt;/&gt;
                      </span>
                    </div>

                    <div className="mt-4 h-1.5 w-full rounded-full bg-gradient-to-r from-purple-500 via-cyan-400 to-indigo-500" />
                  </div>

                  {/* Stylized Laptop Base */}
                  <div className="w-[82%] h-3 rounded-b-xl bg-gradient-to-r from-indigo-500/80 via-purple-400/90 to-purple-500/80" />
                  <div className="mt-1.5 w-[92%] h-4 rounded-full bg-[#131442] border border-purple-400/45 shadow-[0_0_24px_rgba(139,92,246,0.4)]" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Platform Capabilities & About Section */}
        <section
          id="welcome-capabilities"
          className="pt-6 space-y-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Built for Faculty &amp; Students
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Everything needed to run dependable exams
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Zero-lag local &amp; cloud sync
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-400" />
                Autosave every answer
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {capabilities.map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.title}
                  className="rounded-2xl bg-[#0E1132] border border-purple-500/25 p-6 flex flex-col justify-between gap-4 hover:border-purple-400/45 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center text-purple-300">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-white">
                      {cap.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {cap.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Direct Role Entry Strip */}
          <div className="rounded-2xl bg-[#0E1132] border border-purple-500/25 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Ready to sign in to your workspace?
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Students can access assigned exams, Hall Tickets, and published
                  certificates. Administrators manage cohorts, papers, and results.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateToLogin('student')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] text-white text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                Student Portal
              </button>
              <button
                type="button"
                onClick={() => onNavigateToLogin('admin')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#141842] hover:bg-[#1D225C] border border-purple-400/35 text-slate-100 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                Administrator Portal
              </button>
            </div>
          </div>
        </section>
      </main>

      <GlobalFooter />
    </div>
  );
};
