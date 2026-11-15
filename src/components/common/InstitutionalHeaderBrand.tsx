import React from 'react';

interface InstitutionalHeaderBrandProps {
  logoUrl?: string;
  arenaSubtitle?: string;
  compact?: boolean;
  large?: boolean;
}

export const InstitutionalHeaderBrand: React.FC<InstitutionalHeaderBrandProps> = ({
  logoUrl,
  arenaSubtitle,
  compact = false,
  large = false,
}) => {
  const effectiveLogo =
    logoUrl && logoUrl.trim() ? logoUrl : '/assets/panimalar-crest.png';

  return (
    <div
      className={`flex items-center ${
        large ? 'gap-5 sm:gap-7' : 'gap-4 sm:gap-6'
      } shrink-0 select-none`}
    >
      {/* Left: Panimalar Crest + Institutional Title & Department (No Box Borders or Middle Lines) */}
      <div className={`flex items-center ${large ? 'gap-4 sm:gap-5' : 'gap-3'}`}>
        <img
          src={effectiveLogo}
          alt="Panimalar Engineering College Emblem"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.endsWith('/assets/panimalar-crest.png')) {
              target.src = '/assets/panimalar-crest.png';
            }
          }}
          className={`${
            large
              ? 'w-24 h-24 sm:w-32 sm:h-32 lg:w-36 lg:h-36'
              : compact
                ? 'w-12 h-12'
                : 'w-13 h-13 sm:w-14 sm:h-14'
          } object-contain shrink-0 drop-shadow-[0_4px_16px_rgba(255,255,255,0.28)]`}
        />

        <div className="flex flex-col justify-center leading-tight">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span
              className={`${
                large
                  ? 'text-lg sm:text-xl lg:text-2xl'
                  : compact
                    ? 'text-sm sm:text-base'
                    : 'text-base sm:text-lg'
              } font-black tracking-wide text-white uppercase leading-none`}
            >
              PANIMALAR
            </span>
            <span
              className={`${
                large
                  ? 'text-[11px] sm:text-sm lg:text-base'
                  : compact
                    ? 'text-[10px] sm:text-[11px]'
                    : 'text-[11px] sm:text-xs'
              } font-extrabold tracking-wider text-slate-100 uppercase leading-none`}
            >
              ENGINEERING COLLEGE
            </span>
          </div>

          <div
            className={`flex flex-wrap items-center ${
              large ? 'gap-1.5 mt-1' : 'gap-1.5 mt-1'
            }`}
          >
            <span
              className={`${
                large
                  ? 'px-2 py-0.5 text-[9px] sm:text-[11px]'
                  : 'px-1.5 py-0.5 text-[9px]'
              } bg-[#D91B24] text-white font-extrabold tracking-wide rounded-xs leading-none`}
            >
              An Autonomous Institution
            </span>
            <span
              className={`${
                large
                  ? 'text-[10px] sm:text-[11px] font-medium text-slate-200'
                  : 'text-[9px] sm:text-[10px] font-medium text-slate-300'
              } leading-none hidden sm:inline`}
            >
              Affiliated to Anna University, Chennai
            </span>
          </div>

          <div
            className={`${
              large
                ? 'text-[11px] sm:text-xs mt-1'
                : 'text-[10px] sm:text-[11px] mt-1'
            } font-bold text-cyan-300 tracking-wide leading-none`}
          >
            Department of AI and Data Science
          </div>
        </div>
      </div>

      {/* Right: ExamFlow Brand Wordmark (Clean, No Divider Line) */}
      <div className="flex flex-col justify-center shrink-0 pl-1">
        <div
          className={`${
            large
              ? 'text-xl sm:text-2xl lg:text-3xl'
              : compact
                ? 'text-lg sm:text-xl'
                : 'text-xl sm:text-2xl'
          } font-extrabold tracking-tight text-white leading-none`}
        >
          Exam
          <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Flow
          </span>
        </div>
        {arenaSubtitle && (
          <div
            className={`${
              large ? 'text-[11px] sm:text-xs mt-1' : 'text-[10px] sm:text-[11px] mt-1'
            } font-medium text-slate-400 leading-none`}
          >
            {arenaSubtitle}
          </div>
        )}
      </div>
    </div>
  );
};
