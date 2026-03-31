const SB_URL = 'https://eipozcduwvwznyvpawue.supabase.co';

const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcG96Y2R1d3Z3em55dnBhd3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NTE2NjYsImV4cCI6MjA5MDMyNzY2Nn0.289rM7XDfxhYhQsI23iTCNz7JXKK5Oc3WyE2Whq4Ucc';

const IMG_MAX_BYTES = 800_000;

let sb        = null;
let me        = null;
let gifts     = [];
let myChoice  = null;
let cfg       = {};
let commCache = {};
let adm       = { gifts: [], choices: [], users: [], pix: [], comments: [], cfg: {} };
let pixTimer  = null;

let _sessionHandled = false;

(async function boot() {
  sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
  });

  const splashTimeout = setTimeout(() => {
    document.querySelector('.splash')?.remove();
    if (!me) renderLogin();
  }, 10_000);

  const savedIcon = localStorage.getItem('icone_salvo');
  if (savedIcon) applyAppIcon(savedIcon);

  sb.from('configuracoes').select('valor').eq('chave', 'icone_app').single()
    .then(({ data }) => { if (data?.valor) applyAppIcon(data.valor); });

  const { data: { session }, error: sessErr } = await sb.auth.getSession();
  clearTimeout(splashTimeout);

  if (sessErr) {
    console.error('[boot] getSession error:', sessErr.message);
    renderLogin();
    return;
  }

  if (session) {
    _sessionHandled = true;
    me = session.user;
    await loadProfile();
    route();
  } else {
    _sessionHandled = true;
    renderLogin();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      if (!_sessionHandled) return;
      if (me?.id === session.user.id && me?.perfil) return;
      me = session.user;
      await loadProfile();
      route();
    } else if (event === 'SIGNED_OUT') {
      resetState();
      renderLogin();
    } else if (event === 'TOKEN_REFRESHED' && session) {
      me = session.user;
    }
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !me) return;
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      me = session.user;
      if (!me.perfil) await loadProfile();
    } else {
      resetState();
      renderLogin();
      toast('Sessão expirada. Entre novamente.', 'error');
    }
  });
})();

function resetState() {
  me = null; commCache = {}; gifts = []; myChoice = null; cfg = {};
  _sessionHandled = false;
}

async function sbCall(fn) {
  try {
    return await fn();
  } catch (err) {
    return { data: null, error: err };
  }
}

function applyAppIcon(valor) {
  if (!valor) return;
  localStorage.setItem('icone_salvo', valor);
  cfg.icone_app = valor;
  const isB64 = valor.startsWith('data:');
  const mkImg = (size, r) => isB64
    ? `<img src="${valor}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:${r}px" alt="ícone">`
    : valor;

  const targets = {
    splashIcon:    mkImg(52, 10),
    brandIconEl:   mkImg(44, 8),
    sidebarIconEl: mkImg(32, 6),
  };
  Object.entries(targets).forEach(([id, html]) => {
    const el = el$(id);
    if (el) el.innerHTML = html;
  });
}

function route() {
  if (window.location.hash === '#admin' && isAdmin()) renderAdmin();
  else renderApp();
}
window.addEventListener('hashchange', () => { if (me) route(); });

function isAdmin() {
  return me?.user_metadata?.tipo === 'admin' || me?.perfil?.tipo === 'admin';
}

async function loadProfile() {
  if (!me) return;
  const { data } = await sb.from('perfis').select('*').eq('user_id', me.id).single();
  if (data) me.perfil = data;
}

async function doLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, msg: translateError(error.message) };
  me = data.user;
  await loadProfile();
  return { ok: true };
}

async function doSignup(nome, email, telefone, password) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { nome, telefone, tipo: 'usuario' } }
  });
  if (error) return { ok: false, msg: translateError(error.message) };
  me = data.user;
  await loadProfile();
  return { ok: true };
}

async function doLogout() {
  clearInterval(pixTimer);
  await sb.auth.signOut();
  resetState();
}

function translateError(msg) {
  const map = {
    'Invalid login credentials':                         'E-mail ou senha incorretos.',
    'Email not confirmed':                               'Confirme seu e-mail antes de entrar.',
    'User already registered':                           'Este e-mail já está cadastrado.',
    'Password should be at least 6 characters':         'A senha deve ter pelo menos 6 caracteres.',
    'Unable to validate email address: invalid format': 'Formato de e-mail inválido.',
    'signup is disabled':                               'Cadastro desabilitado. Contate o organizador.',
  };
  return map[msg] || msg;
}

function displayName() {
  return me?.perfil?.nome || me?.user_metadata?.nome || me?.email || '';
}

function renderLogin() {
  document.querySelector('.splash')?.remove();
  window.location.hash = '';
  el$('app').innerHTML = `
    <div class="screen-login">
      <div class="login-brand">
        <div class="grain"></div>
        <div class="brand-inner">
          <span class="brand-icon" id="brandIconEl"></span>
          <h1 id="loginTitle"></h1>
          <div class="brand-divider"></div>
          <p id="loginSubtitle"></p>
          <div class="brand-chips" id="loginChips"></div>
        </div>
      </div>
      <div class="login-form-panel">
        <div class="login-box">
          <div class="login-box-title">Bem-vindo!</div>
          <div class="login-box-sub">Entre na sua conta ou crie uma nova</div>
          <div class="tab-row">
            <button class="tab-btn active" id="tabBtnLogin"  onclick="switchTab('login')">Entrar</button>
            <button class="tab-btn"        id="tabBtnSignup" onclick="switchTab('signup')">Criar conta</button>
          </div>
          <div class="tab-panel active" id="panelLogin">
            <div class="alert alert-error" id="loginErr"></div>
            <div class="field">
              <label>E-mail</label>
              <input type="email" id="loginEmail" placeholder="seu@email.com" autocomplete="email">
            </div>
            <div class="field">
              <label>Senha</label>
              <div class="pass-wrap">
                <input type="password" id="loginPass" placeholder="••••••••" autocomplete="current-password"
                  onkeydown="if(event.key==='Enter') onLogin()">
                <button type="button" class="pass-toggle" onclick="togglePass('loginPass',this)">👁</button>
              </div>
            </div>
            <button class="btn btn-primary btn-full" id="btnLogin" onclick="onLogin()">Entrar</button>
          </div>
          <div class="tab-panel" id="panelSignup">
            <div class="alert alert-error"   id="signupErr"></div>
            <div class="alert alert-success" id="signupOk"></div>
            <div class="field">
              <label>Nome completo</label>
              <input type="text" id="signupNome" placeholder="Seu nome completo" autocomplete="name">
            </div>
            <div class="field">
              <label>E-mail</label>
              <input type="email" id="signupEmail" placeholder="seu@email.com" autocomplete="email">
            </div>
            <div class="field">
              <label>Telefone</label>
              <input type="tel" id="signupTel" placeholder="(11) 99999-9999">
            </div>
            <div class="field">
              <label>Senha</label>
              <div class="pass-wrap">
                <input type="password" id="signupPass" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
                <button type="button" class="pass-toggle" onclick="togglePass('signupPass',this)">👁</button>
              </div>
            </div>
            <div class="field">
              <label>Confirmar senha</label>
              <input type="password" id="signupConf" placeholder="Repita a senha" autocomplete="new-password"
                onkeydown="if(event.key==='Enter') onSignup()">
            </div>
            <button class="btn btn-primary btn-full" id="btnSignup" onclick="onSignup()">Criar conta</button>
          </div>
        </div>
      </div>
    </div>`;

  sb.from('configuracoes').select('chave, valor').then(({ data }) => {
    if (!data) return;
    const c = Object.fromEntries(data.map(r => [r.chave, r.valor]));
    if (c.evento_titulo) {
      const tEl = el$('loginTitle');
      if (tEl) tEl.innerHTML = c.evento_titulo.replace(/(\S+)$/, '<em>$1</em>');
    }
    if (c.login_subtitulo) setTextIfEl('loginSubtitle', c.login_subtitulo);
    if (c.icone_app) applyAppIcon(c.icone_app);
    const chipsEl = el$('loginChips');
    if (chipsEl) {
      let chips = ['🤍 Com muito amor', '✨ Momentos especiais', '👶 Nova vida'];
      if (c.chips_login) {
        try {
          const arr = JSON.parse(c.chips_login);
          if (Array.isArray(arr) && arr.length) chips = arr;
        } catch {}
      }
      chipsEl.innerHTML = chips.map(chip => `<span class="chip">${esc(chip)}</span>`).join('');
    }
  });
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  el$('tabBtnLogin') .classList.toggle('active',  isLogin);
  el$('tabBtnSignup').classList.toggle('active', !isLogin);
  el$('panelLogin')  .classList.toggle('active',  isLogin);
  el$('panelSignup') .classList.toggle('active', !isLogin);
}

async function onLogin() {
  const email = val('loginEmail'), pass = val('loginPass');
  const errEl = el$('loginErr');
  errEl.classList.remove('show');
  if (!email || !pass) { showAlert(errEl, 'Preencha todos os campos.'); return; }
  setBtn('btnLogin', true, 'Entrando...');
  const { ok, msg } = await doLogin(email, pass);
  setBtn('btnLogin', false, 'Entrar');
  if (ok) route(); else showAlert(errEl, msg);
}

