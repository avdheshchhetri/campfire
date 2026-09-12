export const inputClass = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60';
export const buttonClass = 'inline-flex items-center justify-center rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryClass = 'rounded-xl border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50';
export const cardClass = 'rounded-2xl border border-stone-200 bg-white p-6 shadow-sm';

export function ErrorMessage({ children }) {
  return children ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{children}</p> : null;
}

export function Field({ label, children }) {
  return <label className="grid gap-2 text-sm font-medium text-stone-700">{label}{children}</label>;
}
