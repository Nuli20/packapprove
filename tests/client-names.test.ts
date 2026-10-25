import {it,expect} from 'vitest';
import {db,asUser} from '../lib/db';
it('client peer-name policy exposes colleagues but never another organization',async()=>{
 const [actor]=await db`select id from profiles where full_name='Айгерим Нурлан'`;
 const [peer]=await db`select id from profiles where full_name='Марат Оспанов'`;
 const [other]=await db`select id from profiles where full_name='Анна Ким'`;
 expect(actor&&peer&&other).toBeTruthy();
 const visible=await asUser(actor.id,async tx=>await tx`select id from profiles where id in (${peer.id},${other.id})`);
 expect(visible.map(p=>p.id)).toContain(peer.id);expect(visible.map(p=>p.id)).not.toContain(other.id);
});
