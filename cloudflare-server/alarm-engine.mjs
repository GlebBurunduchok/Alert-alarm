function localDay(timestamp, zone='Europe/Kyiv') {
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(timestamp);
  return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');
}
function nextTime(time, now=Date.now(), zone='Europe/Kyiv', days=[], skipDate='') {
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Вкажіть коректний час.');
  const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const selected=Array.isArray(days)?days.filter(x=>Number.isInteger(x)&&x>=0&&x<=6):[];
  const start=Math.floor(now/60000)*60000+60000;
  for(let t=start;t<start+9*86400000;t+=60000){
    if(fmt.format(t)!==time)continue;
    const date=localDay(t,zone);if(date===skipDate)continue;
    if(!selected.length||selected.includes(new Date(date+'T12:00:00Z').getUTCDay()))return t;
  }
  throw new Error('Не вдалося визначити наступне спрацювання.');
}
function finishOccurrence(alarm,now=Date.now()){
  const days=Array.isArray(alarm.days)?alarm.days:(alarm.repeat?[0,1,2,3,4,5,6]:[]);
  if(days.length){alarm.due=nextTime(alarm.time,now,alarm.zone,days,localDay(alarm.occurrenceDue||alarm.due,alarm.zone));alarm.enabled=true}else alarm.enabled=false;
  delete alarm.occurrenceDue;delete alarm.snoozed;
}
function snoozeOccurrence(alarm,now=Date.now(),minutes=5){
  alarm.occurrenceDue ||= alarm.due;alarm.due=now+minutes*60000;alarm.snoozed=true;
}
function alarmDecision(alarm,status,fresh,now,offline=false){
  if(!alarm.enabled||alarm.due>now)return 'scheduled';
  if(offline||(!alarm.yellow&&!alarm.red))return 'ring';
  if(!fresh||!['N','Y','R','P','B'].includes(status))return 'ring';
  if(status==='P')return 'partial';
  if((alarm.yellow&&['Y','B'].includes(status))||(alarm.red&&['R','B'].includes(status)))return 'wait';
  return 'ring';
}

export {finishOccurrence};
