import {useState} from 'react';
export default function FlipCard({card}){
 const [back,setBack]=useState(false);
 return <button className="panel p-5 w-full text-left space-y-6" onClick={()=>setBack(v=>!v)} aria-label={back?'Show question':'Show answer'} aria-pressed={back}><span className="eyebrow">{back?'Answer':'Question'}</span><p className="font-display text-2xl">{back?card.back_text:card.front_text}</p><span className="muted text-sm">Click to flip</span></button>;
}