async function onSignup() {
  const nome  = val('signupNome'), email = val('signupEmail'),
        tel   = val('signupTel'),  pass  = val('signupPass'),
        conf  = val('signupConf');
  const errEl = el$('signupErr'), okEl = el$('signupOk');
  errEl.classList.remove('show'); okEl.classList.remove('show');
  if (!nome || !email || !tel || !pass) { showAlert(errEl, 'Preencha todos os campos.'); return; }
  if (pass !== conf)   { showAlert(errEl, 'As senhas não coincidem.'); return; }
  if (pass.length < 6) { showAlert(errEl, 'A senha deve ter pelo menos 6 caracteres.'); return; }
  setBtn('btnSignup', true, 'Criando conta...');
  const { ok, msg } = await doSignup(nome, email, tel, pass);
  setBtn('btnSignup', false, 'Criar conta');
  if (ok) { showAlert(okEl, 'Conta criada! Redirecionando...'); setTimeout(() => route(), 1400); }
  else showAlert(errEl, msg);
}

async function renderApp() {
  document.querySelector('.splash')?.remove();
  window.location.hash = '';
  const name = displayName();

  el$('app').innerHTML = `
    <div class="screen-app">
      <div class="topbar">
        <div class="topbar-user">
          <div class="avatar">${name[0]?.toUpperCase() || '?'}</div>
          <div class="topbar-name">Olá, <strong>${esc(name.split(' ')[0])}</strong></div>
          <span class="chosen-badge hidden" id="chosenBadge">🎁 Presente escolhido</span>
        </div>
        <div class="topbar-actions" id="topbarActions"></div>
      </div>
      <div class="hero">
        <div class="hero-tag">✨ Lista de presentes</div>
        <h1 id="heroTitle">Carregando...</h1>
        <p class="hero-desc" id="heroDesc"></p>
      </div>
      <div class="event-bar" id="eventBar">
        <div class="event-item"><div class="event-label">📅 Data</div><div class="event-value" id="evDate">—</div></div>
        <div class="event-item"><div class="event-label">📍 Local</div><div class="event-value" id="evLocal">—</div></div>
        <div class="event-item"><div class="event-label">⏳ Faltam</div><div class="event-value" id="evCountdown">—</div></div>
      </div>
      <div class="grid-wrap">
        <div class="section-head">
          <div class="section-title">Escolha um presente 🎁</div>
          <div class="section-count" id="giftCount"></div>
        </div>
        <div class="gifts-grid" id="giftsGrid">${skeletons(6)}</div>
      </div>
    </div>

    <button class="pix-fab" id="pixFab" onclick="openPixModal()" title="Contribuir via PIX" style="display:none">
      <span class="pix-fab-icon">💸</span>
      <span class="pix-fab-label">PIX</span>
    </button>

    <div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
      <div class="modal">
        <button class="modal-close" onclick="closeModal()">×</button>
        <h3 id="modalTitle"></h3>
        <p class="modal-sub" id="modalSub"></p>
        <div id="modalBody"></div>
      </div>
    </div>

    <div class="modal-overlay" id="modalPix" onclick="closePixModal(event)">
      <div class="modal">
        <button class="modal-close" onclick="closePixModal()">×</button>
        <h3>💸 Contribuir via PIX</h3>
        <p class="modal-sub">Gere um QR Code para pagamento rápido</p>
        <div id="pixModalBody"></div>
      </div>
    </div>`;

  el$('topbarActions').innerHTML = isAdmin()
    ? `<button class="btn-outline" onclick="goAdmin()">⚙️ Admin</button>
       <button class="btn-outline" onclick="doLogout().then(()=>renderLogin())">Sair</button>`
    : `<button class="btn-outline" onclick="doLogout().then(()=>renderLogin())">Sair</button>`;

  const [cfgRes, giftsRes, choiceRes] = await Promise.allSettled([
    sbCall(() => sb.from('configuracoes').select('chave, valor')),
    sbCall(() => sb.from('presentes').select('*').eq('status', 'ativo').order('ordem')),
    sbCall(() => sb.from('escolhas').select('*, presentes(titulo)').eq('usuario_id', me.id).maybeSingle())
  ]);

  const cfgData    = cfgRes.status    === 'fulfilled' ? cfgRes.value.data    : null;
  const giftsData  = giftsRes.status  === 'fulfilled' ? giftsRes.value.data  : null;
  const choiceData = choiceRes.status === 'fulfilled' ? choiceRes.value.data : null;

  if (cfgData) cfgData.forEach(r => cfg[r.chave] = r.valor);

  el$('pixFab').style.display = cfg.pix_chave ? 'flex' : 'none';

  const titulo = cfg.evento_titulo || 'Chá de Bebê';
  const hEl = el$('heroTitle');
  if (hEl) hEl.innerHTML = titulo.replace(/(\S+)$/, '<em>$1</em>');
  setTextIfEl('heroDesc', cfg.evento_descricao || '');

  if (cfg.evento_data) {
    const d = new Date(cfg.evento_data + 'T12:00:00');
    setTextIfEl('evDate', d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }));
    const today = new Date(); today.setHours(0,0,0,0);
    const evt   = new Date(cfg.evento_data + 'T12:00:00'); evt.setHours(0,0,0,0);
    const diff  = Math.round((evt - today) / 86400000);
    setTextIfEl('evCountdown',
      diff > 1  ? `${diff} dias`  :
      diff === 1 ? 'Amanhã! 🎉'  :
      diff === 0 ? 'Hoje! 🎉'    : 'Realizado ✓');
  }
  setTextIfEl('evLocal', cfg.evento_local || '—');

  const hero = document.querySelector('.hero');
  if (hero) {
    if (cfg.imagem_capa_base64) {
      hero.style.backgroundImage = `url(${cfg.imagem_capa_base64})`;
      hero.classList.add('hero-has-cover');
    } else {
      hero.style.backgroundImage = '';
      hero.classList.remove('hero-has-cover');
    }
  }

  gifts    = giftsData  || [];
  myChoice = choiceData || null;
  setTextIfEl('giftCount', gifts.length ? `${gifts.length} itens` : '');
  if (myChoice) el$('chosenBadge')?.classList.remove('hidden');

  await renderGrid();
}

