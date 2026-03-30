// ===================================================
// CHÁ DE BEBÊ — app.js  (versão final corrigida)
// ===================================================
// CONFIGURAÇÃO: Altere os valores abaixo com os dados
// do SEU projeto no Supabase (Settings → API)
// ===================================================
const SB_URL = 'https://eipozcduwvwznyvpawue.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcG96Y2R1d3Z3em55dnBhd3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NTE2NjYsImV4cCI6MjA5MDMyNzY2Nn0.289rM7XDfxhYhQsI23iTCNz7JXKK5Oc3WyE2Whq4Ucc';

// ── State ─────────────────────────────────────────────
let sb        = null;
let me        = null;   // { ...supabase user, perfil: {...} }
let gifts     =[];
let myChoice  = null;
let cfg       = {};
let commCache = {};
let adm       = { gifts:[], choices:[], users:[], cfg: {} };

// ===================================================
// BOOT
// ===================================================
(async function boot() {
  sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
  });

  // Carrega ícone do app antes mesmo do login (não requer auth)
  sb.from('configuracoes').select('valor').eq('chave', 'icone_app').single().then(({ data }) => {
    if (data?.valor) applyAppIcon(data.valor);
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session) { me = session.user; await loadProfile(); route(); }
  else renderLogin();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      me = session.user; await loadProfile(); route();
    } else if (event === 'SIGNED_OUT') {
      me = null; commCache = {}; gifts =[]; myChoice = null; cfg = {};
      renderLogin();
    }
  });
})();

// Aplica ícone (emoji ou base64) em todos os pontos da UI
function applyAppIcon(valor) {
  // SALVA NA MEMÓRIA DO NAVEGADOR PARA CARREGAR INSTANTANEAMENTE NA PRÓXIMA VEZ
  localStorage.setItem('icone_salvo', valor);

  cfg.icone_app = valor;
  const isBase64 = valor.startsWith('data:');
  const imgTag   = isBase64 ? `<img src="${valor}" style="width:44px;height:44px;object-fit:contain;border-radius:8px">` : valor;
  const imgTagSm = isBase64 ? `<img src="${valor}" style="width:32px;height:32px;object-fit:contain;border-radius:6px">` : valor;

  // Splash
  const splashEl = document.getElementById('splashIcon');
  if (splashEl) splashEl.innerHTML = isBase64
    ? `<img src="${valor}" style="width:52px;height:52px;object-fit:contain;border-radius:10px">`
    : valor;

  // Brand (login)
  const brandEl = document.getElementById('brandIconEl');
  if (brandEl) brandEl.innerHTML = imgTag;

  // Sidebar admin
  const sidebarEl = document.getElementById('sidebarIconEl');
  if (sidebarEl) sidebarEl.innerHTML = imgTagSm;
}

function route() {
  if (window.location.hash === '#admin' && isAdmin()) renderAdmin();
  else renderApp();
}
window.addEventListener('hashchange', () => { if (me) route(); });

// ===================================================
// AUTH HELPERS
// ===================================================

// Lê do JWT — sem DB query, sem recursão RLS
function isAdmin() {
  // Checa JWT primeiro (mais rápido), depois perfil em memória
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
  me = data.user; await loadProfile();
  return { ok: true };
}

async function doSignup(nome, email, telefone, password) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { nome, telefone, tipo: 'usuario' } }
  });
  if (error) return { ok: false, msg: translateError(error.message) };
  me = data.user; await loadProfile();
  return { ok: true };
}

async function doLogout() {
  await sb.auth.signOut();
  me = null; commCache = {}; gifts =[]; myChoice = null; cfg = {};
}

function translateError(msg) {
  const map = {
    'Invalid login credentials':                         'E-mail ou senha incorretos.',
    'Email not confirmed':                               'Confirme seu e-mail antes de entrar.',
    'User already registered':                           'Este e-mail já está cadastrado.',
    'Password should be at least 6 characters':          'A senha deve ter pelo menos 6 caracteres.',
    'Unable to validate email address: invalid format':  'Formato de e-mail inválido.',
    'signup is disabled':                                'Cadastro desabilitado. Contate o organizador.',
  };
  return map[msg] || msg;
}

function displayName() {
  return me?.perfil?.nome || me?.user_metadata?.nome || me?.email || '';
}

