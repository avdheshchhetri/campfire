import { Link } from 'react-router-dom';
export default function NotFound() {
  return <section className="empty-state"><p className="eyebrow">A LITTLE OFF THE PATH</p><h1 className="font-display page-heading mt-3">This page isn’t here.</h1><Link className="button mt-6" to="/">Back to Campfire</Link></section>;
}
