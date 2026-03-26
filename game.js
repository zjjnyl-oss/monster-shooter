/* 答题大炮 - Canvas 游戏引擎 */
const Game = (() => {
  const SAVE = 'monster_shooter_v1';
  const cv = document.getElementById('gc');
  const cx = cv.getContext('2d');
  let W, H, dpr, lastT = 0;

  /* ---- 音效 ---- */
  let audioCtx, sndOn = true;
  function ac() { if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} if (audioCtx?.state==='suspended') audioCtx.resume(); return audioCtx; }
  function tone(f,d,t='sine',v=.12,dl=0){ const c=ac(); if(!c||!sndOn)return; try{ const o=c.createOscillator(),g=c.createGain(); o.type=t; o.frequency.setValueAtTime(f,c.currentTime+dl); g.gain.setValueAtTime(v,c.currentTime+dl); g.gain.exponentialRampToValueAtTime(.001,c.currentTime+dl+d); o.connect(g); g.connect(c.destination); o.start(c.currentTime+dl); o.stop(c.currentTime+dl+d); } catch(e){} }
  const sfx = {
    click(){ tone(900,.06,'sine',.08); tone(1200,.04,'sine',.05,.02); },
    throw(){ tone(300,.15,'triangle',.06); tone(200,.2,'triangle',.04,.05); },
    hit(){ tone(523,.1,'sine',.14); tone(659,.1,'sine',.14,.08); tone(784,.15,'sine',.15,.16); tone(1047,.25,'sine',.1,.26); },
    miss(){ tone(330,.2,'triangle',.1); tone(220,.3,'triangle',.08,.12); },
    explode(){ tone(100,.3,'sawtooth',.08); tone(80,.4,'sawtooth',.06,.1); },
    win(){ [523,659,784,1047,784,1047].forEach((f,i)=>tone(f,.2,'sine',.1,i*.1)); },
    lose(){ tone(392,.3,'triangle',.1); tone(330,.3,'triangle',.08,.2); tone(262,.5,'triangle',.06,.4); },
    combo(n){ for(let i=0;i<Math.min(n,5);i++) tone(600+i*100,.08,'sine',.08,i*.04); },
    monsterHit(){ tone(150,.15,'sawtooth',.1); tone(100,.2,'sawtooth',.08,.08); },
  };

  /* ---- 状态 ---- */
  let state = 'menu'; // menu|playing|transition|win|lose
  let lvl = 0, maxUnlocked = 0, stars = [];
  let monster, bombs, particles, question;
  let playerHP, combo, maxCombo, score;
  let shakeX = 0, shakeY = 0, shakeDur = 0;
  let flashAlpha = 0, flashColor = '';
  let transTimer = 0, pendingState = '';

  /* ---- 存档 ---- */
  function save(){ try{ localStorage.setItem(SAVE, JSON.stringify({ max: maxUnlocked, stars })); }catch(e){} }
  function load(){ try{ const d=JSON.parse(localStorage.getItem(SAVE)); if(d){ maxUnlocked=d.max||0; stars=d.stars||[]; } }catch(e){} }

  /* ---- UI切换 ---- */
  function showUI(id){
    document.querySelectorAll('.ui-overlay').forEach(el=>el.classList.remove('active'));
    if(id) document.getElementById(id).classList.add('active');
  }

  function showMenu(){ state='menu'; showUI('ui-menu'); }
  function showHelp(){ sfx.click(); showUI('ui-help'); }

  function showLevels(){
    sfx.click(); showUI('ui-levels');
    const grid = document.getElementById('levels-grid');
    grid.innerHTML = '';
    MONSTERS.forEach((m,i) => {
      const btn = document.createElement('button');
      const unlocked = i <= maxUnlocked;
      btn.className = `lv-btn ${unlocked?'unlocked':'locked'} ${m.boss?'boss':''}`;
      const s = stars[i] || 0;
      const starStr = (s>=1?'⭐':'☆')+(s>=2?'⭐':'☆')+(s>=3?'⭐':'☆');
      btn.innerHTML = `<span class="lv-emoji">${m.emoji}</span><span>${i+1}</span><span class="lv-stars">${unlocked?starStr:''}</span>`;
      if(unlocked) btn.onclick = () => startLevel(i);
      grid.appendChild(btn);
    });
  }

  /* ---- 开始关卡 ---- */
  function startLevel(n){
    sfx.click(); lvl = n;
    const m = MONSTERS[lvl];
    document.getElementById('start-monster').textContent = m.emoji;
    document.getElementById('start-name').textContent = `第${lvl+1}关 · ${m.name}`;
    document.getElementById('start-hp').textContent = `❤️ × ${m.hp}`;
    showUI('ui-start');
    setTimeout(()=>{ showUI(null); beginGame(); }, 1800);
  }

  function beginGame(){
    const m = MONSTERS[lvl];
    monster = { emoji:m.emoji, name:m.name, hp:m.hp, maxHP:m.hp, x:W/2, y:H*.12, size:H*.09,
      color:m.color, boss:m.boss, hitFlash:0, wobble:0, deathTimer:0, alive:true };
    bombs = []; particles = [];
    playerHP = 3; combo = 0; maxCombo = 0; score = 0;
    shakeX=0; shakeY=0; shakeDur=0; flashAlpha=0;
    state = 'playing';
    nextQuestion();
  }

  /* ---- 题目管理 ---- */
  function getDifficulty(){ return lvl<5?'easy':lvl<10?'medium':'hard'; }

  function nextQuestion(){
    const pool = QUESTIONS[getDifficulty()];
    const q = pool[Math.floor(Math.random()*pool.length)];
    question = { text: q.q, correct: q.a, answered: false };
    const opts = [q.a, ...q.w].sort(()=>Math.random()-.5);
    throwBombs(opts, q.a);
  }

  function throwBombs(opts, correct){
    bombs = [];
    const cols = opts.length;
    const spacing = W / (cols+1);
    sfx.throw();
    opts.forEach((text, i) => {
      const targetX = spacing * (i+1);
      const targetY = H * (.32 + Math.random()*.08);
      bombs.push({
        text, isCorrect: text===correct,
        x: monster.x, y: monster.y + monster.size,
        tx: targetX, ty: targetY,
        vx:0, vy:0,
        radius: Math.min(W*.1, 42),
        phase: 'fly', flyT: 0, flyDur: .4 + i*.08,
        fallSpeed: (.4 + MONSTERS[lvl].speed * .25) * H/700,
        wobbleOff: Math.random()*Math.PI*2,
        alpha: 1, scale: 1, hit: false
      });
    });
  }

  /* ---- 点击处理 ---- */
  function handleTap(px, py){
    if(state !== 'playing' || question.answered) return;
    for(let i=bombs.length-1; i>=0; i--){
      const b = bombs[i];
      if(b.hit || b.phase==='dead') continue;
      const dx=px-b.x, dy=py-b.y;
      if(dx*dx+dy*dy < (b.radius+15)*(b.radius+15)){
        b.hit = true;
        question.answered = true;
        if(b.isCorrect){
          combo++; if(combo>maxCombo) maxCombo=combo;
          score += 100 * Math.max(1, combo);
          sfx.hit();
          if(combo>=3) sfx.combo(combo);
          spawnExplosion(b.x, b.y, '#4ade80', 25);
          spawnText(b.x, b.y-30, `+${100*Math.max(1,combo)}`, '#4ade80');
          if(combo>=3) spawnText(b.x, b.y-60, `🔥${combo}连击！`, '#ff6b35');
          monster.hp--;
          monster.hitFlash = .3;
          doShake(.2, 6);
          flashScreen('#4ade80', .15);
          shootBeam(b.x, b.y);
          bombs.forEach(ob=>{ if(ob!==b){ ob.phase='dead'; ob.alpha=.3; }});
          if(monster.hp <= 0){ monster.alive=false; monster.deathTimer=1.5; }
          else setTimeout(nextQuestion, 800);
        } else {
          combo = 0;
          sfx.miss();
          playerHP--;
          spawnExplosion(b.x, b.y, '#f87171', 15);
          spawnText(b.x, b.y-30, '✗', '#f87171');
          doShake(.3, 10);
          flashScreen('#f87171', .2);
          bombs.forEach(ob=>{ if(ob!==b && ob.isCorrect){ ob.phase='reveal'; }});
          bombs.forEach(ob=>{ if(ob!==b && !ob.isCorrect){ ob.phase='dead'; ob.alpha=.2; }});
          if(playerHP <= 0) setTimeout(()=>{ state='lose'; sfx.lose(); showLoseScreen(); }, 1000);
          else setTimeout(nextQuestion, 1200);
        }
        return;
      }
    }
  }

  /* ---- 粒子效果 ---- */
  function spawnExplosion(x,y,color,count){
    for(let i=0;i<count;i++){
      const a=Math.PI*2*i/count+Math.random()*.3;
      const sp=2+Math.random()*5;
      particles.push({ x,y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-2,
        size:3+Math.random()*4, color, life:1, decay:.02+Math.random()*.02, type:'circle' });
    }
  }

  function spawnText(x,y,text,color){
    particles.push({ x,y, vx:0, vy:-1.5, text, color, size:20, life:1, decay:.015, type:'text' });
  }

  function shootBeam(fx, fy){
    for(let i=0;i<8;i++){
      const t=i/8;
      const bx=fx+(monster.x-fx)*t, by=fy+(monster.y-fy)*t;
      particles.push({ x:bx, y:by, vx:(Math.random()-.5)*2, vy:(Math.random()-.5)*2,
        size:4+Math.random()*3, color:'#fbbf24', life:.6+Math.random()*.3, decay:.03, type:'circle' });
    }
  }

  function doShake(dur,amp){ shakeDur=dur; shakeX=(Math.random()-.5)*amp; shakeY=(Math.random()-.5)*amp; }
  function flashScreen(c,a){ flashColor=c; flashAlpha=a; }

  /* ---- 更新 ---- */
  function update(dt){
    if(state!=='playing') return;

    // 怪物动画
    monster.wobble += dt * 2;
    if(monster.hitFlash > 0) monster.hitFlash -= dt;
    if(!monster.alive){
      monster.deathTimer -= dt;
      if(monster.deathTimer < 1.2 && Math.random()<.3)
        spawnExplosion(monster.x+(Math.random()-.5)*monster.size, monster.y+(Math.random()-.5)*monster.size, monster.color, 5);
      if(monster.deathTimer <= 0){ state='win'; sfx.win(); showWinScreen(); }
    }

    // 炸弹更新
    bombs.forEach(b => {
      if(b.phase === 'fly'){
        b.flyT += dt;
        const t = Math.min(1, b.flyT / b.flyDur);
        const ease = 1-Math.pow(1-t,3);
        b.x = monster.x + (b.tx-monster.x)*ease;
        b.y = (monster.y+monster.size) + (b.ty-monster.y-monster.size)*ease - Math.sin(t*Math.PI)*H*.06;
        if(t >= 1) b.phase = 'fall';
      } else if(b.phase === 'fall'){
        b.y += b.fallSpeed * dt * 60;
        b.x += Math.sin(performance.now()/500 + b.wobbleOff) * .3;
        if(b.y > H + b.radius) b.phase = 'dead';
      } else if(b.phase === 'reveal'){
        b.scale = 1.1 + Math.sin(performance.now()/200)*.05;
      }
      if(b.phase === 'dead' && b.alpha > 0) b.alpha = Math.max(0, b.alpha - dt*3);
    });

    // 清理死亡炸弹
    bombs = bombs.filter(b => b.alpha > .05 || b.phase !== 'dead');

    // 粒子更新
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if(p.type==='circle') p.vy += .1;
      p.life -= p.decay;
    });
    particles = particles.filter(p => p.life > 0);

    // 震动衰减
    if(shakeDur > 0){
      shakeDur -= dt;
      shakeX *= .85; shakeY *= .85;
    } else { shakeX=0; shakeY=0; }
    if(flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt*2);
  }

  /* ---- 绘制 ---- */
  function draw(){
    cx.clearRect(0,0,W,H);
    cx.save();
    cx.translate(shakeX, shakeY);

    drawBG();
    if(state==='playing' || state==='win' || state==='lose'){
      drawMonster();
      drawBombs();
      drawParticles();
      drawHUD();
      drawQuestion();
    }

    cx.restore();

    if(flashAlpha > 0){
      cx.fillStyle = flashColor;
      cx.globalAlpha = flashAlpha;
      cx.fillRect(0,0,W,H);
      cx.globalAlpha = 1;
    }
  }

  function drawBG(){
    const g = cx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0f0c29'); g.addColorStop(.5,'#1a1a3e'); g.addColorStop(1,'#24243e');
    cx.fillStyle = g; cx.fillRect(0,0,W,H);
    cx.fillStyle = 'rgba(255,255,255,.03)';
    for(let i=0;i<20;i++){
      const sx=(i*137.5)%W, sy=(i*97.3)%H, sr=1+i%3;
      cx.beginPath(); cx.arc(sx,sy,sr,0,Math.PI*2); cx.fill();
    }
    cx.strokeStyle='rgba(255,255,255,.04)'; cx.lineWidth=1;
    cx.beginPath(); cx.moveTo(0,H*.25); cx.lineTo(W,H*.25); cx.stroke();
    cx.beginPath(); cx.moveTo(0,H*.75); cx.lineTo(W,H*.75); cx.stroke();
  }

  function drawMonster(){
    if(!monster) return;
    const m=monster, t=performance.now()/1000;
    let dy = Math.sin(m.wobble)*8;
    let sc = 1;

    if(!m.alive){
      sc = Math.max(0, m.deathTimer/1.5);
      dy += Math.sin(t*20)*5*sc;
    }

    cx.save();
    cx.translate(m.x, m.y+dy);
    cx.scale(sc, sc);

    if(m.boss){
      cx.shadowColor=m.color; cx.shadowBlur=30+Math.sin(t*3)*10;
    }

    if(m.hitFlash > 0 && Math.floor(m.hitFlash*20)%2===0){
      cx.globalAlpha=.4;
    }

    cx.font = `${m.size}px sans-serif`;
    cx.textAlign='center'; cx.textBaseline='middle';
    cx.fillText(m.emoji, 0, 0);
    cx.shadowBlur=0;

    cx.globalAlpha=1;
    cx.restore();

    // HP条
    if(m.alive){
      const bw=W*.4, bh=10, bx=W/2-bw/2, by=m.y+m.size*.7+dy;
      cx.fillStyle='rgba(255,255,255,.1)';
      roundRect(bx,by,bw,bh,5);
      const ratio=m.hp/m.maxHP;
      cx.fillStyle = ratio>.5?'#4ade80':ratio>.25?'#fbbf24':'#ef4444';
      roundRect(bx,by,bw*ratio,bh,5);
      cx.fillStyle='rgba(255,255,255,.8)'; cx.font=`bold ${12*dpr}px sans-serif`;
      cx.textAlign='center'; cx.textBaseline='middle';
      cx.fillText(`${m.hp}/${m.maxHP}`, W/2, by+bh/2);
    }
  }

  function drawBombs(){
    bombs.forEach(b => {
      if(b.alpha <= 0) return;
      cx.save();
      cx.globalAlpha = b.alpha;
      cx.translate(b.x, b.y);
      cx.scale(b.scale||1, b.scale||1);

      const r = b.radius;
      let fill, stroke;
      if(b.hit && b.isCorrect){
        fill='rgba(74,222,128,.3)'; stroke='#4ade80';
      } else if(b.hit && !b.isCorrect){
        fill='rgba(248,113,113,.3)'; stroke='#f87171';
      } else if(b.phase==='reveal'){
        fill='rgba(74,222,128,.2)'; stroke='#4ade80';
      } else {
        const colors = [
          {f:'rgba(255,107,157,.15)',s:'#FF6B9D'},
          {f:'rgba(96,165,250,.15)',s:'#60A5FA'},
          {f:'rgba(251,191,36,.15)',s:'#FBBF24'},
          {f:'rgba(192,132,252,.15)',s:'#C084FC'}
        ];
        const ci = bombs.indexOf(b) % 4;
        fill=colors[ci].f; stroke=colors[ci].s;
      }

      cx.fillStyle=fill; cx.strokeStyle=stroke; cx.lineWidth=3;
      cx.beginPath(); cx.arc(0,0,r,0,Math.PI*2); cx.fill(); cx.stroke();

      // 💣 小图标
      cx.font=`${r*.5}px sans-serif`; cx.textAlign='center'; cx.textBaseline='middle';
      cx.fillText('💣', 0, -r*.35);

      // 答案文字
      cx.fillStyle='#fff'; cx.font=`bold ${Math.min(r*.45, 18)}px "Microsoft YaHei",sans-serif`;
      cx.textAlign='center'; cx.textBaseline='middle';
      const text = b.text;
      if(text.length > 8){
        cx.font=`bold ${Math.min(r*.35, 14)}px "Microsoft YaHei",sans-serif`;
      }
      cx.fillText(text, 0, r*.15);

      cx.restore();
    });
  }

  function drawParticles(){
    particles.forEach(p => {
      cx.save();
      cx.globalAlpha = Math.max(0, p.life);
      if(p.type==='circle'){
        cx.fillStyle=p.color;
        cx.beginPath(); cx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2); cx.fill();
      } else if(p.type==='text'){
        cx.fillStyle=p.color;
        cx.font=`bold ${p.size}px "Microsoft YaHei",sans-serif`;
        cx.textAlign='center'; cx.textBaseline='middle';
        cx.fillText(p.text, p.x, p.y);
      }
      cx.restore();
    });
  }

  function drawHUD(){
    // 玩家血量
    cx.font=`${22}px sans-serif`; cx.textAlign='left'; cx.textBaseline='top';
    for(let i=0;i<3;i++){
      cx.globalAlpha = i<playerHP ? 1 : .2;
      cx.fillText('❤️', 15+i*30, H*.78);
    }
    cx.globalAlpha=1;

    // 分数
    cx.fillStyle='#fff'; cx.font=`bold ${16}px "Microsoft YaHei",sans-serif`;
    cx.textAlign='right'; cx.textBaseline='top';
    cx.fillText(`分数: ${score}`, W-15, H*.78);

    // 连击
    if(combo >= 2){
      cx.fillStyle=combo>=4?'#ff4500':'#fbbf24';
      cx.font=`bold ${18}px "Microsoft YaHei",sans-serif`;
      cx.textAlign='center'; cx.textBaseline='top';
      cx.fillText(`🔥 ${combo}连击`, W/2, H*.78);
    }

    // 关卡信息
    cx.fillStyle='rgba(255,255,255,.4)'; cx.font=`${12}px "Microsoft YaHei",sans-serif`;
    cx.textAlign='left'; cx.textBaseline='top';
    cx.fillText(`第${lvl+1}关`, 15, 12);
  }

  function drawQuestion(){
    if(!question) return;
    const qy = H*.84, qh = H*.14;
    // 背景条
    cx.fillStyle='rgba(0,0,0,.55)';
    cx.fillRect(0, qy, W, qh);
    cx.strokeStyle='rgba(255,255,255,.08)'; cx.lineWidth=1;
    cx.beginPath(); cx.moveTo(0,qy); cx.lineTo(W,qy); cx.stroke();

    // 题目文字
    cx.fillStyle='#fff'; cx.textAlign='center'; cx.textBaseline='middle';
    const fs = question.text.length > 15 ? 16 : question.text.length > 10 ? 18 : 22;
    cx.font=`bold ${fs}px "Microsoft YaHei",sans-serif`;
    cx.fillText(question.text, W/2, qy+qh/2);
  }

  function roundRect(x,y,w,h,r){
    cx.beginPath();
    cx.moveTo(x+r,y); cx.lineTo(x+w-r,y); cx.quadraticCurveTo(x+w,y,x+w,y+r);
    cx.lineTo(x+w,y+h-r); cx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    cx.lineTo(x+r,y+h); cx.quadraticCurveTo(x,y+h,x,y+h-r);
    cx.lineTo(x,y+r); cx.quadraticCurveTo(x,y,x+r,y);
    cx.closePath(); cx.fill();
  }

  /* ---- 胜负画面 ---- */
  function showWinScreen(){
    const s = playerHP; // 1-3 stars based on remaining HP
    if(!stars[lvl] || s > stars[lvl]) stars[lvl] = s;
    if(lvl+1 > maxUnlocked && lvl < MONSTERS.length-1) maxUnlocked = lvl+1;
    save();

    document.getElementById('win-title').textContent =
      MONSTERS[lvl].boss ? `🏆 BOSS击败！` : `第${lvl+1}关 胜利！`;
    let sh='';
    for(let i=0;i<3;i++) sh+=`<span class="result-star">${i<s?'⭐':'☆'}</span>`;
    document.getElementById('win-stars').innerHTML = sh;
    document.getElementById('win-msg').textContent =
      s===3?'完美通关！一滴血没掉！':s===2?'很棒！再接再厉！':'险胜！试试不掉血通关？';
    document.getElementById('btn-next').style.display = lvl < MONSTERS.length-1 ? '' : 'none';
    showUI('ui-win');
  }

  function showLoseScreen(){
    document.getElementById('lose-msg').textContent =
      `${MONSTERS[lvl].name}太强了！多练练再来！`;
    showUI('ui-lose');
  }

  function retryLevel(){ sfx.click(); startLevel(lvl); }
  function nextLevel(){ sfx.click(); if(lvl<MONSTERS.length-1) startLevel(lvl+1); else showLevels(); }

  /* ---- 主循环 ---- */
  function loop(ts){
    const dt = Math.min((ts-lastT)/1000, .05);
    lastT = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  /* ---- 初始化 ---- */
  function resize(){
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W+'px'; cv.style.height = H+'px';
    cx.setTransform(dpr,0,0,dpr,0,0);
  }

  function initInput(){
    function getPos(e){
      const r=cv.getBoundingClientRect();
      return { x:(e.clientX-r.left), y:(e.clientY-r.top) };
    }
    cv.addEventListener('click', e=>{ const p=getPos(e); handleTap(p.x,p.y); });
    cv.addEventListener('touchstart', e=>{
      e.preventDefault();
      const t=e.touches[0];
      handleTap(t.clientX - cv.getBoundingClientRect().left, t.clientY - cv.getBoundingClientRect().top);
    }, {passive:false});
  }

  function init(){
    resize(); window.addEventListener('resize', resize);
    initInput(); load();
    document.addEventListener('click', ()=>{ ac(); }, {once:true});
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { showMenu, showHelp, showLevels, startLevel, retryLevel, nextLevel };
})();