// ===================================================
// LOGIN SCREEN
// ===================================================
function renderLogin() {
  window.location.hash = '';
  document.getElementById('app').innerHTML = `
    <div class="screen-login">
      <div class="login-brand">
        <div class="grain"></div>
        <div class="brand-inner">
          <span class="brand-icon" id="brandIconEl"></span>
          <h1 id="loginTitle"></h1>
          <div class="brand-divider"></div>
          <p id="loginSubtitle"></p>
          <div class="brand-chips" id="loginChips">
          </div>
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

  // Carrega branding do banco — sem valores hardcoded para evitar conflito
  sb.from('configuracoes').select('chave, valor').then(({ data }) => {
    if (!data) return;
    const c = Object.fromEntries(data.map(r =>[r.chave, r.valor]));

    // Título completo com último nome em itálico
    if (c.evento_titulo) {
      const tEl = el$('loginTitle');
      if (tEl) tEl.innerHTML = c.evento_titulo.replace(/(\S+)$/, '<em>$1</em>');
    }

    // Subtítulo dinâmico
    if (c.login_subtitulo) {
      setTextIfEl('loginSubtitle', c.login_subtitulo);
    }

    // Ícone
    if (c.icone_app) applyAppIcon(c.icone_app);

    // Chips: banco tem prioridade; fallback neutro se não tiver
    const chipsEl = el$('loginChips');
    if (chipsEl) {
      let chips =['🤍 Com muito amor', '✨ Momentos especiais', '👶 Nova vida'];
      if (c.chips_login) {
        try {
          const arr = JSON.parse(c.chips_login);
          if (Array.isArray(arr) && arr.length) chips = arr;
        } catch { /* mantém padrão */ }
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
  const errEl = el$('loginErr'); errEl.classList.remove('show');
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

// ===================================================
// APP SCREEN
// ===================================================
async function renderApp() {
  window.location.hash = '';
  const name = displayName();

  document.getElementById('app').innerHTML = `
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
        <div class="event-item">
          <div class="event-label">📅 Data</div>
          <div class="event-value" id="evDate">—</div>
        </div>
        <div class="event-item">
          <div class="event-label">📍 Local</div>
          <div class="event-value" id="evLocal">—</div>
        </div>
        <div class="event-item">
          <div class="event-label">⏳ Faltam</div>
          <div class="event-value" id="evCountdown">—</div>
        </div>
      </div>

      <div class="grid-wrap">
        <div class="section-head">
          <div class="section-title">Escolha um presente 🎁</div>
          <div class="section-count" id="giftCount"></div>
        </div>
        <div class="gifts-grid" id="giftsGrid">${skeletons(6)}</div>
      </div>

      ${cfg.pix_chave !== undefined ? '' : ''}
    </div>

    <!-- PIX floating button -->
    <button class="pix-fab" id="pixFab" onclick="openPixModal()" title="Contribuir via PIX">
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

    <!-- PIX Modal -->
    <div class="modal-overlay" id="modalPix" onclick="closePixModal(event)">
      <div class="modal">
        <button class="modal-close" onclick="closePixModal()">×</button>
        <h3>💸 Contribuir via PIX</h3>
        <p class="modal-sub">Gere um QR Code para pagamento rápido</p>
        <div id="pixModalBody"></div>
      </div>
    </div>`;

  const acts = el$('topbarActions');
  if (isAdmin()) {
    acts.innerHTML = `
      <button class="btn-outline" onclick="goAdmin()">⚙️ Admin</button>
      <button class="btn-outline" onclick="doLogout().then(()=>renderLogin())">Sair</button>`;
  } else {
    acts.innerHTML = `<button class="btn-outline" onclick="doLogout().then(()=>renderLogin())">Sair</button>`;
  }

  // Carrega dados em paralelo
  const[cfgRes, giftsRes, choiceRes] = await Promise.all([
    sb.from('configuracoes').select('chave, valor'),
    sb.from('presentes').select('*').eq('status', 'ativo').order('ordem'),
    sb.from('escolhas').select('*, presentes(titulo)').eq('usuario_id', me.id).maybeSingle()
  ]);

  if (cfgRes.data) cfgRes.data.forEach(r => cfg[r.chave] = r.valor);

  // Mostra botão PIX flutuante só se tiver chave configurada
  const pixFab = el$('pixFab');
  if (pixFab) pixFab.style.display = cfg.pix_chave ? 'flex' : 'none';

  const titulo = cfg.evento_titulo || 'Chá de Bebê';
  const hEl = el$('heroTitle');
  if (hEl) hEl.innerHTML = titulo.replace(/(\S+)$/, '<em>$1</em>');
  setTextIfEl('heroDesc', cfg.evento_descricao || '');

  if (cfg.evento_data) {
    const d = new Date(cfg.evento_data + 'T12:00:00');
    setTextIfEl('evDate', d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }));
    // Contagem regressiva
    const today = new Date(); today.setHours(0,0,0,0);
    const evt   = new Date(cfg.evento_data + 'T12:00:00'); evt.setHours(0,0,0,0);
    const diff  = Math.round((evt - today) / 86400000);
    if      (diff > 1)  setTextIfEl('evCountdown', `${diff} dias`);
    else if (diff === 1) setTextIfEl('evCountdown', 'Amanhã! 🎉');
    else if (diff === 0) setTextIfEl('evCountdown', 'Hoje! 🎉');
    else                 setTextIfEl('evCountdown', 'Realizado ✓');
  }
  setTextIfEl('evLocal', cfg.evento_local || '—');

  // Aplica imagem de capa no hero
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

  gifts = giftsRes.data ||[];
  setTextIfEl('giftCount', gifts.length ? `${gifts.length} itens` : '');

  myChoice = choiceRes.data || null;
  if (myChoice) el$('chosenBadge')?.classList.remove('hidden');

  await renderGrid();
}

async function renderGrid() {
  const grid = el$('giftsGrid');
  if (!grid) return;

  if (gifts.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:64px 20px;color:var(--muted)">
      <div style="font-size:48px;margin-bottom:16px">🎁</div>
      <div style="font-size:15px">Nenhum presente disponível no momento.</div>
    </div>`;
    return;
  }

  // Carrega comentários de todos os presentes em paralelo
  const allComments = await Promise.all(gifts.map(g => loadComments(g.id)));
  const commMap = {};
  gifts.forEach((g, i) => commMap[g.id] = allComments[i]);

  grid.innerHTML = gifts.map(g => buildCard(g, commMap[g.id] ||[])).join('');
  bindGridEvents();
}

