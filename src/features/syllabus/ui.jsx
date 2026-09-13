export const inputClass = 'w-full rounded-xl border border-border dark:border-stone-300 bg-surface dark:bg-white px-4 py-3 text-sm text-primary dark:text-stone-900 outline-none focus:border-accent dark:focus:border-emerald-600 focus:ring-2 focus:ring-accent dark:focus:ring-emerald-100 disabled:opacity-60';
export const buttonClass = 'inline-flex items-center justify-center rounded-xl bg-accent dark:bg-emerald-800 px-5 py-3 text-sm font-semibold text-on-accent dark:text-white hover:bg-accent-hover dark:hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryClass = 'rounded-xl border border-border dark:border-stone-300 px-4 py-2 text-sm text-primary dark:text-stone-700 hover:bg-surface dark:hover:bg-stone-100 disabled:opacity-50';
export const cardClass = 'rounded-2xl border border-border dark:border-stone-200 bg-surface dark:bg-white p-6 shadow-sm';

export function ErrorMessage({ children }) {
  return children ? <p role="alert" className="rounded-xl border border-border dark:border-red-200 bg-danger-soft dark:bg-red-50 p-3 text-sm text-danger dark:text-red-800">{children}</p> : null;
}

export function Field({ label, children }) {
  return <label className="grid gap-2 text-sm font-medium text-primary dark:text-stone-700">{label}{children}</label>;
}
