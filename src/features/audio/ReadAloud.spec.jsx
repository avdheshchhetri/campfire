import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReadAloud from './ReadAloud';
const mocks=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('./speechApi.js',()=>({requestSpeech:mocks.request}));
beforeEach(()=>{
 mocks.request.mockReset().mockResolvedValue('data:audio/mpeg;base64,AQID');
 vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(function(){Object.defineProperty(this,'paused',{configurable:true,value:false});this.dispatchEvent(new Event('play'));return Promise.resolve();});
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(){Object.defineProperty(this,'paused',{configurable:true,value:true});this.dispatchEvent(new Event('pause'));});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('does nothing until clicked, plays and pauses, and reuses audio on replay',async()=>{
 render(<ReadAloud roomId="room" text="Question?" />);expect(mocks.request).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));
 await screen.findByText('Speaking…');expect(mocks.request).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'Pause read aloud'}));
 fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));
 await screen.findByText('Speaking…');expect(mocks.request).toHaveBeenCalledOnce();
});
it('keeps underlying text usable when voice fails and supports retry',async()=>{
 mocks.request.mockRejectedValueOnce(new Error('Voice unavailable'));
 render(<><p>Your question remains here.</p><button>Submit answer</button><ReadAloud roomId="room" text="Question?" /></>);
 fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));await screen.findByText('Voice unavailable');
 expect(screen.getByText('Your question remains here.')).toBeTruthy();expect(screen.getByRole('button',{name:'Submit answer'}).disabled).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));await screen.findByText('Speaking…');
});
it('cancels pending old text and never plays it after the question changes',async()=>{
 let resolve;mocks.request.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const page=render(<ReadAloud roomId="room" text="Old question" />);
 fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));await screen.findByText('Preparing audio…');
 const signal=mocks.request.mock.calls[0][0].signal;
 page.rerender(<ReadAloud roomId="room" text="New question" />);expect(signal.aborted).toBe(true);
 await act(async()=>resolve('data:audio/mpeg;base64,AQID'));
 expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
it('handles browser playback blocking without fetching audio again',async()=>{
 HTMLMediaElement.prototype.play.mockRejectedValueOnce(new Error('NotAllowedError'));
 render(<ReadAloud roomId="room" text="Question?" />);
 fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));await screen.findByText('Audio is ready. Tap play to listen.');
 fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));await waitFor(()=>expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
 expect(mocks.request).toHaveBeenCalledOnce();
});