async function renderGrid() {
  const grid = el$('giftsGrid');
  if (!grid) return;

  if (!gifts.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:64px 20px;color:var(--muted)">
      <div style="font-size:48px;margin-bottom:16px">🎁</div>
      <div style="font-size:15px">Nenhum presente disponível no momento.</div>
    </div>`;
    return;
  }

  const presentIds = gifts.map(g => g.id);
  let commMap = {};

  const needFetch = presentIds.filter(id => !commCache[id]);

  if (needFetch.length > 0) {
    const { data: allComments, error } = await sb
      .from('comentarios')
      .select('id, comentario, criado_em, usuario_id, presente_id, perfis(nome), reacoes(id, emoji, usuario_id)')
      .in('presente_id', needFetch)
      .order('criado_em');

    if (!error && allComments) {
      allComments.forEach(c => {
        if (!commCache[c.presente_id]) commCache[c.presente_id] = [];
        commCache[c.presente_id].push(c);
      });
    }
    needFetch.forEach(id => { if (!commCache[id]) commCache[id] = []; });
  }

  presentIds.forEach(id => { commMap[id] = commCache[id] || []; });

  grid.innerHTML = gifts.map(g => buildCard(g, commMap[g.id] || [])).join('');
  bindGridEvents();
}

function buildCard(g, comments) {
  const sold   = g.quantidade_restante <= 0;
  const isMine = myChoice?.presente_id === g.id;
  const imgSrc = g.imagem_base64 || g.imagem_url || '';

  const commHtml = comments.map(c => {
    const reactionMap = {};
    (c.reacoes || []).forEach(r => {
      (reactionMap[r.emoji] ??= []).push(r.usuario_id);
    });
    const reactHtml = Object.entries(reactionMap).map(([emoji, users]) =>
      `<button class="reaction-btn ${users.includes(me.id) ? 'active' : ''}" data-cid="${c.id}" data-emoji="${emoji}">${emoji} ${users.length}</button>`
    ).join('');
    const popoverHtml = `
      <div class="reaction-popover" id="popover-${c.id}">
        ${['❤️','😍','🥰'].map(e =>
          `<button class="popover-emoji reaction-btn" data-cid="${c.id}" data-emoji="${e}">${e}</button>`
        ).join('')}
      </div>`;
    return `
      <div class="comment">
        <div class="comment-author">${esc(c.perfis?.nome || 'Anônimo')}
          <span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:6px">${fmtDate(c.criado_em)}</span>
        </div>
        <div class="comment-text">${esc(c.comentario)}</div>
        <div class="comment-reactions">
          ${reactHtml}
          <div class="reaction-picker-wrap">
            <button class="btn-add-reaction" data-toggle="${c.id}">😀 <span style="font-size:14px;font-weight:300">+</span></button>
            ${popoverHtml}
          </div>
        </div>
      </div>`;
  }).join('');

  return `
  <div class="gift-card ${sold ? 'esgotado' : ''}" id="gc-${g.id}">
    <div class="card-img">
      ${imgSrc ? `<img src="${imgSrc}" alt="${esc(g.titulo)}" loading="lazy">` : `<div class="card-img-icon">🎁</div>`}
      ${sold   ? `<span class="card-badge">Esgotado</span>` : ''}
      ${isMine ? `<span class="card-badge mine">Meu presente ✓</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-title">${esc(g.titulo)}</div>
      ${g.descricao ? `<div class="card-desc">${esc(g.descricao)}</div>` : ''}
      ${g.preco     ? `<div class="card-price">${money(g.preco)}</div>` : ''}
      <div class="card-stock">
        ${(() => {
          const escolhido = g.quantidade_max - g.quantidade_restante;
          if (g.quantidade_restante <= 0) return '🎁 Todos escolhidos';
          if (escolhido > 0) return `📦 ${g.quantidade_restante} de ${g.quantidade_max} disponível · ${escolhido} escolhido${escolhido !== 1 ? 's' : ''}`;
          return `📦 ${g.quantidade_restante} de ${g.quantidade_max} disponível`;
        })()}
      </div>
      ${isMine ? `<div class="card-chosen-msg">✅ Você escolheu este presente!${myChoice.tipo_pagamento === 'pix' ? '<br><small>Pagamento via PIX</small>' : ''}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
        ${!isMine && !sold && !myChoice
          ? `<button class="btn btn-primary btn-full" data-action="choose"
               data-id="${g.id}" data-title="${esc(g.titulo)}" data-price="${g.preco || 0}">
               🎁 Quero este presente
             </button>`
          : ''}
        ${g.link_compra
          ? `<a href="${g.link_compra}" target="_blank" rel="noopener"
               style="text-align:center;font-size:12px;color:var(--muted);text-decoration:none;padding:2px 0">
               Ver onde comprar ↗</a>`
          : ''}
      </div>
    </div>
    <div class="comments-section">
      <div class="comments-body" id="cb-${g.id}">${commHtml}
        <div class="comment-input-row">
          <input class="comment-input" id="ci-${g.id}" placeholder="Deixe um comentário...">
          <button class="btn-send" data-action="comment" data-id="${g.id}">Enviar</button>
        </div>
      </div>
      <div class="comments-toggle" data-pid="${g.id}">
        💬 ${comments.length} comentário${comments.length !== 1 ? 's' : ''}
        <span class="chevron">▾</span>
      </div>
    </div>
  </div>`;
}

function bindGridEvents() {
  document.querySelectorAll('[data-action="choose"]').forEach(btn => {
    btn.addEventListener('click', () =>
      openChoiceModal(btn.dataset.id, btn.dataset.title, parseFloat(btn.dataset.price)));
  });
  document.querySelectorAll('.comments-toggle').forEach(el => {
    el.addEventListener('click', () => el$('cb-' + el.dataset.pid)?.classList.toggle('open'));
  });
  document.querySelectorAll('[data-action="comment"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = el$('ci-' + btn.dataset.id);
      if (input?.value.trim()) submitComment(btn.dataset.id, input.value.trim());
    });
  });
  document.querySelectorAll('.comment-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inp.value.trim())
        submitComment(inp.id.replace('ci-', ''), inp.value.trim());
    });
  });

  document.querySelectorAll('.btn-add-reaction').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.reaction-popover.show').forEach(p => {
        if (p.id !== 'popover-' + btn.dataset.toggle) p.classList.remove('show');
      });
      el$('popover-' + btn.dataset.toggle)?.classList.toggle('show');
    });
  });
  if (!window._popoverListenerAdded) {
    document.addEventListener('click', e => {
      if (!e.target.closest('.reaction-picker-wrap'))
        document.querySelectorAll('.reaction-popover.show').forEach(p => p.classList.remove('show'));
    });
    window._popoverListenerAdded = true;
  }
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleReaction(btn.dataset.cid, btn.dataset.emoji));
  });
}

async function submitComment(pid, text) {
  const input = el$('ci-' + pid);
  if (input) input.value = '';
  const { error } = await sbCall(() => sb.from('comentarios').insert({
    presente_id: pid, usuario_id: me.id, comentario: text
  }));
  if (error) { toast('Erro ao enviar comentário.', 'error'); return; }

  delete commCache[pid];

  const wasOpen = el$('cb-' + pid)?.classList.contains('open');
  await renderGrid();
  if (wasOpen) el$('cb-' + pid)?.classList.add('open');
}

async function toggleReaction(cid, emoji) {
  const { data } = await sb.from('reacoes').select('id, comentarios(presente_id)')
    .eq('comentario_id', cid).eq('usuario_id', me.id).eq('emoji', emoji).maybeSingle();

  if (data) await sb.from('reacoes').delete().eq('id', data.id);
  else      await sb.from('reacoes').insert({ comentario_id: cid, usuario_id: me.id, emoji });

  const pidToInvalidate = data?.comentarios?.presente_id
    ?? Object.keys(commCache).find(pid =>
        commCache[pid]?.some(c => c.id === cid)
      );
  if (pidToInvalidate) delete commCache[pidToInvalidate];

  const abertos = Array.from(document.querySelectorAll('.comments-body.open')).map(el => el.id);
  await renderGrid();
  abertos.forEach(id => el$(id)?.classList.add('open'));
}

function openChoiceModal(gid, title, price) {
  el$('modalTitle').textContent = title;
  el$('modalSub').textContent   = 'Confirme sua escolha';
  el$('modalBody').innerHTML = `
    <div class="choice-option selected">
      <h4>🎁 Comprar o presente</h4>
      <p>${price ? money(price) : 'Sem valor definido'} — você compra e traz no dia do chá</p>
    </div>
    <div class="field" style="margin-top:16px">
      <label>Mensagem para os pais (opcional)</label>
      <textarea id="choiceMsg" rows="2" placeholder="Uma mensagem especial..."></textarea>
    </div>
    <button class="btn btn-primary btn-full" id="btnConfirm" style="margin-top:6px">Confirmar escolha</button>`;

  el$('btnConfirm').addEventListener('click', async () => {
    setBtn('btnConfirm', true, 'Confirmando...');
    await confirmChoice(gid, 'presente', price, val('choiceMsg'));
  });
  el$('modalOverlay').classList.add('open');
}

async function confirmChoice(gid, tipo, valor, mensagem) {
  const payload = {
    presente_id: gid, usuario_id: me.id,
    tipo_pagamento: tipo, quantidade: 1,
    ...(valor    ? { valor }    : {}),
    ...(mensagem ? { mensagem } : {})
  };
  const { error } = await sbCall(() => sb.from('escolhas').insert(payload));

  if (error) {
    const isDuplicate = error.code === '23505' || /unique|duplicate/i.test(error.message);
    const isEsgotado  = /esgotado|estoque/i.test(error.message);
    toast(
      isDuplicate ? 'Você já escolheu um presente!' :
      isEsgotado  ? 'Este presente acabou de ser escolhido por outro convidado.' :
      'Erro: ' + error.message,
      'error'
    );
    setBtn('btnConfirm', false, 'Confirmar escolha');
    return;
  }

  closeModal();
  toast('Presente escolhido com sucesso! 🎉', 'success');

  const [gr, cr] = await Promise.allSettled([
    sb.from('presentes').select('*').eq('status', 'ativo').order('ordem'),
    sb.from('escolhas').select('*, presentes(titulo)').eq('usuario_id', me.id).maybeSingle()
  ]);
  gifts    = gr.status === 'fulfilled'  ? (gr.value.data  || []) : gifts;
  myChoice = cr.status === 'fulfilled'  ? (cr.value.data  || null) : myChoice;
  if (myChoice) el$('chosenBadge')?.classList.remove('hidden');
  await renderGrid();
}

function closeModal(e) {
  if (e && e.type === 'click' && e.target !== el$('modalOverlay')) return;
  el$('modalOverlay')?.classList.remove('open');
}

function buildPixPayload(basePayload, amount) {
  let payload = basePayload.replace(/6304.{4}$/, '').replace(/54\d{2}\d+(\.\d+)?/, '');
  if (amount) {
    const v = Number(amount).toFixed(2);
    payload += '54' + String(v.length).padStart(2, '0') + v;
  }
  payload += '6304';
  return payload + crc16(payload);
}

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++)
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function openPixModal() {
  if (!cfg.pix_chave) { toast('Chave PIX não configurada.', 'error'); return; }

  clearInterval(pixTimer);

  el$('pixModalBody').innerHTML = `
    <div class="pix-step" id="pixStepValor">
      <div class="pix-valor-card">
        <div class="pix-valor-label">Quanto você quer contribuir?</div>
        <div class="pix-valor-display-input">
          <span class="pix-currency-big">R$</span>
          <input type="text" id="pixValor" inputmode="numeric" placeholder="0,00"
            class="pix-valor-input-big"
            oninput="pixMascaraDinheiro(this)"
            onkeydown="if(event.key==='Enter') gerarQrCode()">
        </div>
        <div class="pix-quick-btns">
          ${[20,50,100,200].map(v =>
            `<button class="pix-quick" data-val="${v}" onclick="pixSetValor(${v})">${money(v)}</button>`
          ).join('')}
        </div>
      </div>
      <div class="field" style="margin-top:16px">
        <label>Mensagem (opcional)</label>
        <input type="text" id="pixMsg" placeholder="Uma mensagem carinhosa...">
      </div>
      <button class="btn btn-pix btn-full" id="btnGerarQr" onclick="gerarQrCode()">
        💸 Gerar QR Code PIX
      </button>
    </div>

    <div class="pix-step hidden" id="pixStepQr">
      <div class="pix-qr-area">
        <div class="pix-timer-bar">
          <span class="pix-timer-label">⏳ Expira em</span>
          <span class="pix-timer-count" id="pixTimerCount">30:00</span>
        </div>
        <div class="pix-qr-box" id="pixQrBox"></div>
        <div class="pix-valor-display" id="pixValorDisplay"></div>
        ${cfg.pix_nome ? `<div style="text-align:center;font-size:12px;color:var(--muted);margin-top:-4px">para <strong>${esc(cfg.pix_nome)}</strong></div>` : ''}
        <div class="pix-chave-row">
          <span class="pix-chave-label">PIX Copia e Cola</span>
          <button class="btn-copy" id="btnCopyPix" onclick="copyPix()">📋 Copiar código</button>
        </div>
        <div class="pix-timer-expired hidden" id="pixExpired">
          <div style="font-size:32px">⏰</div>
          <div>QR Code expirado</div>
          <button class="btn btn-ghost" onclick="openPixModal()">Gerar novo</button>
        </div>
      </div>
    </div>`;

  el$('modalPix').classList.add('open');
  setTimeout(() => el$('pixValor')?.focus(), 100);
}

function pixMascaraDinheiro(input) {
  let raw = input.value.replace(/\D/g, '');
  if (!raw) { input.value = ''; return; }
  raw = raw.replace(/^0+/, '') || '0';
  while (raw.length < 3) raw = '0' + raw;
  const reais    = raw.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = raw.slice(-2);
  input.value = reais + ',' + centavos;
  const v = pixGetValor();
  document.querySelectorAll('.pix-quick').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.val) === v);
  });
}

function pixGetValor() {
  const raw = el$('pixValor')?.value || '';
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
}

function pixSetValor(v) {
  const cents    = String(Math.round(v * 100)).padStart(3, '0');
  const reais    = cents.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.') || '0';
  const centavos = cents.slice(-2);
  const input = el$('pixValor');
  if (input) input.value = reais + ',' + centavos;
  document.querySelectorAll('.pix-quick').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.val) === v);
  });
}

async function gerarQrCode() {
  const valor = pixGetValor();
  if (!valor || valor < 0.01) { toast('Informe um valor válido.', 'error'); return; }
  if (!cfg.pix_chave || cfg.pix_chave.length < 20) { toast('Código PIX base inválido.', 'error'); return; }

  setBtn('btnGerarQr', true, 'Gerando...');

  const qrData = buildPixPayload(cfg.pix_chave, valor);
  const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`;
  const msg    = val('pixMsg');

  const { error } = await sbCall(() => sb.from('contribuicoes_pix').insert({
    usuario_id: me.id, valor, mensagem: msg || null, status: 'pendente'
  }));
  if (error && !/does not exist/i.test(error.message)) console.warn('[pix insert]', error.message);

  setBtn('btnGerarQr', false, '✨ Gerar QR Code');
  el$('pixStepValor').classList.add('hidden');
  el$('pixStepQr').classList.remove('hidden');
  el$('pixQrBox').innerHTML = `<img src="${qrUrl}" alt="QR Code PIX" style="width:220px;height:220px;border-radius:12px">`;
  setTextIfEl('pixValorDisplay', money(valor));
  el$('btnCopyPix').dataset.payload = qrData;
  startPixTimer();
}

function startPixTimer() {
  clearInterval(pixTimer);
  let secs = 1800;
  const tick = () => {
    setTextIfEl('pixTimerCount',
      `${String(Math.floor(secs / 60)).padStart(2,'0')}:${String(secs % 60).padStart(2,'0')}`);
    if (secs <= 0) {
      clearInterval(pixTimer);
      pixTimer = null;
      el$('pixQrBox')?.classList.add('pix-expired-blur');
      el$('pixExpired')?.classList.remove('hidden');
      el$('btnCopyPix')?.setAttribute('disabled', 'true');
      return;
    }
    secs--;
  };
  tick();
  pixTimer = setInterval(tick, 1000);
}

function copyPix() {
  const texto = el$('btnCopyPix')?.dataset?.payload || '';
  if (!texto) { toast('Código PIX indisponível.', 'error'); return; }
  const done = () => {
    const btn = el$('btnCopyPix');
    if (btn) { const orig = btn.innerHTML; btn.innerHTML = '✅ Copiado!'; setTimeout(() => btn.innerHTML = orig, 2000); }
    toast('Copiado!', 'success');
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).then(done).catch(() => fallbackCopy(texto, done));
  } else {
    fallbackCopy(texto, done);
  }
}

function fallbackCopy(text, onSuccess) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-999999px;top:-999999px';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { if (document.execCommand('copy')) onSuccess(); else toast('Não foi possível copiar.', 'error'); }
  catch { toast('Não foi possível copiar.', 'error'); }
  document.body.removeChild(ta);
}

