"use client";

import { useEffect, useState } from "react";

type Language = "pt-BR" | "es" | "en";

export default function LanguageSwitcher() {
  const [currentLanguage, setCurrentLanguage] = useState<Language | null>(null);

  useEffect(() => {
    // Detect browser language
    const browserLang = navigator.language;
    let detected: Language = "en";
    
    if (browserLang.startsWith("pt")) {
      detected = "pt-BR";
    } else if (browserLang.startsWith("es")) {
      detected = "es";
    }

    // Check localStorage first
    const saved = localStorage.getItem("huginflow-language") as Language | null;
    if (saved && ["pt-BR", "es", "en"].includes(saved)) {
      setCurrentLanguage(saved);
    } else {
      setCurrentLanguage(detected);
    }
  }, []);

  const handleLanguageChange = (lang: Language) => {
    setCurrentLanguage(lang);
    localStorage.setItem("huginflow-language", lang);
    // Note: This currently only updates the UI flag. 
    // Future i18n logic can be hooked here.
  };

  const flags = [
    {
      id: "pt-BR" as Language,
      title: "Português Brasileiro",
      svg: (
        <svg width="24" height="24" viewBox="0 0 512 512">
          <path fill="#43a047" d="M0 0h512v512H0z"/>
          <path fill="#ffee58" d="M38.1 256 256 473.9 473.9 256 256 38.1z"/>
          <circle cx="256" cy="256" r="101.9" fill="#283593"/>
          <path fill="#fafafa" d="M256 211.9a138 138 0 0 1 100.9 44.1l11.7-11.7a154.5 154.5 0 0 0-225.2 0l11.7 11.7A138 138 0 0 1 256 211.9z"/>
        </svg>
      )
    },
    {
      id: "es" as Language,
      title: "Español",
      svg: (
        <svg width="24" height="24" viewBox="0 0 512 512">
          <path fill="#f44336" d="M0 0h512v128H0zm0 384h512v128H0z"/>
          <path fill="#ffeb3b" d="M0 128h512v256H0z"/>
        </svg>
      )
    },
    {
      id: "en" as Language,
      title: "English",
      svg: (
        <svg width="24" height="24" viewBox="0 0 512 512">
          <path fill="#eeeeee" d="M0 0h512v512H0z"/>
          <path fill="#f44336" d="M0 0h512v36.6H0zm0 73.1h512v36.6H0zm0 73.2h512v36.5H0zm0 73.1h512v36.6H0zm0 73.2h512v36.5H0zm0 73.1h512v36.6H0zm0 73.2h512v36.5H0z"/>
          <path fill="#3f51b5" d="M0 0h284.4v256H0z"/>
        </svg>
      )
    }
  ];

  // Prevent hydration mismatch by only rendering after client-side mount
  if (!currentLanguage) return (
    <div className="flex items-center gap-3 mr-2 animate-pulse">
      <div className="w-6 h-6 bg-gray-700 rounded-sm"></div>
      <div className="w-6 h-6 bg-gray-700 rounded-sm"></div>
      <div className="w-6 h-6 bg-gray-700 rounded-sm"></div>
    </div>
  );

  return (
    <div className="flex items-center gap-3 mr-2">
      {flags.map((flag) => {
        const isActive = currentLanguage === flag.id;
        return (
          <button
            key={flag.id}
            title={flag.title}
            onClick={() => handleLanguageChange(flag.id)}
            className={`
              transition-all duration-300 active:scale-95
              ${isActive 
                ? "grayscale-0 opacity-100 scale-125 drop-shadow-[0_0_8px_rgba(43,170,223,0.3)]" 
                : "grayscale opacity-40 hover:grayscale-0 hover:opacity-100 hover:scale-110"
              }
            `}
          >
            {flag.svg}
          </button>
        );
      })}
    </div>
  );
}