function buildCard(g, comments) {
  const sold   = g.quantidade_restante <= 0;
  const isMine = myChoice?.presente_id === g.id;

  const commHtml = comments.map(c => {
    const reactionMap = {};
    (c.reacoes ||[]).forEach(r => {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] =[];
      reactionMap[r.emoji].push(r.usuario_id);
    });
    
    // Mostra as reações que já existem (com contador)
    const reactHtml = Object.entries(reactionMap).map(([emoji, users]) =>
      `<button class="reaction-btn ${users.includes(me.id) ? 'active' : ''}"
        data-cid="${c.id}" data-emoji="${emoji}">${emoji} ${users.length}</button>`
    ).join('');
    
    // Cria o menu oculto (popover) com os emojis disponíveis
    const emojisDisponiveis = ['❤️','😍','🥰'];
    const popoverHtml = `
      <div class="reaction-popover" id="popover-${c.id}">
        ${emojisDisponiveis.map(e => 
          `<button class="popover-emoji reaction-btn" data-cid="${c.id}" data-emoji="${e}">${e}</button>`
        ).join('')}
      </div>
    `;

    // A linha de botões: reações existentes + botão de adicionar
    const reactRow = `
      <div class="comment-reactions">
        ${reactHtml}
        <div class="reaction-picker-wrap">
          <button class="btn-add-reaction" data-toggle="${c.id}">
            😀 <span style="font-size: 14px; font-weight: 300;">+</span>
          </button>
          ${popoverHtml}
        </div>
      </div>
    `;

    return `<div class="comment">
      <div class="comment-author">${esc(c.perfis?.nome || 'Anônimo')}
        <span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:6px">${fmtDate(c.criado_em)}</span>
      </div>
      <div class="comment-text">${esc(c.comentario)}</div>
      ${reactRow}
    </div>`;
  }).join('');

  const imgSrc = g.imagem_base64 || g.imagem_url || '';

  return `
  <div class="gift-card ${sold ? 'esgotado' : ''}" id="gc-${g.id}">
    <div class="card-img">
      ${imgSrc
        ? `<img src="${imgSrc}" alt="${esc(g.titulo)}" loading="lazy">`
        : `<div class="card-img-icon">🎁</div>`}
      ${sold   ? `<span class="card-badge">Esgotado</span>` : ''}
      ${isMine ? `<span class="card-badge mine">Meu presente ✓</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-title">${esc(g.titulo)}</div>
      ${g.descricao ? `<div class="card-desc">${esc(g.descricao)}</div>` : ''}
      ${g.preco     ? `<div class="card-price">${money(g.preco)}</div>`  : ''}
      <div class="card-stock">
        ${sold ? '🎁 Já escolhido' : `📦 ${g.quantidade_restante} de ${g.quantidade_max} disponível`}
      </div>
      ${isMine ? `<div class="card-chosen-msg">✅ Você escolheu este presente!
        ${myChoice.tipo_pagamento === 'pix' ? '<br><small>Pagamento via PIX</small>' : ''}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
        ${!isMine && !sold && !myChoice ? `
          <button class="btn btn-primary btn-full" data-action="choose"
            data-id="${g.id}" data-title="${esc(g.titulo)}" data-price="${g.preco || 0}">
            🎁 Quero este presente
          </button>` : ''}
        ${g.link_compra ? `<a href="${g.link_compra}" target="_blank" rel="noopener"
          style="text-align:center;font-size:12px;color:var(--muted);text-decoration:none;padding:2px 0;">
          Ver onde comprar ↗</a>` : ''}
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
    el.addEventListener('click', () => {
      const cb = el$('cb-' + el.dataset.pid);
      cb?.classList.toggle('open');
    });
  });
  document.querySelectorAll('[data-action="comment"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = el$('ci-' + btn.dataset.id);
      if (input?.value.trim()) submitComment(btn.dataset.id, input.value.trim());
    });
  });
  document.querySelectorAll('.comment-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const id = inp.id.replace('ci-', '');
        if (inp.value.trim()) submitComment(id, inp.value.trim());
      }
    });
  });

  // Lógica para abrir o modal de emoji
  document.querySelectorAll('.btn-add-reaction').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Impede o fechamento imediato
      
      // Fecha qualquer outro popover que possa estar aberto na tela
      document.querySelectorAll('.reaction-popover.show').forEach(p => {
        if (p.id !== 'popover-' + btn.dataset.toggle) p.classList.remove('show');
      });
      
      // Abre o popover referente a este comentário
      const popover = document.getElementById('popover-' + btn.dataset.toggle);
      if (popover) popover.classList.toggle('show');
    });
  });

  // Fechar popover se o usuário clicar fora dele
  if (!window.popoverListenerAtivo) {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.reaction-picker-wrap')) {
        document.querySelectorAll('.reaction-popover.show').forEach(p => p.classList.remove('show'));
      }
    });
    window.popoverListenerAtivo = true;
  }

  // Salvar a reação ao clicar nos emojis (seja no popover ou nos já existentes)
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleReaction(btn.dataset.cid, btn.dataset.emoji));
  });
}

async function loadComments(pid) {
  if (commCache[pid]) return commCache[pid];
  const { data, error } = await sb.from('comentarios')
    .select('id, comentario, criado_em, usuario_id, perfis(nome), reacoes(id, emoji, usuario_id)')
    .eq('presente_id', pid).order('criado_em');
  if (error) console.warn('[comments]', error.message);
  commCache[pid] = data ||[];
  return commCache[pid];
}

async function submitComment(pid, text) {
  const input = el$('ci-' + pid);
  if (input) input.value = '';
  const { error } = await sb.from('comentarios').insert({
    presente_id: pid, usuario_id: me.id, comentario: text
  });
  if (error) { toast('Erro ao enviar comentário.', 'error'); return; }
  delete commCache[pid];
  const wasOpen = el$('cb-' + pid)?.classList.contains('open');
  await renderGrid();
  if (wasOpen) { el$('cb-' + pid)?.classList.add('open'); }
}

async function toggleReaction(cid, emoji) {
  const { data } = await sb.from('reacoes').select('id')
    .eq('comentario_id', cid).eq('usuario_id', me.id).eq('emoji', emoji).maybeSingle();
    
  if (data) await sb.from('reacoes').delete().eq('id', data.id);
  else await sb.from('reacoes').insert({ comentario_id: cid, usuario_id: me.id, emoji });
  
  commCache = {};
  
  // MÁGICA: Antes de recarregar, salva quais painéis de comentário estavam abertos
  const comentariosAbertos = Array.from(document.querySelectorAll('.comments-body.open')).map(el => el.id);
  
  await renderGrid();
  
  // Após recarregar a tela, manda abrir novamente os que estavam abertos
  comentariosAbertos.forEach(id => {
    const painel = document.getElementById(id);
    if (painel) painel.classList.add('open');
  });
}

// ── Choice Modal ──────────────────────────────────────
function openChoiceModal(gid, title, price) {
  el$('modalTitle').textContent = title;
  el$('modalSub').textContent   = 'Confirme sua escolha';

  el$('modalBody').innerHTML = `
    <div class="choice-option selected" id="optGift">
      <h4>🎁 Comprar o presente</h4>
      <p>${price ? money(price) : 'Sem valor definido'} — você compra e traz no dia do chá</p>
    </div>
    <div class="field" style="margin-top:16px">
      <label>Mensagem para os pais (opcional)</label>
      <textarea id="choiceMsg" rows="2" placeholder="Uma mensagem especial..."></textarea>
    </div>
    <button class="btn btn-primary btn-full" id="btnConfirm" style="margin-top:6px">
      Confirmar escolha
    </button>`;

  el$('btnConfirm').addEventListener('click', async () => {
    const msg = val('choiceMsg');
    setBtn('btnConfirm', true, 'Confirmando...');
    await confirmChoice(gid, 'presente', price, msg);
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

  const { error } = await sb.from('escolhas').insert(payload);

  if (error) {
    const isDuplicate = error.code === '23505' || error.message.includes('unique') || error.message.includes('duplicate');
    const isEsgotado  = error.message.includes('esgotado') || error.message.includes('estoque');
    const msg = isDuplicate ? 'Você já escolheu um presente!'
              : isEsgotado  ? 'Este presente acabou de ser escolhido por outro convidado.'
              : 'Erro: ' + error.message;
    toast(msg, 'error');
    setBtn('btnConfirm', false, 'Confirmar escolha');
    return;
  }

  closeModal();
  toast('Presente escolhido com sucesso! 🎉', 'success');

  const [gr, cr] = await Promise.all([
    sb.from('presentes').select('*').eq('status', 'ativo').order('ordem'),
    sb.from('escolhas').select('*, presentes(titulo)').eq('usuario_id', me.id).maybeSingle()
  ]);
  gifts    = gr.data ||[];
  myChoice = cr.data || null;
  if (myChoice) el$('chosenBadge')?.classList.remove('hidden');
  await renderGrid();
}

function closeModal(e) {
  if (e && e.type === 'click' && e.target !== el$('modalOverlay')) return;
  el$('modalOverlay')?.classList.remove('open');
}

// ── PIX Modal ──────────────────────────────────────────

function buildPixPayload(basePayload, amount) {
    // 1. Remove o CRC antigo (últimos 4 caracteres)
    let payload = basePayload.replace(/6304.{4}$/, "");

    // 2. Remove a Tag de valor (54) se ela existir
    payload = payload.replace(/54\d{2}\d+(\.\d+)?/, "");

    // 3. Insere o novo valor formatado
    if (amount) {
        const v = Number(amount).toFixed(2);
        const len = v.length.toString().padStart(2, "0");
        payload = payload + "54" + len + v;
    }

    // 4. Adiciona o prefixo do CRC
    payload = payload + "6304";

    // 5. Calcula o novo CRC
    const crc = crc16(payload);
    return payload + crc;
}

function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
}

let pixTimer = null;

function openPixModal() {
  const hasPix = !!cfg.pix_chave;
  if (!hasPix) { toast('Chave PIX não configurada.', 'error'); return; }

  el$('pixModalBody').innerHTML = `
    <div class="pix-step" id="pixStepValor">
      <div class="field">
        <label>Valor da contribuição (R$)</label>
        <div class="pix-valor-wrap">
          <span class="pix-currency">R$</span>
          <input type="number" id="pixValor" min="1" step="0.01" placeholder="0,00"
            class="pix-valor-input" onkeydown="if(event.key==='Enter') gerarQrCode()">
        </div>
        <div class="pix-quick-btns">
          ${[20,50,100,200].map(v =>
            `<button class="pix-quick" onclick="el$('pixValor').value='${v}'">${money(v)}</button>`
          ).join('')}
        </div>
      </div>
      <div class="field">
        <label>Mensagem (opcional)</label>
        <input type="text" id="pixMsg" placeholder="Uma mensagem carinhosa...">
      </div>
      <button class="btn btn-primary btn-full" id="btnGerarQr" onclick="gerarQrCode()">
        ✨ Gerar QR Code
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
        <div class="pix-chave-row">
          <span class="pix-chave-label">PIX Copia e Cola</span>
          <button class="btn-copy" id="btnCopyPix" onclick="copyPix('payload')">📋 Copiar código</button>
        </div>
        <button class="btn-copy pix-copia-cola" id="pixCopiaECola" onclick="copyPix('payload')" style="display:none;width:100%;justify-content:center;margin-top:4px">
          📲 Copiar código Pix (Copia e Cola)
        </button>
        ${cfg.pix_nome ? `<div style="text-align:center;font-size:12px;color:var(--muted);margin-top:4px">Beneficiário: <strong>${esc(cfg.pix_nome)}</strong></div>` : ''}
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

async function gerarQrCode() {
  const valorStr = el$('pixValor')?.value?.trim();
  const valor = parseFloat(valorStr);
  if (!valor || valor <= 0) { toast('Informe um valor válido.', 'error'); return; }

  setBtn('btnGerarQr', true, 'Gerando...');

  const basePayload = cfg.pix_chave; 
  if (!basePayload || basePayload.length < 20) {
      toast('Código PIX Base inválido no Admin.', 'error');
      setBtn('btnGerarQr', false, '✨ Gerar QR Code');
      return;
  }

  const qrData = buildPixPayload(basePayload, valor);
  const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`;

  // Salva contribuição no banco
  const msg = val('pixMsg');
  const { error } = await sb.from('contribuicoes_pix').insert({
    usuario_id: me.id,
    valor: valor,
    mensagem: msg || null,
    status: 'pendente'
  });
  
  if (error && !error.message.includes('does not exist')) {
    console.warn('[pix insert]', error.message);
  }

  setBtn('btnGerarQr', false, '✨ Gerar QR Code');

  // Muda para step do QR
  el$('pixStepValor').classList.add('hidden');
  el$('pixStepQr').classList.remove('hidden');

  const qrBox = el$('pixQrBox');
  qrBox.innerHTML = `<img src="${qrUrl}" alt="QR Code PIX" style="width:220px;height:220px;border-radius:12px">`;
  setTextIfEl('pixValorDisplay', money(valor));

  // Guarda o payload para os botões de cópia
  const copyEl = el$('pixCopiaECola');
  const btnCopyPix = el$('btnCopyPix');
  
  if (copyEl) {
    copyEl.dataset.payload = qrData;
    copyEl.style.display = '';
  }
  
  if (btnCopyPix) {
    btnCopyPix.dataset.payload = qrData;
  }

  // Timer 30 min
  startPixTimer();
}

function startPixTimer() {
  clearInterval(pixTimer);
  let secs = 30 * 60;
  function tick() {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    setTextIfEl('pixTimerCount', `${m}:${s}`);
    if (secs <= 0) {
      clearInterval(pixTimer);
      el$('pixQrBox')?.classList.add('pix-expired-blur');
      el$('pixExpired')?.classList.remove('hidden');
      el$('btnCopyPix')?.setAttribute('disabled', true);
    }
    secs--;
  }
  tick();
  pixTimer = setInterval(tick, 1000);
}

function copyPix(tipo = 'payload') {
  let texto, btnId;
  
  // No caso de PIX dinâmico, sempre buscamos o payload gerado no botão
  if (tipo === 'payload') {
    const btnBig = el$('pixCopiaECola');
    const btnSmall = el$('btnCopyPix');
    texto = btnBig?.dataset?.payload || btnSmall?.dataset?.payload || '';
    btnId = btnBig?.style.display !== 'none' ? 'pixCopiaECola' : 'btnCopyPix';
  } else {
    // Caso de uso para a chave estática (raro neste fluxo atual)
    texto = cfg.pix_chave || '';
    btnId = 'btnCopyPix';
  }

  if (!texto) {
    toast('Não foi possível gerar o código para cópia.', 'error');
    return;
  }

  // Tenta usar a API Clipboard moderna
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).then(() => {
      confirmCopy(btnId);
    }).catch(() => {
      fallbackCopyTextToClipboard(texto, btnId);
    });
  } else {
    fallbackCopyTextToClipboard(texto, btnId);
  }
}

// Função de fallback para dispositivos/navegadores sem Clipboard API (ex: HTTP local ou iPhones antigos)
function fallbackCopyTextToClipboard(text, btnId) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed"; 
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    if (successful) confirmCopy(btnId);
    else toast('Não foi possível copiar.', 'error');
  } catch (err) {
    toast('Não foi possível copiar.', 'error');
  }
  document.body.removeChild(textArea);
}

function confirmCopy(btnId) {
  const btn = el$(btnId);
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ Copiado!';
    setTimeout(() => btn.innerHTML = orig, 2000);
  }
  toast('Copiado com sucesso!', 'success');
}

function closePixModal(e) {
  if (e && e.type === 'click' && e.target !== el$('modalPix')) return;
  clearInterval(pixTimer);
  el$('modalPix')?.classList.remove('open');
}

// ===================================================
// ADMIN SCREEN
// ===================================================
function goAdmin() { window.location.hash = '#admin'; renderAdmin(); }

async function renderAdmin() {
  if (!isAdmin()) { renderApp(); return; }

  document.getElementById('app').innerHTML = `
    <div class="screen-admin">
      <aside class="sidebar" id="adminSidebar">
        <div class="sidebar-brand">
          <div class="sidebar-brand-icon" id="sidebarIconEl"></div>
          <div>
            <h2>Configurações do Site</h2>
            <span>Painel Admin</span>
          </div>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-item active" data-panel="dashboard"><span class="nav-icon">📊</span>Dashboard</button>
          <button class="nav-item" data-panel="presentes"><span class="nav-icon">🎁</span>Presentes</button>
          <button class="nav-item" data-panel="escolhas"><span class="nav-icon">📋</span>Escolhas</button>
          <button class="nav-item" data-panel="pix"><span class="nav-icon">💸</span>PIX</button>
          <button class="nav-item" data-panel="convidados"><span class="nav-icon">👥</span>Convidados</button>
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
            <h1 id="admTitle">Dashboard</h1>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="admin-avatar">${displayName()[0]?.toUpperCase() || 'A'}</div>
            <span class="admin-user-name">${esc(displayName().split(' ')[0] || 'Admin')}</span>
          </div>
        </div>

        <div class="admin-content">

          <!-- Dashboard -->
          <div class="admin-panel active" id="ap-dashboard">
            <div class="stats-grid">
              <div class="stat-card c-terra"><div class="stat-icon">🎁</div><div class="stat-label">Presentes</div><div class="stat-value" id="stGifts">—</div></div>
              <div class="stat-card c-sage"> <div class="stat-icon">✅</div><div class="stat-label">Escolhas</div><div class="stat-value" id="stChoices">—</div></div>
              <div class="stat-card c-blue"> <div class="stat-icon">👥</div><div class="stat-label">Convidados</div><div class="stat-value" id="stGuests">—</div></div>
              <div class="stat-card c-gold"> <div class="stat-icon">💰</div><div class="stat-label">Valor Presentes</div><div class="stat-value" id="stValue">—</div></div>
              <div class="stat-card c-pix">  <div class="stat-icon">💸</div><div class="stat-label">PIX Recebido</div><div class="stat-value" id="stPix">—</div></div>
            </div>
            <div class="a-card">
              <div class="a-card-title">📋 Últimas escolhas</div>
              <div class="table-wrap">
                <table id="tDash">
                  <thead><tr><th>Convidado</th><th>Presente</th><th>Pagamento</th><th>Data</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Presentes -->
          <div class="admin-panel" id="ap-presentes">
            <div class="panel-header-row">
              <h2 class="panel-title">🎁 Presentes</h2>
              <button class="btn btn-primary" onclick="openGiftForm()">+ Novo Presente</button>
            </div>
            <div class="presents-admin-grid" id="admGiftsGrid">
              <div style="text-align:center;padding:40px;color:var(--muted)">Carregando...</div>
            </div>
          </div>

          <!-- Escolhas -->
          <div class="admin-panel" id="ap-escolhas">
            <div class="a-card">
              <div class="a-card-title">📋 Todas as Escolhas</div>
              <div class="table-wrap">
                <table id="tChoices">
                  <thead><tr><th>Convidado</th><th>E-mail</th><th>Telefone</th><th>Presente</th><th>Pagamento</th><th>Valor</th><th>Mensagem</th><th>Data</th><th>Ações</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- PIX -->
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

          <!-- Convidados -->
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

          <!-- Configurações -->
          <div class="admin-panel" id="ap-configuracoes">
            <div class="a-card">
              <div class="a-card-title">⚙️ Configurações do Evento</div>
              <div class="admin-grid-2">
                <div>
                  <div class="field"><label>Título do evento</label><input type="text" id="cfgTitle"></div>
                  <div class="field"><label>Data do evento</label><input type="date" id="cfgDate"></div>
                  <div class="field"><label>Local</label><input type="text" id="cfgLocal"></div>
                  <div class="field"><label>Descrição</label><textarea id="cfgDesc" rows="3"></textarea></div>
                  <div class="field">
                    <label>Subtítulo da tela de login</label>
                    <textarea id="cfgLoginSubtitle" rows="2" placeholder="Ex: Escolha um presente especial para celebrar..."></textarea>
                  </div>
                  <div class="field">
                    <label>Chips da tela de login <small style="color:var(--muted)">(um por linha, ex: 🤍 Com amor)</small></label>
                    <textarea id="cfgChips" rows="4" placeholder="🤍 Com muito amor&#10;✨ Momentos especiais&#10;👶 Nova vida"></textarea>
                  </div>
                </div>
                <div>
                  <div class="field"><label>Código PIX "Copia e Cola" Base (do seu Banco)</label><input type="text" id="cfgPix" placeholder="Cole o código completo aqui"></div>
                  <div class="field"><label>Nome do beneficiário PIX</label><input type="text" id="cfgPixName"></div>
                  <div class="field"><label>E-mail admin (notificações)</label><input type="email" id="cfgAdminEmail"></div>
                  <div class="field">
                    <label>🎨 Ícone do app</label>
                    <div class="icon-config-box">
                      <div class="icon-preview-big" id="iconPreviewBig">🍼</div>
                      <div class="icon-config-opts">
                        <div class="field" style="margin-bottom:10px">
                          <label style="font-size:11px">Escolha somente 1 Emoji (cole aqui)</label>
                          <input type="text" id="cfgIconEmoji" placeholder="Ex: 🐣 🍼 🌸 💛" maxlength="8"
                            oninput="previewIconInput(this.value)">
                        </div>
                        <div style="font-size:11px;color:var(--muted);margin-bottom:6px;text-align:center">— ou —</div>
                        <div class="upload-area" style="padding:12px" onclick="el$('cfgIconFile').click()">
                          <div style="font-size:20px">📷</div>
                          <p style="font-size:11px;margin:0">Esolha Carregar uma imagem</p>
                          <input type="file" id="cfgIconFile" accept="image/*" style="display:none"
                            onchange="previewIconFile(this)">
                        </div>
                        <input type="hidden" id="cfgIconBase64">
                      </div>
                    </div>
                  </div>
                  <div class="field">
                    <label>Imagem de capa</label>
                    <input type="file" id="cfgCover" accept="image/*">
                    <img id="cfgCoverPrev" class="img-preview">
                  </div>
                </div>
              </div>
              <button class="btn btn-primary" id="btnSaveCfg">💾 Salvar Configurações</button>
            </div>
          </div>

        </div>
      </main>
    </div>

    <!-- Gift modal -->
    <div class="modal-overlay" id="modalGift" onclick="closeGiftModal(event)">
      <div class="modal modal-lg">
        <button class="modal-close" onclick="closeGiftModal()">×</button>
        <h3 id="giftModalTitle">Novo Presente</h3>
        <p class="modal-sub">Preencha os dados do presente</p>
        <div id="giftModalBody"></div>
      </div>
    </div>

    <!-- Guest modal -->
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

  el$('cfgCover')?.addEventListener('change', function() { previewImg(this, 'cfgCoverPrev'); });
  el$('btnSaveCfg')?.addEventListener('click', admSaveConfig);

  // Expõe funções de preview de ícone globalmente
  window.previewIconInput = function(val) {
    const v = val.trim();
    const el = el$('iconPreviewBig');
    if (el) el.textContent = v || '🍼';
    el$('cfgIconBase64').value = '';
  };
  window.previewIconFile = async function(input) {
    if (!input.files?.[0]) return;
    const base64 = await toBase64(input.files[0]);
    el$('cfgIconBase64').value = base64;
    el$('cfgIconEmoji').value = '';
    const el = el$('iconPreviewBig');
    if (el) el.innerHTML = `<img src="${base64}" style="width:52px;height:52px;object-fit:contain;border-radius:10px">`;
  };

  await admLoadAll();
  admRenderAll();
  // Aplica ícone no sidebar após carregar cfg
  if (adm.cfg.icone_app) applyAppIcon(adm.cfg.icone_app);
}

// ── Admin: carrega dados ──────────────────────────────
async function admLoadAll() {
  const[r1, r2, r3, r4, r5] = await Promise.all([
    sb.from('presentes').select('*').order('ordem'),
    sb.from('escolhas')
      .select('*, perfis(nome,email,telefone), presentes(titulo,preco)')
      .order('criado_em', { ascending: false }),
    sb.from('perfis')
      .select('*, escolhas(presente_id, tipo_pagamento, presentes(titulo))')
      .order('criado_em'),
    sb.from('configuracoes').select('chave, valor'),
    sb.from('contribuicoes_pix')
      .select('*, perfis(nome,email)')
      .order('criado_em', { ascending: false })
  ]);

  if (r1.error) console.error('[adm gifts]',   r1.error.message);
  if (r2.error) console.error('[adm choices]', r2.error.message);
  if (r3.error) console.error('[adm users]',   r3.error.message);

  adm.gifts    = r1.data ||[];
  adm.choices  = r2.data ||[];
  adm.users    = r3.data ||[];
  adm.pix      = r5.error ? [] : (r5.data ||[]);
  adm.cfg      = {};
  if (r4.data) r4.data.forEach(c => adm.cfg[c.chave] = c.valor);
}

function admRenderAll() {
  admRenderDashboard();
  admRenderGifts();
  admRenderChoices();
  admRenderPixContribs();
  admRenderGuests();
  admRenderConfig();
}

function admShowPanel(id, btn) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-panel]').forEach(b => b.classList.remove('active'));
  el$('ap-' + id)?.classList.add('active');
  btn?.classList.add('active');
  const labels = { dashboard: 'Dashboard', presentes: 'Presentes', escolhas: 'Escolhas', pix: 'PIX', convidados: 'Convidados', configuracoes: 'Configurações' };
  setTextIfEl('admTitle', labels[id] || id);
  el$('adminSidebar')?.classList.remove('open');
  el$('sidebarOverlay')?.classList.remove('active');
}