function closePixModal(e) {
  if (e && e.type === 'click' && e.target !== el$('modalPix')) return;
  clearInterval(pixTimer);
  pixTimer = null;
  el$('modalPix')?.classList.remove('open');
}

function goAdmin() { window.location.hash = '#admin'; renderAdmin(); }

async function renderAdmin() {
  if (!isAdmin()) { renderApp(); return; }
  document.querySelector('.splash')?.remove();

  el$('app').innerHTML = `
    <div class="screen-admin">
      <aside class="sidebar" id="adminSidebar">
        <div class="sidebar-brand">
          <div class="sidebar-brand-icon" id="sidebarIconEl"></div>
          <div><h2>Configurações do Site</h2><span>Painel Admin</span></div>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-item active" data-panel="dashboard"><span class="nav-icon">📊</span>Dashboard</button>
          <button class="nav-item" data-panel="presentes"><span class="nav-icon">🎁</span>Presentes</button>
          <button class="nav-item" data-panel="escolhas"><span class="nav-icon">📋</span>Escolhas</button>
          <button class="nav-item" data-panel="pix"><span class="nav-icon">💸</span>PIX</button>
          <button class="nav-item" data-panel="convidados"><span class="nav-icon">👥</span>Convidados</button>
          <button class="nav-item" data-panel="comentarios"><span class="nav-icon">💬</span>Comentários</button>
          <button class="nav-item" data-panel="configuracoes"><span class="nav-icon">⚙️</span>Configurações</button>
        </nav>
        <div class="sidebar-footer">
          <button class="nav-item" onclick="backToSite()"><span class="nav-icon">🌐</span>Ver site</button>
          <button class="nav-item" onclick="doLogout().then(()=>renderLogin())"><span class="nav-icon">🚪</span>Sair</button>
        </div>
      </aside>
      <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>
      <main class="admin-main">
        <div class="admin-topbar">
          <div style="display:flex;align-items:center;gap:14px">
            <button class="sidebar-toggle" onclick="toggleSidebar()">☰</button>
            <h1 class="admin-title" id="admTitle">Dashboard</h1>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="admin-user-name">${esc(displayName())}</span>
          </div>
        </div>
        <div class="admin-content">

          <div class="admin-panel active" id="ap-dashboard">
            <div class="stats-grid">
              <div class="stat-card"><div class="stat-icon">🎁</div><div class="stat-body"><div class="stat-label">Presentes</div><div class="stat-value" id="stGifts">—</div></div></div>
              <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-body"><div class="stat-label">Escolhas</div><div class="stat-value" id="stChoices">—</div></div></div>
              <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-body"><div class="stat-label">Convidados</div><div class="stat-value" id="stGuests">—</div></div></div>
              <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-body"><div class="stat-label">Valor total</div><div class="stat-value" id="stValue">—</div></div></div>
              <div class="stat-card c-pix"><div class="stat-icon">💸</div><div class="stat-body"><div class="stat-label">PIX recebido</div><div class="stat-value" id="stPix">—</div></div></div>
            </div>
            <div class="a-card">
              <div class="a-card-title">Atividade recente</div>
              <div id="dashActivity"></div>
            </div>
          </div>

          <div class="admin-panel" id="ap-presentes">
            <div class="panel-header-row">
              <h2 class="panel-title">🎁 Presentes</h2>
              <button class="btn btn-primary" onclick="openGiftForm()">+ Novo Presente</button>
            </div>
            <div class="presents-admin-grid" id="admGiftsGrid"></div>
          </div>

          <div class="admin-panel" id="ap-escolhas">
            <div class="panel-header-row">
              <h2 class="panel-title">📋 Escolhas</h2>
            </div>
            <div class="a-card">
              <div class="table-wrap">
                <table id="tChoices">
                  <thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Presente</th><th>Tipo</th><th>Valor</th><th>Mensagem</th><th>Data</th><th>Ações</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="admin-panel" id="ap-pix">
            <div class="panel-header-row">
              <h2 class="panel-title">💸 Contribuições PIX</h2>
              <span id="pixTotalLabel" style="font-size:13px;color:var(--muted)"></span>
            </div>
            <div class="a-card">
              <div class="table-wrap">
                <table id="tPix">
                  <thead><tr><th>Convidado</th><th>E-mail</th><th>Valor</th><th>Mensagem</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="admin-panel" id="ap-convidados">
            <div class="panel-header-row">
              <h2 class="panel-title">👥 Convidados</h2>
              <span id="guestCount" style="font-size:13px;color:var(--muted)"></span>
            </div>
            <div class="a-card">
              <div class="table-wrap">
                <table id="tGuests">
                  <thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Tipo</th><th>Presente escolhido</th><th>Cadastro</th><th>Ações</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="admin-panel" id="ap-configuracoes">
            <div class="cfg-sections">
              <div class="cfg-section">
                <div class="cfg-section-header"><div class="cfg-section-icon">📅</div><div class="cfg-section-title">Informações do Evento</div></div>
                <div class="cfg-section-body">
                  <div class="field"><label>Título do evento</label><input type="text" id="cfgTitle" placeholder="Ex: Chá de Bebê da Maria"></div>
                  <div class="cfg-grid-2">
                    <div class="field"><label>Data do evento</label><input type="date" id="cfgDate"></div>
                    <div class="field"><label>Local</label><input type="text" id="cfgLocal" placeholder="Ex: R. das Flores, 123"></div>
                  </div>
                  <div class="field"><label>Descrição</label><textarea id="cfgDesc" rows="3" placeholder="Uma mensagem especial para os convidados..."></textarea></div>
                </div>
              </div>
              <div class="cfg-section">
                <div class="cfg-section-header"><div class="cfg-section-icon">🔐</div><div class="cfg-section-title">Tela de Boas-vindas</div></div>
                <div class="cfg-section-body">
                  <div class="field"><label>Subtítulo</label><textarea id="cfgLoginSubtitle" rows="2" placeholder="Ex: Venha celebrar esse momento especial..."></textarea></div>
                  <div class="field"><label>Chips de destaque <small style="color:var(--muted)">(um por linha)</small></label><textarea id="cfgChips" rows="4" placeholder="🤍 Com muito amor&#10;✨ Momentos especiais&#10;👶 Nova vida"></textarea></div>
                </div>
              </div>
              <div class="cfg-section">
                <div class="cfg-section-header"><div class="cfg-section-icon">💸</div><div class="cfg-section-title">Configurações PIX</div></div>
                <div class="cfg-section-body">
                  <div class="field"><label>Código PIX "Copia e Cola" Base</label><input type="text" id="cfgPix" placeholder="Cole o código completo aqui"></div>
                  <div class="cfg-grid-2">
                    <div class="field"><label>Nome do beneficiário</label><input type="text" id="cfgPixName" placeholder="Ex: Maria Silva"></div>
                    <div class="field"><label>E-mail admin (notificações)</label><input type="email" id="cfgAdminEmail" placeholder="seu@email.com"></div>
                  </div>
                </div>
              </div>
              <div class="cfg-section">
                <div class="cfg-section-header"><div class="cfg-section-icon">🎨</div><div class="cfg-section-title">Ícone do App</div></div>
                <div class="cfg-section-body">
                  <div class="icon-config-box">
                    <div class="icon-preview-big" id="iconPreviewBig">🍼
                      <button class="icon-remove-btn" title="Remover ícone" onclick="admRemoveIcon()" style="display:none" id="btnRemoveIcon">×</button>
                    </div>
                    <div class="icon-config-opts">
                      <div class="field" style="margin-bottom:10px">
                        <label style="font-size:11px">Emoji (cole aqui)</label>
                        <input type="text" id="cfgIconEmoji" placeholder="Ex: 🐣 🍼 🌸 💛" maxlength="8" oninput="previewIconInput(this.value)">
                      </div>
                      <div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-align:center">— ou —</div>
                      <div class="upload-area" style="padding:12px" onclick="el$('cfgIconFile').click()">
                        <div style="font-size:18px">📷</div>
                        <p style="font-size:11px;margin:0">Carregar imagem</p>
                        <input type="file" id="cfgIconFile" accept="image/*" style="display:none" onchange="previewIconFile(this)">
                      </div>
                      <input type="hidden" id="cfgIconBase64">
                    </div>
                  </div>
                </div>
              </div>
              <div class="cfg-section">
                <div class="cfg-section-header"><div class="cfg-section-icon">🖼️</div><div class="cfg-section-title">Imagem de Capa</div></div>
                <div class="cfg-section-body">
                  <div class="upload-area" onclick="el$('cfgCover').click()" id="cfgCoverUploadArea">
                    <div class="upload-icon">🏞️</div>
                    <p>Clique para selecionar uma imagem de capa <small style="color:var(--muted)">(máx. 800KB)</small></p>
                    <input type="file" id="cfgCover" accept="image/*" style="display:none">
                  </div>
                  <div class="img-preview-wrap" id="cfgCoverWrap" style="display:none">
                    <img id="cfgCoverPrev" class="img-preview" style="display:block;margin-top:0">
                    <button class="btn-remove-img" onclick="admRemoveCover()">🗑️ Remover capa</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="cfg-save-bar">
              <button class="btn btn-primary" id="btnSaveCfg" style="min-width:180px">💾 Salvar Configurações</button>
            </div>
          </div>

          <div class="admin-panel" id="ap-comentarios">
            <div class="panel-header-row">
              <h2 class="panel-title">💬 Comentários</h2>
              <button class="btn btn-danger" id="btnDeleteAllComments">🗑️ Excluir Todos</button>
            </div>
            <div class="a-card">
              <div class="table-wrap">
                <table id="tComments">
                  <thead><tr><th>Presente</th><th>Autor</th><th>Comentário</th><th>Data</th><th>Ações</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>

    <div class="modal-overlay" id="modalGift" onclick="closeGiftModal(event)">
      <div class="modal modal-lg">
        <button class="modal-close" onclick="closeGiftModal()">×</button>
        <h3 id="giftModalTitle">Novo Presente</h3>
        <p class="modal-sub">Preencha os dados do presente</p>
        <div id="giftModalBody"></div>
      </div>
    </div>

    <div class="modal-overlay" id="modalGuest" onclick="closeGuestModal(event)">
      <div class="modal">
        <button class="modal-close" onclick="closeGuestModal()">×</button>
        <h3 id="guestModalTitle">Editar Convidado</h3>
        <p class="modal-sub">Altere as informações do convidado</p>
        <div id="guestModalBody"></div>
      </div>
    </div>`;

  document.querySelectorAll('.nav-item[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => admShowPanel(btn.dataset.panel, btn));
  });
  el$('cfgCover')?.addEventListener('change', function () {
    if (!this.files?.[0]) return;
    if (this.files[0].size > IMG_MAX_BYTES) {
      toast('Imagem muito grande. Máximo 800KB.', 'error');
      this.value = ''; return;
    }
    const r = new FileReader();
    r.onload = e => {
      const prev = el$('cfgCoverPrev'), wrap = el$('cfgCoverWrap'), area = el$('cfgCoverUploadArea');
      if (prev) { prev.src = e.target.result; prev.style.display = 'block'; }
      if (wrap) wrap.style.display = 'block';
      if (area) area.style.display = 'none';
    };
    r.readAsDataURL(this.files[0]);
  });
  el$('btnSaveCfg')?.addEventListener('click', admSaveConfig);

  window.previewIconInput = function (v) {
    const trimmed = v.trim();
    const prev = el$('iconPreviewBig'), btn = el$('btnRemoveIcon');
    if (prev) { prev.textContent = trimmed || '🍼'; if (btn) prev.appendChild(btn); }
    if (btn) btn.style.display = trimmed ? 'flex' : 'none';
    if (el$('cfgIconBase64')) el$('cfgIconBase64').value = '';
  };
  window.previewIconFile = async function (input) {
    if (!input.files?.[0]) return;
    if (input.files[0].size > IMG_MAX_BYTES) { toast('Imagem muito grande. Máximo 800KB.', 'error'); input.value = ''; return; }
    const base64 = await toBase64(input.files[0]);
    el$('cfgIconBase64').value = base64;
    el$('cfgIconEmoji').value  = '';
    const prev = el$('iconPreviewBig'), btn = el$('btnRemoveIcon');
    if (prev) {
      prev.innerHTML = `<img src="${base64}" style="width:52px;height:52px;object-fit:contain;border-radius:10px">`;
      if (btn) { prev.appendChild(btn); btn.style.display = 'flex'; }
    }
  };
  window.admRemoveIcon  = admRemoveIcon;
  window.admRemoveCover = admRemoveCover;

  await admLoadPanel('dashboard');
  admRenderDashboard();
  if (adm.cfg.icone_app) applyAppIcon(adm.cfg.icone_app);
}

