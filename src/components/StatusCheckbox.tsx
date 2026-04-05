"use client";

interface StatusCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: "green" | "red" | "blue" | "orange";
}

const colorMap = {
  green: "text-green-600",
  red: "text-red-600",
  blue: "text-blue-600",
  orange: "text-orange-500",
};

export default function StatusCheckbox({ checked, onChange, color = "green" }: StatusCheckboxProps) {
  return (
    <button
      className={`w-full flex justify-center py-1 ${checked ? colorMap[color] : "text-gray-300"} hover:opacity-80`}
      onClick={() => onChange(!checked)}
    >
      {checked ? (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 20 20">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 10l3 3 5-5" className="opacity-0" />
          <rect x="3" y="3" width="14" height="14" rx="2" strokeWidth="1.5" />
        </svg>
      )}
    </button>
  );
}