function toggleSidebar() {
  el$('adminSidebar')?.classList.toggle('open');
  el$('sidebarOverlay')?.classList.toggle('active');
}

// ── Dashboard ─────────────────────────────────────────
function admRenderDashboard() {
  const totalValue = adm.choices.reduce((s, c) => s + (c.presentes?.preco || 0), 0);
  const totalPix   = (adm.pix ||[]).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
  setTextIfEl('stGifts',   adm.gifts.length);
  setTextIfEl('stChoices', adm.choices.length);
  setTextIfEl('stGuests',  adm.users.filter(u => u.tipo === 'usuario').length);
  setTextIfEl('stValue',   money(totalValue));
  setTextIfEl('stPix',     money(totalPix));

  const tbody = document.querySelector('#tDash tbody');
  if (!tbody) return;
  tbody.innerHTML = adm.choices.slice(0, 10).map(c => `
    <tr>
      <td><strong>${esc(c.perfis?.nome || '—')}</strong></td>
      <td>${esc(c.presentes?.titulo || '—')}</td>
      <td><span class="badge badge-${c.tipo_pagamento}">${payLabel(c.tipo_pagamento)}</span></td>
      <td style="color:var(--muted)">${fmtDate(c.criado_em)}</td>
    </tr>`).join('')
    || `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted)">Sem registros</td></tr>`;
}