const _admPanelLoaded = {};

async function admLoadPanel(panel) {
  switch (panel) {
    case 'dashboard':
      await Promise.allSettled([
        _admFetchChoices(),
        _admFetchUsers(),
        _admFetchPix(),
        _admFetchCfg(),
      ]);
      break;
    case 'presentes':
      await _admFetchGifts();
      break;
    case 'escolhas':
      await _admFetchChoices();
      break;
    case 'pix':
      await _admFetchPix();
      break;
    case 'convidados':
      await Promise.allSettled([_admFetchUsers(), _admFetchChoices()]);
      break;
    case 'comentarios':
      await _admFetchComments();
      break;
    case 'configuracoes':
      await _admFetchCfg();
      break;
  }
}

async function _admFetchGifts() {
  const { data, error } = await sbCall(() => sb.from('presentes').select('*').order('ordem'));
  if (error) console.error('[adm presentes]', error.message);
  adm.gifts = data || [];
}
async function _admFetchChoices() {
  const { data, error } = await sbCall(() =>
    sb.from('escolhas').select('*, perfis(nome,email,telefone), presentes(titulo,preco)').order('criado_em', { ascending: false }));
  if (error) console.error('[adm escolhas]', error.message);
  adm.choices = data || [];
}
async function _admFetchUsers() {
  const { data, error } = await sbCall(() =>
    sb.from('perfis').select('*, escolhas(presente_id, tipo_pagamento, presentes(titulo))').order('criado_em'));
  if (error) console.error('[adm perfis]', error.message);
  adm.users = data || [];
}
async function _admFetchCfg() {
  const { data } = await sbCall(() => sb.from('configuracoes').select('chave, valor'));
  adm.cfg = {};
  if (data) data.forEach(c => adm.cfg[c.chave] = c.valor);
}
async function _admFetchPix() {
  const { data } = await sbCall(() =>
    sb.from('contribuicoes_pix').select('*, perfis(nome,email)').order('criado_em', { ascending: false }));
  adm.pix = data || [];
}
async function _admFetchComments() {
  const { data, error } = await sbCall(() =>
    sb.from('comentarios').select('id, comentario, criado_em, usuario_id, presente_id, perfis(nome), presentes(titulo)').order('criado_em', { ascending: false }));
  if (error) console.error('[adm comentarios]', error.message);
  adm.comments = data || [];
}

function admShowPanel(id, btn) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-panel]').forEach(b => b.classList.remove('active'));
  el$('ap-' + id)?.classList.add('active');
  btn?.classList.add('active');
  const labels = { dashboard:'Dashboard', presentes:'Presentes', escolhas:'Escolhas', pix:'PIX', convidados:'Convidados', configuracoes:'Configurações', comentarios:'Comentários' };
  setTextIfEl('admTitle', labels[id] || id);
  el$('adminSidebar')?.classList.remove('open');
  el$('sidebarOverlay')?.classList.remove('active');

  admLoadPanel(id).then(() => {
    switch (id) {
      case 'dashboard':    admRenderDashboard();    break;
      case 'presentes':    admRenderGifts();        break;
      case 'escolhas':     admRenderChoices();      break;
      case 'pix':          admRenderPixContribs();  break;
      case 'convidados':   admRenderGuests();       break;
      case 'comentarios':  admRenderComments();     break;
      case 'configuracoes':admRenderConfig();       break;
    }
  });
}

