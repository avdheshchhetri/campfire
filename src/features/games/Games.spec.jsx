import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('./studyApi',()=>({gameRpc:vi.fn().mockResolvedValue(undefined),studyPost:vi.fn()}));
import {gameRpc,studyPost} from './studyApi';
import FlipCard from './FlipCard';
import SparkRound from './SparkRound';
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('flips without revealing the back initially',()=>{render(<FlipCard card={{front_text:'Question',back_text:'Private recall answer'}}/>);expect(screen.queryByText('Private recall answer')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Show answer'}));expect(screen.getByText('Private recall answer')).toBeTruthy();});
it('submits only an option and locks the revealed round',async()=>{
 const game={type:'trivia',round_index:0,total:5,phase:'question',participants:['u'],players:[],answers:[],round:{id:'r',prompt:'Q',options:['A','B','C','D']}};
 const {rerender}=render(<SparkRound game={game} roomId="room" userId="u" seconds={10} onChange={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'B'}));await waitFor(()=>expect(gameRpc).toHaveBeenCalledWith('cf_game_answer',{p_room:'room',p_round:'r',p_option:1}));
 rerender(<SparkRound game={{...game,phase:'reveal',round:{...game.round,correct:1,explanation:'Because'}}} roomId="room" userId="u" seconds={5}/>);
 expect(screen.getByRole('button',{name:'A'}).disabled).toBe(true);expect(screen.getByText('Because')).toBeTruthy();
});

vi.mock('react-router-dom',()=>({useOutletContext:()=>({room:{id:'room'}})}));
vi.mock('../auth/AuthContext',()=>({useAuth:()=>({user:{id:'u'}})}));
vi.mock('./useRoomGame',()=>({useRoomGame:()=>({game:null,error:'',loading:false,refresh:vi.fn(),seconds:0})}));
import Games from '../../pages/Games';
it('shows preparing only for the selected game',async()=>{
 let finish;studyPost.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 render(<Games/>);fireEvent.click(screen.getByRole('button',{name:'Start Spark Round'}));
 expect(screen.getAllByRole('button',{name:'Preparing…'})).toHaveLength(1);
 expect(screen.getByRole('button',{name:'Start The Ember Riddle'})).toBeTruthy();
 finish({});await waitFor(()=>expect(screen.getByRole('button',{name:'Start Spark Round'})).toBeTruthy());
});