// ── Gifts admin ───────────────────────────────────────
function admRenderGifts() {
  const grid = el$('admGiftsGrid');
  if (!grid) return;

  if (adm.gifts.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎁</div>
      <h3>Nenhum presente</h3>
      <p>Clique em "+ Novo Presente" para começar.</p>
    </div>`;
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
          <button class="btn btn-ghost" style="flex:1;font-size:12px;padding:7px"
            data-edit-gift="${g.id}">✏️ Editar</button>
          <button class="btn btn-danger" style="padding:7px 12px;font-size:13px"
            data-del-gift="${g.id}" data-del-name="${esc(g.titulo)}">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Bind gift actions (evita usar onclick inline com objetos complexos)
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

// ── Gift form modal ───────────────────────────────────
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
          <p>Clique para selecionar uma imagem</p>
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
  const id     = val('gmId');
  const titulo = val('gmTitle');
  if (!titulo) { toast('Título é obrigatório.', 'error'); return; }

  setBtn('btnSaveGift', true, 'Salvando...');

  let imagem_base64 = null;
  const imagem_url  = val('gmImgUrl') || null;
  const file = el$('gmImg')?.files?.[0];
  if (file) imagem_base64 = await toBase64(file);

  const payload = {
    titulo,
    descricao:     val('gmDesc')  || null,
    preco:         parseFloat(val('gmPrice')) || null,
    quantidade_max: parseInt(val('gmQty')) || 1,
    ordem:         parseInt(val('gmOrder')) || 0,
    status:        val('gmStatus') || 'ativo',
    link_compra:   val('gmLink')  || null,
    atualizado_em: new Date().toISOString(),
    ...(imagem_base64 ? { imagem_base64, imagem_url: null } : {}),
    ...(imagem_url && !imagem_base64 ? { imagem_url, imagem_base64: null } : {})
  };

  let error;
  if (id) {
    ({ error } = await sb.from('presentes').update(payload).eq('id', id));
  } else {
    payload.quantidade_restante = payload.quantidade_max;
    ({ error } = await sb.from('presentes').insert(payload));
  }

  setBtn('btnSaveGift', false, '💾 Salvar');

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  toast(id ? 'Presente atualizado! ✅' : 'Presente adicionado! ✅', 'success');
  closeGiftModal();
  await admLoadAll();
  admRenderGifts();
  admRenderDashboard();
}

async function admDeleteGift(id, name) {
  if (!confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
  const { error } = await sb.from('presentes').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Presente removido.', 'success');
  await admLoadAll();
  admRenderGifts();
  admRenderDashboard();
}

function closeGiftModal(e) {
  if (e && e.type === 'click' && e.target !== el$('modalGift')) return;
  el$('modalGift')?.classList.remove('open');
}

// ── Choices ───────────────────────────────────────────
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
      <td>
        <div class="table-actions">
          <button class="tbl-btn tbl-btn-del" title="Remover"
            onclick="admChoiceDelete('${c.id}', '${esc(c.perfis?.nome || '')}')">🗑️</button>
        </div>
      </td>
    </tr>`).join('')
    || `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">Sem escolhas</td></tr>`;
}