function toggleSidebar() {
  el$('adminSidebar')?.classList.toggle('open');
  el$('sidebarOverlay')?.classList.toggle('active');
}

function admRenderDashboard() {
  const totalValue = adm.choices.reduce((s, c) => s + (c.presentes?.preco || 0), 0);
  const totalPix   = adm.pix.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
  setTextIfEl('stGifts',   adm.gifts.length || adm.choices.length);
  setTextIfEl('stChoices', adm.choices.length);
  setTextIfEl('stGuests',  adm.users.filter(u => u.tipo === 'usuario').length);
  setTextIfEl('stValue',   money(totalValue));
  setTextIfEl('stPix',     money(totalPix));

  const list = el$('dashActivity');
  if (!list) return;
  const recent = adm.choices.slice(0, 10);
  if (!recent.length) {
    list.innerHTML = `<div style="text-align:center;padding:28px;color:var(--muted);font-size:13px">Nenhuma escolha ainda.</div>`;
    return;
  }
  list.innerHTML = recent.map(c => {
    const nome = c.perfis?.nome || '—';
    const iniciais = nome.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();
    return `
    <div class="dash-activity-item">
      <div class="dash-activity-avatar">${iniciais}</div>
      <div class="dash-activity-info">
        <div class="dash-activity-name">${esc(nome)}</div>
        <div class="dash-activity-sub">🎁 ${esc(c.presentes?.titulo || '—')}</div>
      </div>
      <div class="dash-activity-meta">
        <span class="badge badge-${c.tipo_pagamento}">${payLabel(c.tipo_pagamento)}</span>
        <div style="text-align:right;margin-top:3px;font-size:10.5px;color:var(--muted)">${fmtDate(c.criado_em)}</div>
      </div>
    </div>`;
  }).join('');
}

function admRenderGifts() {
  const grid = el$('admGiftsGrid');
  if (!grid) return;
  if (!adm.gifts.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🎁</div><h3>Nenhum presente</h3><p>Clique em "+ Novo Presente" para começar.</p></div>`;
    return;
  }
  grid.innerHTML = adm.gifts.map(g => {
    const imgSrc = g.imagem_base64 || g.imagem_url || '';
    const sold   = g.quantidade_restante <= 0;
    const sClass = g.status === 'inativo' ? 'inativo' : (sold ? 'esgotado' : 'ativo');
    const sLabel = g.status === 'inativo' ? 'Inativo'  : (sold ? 'Esgotado'  : 'Ativo');
    return `
    <div class="pac">
      <div class="pac-img">
        ${imgSrc ? `<img src="${imgSrc}" alt="${esc(g.titulo)}">` : `<div class="pac-img-icon">🎁</div>`}
        <div class="pac-status ${sClass}">${sLabel}</div>
      </div>
      <div class="pac-body">
        <div class="pac-title">${esc(g.titulo)}</div>
        ${g.descricao ? `<div class="pac-desc">${esc(g.descricao)}</div>` : ''}
        <div class="pac-meta">
          ${g.preco ? `<span class="pac-price">${money(g.preco)}</span>` : ''}
          <span class="pac-stock">📦 ${g.quantidade_restante}/${g.quantidade_max}</span>
        </div>
        <div class="pac-actions">
          <button class="btn btn-ghost" style="flex:1;font-size:12px;padding:7px" data-edit-gift="${g.id}">✏️ Editar</button>
          <button class="btn btn-danger" style="padding:7px 12px;font-size:13px" data-del-gift="${g.id}" data-del-name="${esc(g.titulo)}">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('[data-edit-gift]').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = adm.gifts.find(x => x.id === btn.dataset.editGift);
      if (g) openGiftForm(g);
    });
  });
  document.querySelectorAll('[data-del-gift]').forEach(btn => {
    btn.addEventListener('click', () => admDeleteGift(btn.dataset.delGift, btn.dataset.delName));
  });
}

function openGiftForm(g = null) {
  const editing = !!g;
  setTextIfEl('giftModalTitle', editing ? '✏️ Editar Presente' : '➕ Novo Presente');
  const imgSrc = editing ? (g.imagem_base64 || g.imagem_url || '') : '';

  el$('giftModalBody').innerHTML = `
    <input type="hidden" id="gmId" value="${editing ? g.id : ''}">
    <div class="field"><label>Título *</label>
      <input type="text" id="gmTitle" placeholder="Ex: Kit de Banho" value="${editing ? esc(g.titulo) : ''}">
    </div>
    <div class="field"><label>Descrição</label>
      <textarea id="gmDesc" rows="2" placeholder="Descrição...">${editing ? esc(g.descricao || '') : ''}</textarea>
    </div>
    <div class="form-row-2">
      <div class="field"><label>Preço (R$)</label>
        <input type="number" id="gmPrice" step="0.01" min="0" placeholder="0,00" value="${editing && g.preco ? g.preco : ''}">
      </div>
      <div class="field"><label>Qtd. máxima</label>
        <input type="number" id="gmQty" min="1" value="${editing ? g.quantidade_max : 1}">
      </div>
    </div>
    <div class="form-row-2">
      <div class="field"><label>Ordem</label>
        <input type="number" id="gmOrder" value="${editing ? (g.ordem || 0) : adm.gifts.length}">
      </div>
      <div class="field"><label>Status</label>
        <select id="gmStatus">
          <option value="ativo"   ${!editing || g.status === 'ativo'   ? 'selected' : ''}>✅ Ativo</option>
          <option value="inativo" ${editing  && g.status === 'inativo' ? 'selected' : ''}>🚫 Inativo</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Link de compra (opcional)</label>
      <input type="url" id="gmLink" placeholder="https://..." value="${editing ? esc(g.link_compra || '') : ''}">
    </div>
    <div style="margin-bottom:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">🖼️ Imagem</div>
      <div class="img-tabs">
        <button class="img-tab active" id="imgTabUpload" type="button" onclick="switchImgTab('upload')">📁 Upload</button>
        <button class="img-tab"        id="imgTabUrl"    type="button" onclick="switchImgTab('url')">🔗 URL</button>
      </div>
      <div id="imgPanelUpload">
        <div class="upload-area" onclick="el$('gmImg').click()">
          <div class="upload-icon">📷</div>
          <p>Clique para selecionar uma imagem <small style="color:var(--muted)">(máx. 800KB)</small></p>
          <input type="file" id="gmImg" accept="image/*" style="display:none" onchange="previewImg(this,'gmImgPrev')">
        </div>
        ${imgSrc && !imgSrc.startsWith('http')
          ? `<img id="gmImgPrev" class="img-preview" src="${imgSrc}" style="display:block">`
          : `<img id="gmImgPrev" class="img-preview">`}
      </div>
      <div id="imgPanelUrl" style="display:none">
        <div class="field">
          <input type="url" id="gmImgUrl" placeholder="https://..." value="${editing && g.imagem_url ? g.imagem_url : ''}">
          ${imgSrc && imgSrc.startsWith('http') ? `<img class="img-preview" src="${imgSrc}" style="display:block;margin-top:8px">` : ''}
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" type="button" onclick="closeGiftModal()">Cancelar</button>
      <button class="btn btn-primary" id="btnSaveGift" type="button" onclick="admSaveGift()">💾 Salvar</button>
    </div>`;

  el$('modalGift').classList.add('open');
}

function switchImgTab(tab) {
  const isUpload = tab === 'upload';
  el$('imgTabUpload').classList.toggle('active',  isUpload);
  el$('imgTabUrl')   .classList.toggle('active', !isUpload);
  el$('imgPanelUpload').style.display = isUpload ? '' : 'none';
  el$('imgPanelUrl')  .style.display = isUpload ? 'none' : '';
}

async function admSaveGift() {
  const titulo = val('gmTitle');
  if (!titulo) { toast('Título é obrigatório.', 'error'); return; }

  const file = el$('gmImg')?.files?.[0];
  if (file && file.size > IMG_MAX_BYTES) { toast('Imagem muito grande. Máximo 800KB ou use URL.', 'error'); return; }

  setBtn('btnSaveGift', true, 'Salvando...');

  const imagem_base64 = file ? await toBase64(file) : null;
  const imagem_url    = val('gmImgUrl') || null;
  const id            = val('gmId');

  const payload = {
    titulo,
    descricao:      val('gmDesc')  || null,
    preco:          parseFloat(val('gmPrice')) || null,
    quantidade_max: parseInt(val('gmQty'))   || 1,
    ordem:          parseInt(val('gmOrder'))  || 0,
    status:         val('gmStatus') || 'ativo',
    link_compra:    val('gmLink')  || null,
    atualizado_em:  new Date().toISOString(),
    ...(imagem_base64 ? { imagem_base64, imagem_url: null } : {}),
    ...(imagem_url && !imagem_base64 ? { imagem_url, imagem_base64: null } : {})
  };

  let error;
  if (id) {
    const { data: escolhasAtuais } = await sb.from('escolhas').select('quantidade').eq('presente_id', id);
    const totalEscolhido = (escolhasAtuais || []).reduce((s, e) => s + (e.quantidade || 1), 0);
    payload.quantidade_restante = Math.max(0, payload.quantidade_max - totalEscolhido);
    ({ error } = await sb.from('presentes').update(payload).eq('id', id));
  } else {
    payload.quantidade_restante = payload.quantidade_max;
    ({ error } = await sb.from('presentes').insert(payload));
  }

  setBtn('btnSaveGift', false, '💾 Salvar');
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast(id ? 'Presente atualizado! ✅' : 'Presente adicionado! ✅', 'success');
  closeGiftModal();
  await _admFetchGifts();
  admRenderGifts();
  admRenderDashboard();
}

