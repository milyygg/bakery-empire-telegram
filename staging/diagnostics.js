(function () {
  const el = name => document.createElement(name);
  const panel = el('details'), title = el('summary'), run = el('button'), copy = el('button'), result = el('p');
  title.textContent = 'Диагностика staging';
  run.textContent = 'Замерить 15 секунд игры';
  copy.textContent = 'Скопировать';
  copy.hidden = true;
  for (const btn of [run, copy]) btn.style = 'background:#452b20;color:#fff4df;border:1px solid #bb935f;border-radius:8px;padding:8px;margin:4px';
  result.style = 'font:14px/1.4 system-ui;user-select:text';
  const mode=el('select');mode.setAttribute?.('aria-label','Эффекты во время замера');
  for(const [value,label] of [['all','Все эффекты'],['burst','Без кольца и крошек'],['numbers','Без всплывающих чисел'],['filters','Без фильтров сцены']]){const option=el('option');option.value=value;option.textContent=label;mode.append(option)}
  panel.append(title,mode,run,result,copy);
  const tab = window.tab;
  if(typeof tab==='function') window.tab=function(...args){const value=tab.apply(this,args);if(args[0]==='set')queueMicrotask(()=>{const host=document.querySelector('#p_dyn');if(T==='set'&&host&&!host.contains(panel))host.append(panel)});return value};
  copy.onclick = async () => {try{await navigator.clipboard.writeText(result.textContent);copy.textContent='Скопировано'}catch{const range=document.createRange();range.selectNodeContents(result);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);copy.textContent='Скопируйте выделенный текст'}};
  run.onclick = () => {
    if(run.disabled)return;
    const variant=mode.value, originalBurst=window.hitFX, originalNumber=window.fl;
    const style=el('style');
    if(variant==='burst')window.hitFX=()=>{};
    if(variant==='numbers')window.fl=()=>{};
    if(variant==='filters'){style.textContent='#bg svg,#center,#bun .pastry-hero,.bub,.reward-orb{filter:none!important;backdrop-filter:none!important}';document.head.append(style)}
    mode.disabled=true;run.disabled=true;copy.hidden=true;result.textContent='Вернитесь в игру на 15 секунд.';
    const groups=new Map(), intervals=[], observers=[];
    let longMs=0,requests=0,saves=0,records=0,frame,last=0;
    const start=performance.now();
    function observe(type,collect){if(!PerformanceObserver.supportedEntryTypes.includes(type))return false;const o=new PerformanceObserver(list=>collect(list.getEntries()));o.observe({type});observers.push(o);return true}
    const hasLong=observe('longtask',entries=>entries.forEach(e=>longMs+=e.duration));
    observe('resource',entries=>requests+=entries.filter(e=>e.name.startsWith('http')).length);
    const mutations=new MutationObserver(batch=>{records+=batch.length;for(const r of batch){const n=r.target;const key=n.id==='bun'?'булочка':n.id==='coins'||n.id==='gems'?'счетчики':r.attributeName==='style'?'прочие стили':r.type==='attributes'?'прочие атрибуты':'текст и узлы';groups.set(key,(groups.get(key)||0)+1)}});
    mutations.observe(document.body,{attributes:true,subtree:true,childList:true,characterData:true});
    const onPut=()=>saves++;window.addEventListener('bakery:put',onPut);
    function tick(t){if(last)intervals.push(t-last);last=t;frame=requestAnimationFrame(tick)}frame=requestAnimationFrame(tick);
    setTimeout(()=>{cancelAnimationFrame(frame);mutations.disconnect();if(variant==='burst')window.hitFX=originalBurst;if(variant==='numbers')window.fl=originalNumber;style.remove();mode.disabled=false;observers.forEach(o=>o.disconnect());window.removeEventListener('bakery:put',onPut);
      const sec=(performance.now()-start)/1000;intervals.sort((a,b)=>a-b);const p95=intervals[Math.max(0,Math.ceil(intervals.length*.95)-1)];const fps=(intervals.length+1)/sec;
      const top=[...groups].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} ${(v/sec).toFixed(0)}/с`).join(', ');
      result.textContent=`Режим ${variant}. FPS ${fps.toFixed(1)}, кадр в среднем ${(1000/fps).toFixed(1)} мс, p95 ${p95?.toFixed(1)??'н/д'} мс (низкий FPS ${p95?(1000/p95).toFixed(1):'н/д'}). Записи MutationObserver ${(records/sec).toFixed(1)}/с (${top}). Длинные задачи ${hasLong?Math.round(longMs)+' мс':'н/д'}. HTTP ${requests}, PUT ${saves}.`;
      copy.hidden=false;copy.textContent='Скопировать';run.disabled=false;run.textContent='Повторить замер';
    },15000);
  };
})();