async function admChoiceDelete(id, nome) {
  if (!confirm(`Remover a escolha de ${nome || 'este convidado'}? O presente voltará a ficar disponível na lista.`)) return;
  const { error } = await sb.from('escolhas').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Escolha removida.', 'success');
  await admLoadAll(); 
  admRenderChoices(); 
  admRenderDashboard();
  admRenderGifts(); 
}

// ── PIX Contributions ─────────────────────────────────
function admRenderPixContribs() {
  const tbody = document.querySelector('#tPix tbody');
  if (!tbody) return;
  const list = adm.pix ||[];
  const total = list.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
  setTextIfEl('pixTotalLabel', `Total: ${money(total)}`);

  tbody.innerHTML = list.map(p => `
    <tr>
      <td><strong>${esc(p.perfis?.nome || '—')}</strong></td>
      <td style="color:var(--muted)">${esc(p.perfis?.email || '—')}</td>
      <td><strong style="color:var(--terracotta)">${money(p.valor)}</strong></td>
      <td style="color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${esc(p.mensagem||'')}">${esc(p.mensagem || '—')}</td>
      <td><span class="badge badge-pix-${p.status}">${pixStatusLabel(p.status)}</span></td>
      <td style="color:var(--muted)">${fmtDate(p.criado_em)}</td>
      <td>
        <div class="table-actions">
          <button class="tbl-btn tbl-btn-edit" title="Marcar como confirmado"
            onclick="admPixStatus('${p.id}','confirmado')">✅</button>
          <button class="tbl-btn tbl-btn-del" title="Remover"
            onclick="admPixDelete('${p.id}')">🗑️</button>
        </div>
      </td>
    </tr>`).join('')
    || `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Nenhuma contribuição PIX</td></tr>`;
}

