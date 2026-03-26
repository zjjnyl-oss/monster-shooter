/* ========== 答题大炮 - 可移动炮管 + 射击 ========== */
const G = (() => {
  const cv = document.getElementById('gc'), cx = cv.getContext('2d');
  const fireBtn = document.getElementById('fire-btn');
  let W, H, dpr;

  /* === 音效引擎 === */
  let actx;
  function ac(){ if(!actx) try{ actx=new(window.AudioContext||window.webkitAudioContext)(); }catch(e){} if(actx?.state==='suspended')actx.resume(); return actx; }
  function tn(f,d,t='sine',v=.12,dl=0){ const c=ac();if(!c)return;try{ const o=c.createOscillator(),g=c.createGain();o.type=t;o.frequency.setValueAtTime(f,c.currentTime+dl);g.gain.setValueAtTime(v,c.currentTime+dl);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+dl+d);o.connect(g);g.connect(c.destination);o.start(c.currentTime+dl);o.stop(c.currentTime+dl+d);}catch(e){} }
  function noise(d,v=.06){ const c=ac();if(!c)return;try{const b=c.createBuffer(1,c.sampleRate*d,c.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.4;const s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();s.buffer=b;f.type='lowpass';f.frequency.value=2500;g.gain.setValueAtTime(v,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d);s.connect(f);f.connect(g);g.connect(c.destination);s.start();s.stop(c.currentTime+d);}catch(e){}}
  const sfx = {
    click(){ tn(900,.05,'sine',.08);tn(1200,.03,'sine',.05,.02); },
    fire(){ noise(.2,.12);tn(200,.15,'sawtooth',.1);tn(120,.25,'sawtooth',.06,.05); },
    hit(){ tn(523,.1,'sine',.15);tn(659,.1,'sine',.14,.08);tn(784,.12,'sine',.15,.16);tn(1047,.25,'sine',.1,.26); },
    miss(){ tn(330,.2,'triangle',.1);tn(220,.3,'triangle',.07,.12); },
    boom(){ noise(.3,.1);tn(80,.35,'sawtooth',.08);tn(60,.4,'sawtooth',.05,.1); },
    monsterHurt(){ tn(150,.12,'sawtooth',.1);tn(100,.18,'sawtooth',.07,.06); },
    win(){ [523,659,784,1047,784,1047,1318].forEach((f,i)=>tn(f,.2,'sine',.1,i*.09)); },
    lose(){ tn(392,.3,'triangle',.1);tn(330,.3,'triangle',.07,.2);tn(262,.5,'triangle',.05,.4); },
    combo(n){ for(let i=0;i<Math.min(n,6);i++)tn(600+i*90,.08,'sine',.08,i*.04); },
    land(){ tn(180,.12,'triangle',.06);noise(.08,.04); },
  };

  /* === 语音 === */
  const voice = {
    speak(txt,rate=.9,pitch=1.1){
      if(!('speechSynthesis' in window))return;
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(txt);
      u.lang='zh-CN';u.rate=rate;u.pitch=pitch;u.volume=.9;
      const vs=speechSynthesis.getVoices();
      const zh=vs.find(v=>v.lang.startsWith('zh'))||vs.find(v=>v.lang.includes('CN'));
      if(zh)u.voice=zh;
      speechSynthesis.speak(u);
    },
    stop(){ if('speechSynthesis' in window)speechSynthesis.cancel(); },
    question(t){ this.speak(t.replace(/[🍎🐱🐶💣🔴🔵⭐🌟🦇🐸🐲🤖🦑👻🧟🐉👾🦹🎃☠️😈🟢🐙]/g,''),.85,1.15); },
    good(){ const m=['答对了！太棒了！','真聪明！命中！','厉害！打中了！'];this.speak(m[Math.floor(Math.random()*m.length)],1,1.2); },
    bad(){ const m=['打偏了！再瞄准！','没关系，瞄准再打！'];this.speak(m[Math.floor(Math.random()*m.length)],.9,1); },
  };

  /* === 存档 === */
  const SK='mshoot_v2';
  let maxUn=0, starArr=[];
  function save(){ try{localStorage.setItem(SK,JSON.stringify({m:maxUn,s:starArr}));}catch(e){} }
  function load(){ try{const d=JSON.parse(localStorage.getItem(SK));if(d){maxUn=d.m||0;starArr=d.s||[];}}catch(e){} }

  /* === 游戏状态 === */
  let st='menu', lvl=0;
  let cannon, bullets, targets, monster, particles, question;
  let pHP, combo, maxCombo, score;
  let shakeT=0, shakeAmp=0, flashA=0, flashC='';
  let dragging=false, dragStartX=0;

  /* === UI === */
  function showUI(id){ document.querySelectorAll('.ui').forEach(e=>e.classList.remove('active')); if(id)document.getElementById(id).classList.add('active'); fireBtn.style.display=(id===null&&st==='playing')?'block':'none'; }
  function showMenu(){ st='menu';showUI('ui-menu'); }
  function showHelp(){ sfx.click();showUI('ui-help'); }

  function showLevels(){
    sfx.click();showUI('ui-levels');
    const g=document.getElementById('lvgrid');g.innerHTML='';
    MONSTERS.forEach((m,i)=>{
      const b=document.createElement('button');
      const ok=i<=maxUn;
      b.className=`lv ${ok?'':'locked'} ${m.boss?'boss':''}`;
      const s=starArr[i]||0;
      const ss=ok?((s>=1?'⭐':'☆')+(s>=2?'⭐':'☆')+(s>=3?'⭐':'☆')):'';
      b.innerHTML=`<span class="le">${m.emoji}</span>${i+1}<span class="ls">${ss}</span>`;
      if(ok)b.onclick=()=>startLv(i);
      g.appendChild(b);
    });
  }

  /* === 开始关卡 === */
  function startLv(n){
    sfx.click();lvl=n;voice.stop();
    const m=MONSTERS[lvl];
    document.getElementById('intro').innerHTML=
      `<div class="ie">${m.emoji}</div><div class="in">第${lvl+1}关 · ${m.name}</div><div class="ih">❤️×${m.hp}</div><div class="ir">准备战斗！</div>`;
    showUI('ui-intro');
    voice.speak(`第${lvl+1}关，${m.name}，准备战斗！`);
    setTimeout(()=>{ showUI(null); beginGame(); },2000);
  }

  function beginGame(){
    const m=MONSTERS[lvl];
    cannon={ x:W/2, y:H*.82, w:50, h:60 };
    bullets=[]; targets=[]; particles=[];
    monster={ emoji:m.emoji,name:m.name,hp:m.hp,maxHP:m.hp,x:W/2,y:H*.1,sz:H*.1,
      color:m.color,boss:m.boss,flash:0,wobble:0,alive:true,deathT:0,
      armL:0,armR:0,mouthOpen:0 };
    pHP=3; combo=0; maxCombo=0; score=0;
    shakeT=0;flashA=0;
    question=null;
    st='playing';
    fireBtn.style.display='block';
    nextQ();
  }

  /* === 题目 & 炸弹投掷 === */
  function diff(){ return lvl<5?'easy':lvl<10?'medium':'hard'; }

  function nextQ(){
    bullets=[];targets=[];
    const pool=QUESTIONS[diff()];
    const q=pool[Math.floor(Math.random()*pool.length)];
    question={ text:q.q, correct:q.a, resolved:false };
    const opts=[q.a,...q.w].sort(()=>Math.random()-.5);
    voice.question(q.q);
    throwBombs(opts,q.a);
  }

  function throwBombs(opts,correct){
    const n=opts.length;
    const margin=W*.12;
    const space=(W-margin*2)/(n-1);
    opts.forEach((txt,i)=>{
      const tx=margin+space*i;
      const ty=H*.38+Math.random()*H*.08;
      targets.push({
        txt, isCorrect:txt===correct,
        x:monster.x, y:monster.y+monster.sz*.5,
        tx, ty, r:Math.min(W*.1,40),
        phase:'fly', flyT:0, flyDur:.5+i*.1,
        alive:true, revealed:false,
        bobOff:Math.random()*Math.PI*2
      });
    });
    sfx.land();
    monster.armL=1;monster.armR=1;monster.mouthOpen=1;
  }

  /* === 发射炮弹 === */
  function fire(){
    if(st!=='playing'||!question||question.resolved)return;
    if(bullets.length>0)return;
    sfx.fire();
    bullets.push({
      x:cannon.x, y:cannon.y-cannon.h/2,
      vy:-H*.015, r:6, alive:true
    });
    spawnParticles(cannon.x,cannon.y-cannon.h/2,4,'#fbbf24','circle');
  }

  /* === 输入 === */
  function initInput(){
    let touchId=null;

    cv.addEventListener('touchstart',e=>{
      e.preventDefault();
      const t=e.changedTouches[0];
      const py=t.clientY;
      if(py>H*.55){
        dragging=true;touchId=t.identifier;
        cannon.x=t.clientX;
      }
    },{passive:false});

    cv.addEventListener('touchmove',e=>{
      e.preventDefault();
      for(let t of e.changedTouches){
        if(t.identifier===touchId&&dragging){
          cannon.x=Math.max(30,Math.min(W-30,t.clientX));
        }
      }
    },{passive:false});

    cv.addEventListener('touchend',e=>{
      for(let t of e.changedTouches){
        if(t.identifier===touchId){dragging=false;touchId=null;}
      }
    });

    // 鼠标
    let mouseDown=false;
    cv.addEventListener('mousedown',e=>{
      if(e.clientY>H*.55){mouseDown=true;cannon.x=e.clientX;}
    });
    cv.addEventListener('mousemove',e=>{
      if(mouseDown)cannon.x=Math.max(30,Math.min(W-30,e.clientX));
    });
    cv.addEventListener('mouseup',()=>{mouseDown=false;});

    fireBtn.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();fire();},{passive:false});
    fireBtn.addEventListener('click',e=>{e.stopPropagation();fire();});

    // 键盘(PC调试)
    const keys={};
    document.addEventListener('keydown',e=>{
      keys[e.key]=true;
      if(e.key===' '||e.key==='ArrowUp')fire();
    });
    document.addEventListener('keyup',e=>{keys[e.key]=false;});
    setInterval(()=>{
      if(st==='playing'){
        if(keys['ArrowLeft'])cannon.x=Math.max(30,cannon.x-6);
        if(keys['ArrowRight'])cannon.x=Math.min(W-30,cannon.x+6);
      }
    },16);
  }

  /* === 碰撞检测 === */
  function checkHits(){
    bullets.forEach(b=>{
      if(!b.alive)return;
      targets.forEach(t=>{
        if(!t.alive||t.phase!=='idle')return;
        const dx=b.x-t.x,dy=b.y-t.y;
        if(dx*dx+dy*dy<(b.r+t.r)*(b.r+t.r)){
          b.alive=false;
          t.alive=false;
          question.resolved=true;
          if(t.isCorrect){
            combo++;if(combo>maxCombo)maxCombo=combo;
            score+=100*Math.max(1,combo);
            sfx.hit();sfx.monsterHurt();
            if(combo>=3)sfx.combo(combo);
            voice.good();
            spawnExplosion(t.x,t.y,'#4ade80',25);
            spawnText(t.x,t.y-20,`+${100*Math.max(1,combo)}`,'#4ade80');
            if(combo>=3)spawnText(t.x,t.y-50,`🔥${combo}连击！`,'#ff6b35');
            shootBeam(t.x,t.y);
            monster.hp--;monster.flash=.35;
            doShake(.2,6);flash('#4ade80',.15);
            targets.forEach(o=>{if(o!==t)o.phase='fadeout';});
            if(monster.hp<=0){monster.alive=false;monster.deathT=1.8;}
            else setTimeout(nextQ,900);
          } else {
            combo=0;pHP--;
            sfx.miss();sfx.boom();
            voice.bad();
            spawnExplosion(t.x,t.y,'#f87171',18);
            spawnText(t.x,t.y-20,'✗','#f87171');
            doShake(.3,10);flash('#f87171',.2);
            // 标出正确的
            targets.forEach(o=>{if(o.isCorrect&&o.alive)o.revealed=true;});
            if(pHP<=0)setTimeout(()=>{st='lose';sfx.lose();showLose();},1000);
            else setTimeout(nextQ,1200);
          }
        }
      });
      // 子弹飞出屏幕
      if(b.y<-20)b.alive=false;
    });
    bullets=bullets.filter(b=>b.alive);
  }

  /* === 粒子 === */
  function spawnExplosion(x,y,c,n){for(let i=0;i<n;i++){const a=Math.PI*2*i/n+Math.random()*.3,sp=2+Math.random()*5;particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,sz:3+Math.random()*4,c,life:1,decay:.02+Math.random()*.02,type:'c'});}}
  function spawnText(x,y,t,c){particles.push({x,y,vx:0,vy:-1.5,text:t,c,sz:18,life:1,decay:.013,type:'t'});}
  function spawnParticles(x,y,n,c){for(let i=0;i<n;i++){particles.push({x:x+(Math.random()-.5)*10,y,vx:(Math.random()-.5)*3,vy:-2-Math.random()*3,sz:2+Math.random()*3,c,life:1,decay:.03,type:'c'});}}
  function shootBeam(fx,fy){for(let i=0;i<10;i++){const t=i/10;particles.push({x:fx+(monster.x-fx)*t,y:fy+(monster.y-fy)*t,vx:(Math.random()-.5)*2,vy:(Math.random()-.5)*2,sz:3+Math.random()*3,c:'#fbbf24',life:.6+Math.random()*.3,decay:.025,type:'c'});}}
  function doShake(d,a){shakeT=d;shakeAmp=a;}
  function flash(c,a){flashC=c;flashA=a;}

  /* === 更新 === */
  function update(dt){
    if(st!=='playing')return;
    const t=performance.now()/1000;

    // 怪物
    monster.wobble+=dt*2.5;
    if(monster.flash>0)monster.flash-=dt;
    if(monster.armL>0)monster.armL=Math.max(0,monster.armL-dt*2);
    if(monster.armR>0)monster.armR=Math.max(0,monster.armR-dt*2);
    if(monster.mouthOpen>0)monster.mouthOpen=Math.max(0,monster.mouthOpen-dt*3);
    if(!monster.alive){
      monster.deathT-=dt;
      if(Math.random()<.35)spawnExplosion(monster.x+(Math.random()-.5)*monster.sz,monster.y+(Math.random()-.5)*monster.sz,monster.color,4);
      if(monster.deathT<=0){st='win';sfx.win();showWin();}
    }

    // 目标炸弹
    targets.forEach(tg=>{
      if(tg.phase==='fly'){
        tg.flyT+=dt;
        const p=Math.min(1,tg.flyT/tg.flyDur);
        const e=1-Math.pow(1-p,3);
        tg.x=monster.x+(tg.tx-monster.x)*e;
        tg.y=(monster.y+monster.sz*.5)+(tg.ty-monster.y-monster.sz*.5)*e-Math.sin(p*Math.PI)*H*.1;
        if(p>=1){tg.phase='idle';sfx.land();}
      }
      if(tg.phase==='idle'){
        tg.y=tg.ty+Math.sin(t*2+tg.bobOff)*4;
      }
      if(tg.phase==='fadeout'){
        tg.r=Math.max(0,tg.r-dt*80);
        if(tg.r<=0)tg.alive=false;
      }
    });

    // 子弹
    bullets.forEach(b=>{b.y+=b.vy;});
    checkHits();

    // 粒子
    particles.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;
      if(p.type==='c')p.vy+=.1;
      p.life-=p.decay;
    });
    particles=particles.filter(p=>p.life>0);

    // 震动
    if(shakeT>0){shakeT-=dt;shakeAmp*=.85;}else shakeAmp=0;
    if(flashA>0)flashA=Math.max(0,flashA-dt*2.5);
  }

  /* === 绘制 === */
  function draw(){
    cx.clearRect(0,0,W,H);
    cx.save();
    if(shakeAmp>0)cx.translate((Math.random()-.5)*shakeAmp,(Math.random()-.5)*shakeAmp);

    drawBG();
    if(st==='playing'||st==='win'||st==='lose'){
      drawMonster();
      drawTargets();
      drawAimLine();
      drawBullets();
      drawCannon();
      drawParticles();
      drawHUD();
      drawQuestion();
    }
    cx.restore();

    if(flashA>0){cx.fillStyle=flashC;cx.globalAlpha=flashA;cx.fillRect(0,0,W,H);cx.globalAlpha=1;}
  }

  function drawBG(){
    const g=cx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0f0c29');g.addColorStop(.4,'#1a1a3e');g.addColorStop(1,'#24243e');
    cx.fillStyle=g;cx.fillRect(0,0,W,H);
    cx.fillStyle='rgba(255,255,255,.025)';
    for(let i=0;i<25;i++){cx.beginPath();cx.arc((i*137.5)%W,(i*97.3)%H,1+i%3,0,Math.PI*2);cx.fill();}
    // 地面线
    cx.strokeStyle='rgba(255,255,255,.06)';cx.lineWidth=1;
    cx.beginPath();cx.moveTo(0,H*.75);cx.lineTo(W,H*.75);cx.stroke();
  }

  function drawMonster(){
    const m=monster,t=performance.now()/1000;
    let dy=Math.sin(m.wobble)*10;
    let sc=m.alive?1:Math.max(0,m.deathT/1.8);

    cx.save();
    cx.translate(m.x,m.y+dy);cx.scale(sc,sc);

    // 张牙舞爪的手臂
    cx.strokeStyle=m.color;cx.lineWidth=5;cx.lineCap='round';
    const armSwing=Math.sin(t*5)*.4;
    // 左臂
    cx.save();cx.translate(-m.sz*.6,0);cx.rotate(-.5+armSwing+m.armL*-.8);
    cx.beginPath();cx.moveTo(0,0);cx.lineTo(-m.sz*.4,-m.sz*.2);cx.lineTo(-m.sz*.5,-m.sz*.4);cx.stroke();
    cx.beginPath();cx.moveTo(-m.sz*.5,-m.sz*.4);cx.lineTo(-m.sz*.6,-m.sz*.55);cx.stroke();
    cx.beginPath();cx.moveTo(-m.sz*.5,-m.sz*.4);cx.lineTo(-m.sz*.4,-m.sz*.6);cx.stroke();
    cx.restore();
    // 右臂
    cx.save();cx.translate(m.sz*.6,0);cx.rotate(.5-armSwing+m.armR*.8);
    cx.beginPath();cx.moveTo(0,0);cx.lineTo(m.sz*.4,-m.sz*.2);cx.lineTo(m.sz*.5,-m.sz*.4);cx.stroke();
    cx.beginPath();cx.moveTo(m.sz*.5,-m.sz*.4);cx.lineTo(m.sz*.6,-m.sz*.55);cx.stroke();
    cx.beginPath();cx.moveTo(m.sz*.5,-m.sz*.4);cx.lineTo(m.sz*.4,-m.sz*.6);cx.stroke();
    cx.restore();

    // 身体光晕
    if(m.boss){cx.shadowColor=m.color;cx.shadowBlur=30+Math.sin(t*3)*10;}
    if(m.flash>0&&Math.floor(m.flash*20)%2===0)cx.globalAlpha=.3;

    // emoji
    cx.font=`${m.sz}px sans-serif`;cx.textAlign='center';cx.textBaseline='middle';
    cx.fillText(m.emoji,0,0);
    cx.shadowBlur=0;cx.globalAlpha=1;

    // 嘴巴张开特效
    if(m.mouthOpen>.1){
      cx.fillStyle=`rgba(255,50,50,${m.mouthOpen*.5})`;
      cx.beginPath();cx.arc(0,m.sz*.25,m.sz*.2*m.mouthOpen,0,Math.PI*2);cx.fill();
    }

    cx.restore();

    // HP条
    if(m.alive){
      const bw=W*.4,bh=10,bx=W/2-bw/2,by=m.y+m.sz*.8+dy;
      cx.fillStyle='rgba(255,255,255,.08)';rr(bx,by,bw,bh,5);
      const ratio=m.hp/m.maxHP;
      cx.fillStyle=ratio>.5?'#4ade80':ratio>.25?'#fbbf24':'#ef4444';
      rr(bx,by,bw*ratio,bh,5);
      cx.fillStyle='rgba(255,255,255,.7)';cx.font=`bold 11px sans-serif`;
      cx.textAlign='center';cx.textBaseline='middle';
      cx.fillText(`${m.hp}/${m.maxHP}`,W/2,by+bh/2);
    }
  }

  function drawTargets(){
    targets.forEach(tg=>{
      if(!tg.alive&&tg.phase!=='fadeout')return;
      cx.save();cx.translate(tg.x,tg.y);
      const r=tg.r;

      // 色彩
      let fillC,strokeC;
      if(tg.revealed){fillC='rgba(74,222,128,.25)';strokeC='#4ade80';}
      else{
        const ci=targets.indexOf(tg)%4;
        const cls=[{f:'rgba(255,107,157,.12)',s:'#FF6B9D'},{f:'rgba(96,165,250,.12)',s:'#60A5FA'},
          {f:'rgba(251,191,36,.12)',s:'#FBBF24'},{f:'rgba(192,132,252,.12)',s:'#C084FC'}];
        fillC=cls[ci].f;strokeC=cls[ci].s;
      }

      // 炸弹体
      cx.fillStyle=fillC;cx.strokeStyle=strokeC;cx.lineWidth=3;
      cx.beginPath();cx.arc(0,0,r,0,Math.PI*2);cx.fill();cx.stroke();

      // 💣图标
      cx.font=`${r*.45}px sans-serif`;cx.textAlign='center';cx.textBaseline='middle';
      cx.fillText('💣',0,-r*.3);

      // 答案文字
      cx.fillStyle='#fff';
      let fs=Math.min(r*.42,16);
      if(tg.txt.length>8)fs=Math.min(r*.32,13);
      cx.font=`bold ${fs}px "Microsoft YaHei",sans-serif`;
      cx.fillText(tg.txt,0,r*.2);

      cx.restore();
    });
  }

  function drawAimLine(){
    if(st!=='playing'||!question||question.resolved)return;
    cx.setLineDash([6,8]);cx.strokeStyle='rgba(251,191,36,.25)';cx.lineWidth=2;
    cx.beginPath();cx.moveTo(cannon.x,cannon.y-cannon.h/2-5);cx.lineTo(cannon.x,H*.2);cx.stroke();
    cx.setLineDash([]);

    // 瞄准指示器
    targets.forEach(tg=>{
      if(!tg.alive||tg.phase!=='idle')return;
      if(Math.abs(cannon.x-tg.x)<tg.r+5){
        cx.strokeStyle='rgba(251,191,36,.5)';cx.lineWidth=2;
        cx.beginPath();cx.arc(tg.x,tg.y,tg.r+6,0,Math.PI*2);cx.stroke();
      }
    });
  }

  function drawCannon(){
    const c=cannon,t=performance.now()/1000;
    cx.save();cx.translate(c.x,c.y);

    // 轮子
    cx.fillStyle='#475569';
    cx.beginPath();cx.arc(-14,8,10,0,Math.PI*2);cx.fill();
    cx.beginPath();cx.arc(14,8,10,0,Math.PI*2);cx.fill();
    cx.fillStyle='#64748b';
    cx.beginPath();cx.arc(-14,8,5,0,Math.PI*2);cx.fill();
    cx.beginPath();cx.arc(14,8,5,0,Math.PI*2);cx.fill();

    // 炮身
    cx.fillStyle='#334155';
    rr(-20,-5,40,20,6);

    // 炮管
    cx.fillStyle='#64748b';
    rr(-8,-c.h/2,16,c.h/2-5,4);
    cx.fillStyle='#94a3b8';
    rr(-6,-c.h/2+2,12,8,3);

    // 炮口火焰(发射时)
    if(bullets.length>0&&bullets[0].y>c.y-c.h){
      cx.fillStyle=`rgba(251,191,36,${.5+Math.random()*.5})`;
      cx.beginPath();cx.arc(0,-c.h/2-5,8+Math.random()*4,0,Math.PI*2);cx.fill();
    }

    cx.restore();

    // 移动提示箭头
    if(!question?.resolved&&targets.some(t=>t.phase==='idle')){
      cx.fillStyle=`rgba(255,255,255,${.15+Math.sin(t*3)*.1})`;
      cx.font='20px sans-serif';cx.textAlign='center';cx.textBaseline='middle';
      cx.fillText('◀',c.x-45,c.y);cx.fillText('▶',c.x+45,c.y);
    }
  }

  function drawBullets(){
    bullets.forEach(b=>{
      cx.save();cx.translate(b.x,b.y);
      // 拖尾
      cx.fillStyle='rgba(251,191,36,.3)';
      cx.beginPath();cx.moveTo(-4,0);cx.lineTo(4,0);cx.lineTo(1,18);cx.lineTo(-1,18);cx.fill();
      // 弹体
      cx.fillStyle='#fbbf24';cx.shadowColor='#fbbf24';cx.shadowBlur=12;
      cx.beginPath();cx.arc(0,0,b.r,0,Math.PI*2);cx.fill();
      cx.shadowBlur=0;
      cx.restore();
    });
  }

  function drawParticles(){
    particles.forEach(p=>{
      cx.save();cx.globalAlpha=Math.max(0,p.life);
      if(p.type==='c'){cx.fillStyle=p.c;cx.beginPath();cx.arc(p.x,p.y,p.sz*p.life,0,Math.PI*2);cx.fill();}
      else{cx.fillStyle=p.c;cx.font=`bold ${p.sz}px "Microsoft YaHei",sans-serif`;cx.textAlign='center';cx.textBaseline='middle';cx.fillText(p.text,p.x,p.y);}
      cx.restore();
    });
  }

  function drawHUD(){
    // 血量
    cx.font='22px sans-serif';cx.textAlign='left';cx.textBaseline='top';
    for(let i=0;i<3;i++){cx.globalAlpha=i<pHP?1:.2;cx.fillText('❤️',12+i*32,H*.76);}
    cx.globalAlpha=1;
    // 分数
    cx.fillStyle='#fff';cx.font='bold 14px "Microsoft YaHei",sans-serif';
    cx.textAlign='right';cx.textBaseline='top';
    cx.fillText(`分数:${score}`,W-12,H*.76);
    // 连击
    if(combo>=2){cx.fillStyle=combo>=4?'#ff4500':'#fbbf24';cx.font='bold 16px "Microsoft YaHei",sans-serif';
      cx.textAlign='center';cx.fillText(`🔥${combo}连击`,W/2,H*.76);}
    // 关卡
    cx.fillStyle='rgba(255,255,255,.3)';cx.font='11px sans-serif';cx.textAlign='left';cx.fillText(`第${lvl+1}关`,12,10);
  }

  function drawQuestion(){
    if(!question)return;
    const qy=H*.87,qh=H*.13;
    cx.fillStyle='rgba(0,0,0,.6)';cx.fillRect(0,qy,W,qh);
    cx.strokeStyle='rgba(255,255,255,.06)';cx.lineWidth=1;
    cx.beginPath();cx.moveTo(0,qy);cx.lineTo(W,qy);cx.stroke();
    cx.fillStyle='#fff';cx.textAlign='center';cx.textBaseline='middle';
    const fs=question.text.length>15?15:question.text.length>10?17:20;
    cx.font=`bold ${fs}px "Microsoft YaHei",sans-serif`;
    cx.fillText(question.text,W/2,qy+qh/2);
  }

  function rr(x,y,w,h,r){cx.beginPath();cx.moveTo(x+r,y);cx.lineTo(x+w-r,y);cx.quadraticCurveTo(x+w,y,x+w,y+r);cx.lineTo(x+w,y+h-r);cx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);cx.lineTo(x+r,y+h);cx.quadraticCurveTo(x,y+h,x,y+h-r);cx.lineTo(x,y+r);cx.quadraticCurveTo(x,y,x+r,y);cx.closePath();cx.fill();}

  /* === 胜负 === */
  function showWin(){
    fireBtn.style.display='none';
    const s=pHP;
    if(!starArr[lvl]||s>starArr[lvl])starArr[lvl]=s;
    if(lvl+1>maxUn&&lvl<MONSTERS.length-1)maxUn=lvl+1;
    save();
    document.getElementById('win-t').textContent=MONSTERS[lvl].boss?`🏆 BOSS击败！`:`第${lvl+1}关 胜利！`;
    let sh='';for(let i=0;i<3;i++)sh+=`<span class="rstar">${i<s?'⭐':'☆'}</span>`;
    document.getElementById('win-s').innerHTML=sh;
    document.getElementById('win-m').textContent=s===3?'完美！一滴血没掉！':s===2?'很棒！再接再厉！':'险胜！试试满血通关？';
    document.getElementById('btn-nxt').style.display=lvl<MONSTERS.length-1?'':'none';
    voice.speak(s===3?'完美通关！太厉害了！':'恭喜过关！');
    showUI('ui-win');
  }
  function showLose(){
    fireBtn.style.display='none';
    document.getElementById('lose-m').textContent=`${MONSTERS[lvl].name}太强了！多练练再来！`;
    voice.speak('被打败了，再来一次吧！');
    showUI('ui-lose');
  }
  function retry(){sfx.click();startLv(lvl);}
  function nextLv(){sfx.click();lvl<MONSTERS.length-1?startLv(lvl+1):showLevels();}

  /* === 主循环 === */
  let lastT=0;
  function loop(ts){
    const dt=Math.min((ts-lastT)/1000,.05);lastT=ts;
    update(dt);draw();requestAnimationFrame(loop);
  }

  /* === 初始化 === */
  function resize(){
    dpr=window.devicePixelRatio||1;
    W=window.innerWidth;H=window.innerHeight;
    cv.width=W*dpr;cv.height=H*dpr;
    cv.style.width=W+'px';cv.style.height=H+'px';
    cx.setTransform(dpr,0,0,dpr,0,0);
    if(cannon)cannon.y=H*.82;
  }

  function init(){
    resize();window.addEventListener('resize',resize);
    initInput();load();
    document.addEventListener('click',()=>ac(),{once:true});
    if('speechSynthesis' in window)speechSynthesis.getVoices();
    requestAnimationFrame(loop);
  }
  document.addEventListener('DOMContentLoaded',init);

  return {showMenu,showHelp,showLevels,startLv,retry,nextLv};
})();
