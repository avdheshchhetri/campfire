// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreateRoom from './CreateRoom.jsx';
import JoinRoom from './JoinRoom.jsx';
import SyllabusUpload from './SyllabusUpload.jsx';
import TeachTopic from './TeachTopic.jsx';
import Dashboard from './Dashboard.jsx';
import { demoData, demoRoomId, demoUserId, resetDemo, supabase } from '../../../demo/syllabus/supabaseClient.js';

const api = vi.hoisted(() => ({ callStudyAPI: vi.fn(), requireUser: vi.fn() }));
vi.mock('./api.js', () => api);
let container; let root;
beforeEach(() => {
  vi.resetAllMocks(); resetDemo();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api.requireUser.mockResolvedValue({ id: demoUserId });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(component) { await act(async () => root.render(component)); }
async function fill(selector, value) {
  const element = container.querySelector(selector);
  await act(async () => {
    const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function submit() { await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); }
async function click(label) {
  const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent === label);
  expect(button, `button ${label}`).toBeTruthy(); await act(async () => button.click());
}

describe('room forms', () => {
  it('creates the room and owner membership through the host RPC', async () => {
    const callback = vi.fn(); await render(<CreateRoom onCreated={callback} />);
    await fill('input[maxlength="100"]', 'Systems group'); await submit();
    expect(callback).toHaveBeenCalledOnce();
    const room = callback.mock.calls[0][0]; expect(room.name).toBe('Systems group'); expect(room.join_code).toHaveLength(10);
    expect(demoData().room_members.some(member => member.room_id === room.id && member.user_id === demoUserId)).toBe(true);
  });
  it('retries a failed room read without creating a duplicate room', async () => {
    const original = supabase.from; let fail = true;
    vi.spyOn(supabase, 'from').mockImplementation(table => {
      if (table === 'rooms' && fail) { fail = false; const query = { select: () => query, eq: () => query, single: async () => ({ error: { message: 'Temporary network issue' } }) }; return query; }
      return original(table);
    });
    await render(<CreateRoom />); await fill('input[maxlength="100"]', 'Retry group'); await submit();
    expect(container.textContent).toContain('Your room was created');
    expect(demoData().rooms).toHaveLength(2); await submit(); expect(demoData().rooms).toHaveLength(2);
    expect(container.textContent).toContain('is ready');
  });
  it('joins case-insensitively and treats existing membership as success', async () => {
    const callback = vi.fn(); await render(<JoinRoom onJoined={callback} />);
    await fill('input', 'fire42'); await submit(); expect(callback).toHaveBeenCalledOnce();
    expect(demoData().room_members).toHaveLength(1);
  });
});

describe('syllabus and teaching screens', () => {
  it('reads an uploaded PDF and sends it through the same authenticated API helper', async () => {
    api.callStudyAPI.mockResolvedValue({ topics: [{ title: 'Graphs', order_index: 0 }] });
    await render(<SyllabusUpload roomId={demoRoomId} />); await click('Upload PDF');
    const file = new File(['%PDF-1.7\nfrontend-test'], 'syllabus.pdf', { type: 'application/pdf' });
    await act(async () => {
      const input = container.querySelector('input[type="file"]');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(api.callStudyAPI).toHaveBeenCalledWith('/api/parse-syllabus', { roomId: demoRoomId, pdf: { name: 'syllabus.pdf', data: btoa('%PDF-1.7\nfrontend-test') } });
    expect(container.textContent).toContain('Review 1 topics');
  });
  it('previews parsed topics and adds only new titles without resetting progress', async () => {
    api.callStudyAPI.mockResolvedValue({ topics: [{ title: 'Arrays and linked lists', order_index: 0 }, { title: 'Graphs', order_index: 1 }] });
    await render(<SyllabusUpload roomId={demoRoomId} />);
    await fill('textarea', 'Arrays and linked lists\nGraphs'); await submit();
    expect(container.textContent).toContain('Review 2 topics');
    await click('Add topics to room');
    expect(demoData().syllabus_topics).toHaveLength(5);
    expect(demoData().syllabus_topics[0].status).toBe('verified');
    expect(container.textContent).toContain('1 topics added');
  });
  it('submits a follow-up using the issued token and offers revision after failure', async () => {
    api.callStudyAPI.mockResolvedValueOnce({ question: 'Why a base case?', attempt: 'signed-attempt', status: 'taught' });
    api.callStudyAPI.mockResolvedValueOnce({ verified: false, feedback: 'Explain termination.', status: 'taught' });
    const id = demoData().syllabus_topics[1].id;
    await render(<TeachTopic roomId={demoRoomId} initialTopicId={id} />);
    await fill('textarea', 'A function calls itself.'); await submit();
    expect(container.textContent).toContain('Why a base case?');
    await fill('textarea[rows="4"]', 'It is fast.'); await submit();
    expect(api.callStudyAPI.mock.calls[1][1]).toMatchObject({ stage: 'evaluate', attempt: 'signed-attempt', answer: 'It is fast.' });
    expect(container.textContent).toContain('Explain termination.');
    await click('Revise and try again'); expect(container.textContent).toContain('Ask my follow-up');
  });
  it('shows every unverified topic in the upcoming-exam banner', async () => {
    await render(<Dashboard roomId={demoRoomId} />);
    const banner = container.querySelector('aside');
    expect(banner.textContent).toContain('in 5 days');
    expect(banner.textContent).toContain('Recursion and base cases');
    expect(banner.textContent).not.toContain('Arrays and linked lists');
    expect(container.querySelectorAll('article')).toHaveLength(4);
  });
});