function pixStatusLabel(s) {
  return { pendente: '⏳ Pendente', confirmado: '✅ Confirmado', cancelado: '❌ Cancelado' }[s] || s;
}

async function admPixStatus(id, status) {
  const { error } = await sb.from('contribuicoes_pix').update({ status }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Status atualizado!', 'success');
  await admLoadAll(); admRenderPixContribs(); admRenderDashboard();
}

async function admPixDelete(id) {
  if (!confirm('Remover esta contribuição?')) return;
  const { error } = await sb.from('contribuicoes_pix').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Removido.', 'success');
  await admLoadAll(); admRenderPixContribs(); admRenderDashboard();
}
function admRenderGuests() {
  const tbody = document.querySelector('#tGuests tbody');
  if (!tbody) return;
  setTextIfEl('guestCount', `${adm.users.length} cadastrado${adm.users.length !== 1 ? 's' : ''}`);
  tbody.innerHTML = adm.users.map(u => {
    const choice = u.escolhas?.[0];
    return `<tr>
      <td><strong>${esc(u.nome || '—')}</strong></td>
      <td style="color:var(--muted)">${esc(u.email || '—')}</td>
      <td style="color:var(--muted)">${esc(u.telefone || '—')}</td>
      <td><span class="badge badge-${u.tipo}">${u.tipo === 'admin' ? '⭐ Admin não excluir!' : '👤 Usuário Padão'}</span></td>
      <td>${choice ? esc(choice.presentes?.titulo || '—') : '<span style="color:var(--muted)">—</span>'}</td>
      <td style="color:var(--muted)">${fmtDate(u.criado_em)}</td>
      <td>
        <div class="table-actions">
          <button class="tbl-btn tbl-btn-edit" data-edit-guest="${u.user_id}">✏️</button>
          <button class="tbl-btn tbl-btn-del"  data-del-guest="${u.user_id}" data-del-gname="${esc(u.nome||'')}">🗑️</button>
        </div>
      </td>
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
  const userId = val('gmUserId');
  const nome   = val('gmGuestName');
  const tel    = val('gmGuestTel');
  const tipo   = val('gmGuestType');
  const pass   = val('gmGuestPass');
  const conf   = val('gmGuestConf');

  if (!nome) { toast('Nome é obrigatório.', 'error'); return; }
  if (pass) {
    if (pass.length < 6) { toast('Senha mínima 6 caracteres.', 'error'); return; }
    if (pass !== conf)   { toast('As senhas não coincidem.',    'error'); return; }
  }

  setBtn('btnSaveGuest', true, 'Salvando...');

  const { error } = await sb.from('perfis').update({
    nome, telefone: tel || null, tipo, atualizado_em: new Date().toISOString()
  }).eq('user_id', userId);

  if (error) {
    toast('Erro: ' + error.message, 'error');
    setBtn('btnSaveGuest', false, '💾 Salvar');
    return;
  }

  if (pass) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`${SB_URL}/functions/v1/admin-update-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: userId, password: pass })
      });
      if (!res.ok) toast('Dados salvos, mas a senha não foi alterada (configure a Edge Function).', 'error');
      else toast('Senha alterada! ✅', 'success');
    } catch {
      toast('Dados salvos, mas a senha não foi alterada (configure a Edge Function).', 'error');
    }
  }

  setBtn('btnSaveGuest', false, '💾 Salvar');
  toast('Convidado atualizado! ✅', 'success');
  closeGuestModal();
  await admLoadAll();
  admRenderGuests();
  admRenderDashboard();
}