async function admDeleteGift(id, name) {
  if (!confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
  const { error } = await sb.from('presentes').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Presente removido.', 'success');
  await _admFetchGifts();
  admRenderGifts();
  admRenderDashboard();
}

function closeGiftModal(e) {
  if (e && e.type === 'click' && e.target !== el$('modalGift')) return;
  el$('modalGift')?.classList.remove('open');
}

function admRenderChoices() {
  const tbody = document.querySelector('#tChoices tbody');
  if (!tbody) return;
  tbody.innerHTML = adm.choices.map(c => `
    <tr>
      <td><strong>${esc(c.perfis?.nome || '—')}</strong></td>
      <td style="color:var(--muted)">${esc(c.perfis?.email || '—')}</td>
      <td style="color:var(--muted)">${esc(c.perfis?.telefone || '—')}</td>
      <td>${esc(c.presentes?.titulo || '—')}</td>
      <td><span class="badge badge-${c.tipo_pagamento}">${payLabel(c.tipo_pagamento)}</span></td>
      <td>${c.presentes?.preco ? money(c.presentes.preco) : '—'}</td>
      <td style="color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.mensagem||'')}">${esc(c.mensagem || '—')}</td>
      <td style="color:var(--muted)">${fmtDate(c.criado_em)}</td>
      <td><div class="table-actions">
        <button class="tbl-btn tbl-btn-del" title="Remover"
          onclick="admChoiceDelete('${c.id}','${esc(c.perfis?.nome||'')}')">🗑️</button>
      </div></td>
    </tr>`).join('')
    || `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">Sem escolhas</td></tr>`;
}

async function admChoiceDelete(id, nome) {
  if (!confirm(`Remover a escolha de ${nome || 'este convidado'}? O presente voltará a ficar disponível.`)) return;

  const { data: escolha } = await sb.from('escolhas').select('presente_id, quantidade').eq('id', id).maybeSingle();
  const { error } = await sb.from('escolhas').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  if (escolha?.presente_id) {
    const { data: present } = await sb.from('presentes').select('quantidade_max').eq('id', escolha.presente_id).maybeSingle();
    const { data: escolhasRestantes } = await sb.from('escolhas').select('quantidade').eq('presente_id', escolha.presente_id);
    const totalEscolhido = (escolhasRestantes || []).reduce((s, e) => s + (e.quantidade || 1), 0);
    const novaRestante = Math.max(0, (present?.quantidade_max || 0) - totalEscolhido);
    await sb.from('presentes').update({ quantidade_restante: novaRestante }).eq('id', escolha.presente_id);
  }

  toast('Escolha removida. Estoque atualizado.', 'success');
  await Promise.allSettled([_admFetchChoices(), _admFetchGifts()]);
  admRenderChoices();
  admRenderGifts();
  admRenderDashboard();
}

function admRenderPixContribs() {
  const tbody = document.querySelector('#tPix tbody');
  if (!tbody) return;
  const total = adm.pix.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
  setTextIfEl('pixTotalLabel', `Total: ${money(total)}`);
  tbody.innerHTML = adm.pix.map(p => `
    <tr>
      <td><strong>${esc(p.perfis?.nome || '—')}</strong></td>
      <td style="color:var(--muted)">${esc(p.perfis?.email || '—')}</td>
      <td><strong style="color:var(--terracotta)">${money(p.valor)}</strong></td>
      <td style="color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.mensagem||'')}">${esc(p.mensagem || '—')}</td>
      <td><span class="badge badge-pix-${p.status}">${pixStatusLabel(p.status)}</span></td>
      <td style="color:var(--muted)">${fmtDate(p.criado_em)}</td>
      <td><div class="table-actions">
        <button class="tbl-btn tbl-btn-edit" title="Confirmar" onclick="admPixStatus('${p.id}','confirmado')">✅</button>
        <button class="tbl-btn tbl-btn-del"  title="Remover"   onclick="admPixDelete('${p.id}')">🗑️</button>
      </div></td>
    </tr>`).join('')
    || `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Nenhuma contribuição PIX</td></tr>`;
}

function pixStatusLabel(s) {
  return { pendente:'⏳ Pendente', confirmado:'✅ Confirmado', cancelado:'❌ Cancelado' }[s] || s;
}

async function admPixStatus(id, status) {
  const { error } = await sb.from('contribuicoes_pix').update({ status }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Status atualizado!', 'success');
  await _admFetchPix();
  admRenderPixContribs();
  admRenderDashboard();
}

async function admPixDelete(id) {
  if (!confirm('Remover esta contribuição?')) return;
  const { error } = await sb.from('contribuicoes_pix').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Removido.', 'success');
  await _admFetchPix();
  admRenderPixContribs();
  admRenderDashboard();
}

function admRenderGuests() {
  const tbody = document.querySelector('#tGuests tbody');
  if (!tbody) return;
  setTextIfEl('guestCount', `${adm.users.length} cadastrado${adm.users.length !== 1 ? 's' : ''}`);
  tbody.innerHTML = adm.users.map(u => {
    const choice = u.escolhas?.[0];
    const isAdm  = u.tipo === 'admin';
    return `<tr>
      <td><strong>${esc(u.nome || '—')}</strong></td>
      <td style="color:var(--muted)">${esc(u.email || '—')}</td>
      <td style="color:var(--muted)">${esc(u.telefone || '—')}</td>
      <td><span class="badge badge-${u.tipo}">${isAdm ? '⭐ Admin' : '👤 Usuário'}</span></td>
      <td>${choice ? esc(choice.presentes?.titulo || '—') : '<span style="color:var(--muted)">—</span>'}</td>
      <td style="color:var(--muted)">${fmtDate(u.criado_em)}</td>
      <td><div class="table-actions">
        <button class="tbl-btn tbl-btn-edit" data-edit-guest="${u.user_id}">✏️</button>
        ${!isAdm ? `<button class="tbl-btn tbl-btn-del" data-del-guest="${u.user_id}" data-del-gname="${esc(u.nome||'')}">🗑️</button>` : ''}
      </div></td>
    </tr>`;
  }).join('')
    || `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Sem convidados</td></tr>`;

  document.querySelectorAll('[data-edit-guest]').forEach(btn => {
    btn.addEventListener('click', () => openGuestModal(btn.dataset.editGuest));
  });
  document.querySelectorAll('[data-del-guest]').forEach(btn => {
    btn.addEventListener('click', () => admDeleteGuest(btn.dataset.delGuest, btn.dataset.delGname));
  });
}

function openGuestModal(userId) {
  const u = adm.users.find(x => x.user_id === userId);
  if (!u) return;
  el$('guestModalBody').innerHTML = `
    <input type="hidden" id="gmUserId" value="${u.user_id}">
    <div class="field"><label>Nome</label>
      <input type="text" id="gmGuestName" value="${esc(u.nome || '')}">
    </div>
    <div class="field"><label>Telefone</label>
      <input type="tel" id="gmGuestTel" value="${esc(u.telefone || '')}">
    </div>
    <div class="field"><label>Tipo</label>
      <select id="gmGuestType">
        <option value="usuario" ${u.tipo === 'usuario' ? 'selected' : ''}>👤 Usuário</option>
        <option value="admin"   ${u.tipo === 'admin'   ? 'selected' : ''}>⭐ Admin</option>
      </select>
    </div>
    <div class="field"><label>Nova senha <small style="color:var(--muted)">(deixe vazio para não alterar)</small></label>
      <div class="pass-wrap">
        <input type="password" id="gmGuestPass" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
        <button type="button" class="pass-toggle" onclick="togglePass('gmGuestPass',this)">👁</button>
      </div>
    </div>
    <div class="field"><label>Confirmar nova senha</label>
      <input type="password" id="gmGuestConf" placeholder="Repita a senha" autocomplete="new-password">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" type="button" onclick="closeGuestModal()">Cancelar</button>
      <button class="btn btn-primary" id="btnSaveGuest" type="button" onclick="admSaveGuest()">💾 Salvar</button>
    </div>`;
  el$('modalGuest').classList.add('open');
}

async function admSaveGuest() {
  const userId = val('gmUserId'), nome = val('gmGuestName'),
        tel    = val('gmGuestTel'), tipo = val('gmGuestType'),
        pass   = val('gmGuestPass'), conf = val('gmGuestConf');

  if (!nome) { toast('Nome é obrigatório.', 'error'); return; }
  if (pass) {
    if (pass.length < 6) { toast('Senha mínima 6 caracteres.', 'error'); return; }
    if (pass !== conf)   { toast('As senhas não coincidem.', 'error'); return; }
  }

  setBtn('btnSaveGuest', true, 'Salvando...');
  const { error } = await sb.from('perfis').update({
    nome, telefone: tel || null, tipo, atualizado_em: new Date().toISOString()
  }).eq('user_id', userId);

  if (error) { toast('Erro: ' + error.message, 'error'); setBtn('btnSaveGuest', false, '💾 Salvar'); return; }

  if (pass) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`${SB_URL}/functions/v1/admin-update-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: userId, password: pass })
      });
      toast(res.ok ? 'Senha alterada! ✅' : 'Dados salvos, mas a senha não foi alterada (configure a Edge Function).', res.ok ? 'success' : 'error');
    } catch {
      toast('Dados salvos, mas a senha não foi alterada (configure a Edge Function).', 'error');
    }
  }

  setBtn('btnSaveGuest', false, '💾 Salvar');
  toast('Convidado atualizado! ✅', 'success');
  closeGuestModal();
  await _admFetchUsers();
  admRenderGuests();
  admRenderDashboard();
}

async function admDeleteGuest(userId, nome) {
  if (!confirm(`Remover "${nome}" permanentemente? O acesso ao site será revogado.`)) return;
  const { error } = await sb.from('perfis').delete().eq('user_id', userId);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Convidado removido.', 'success');
  await _admFetchUsers();
  admRenderGuests();
  admRenderDashboard();
}

function closeGuestModal(e) {
  if (e && e.type === 'click' && e.target !== el$('modalGuest')) return;
  el$('modalGuest')?.classList.remove('open');
}

function admRenderConfig() {
  const c = adm.cfg;
  [
    ['cfgTitle',        'evento_titulo'],
    ['cfgDate',         'evento_data'],
    ['cfgLocal',        'evento_local'],
    ['cfgDesc',         'evento_descricao'],
    ['cfgPix',          'pix_chave'],
    ['cfgPixName',      'pix_nome'],
    ['cfgAdminEmail',   'admin_email'],
    ['cfgLoginSubtitle','login_subtitulo']
  ].forEach(([id, key]) => { const el = el$(id); if (el) el.value = c[key] || ''; });

  const chipsEl = el$('cfgChips');
  if (chipsEl) {
    try {
      const arr = JSON.parse(c.chips_login || '[]');
      chipsEl.value = Array.isArray(arr) ? arr.join('\n') : (c.chips_login || '');
    } catch { chipsEl.value = c.chips_login || ''; }
  }

  const icone = c.icone_app || '';
  const prevEl = el$('iconPreviewBig'), btnRemove = el$('btnRemoveIcon');
  if (prevEl) {
    if (icone.startsWith('data:')) {
      prevEl.innerHTML = `<img src="${icone}" style="width:52px;height:52px;object-fit:contain;border-radius:10px">`;
      if (btnRemove) { prevEl.appendChild(btnRemove); btnRemove.style.display = 'flex'; }
      const b64 = el$('cfgIconBase64'); if (b64) b64.value = icone;
    } else {
      prevEl.textContent = icone || '🍼';
      if (btnRemove) { prevEl.appendChild(btnRemove); btnRemove.style.display = icone ? 'flex' : 'none'; }
      const emojiEl = el$('cfgIconEmoji'); if (emojiEl) emojiEl.value = icone;
    }
  }

  const coverWrap = el$('cfgCoverWrap'), coverPrev = el$('cfgCoverPrev'), coverArea = el$('cfgCoverUploadArea');
  if (c.imagem_capa_base64 && coverPrev) {
    coverPrev.src = c.imagem_capa_base64;
    coverPrev.style.display = 'block';
    if (coverWrap) coverWrap.style.display = 'block';
    if (coverArea) coverArea.style.display = 'none';
  }
}

async function admSaveConfig() {
  setBtn('btnSaveCfg', true, 'Salvando...');

  const chipsArr = (el$('cfgChips')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const pairs = [
    ['evento_titulo',    val('cfgTitle')],
    ['evento_data',      val('cfgDate')],
    ['evento_local',     val('cfgLocal')],
    ['evento_descricao', val('cfgDesc')],
    ['pix_chave',        val('cfgPix')],
    ['pix_nome',         val('cfgPixName')],
    ['admin_email',      val('cfgAdminEmail')],
    ['login_subtitulo',  val('cfgLoginSubtitle')],
    ['chips_login',      JSON.stringify(chipsArr)],
  ];

  const now = new Date().toISOString();
  await Promise.allSettled(pairs.map(([chave, valor]) =>
    sb.from('configuracoes').upsert({ chave, valor, atualizado_em: now }, { onConflict: 'chave' })
      .then(({ error }) => { if (error) toast(`Erro ao salvar "${chave}": ${error.message}`, 'error'); })
  ));

  const iconValor = val('cfgIconBase64') || val('cfgIconEmoji');
  if (iconValor) {
    await sb.from('configuracoes').upsert({ chave: 'icone_app', valor: iconValor, atualizado_em: now }, { onConflict: 'chave' });
    applyAppIcon(iconValor);
  }

  const coverFile = el$('cfgCover')?.files?.[0];
  if (coverFile) {
    if (coverFile.size > IMG_MAX_BYTES) {
      toast('Imagem de capa muito grande. Máximo 800KB.', 'error');
    } else {
      const base64 = await toBase64(coverFile);
      await sb.from('configuracoes').upsert({ chave: 'imagem_capa_base64', valor: base64, atualizado_em: now }, { onConflict: 'chave' });
    }
  }

  setBtn('btnSaveCfg', false, '💾 Salvar Configurações');
  toast('Configurações salvas! ✅', 'success');
  await _admFetchCfg();
  admRenderConfig();
}

async function admRemoveIcon() {
  if (!confirm('Remover o ícone atual?')) return;
  const now = new Date().toISOString();
  await sb.from('configuracoes').upsert({ chave: 'icone_app', valor: '🍼', atualizado_em: now }, { onConflict: 'chave' });
  adm.cfg.icone_app = '🍼';
  applyAppIcon('🍼');
  const prevEl = el$('iconPreviewBig');
  if (prevEl) prevEl.textContent = '🍼';
  const emojiEl = el$('cfgIconEmoji'); if (emojiEl) emojiEl.value = '';
  const b64 = el$('cfgIconBase64'); if (b64) b64.value = '';
  const btnRemove = el$('btnRemoveIcon'); if (btnRemove) btnRemove.style.display = 'none';
  toast('Ícone removido.', 'success');
}

async function admRemoveCover() {
  if (!confirm('Remover a imagem de capa?')) return;
  const now = new Date().toISOString();
  await sb.from('configuracoes').upsert({ chave: 'imagem_capa_base64', valor: '', atualizado_em: now }, { onConflict: 'chave' });
  adm.cfg.imagem_capa_base64 = '';
  const coverWrap = el$('cfgCoverWrap'); if (coverWrap) coverWrap.style.display = 'none';
  const coverPrev = el$('cfgCoverPrev'); if (coverPrev) { coverPrev.src = ''; coverPrev.style.display = 'none'; }
  const coverArea = el$('cfgCoverUploadArea'); if (coverArea) coverArea.style.display = '';
  const cfgCover = el$('cfgCover'); if (cfgCover) cfgCover.value = '';
  toast('Imagem de capa removida.', 'success');
}

function admRenderComments() {
  const tbody = document.querySelector('#tComments tbody');
  if (!tbody) return;
  const btnAll = el$('btnDeleteAllComments');
  if (btnAll) btnAll.onclick = admDeleteAllComments;

  if (!adm.comments.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">Nenhum comentário encontrado.</td></tr>`;
    return;
  }
  tbody.innerHTML = adm.comments.map(c => `
    <tr>
      <td>${esc(c.presentes?.titulo || '—')}</td>
      <td><strong>${esc(c.perfis?.nome || '—')}</strong></td>
      <td style="max-width:320px;word-break:break-word">${esc(c.comentario)}</td>
      <td style="color:var(--muted);white-space:nowrap">${fmtDate(c.criado_em)}</td>
      <td><button class="tbl-btn tbl-btn-del" title="Excluir" data-del-comment="${c.id}">🗑️</button></td>
    </tr>`).join('');

  document.querySelectorAll('[data-del-comment]').forEach(btn => {
    btn.addEventListener('click', () => admDeleteComment(btn.dataset.delComment));
  });
}

async function admDeleteComment(id) {
  if (!confirm('Excluir este comentário permanentemente?')) return;
  const { error } = await sb.from('comentarios').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  const pidToInvalidate = Object.keys(commCache).find(pid =>
    commCache[pid]?.some(c => c.id === id)
  );
  if (pidToInvalidate) delete commCache[pidToInvalidate];
  toast('Comentário excluído.', 'success');
  await _admFetchComments();
  admRenderComments();
}

async function admDeleteAllComments() {
  const total = adm.comments.length;
  if (!total) { toast('Não há comentários para excluir.', 'info'); return; }
  if (!confirm(`Excluir TODOS os ${total} comentário${total !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`)) return;
  const { error } = await sb.from('comentarios').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  commCache = {};
  toast(`${total} comentário${total !== 1 ? 's' : ''} excluído${total !== 1 ? 's' : ''}.`, 'success');
  await _admFetchComments();
  admRenderComments();
}

function backToSite() { window.location.hash = ''; commCache = {}; renderApp(); }

const el$         = id  => document.getElementById(id);
const val         = id  => el$(id)?.value?.trim() || '';
const setTextIfEl = (id, v) => { const e = el$(id); if (e) e.textContent = v; };
const showAlert   = (el, msg) => { if (!el) return; el.textContent = msg; el.classList.add('show'); };

function setBtn(id, loading, label) {
  const btn = el$(id);
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = label;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className   = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function togglePass(inputId, btn) {
  const input = el$(inputId);
  if (!input) return;
  input.type      = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

function previewImg(input, prevId) {
  if (!input.files?.[0]) return;
  if (input.files[0].size > IMG_MAX_BYTES) {
    toast('Imagem muito grande. Máximo 800KB.', 'error');
    input.value = '';
    return;
  }
  const r = new FileReader();
  r.onload = e => { const el = el$(prevId); if (el) { el.src = e.target.result; el.style.display = 'block'; } };
  r.readAsDataURL(input.files[0]);
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

const money   = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const payLabel = t => ({ presente:'🎁 Presente', pix:'💰 PIX', dinheiro:'💵 Dinheiro' }[t] || t || '—');

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function skeletons(n) {
  return Array.from({ length: n }, () => `
    <div class="gift-card">
      <div class="card-img skeleton" style="height:200px;border-radius:0"></div>
      <div class="card-body">
        <div class="skeleton" style="height:18px;width:60%;margin-bottom:9px;border-radius:6px"></div>
        <div class="skeleton" style="height:13px;width:85%;margin-bottom:7px;border-radius:6px"></div>
        <div class="skeleton" style="height:13px;width:65%;margin-bottom:16px;border-radius:6px"></div>
        <div class="skeleton" style="height:42px;border-radius:9px"></div>
      </div>
    </div>`).join('');
}
