interface IconProps {
  className?: string
}

export function MaleIcon({ className }: IconProps) {
  return (
    <svg
      className={`${className} text-sky-600/70 dark:text-sky-400/60`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="14" r="5" />
      <path d="M19 5l-5.4 5.4" />
      <path d="M15 5h4v4" />
    </svg>
  )
}

export function FemaleIcon({ className }: IconProps) {
  return (
    <svg
      className={`${className} text-rose-400/70 dark:text-rose-300/60`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M12 13v8" />
      <path d="M9 18h6" />
    </svg>
  )
}