async function admDeleteGuest(userId, nome) {
  if (!confirm(`Remover "${nome}" permanentemente? O acesso ao site será revogado.`)) return;
  // Deleta o perfil (CASCADE remove o usuário via FK, dependendo da configuração)
  const { error } = await sb.from('perfis').delete().eq('user_id', userId);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Convidado removido.', 'success');
  await admLoadAll();
  admRenderGuests();
  admRenderDashboard();
}

function closeGuestModal(e) {
  if (e && e.type === 'click' && e.target !== el$('modalGuest')) return;
  el$('modalGuest')?.classList.remove('open');
}

// ── Config ────────────────────────────────────────────
function admRenderConfig() {
  const c = adm.cfg;
  [['cfgTitle','evento_titulo'],['cfgDate','evento_data'],['cfgLocal','evento_local'],['cfgDesc','evento_descricao'],['cfgPix','pix_chave'],['cfgPixName','pix_nome'],['cfgAdminEmail','admin_email'],['cfgLoginSubtitle','login_subtitulo']
  ].forEach(([id, key]) => { const el = el$(id); if (el) el.value = c[key] || ''; });

  // Chips do login — armazenado como JSON array, exibido como uma linha por chip
  const chipsEl = el$('cfgChips');
  if (chipsEl) {
    try {
      const arr = JSON.parse(c.chips_login || '[]');
      chipsEl.value = Array.isArray(arr) ? arr.join('\n') : (c.chips_login || '');
    } catch { chipsEl.value = c.chips_login || ''; }
  }

  // Carrega ícone do app
  const icone = c.icone_app || '';
  const prevEl = el$('iconPreviewBig');
  if (prevEl) {
    if (icone.startsWith('data:')) {
      prevEl.innerHTML = `<img src="${icone}" style="width:52px;height:52px;object-fit:contain;border-radius:10px">`;
      const b64 = el$('cfgIconBase64'); if (b64) b64.value = icone;
    } else {
      prevEl.textContent = icone || '🍼';
      const emojiEl = el$('cfgIconEmoji'); if (emojiEl) emojiEl.value = icone;
    }
  }

  // Preview de capa existente
  if (c.imagem_capa_base64) {
    const prev = el$('cfgCoverPrev');
    if (prev) { prev.src = c.imagem_capa_base64; prev.style.display = 'block'; }
  }
}

async function admSaveConfig() {
  const pairs =[
    ['evento_titulo',    val('cfgTitle')],['evento_data',      val('cfgDate')],['evento_local',     val('cfgLocal')],['evento_descricao', val('cfgDesc')],['pix_chave',        val('cfgPix')],['pix_nome',         val('cfgPixName')],['admin_email',      val('cfgAdminEmail')],['login_subtitulo', val('cfgLoginSubtitle')]
  ];

  // Chips: pega o textarea, divide por linha, filtra vazias, salva como JSON
  const chipsRaw = el$('cfgChips')?.value || '';
  const chipsArr = chipsRaw.split('\n').map(s => s.trim()).filter(Boolean);
  pairs.push(['chips_login', JSON.stringify(chipsArr)]);

  setBtn('btnSaveCfg', true, 'Salvando...');

  for (const[chave, valor] of pairs) {
    const { error } = await sb.from('configuracoes')
      .upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
    if (error) { toast(`Erro ao salvar "${chave}": ` + error.message, 'error'); }
  }

  // Salva ícone do app
  const iconBase64 = val('cfgIconBase64');
  const iconEmoji  = val('cfgIconEmoji');
  const iconValor  = iconBase64 || iconEmoji;
  if (iconValor) {
    await sb.from('configuracoes')
      .upsert({ chave: 'icone_app', valor: iconValor, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
    applyAppIcon(iconValor);
  }

  const coverFile = el$('cfgCover')?.files?.[0];
  if (coverFile) {
    const base64 = await toBase64(coverFile);
    await sb.from('configuracoes')
      .upsert({ chave: 'imagem_capa_base64', valor: base64, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
  }

  setBtn('btnSaveCfg', false, '💾 Salvar Configurações');
  toast('Configurações salvas! ✅', 'success');
  await admLoadAll();
  admRenderConfig();
}

function backToSite() { window.location.hash = ''; commCache = {}; renderApp(); }

// ===================================================
// UTILITIES
// ===================================================
function el$(id)           { return document.getElementById(id); }
function val(id)           { return el$(id)?.value?.trim() || ''; }
function setTextIfEl(id,v) { const el = el$(id); if (el) el.textContent = v; }
function showAlert(el, msg){ if (!el) return; el.textContent = msg; el.classList.add('show'); }

function setBtn(id, loading, label) {
  const btn = el$(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = label;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function togglePass(inputId, btn) {
  const input = el$(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

function previewImg(input, prevId) {
  if (!input.files?.[0]) return;
  const r = new FileReader();
  r.onload = e => {
    const el = el$(prevId);
    if (el) { el.src = e.target.result; el.style.display = 'block'; }
  };
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

function money(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—';
}

function payLabel(t) {
  return { presente: '🎁 Presente', pix: '💰 PIX', dinheiro: '💵 Dinheiro' }[t] || t || '—';
}

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