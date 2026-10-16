function delayNotice(alarm,status){
 const yellow=alarm.yellow&&['Y','B'].includes(status),red=alarm.red&&['R','B'].includes(status);
 const title=yellow&&red?'🟡🔴 Будильник відкладено через жовтий і червоний рівні небезпеки':red?'🔴 Будильник відкладено через червоний рівень небезпеки (ракетна небезпека)':'🟡 Будильник відкладено через жовтий рівень небезпеки (дронова небезпека)';
 return {title,body:'Будильник на '+alarm.time+' очікує відбою вибраного рівня тривоги. Для звуку вебверсії залишайте додаток відкритим.',tag:'alarm-delay-'+alarm.id+'-'+(alarm.occurrenceDue||alarm.due),level:yellow&&red?'B':red?'R':'Y'};
}

export {delayNotice};
