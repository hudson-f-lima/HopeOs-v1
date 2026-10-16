// E2E manual: sugestão de horários no modal (modo token legado). E2E_DATE=YYYY-MM-DD de hoje.
const { chromium } = require('playwright');
(async()=>{
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto('http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api&apiToken=dev');
 await p.waitForTimeout(2500);
 await p.click('#fab'); await p.waitForTimeout(500);
 await p.fill('#agData', process.env.E2E_DATE);
 await p.dispatchEvent('#agData','change');
 await p.click('#agServico'); await p.fill('#agServico','Corte'); await p.waitForTimeout(300);
 await p.locator('#agServico ~ div [data-value]').first().click(); await p.waitForTimeout(300);
 await p.click('#agProfissional'); await p.fill('#agProfissional','Ana'); await p.waitForTimeout(300);
 await p.locator('#agProfissional ~ div [data-value]').first().click(); await p.waitForTimeout(1200);
 console.log('SLOTS:', (await p.textContent('#agSlots')).replace(/\s+/g,' ').trim());
 console.log('PREVIEW:', await p.textContent('#agDuracaoPreview'));
 await p.screenshot({path:'modal.png'});
 const t=p.locator('.ag-slots-toggle'); if(await t.count()){await t.click(); console.log('TODOS:', (await p.textContent('.ag-slots-list')).replace(/\s+/g,' ').trim());}
 await p.click('.ag-slot.recomendado >> nth=0'); console.log('HORARIO:', await p.inputValue('#agHorario'));
 await p.screenshot({path:'modal2.png'});
 await p.click('#btnConfirmarNovoAgendamento'); await p.waitForTimeout(1500);
 const db=await (await fetch('http://127.0.0.1:3399/__db/agendamentos')).json();
 console.log('DB:', JSON.stringify(db.map(a=>[a.horario,a.duracao_min,a.servico_id.slice(-1)])));
 console.log('ERRS:', JSON.stringify(errs));
 await b.close();})();
