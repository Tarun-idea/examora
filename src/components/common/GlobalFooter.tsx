import React from 'react';
import { GraduationCap, Mail, Phone, MapPin } from 'lucide-react';

export const TEAM_MEMBERS = [
  {
    id: 'tm1',
    name: 'Mrs.C.Annapoorani',
    email: 'cvpoorani@gmail.com',
    phone: '+91 9176380194',
  },
  {
    id: 'tm2',
    name: 'Mr. S.VIGNESH',
    email: 'vicky366vj@gmail.com',
    phone: '+91 6381260699',
  },
  {
    id: 'tm3',
    name: 'Mr.Tarunkumar v',
    email: 'taruntk2008@gmail.com',
    phone: '+91 9025846979',
  },
  {
    id: 'tm4',
    name: 'Mr.YOGGESH N',
    email: 'yoggeshnr@gmail.com',
    phone: '+91 9791155317',
  },
  {
    id: 'tm5',
    name: 'Mr.Tamilselvan D',
    email: 'tamil3634786@gmail.com',
    phone: '+91 6384528015',
  },
];

const MENTOR_MEMBERS = TEAM_MEMBERS.slice(0, 2);
const DEVELOPER_MEMBERS = TEAM_MEMBERS.slice(2);

interface GlobalFooterProps {
  className?: string;
}

export const GlobalFooter: React.FC<GlobalFooterProps> = ({ className = '' }) => {
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <footer
      id="welcome-about-section"
      className={`relative z-10 border-t border-slate-800/80 bg-[#080D1A] pt-12 pb-8 px-4 sm:px-8 lg:px-10 ${className}`}
    >
      <div className="max-w-[1480px] mx-auto space-y-10">
        {/* ROW 1: Brand & Overview | Credits */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <span className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                Exam
                <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  Flow
                </span>
              </span>
            </div>

            <p className="text-xs sm:text-[13px] text-slate-400 leading-relaxed max-w-2xl">
              ExamFlow is a unified digital examination and automated programming
              evaluation platform engineered for academic integrity. Featuring a
              3-strike fullscreen proctoring lockdown, multi-language code
              sandbox (C, C++, Python, Java, JavaScript, SQL), randomized
              per-candidate papers, and bulk Section A–L merit certificate
              generation, ExamFlow streamlines assessment for faculty and students.
            </p>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-center space-y-2.5 lg:pt-2 text-xs sm:text-[13px] text-slate-300">
            <div>
              <strong className="text-slate-100 font-bold">
                Created &amp; Designed By:
              </strong>{' '}
              TarunKumar V &amp; Team
            </div>
            <div>
              <strong className="text-slate-100 font-bold">
                Developed By:
              </strong>{' '}
              5-Member Student Development Team — Department of AI &amp; Data
              Science, Panimalar Engineering College (2025–2026)
            </div>
          </div>
        </div>

        {/* ROW 2: Contact & Mentors | Developers */}
        <div
          id="welcome-contact-section"
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-6 border-t border-slate-800/70"
        >
          <div className="lg:col-span-6 space-y-5">
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Contact Us
              </h3>
              <div className="flex items-start gap-2 text-xs sm:text-[13px] text-slate-300">
                <MapPin className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  Department of AI &amp; Data Science, Panimalar Engineering
                  College, Chennai
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Mentored By
              </div>

              <div className="space-y-3">
                {MENTOR_MEMBERS.map((member) => (
                  <div key={member.id} className="space-y-1">
                    <div className="text-sm font-semibold text-slate-100">
                      {member.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                        <span>{member.email}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                        <Phone className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                        <span>{member.phone}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Developed By
            </div>

            <div className="space-y-3">
              {DEVELOPER_MEMBERS.map((member) => (
                <div key={member.id} className="space-y-1">
                  <div className="text-sm font-semibold text-slate-100">
                    {member.name}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                      <span>{member.email}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                      <Phone className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                      <span>{member.phone}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROW 3: Bottom Bar */}
        <div className="border-t border-slate-800/70 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div>© 2026 ExamFlow · Department of AI &amp; Data Science, Panimalar Engineering College.</div>
          <div className="flex flex-wrap items-center gap-6">
            <button
              type="button"
              onClick={() => scrollToSection('welcome-about-section')}
              className="hover:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('welcome-about-section')}
              className="hover:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('welcome-contact-section')}
              className="hover:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              Department Contact
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
