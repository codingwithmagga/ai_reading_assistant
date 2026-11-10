import { useEffect, useState } from "react";

const translations = {
  de: {
    heading: "Spoilerfreier Lesebegleiter",
    description:
      "Deine Notizen bleiben auf dem Stand deiner aktuellen Leseposition.",
    language: "Sprache",
  },
  en: {
    heading: "Spoiler-Free Reading Assistant",
    description: "Your notes stay up to date with your current reading position.",
    language: "Language",
  },
};

type Language = keyof typeof translations;

function isLanguage(value: string): value is Language {
  return Object.prototype.hasOwnProperty.call(translations, value);
}

export function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const savedLanguage = window.localStorage.getItem("ui-language");
    return savedLanguage && isLanguage(savedLanguage) ? savedLanguage : "de";
  });
  const text = translations[language];

  useEffect(() => {
    window.localStorage.setItem("ui-language", language);
  }, [language]);

  return (
    <main lang={language}>
      <label>
        {text.language}
        <select
          value={language}
          onChange={(event) => {
            const selectedLanguage = event.currentTarget.value;
            if (isLanguage(selectedLanguage)) {
              setLanguage(selectedLanguage);
            }
          }}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </label>
      <h1>{text.heading}</h1>
      <p>{text.description}</p>
    </main>
  );
}
