import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FeatureBoundary from './FeatureBoundary';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('keeps surrounding navigation visible when a feature fails, and retries it',()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  let broken=true;
  function View(){if(broken)throw new Error('Device view failure');return <p>Phone detection ready</p>;}
  render(<><nav>Session navigation</nav><FeatureBoundary><View /></FeatureBoundary></>);
  expect(screen.getByText('Session navigation')).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
  broken=false;fireEvent.click(screen.getByRole('button',{name:'Retry this view'}));
  expect(screen.getByText('Phone detection ready')).toBeTruthy();
});
