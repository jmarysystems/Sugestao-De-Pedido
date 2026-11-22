// Shell: login, layout e rotas do sistema Sugestão de Pedido.
import { sb, sair, sessao, perfilAtual, entrar, minhasPermissoes } from './api.js?v=20261122r';
import { SISTEMA } from './config.js?v=20261122r';
import * as ui from './ui.js?v=20261122r';
import * as dashboard from './views/dashboard.js?v=20261122r';
import * as sugestao from './views/sugestao.js?v=20261122r';
import * as pedidos from './views/pedidos.js?v=20261122r';
import * as listas from './views/listas.js?v=20261122r';

const app = document.getElementById('app');
let perfil = null;

const ROTULOS = {
  admin_sistema: 'Administrador do Sistema',
  administrador: 'Administrador',
  leitura: 'Leitura',
  fornecedor: 'Fornecedor',
  armazenados: 'Armazenados',
};

// outros sistemas que já existem
const LINKS = [
  { nome: 'Fornecedores', url: 'https://www.jmarysystems.com.br/Fornecedores/', icone: '◇' },
  { nome: 'Prod. por fornecedor', url: 'https://www.jmarysystems.com.br/Produtos-Por-Fornecedores/', icone: '⇄' },
  { nome: 'Produtos', url: 'https://www.jmarysystems.com.br/Produtos-Sistema/', icone: '▤' },
  { nome: 'Usuários', url: 'https://www.jmarysystems.com.br/Usuarios/', icone: '◉' },
];

function telaLogin(mensagem = '') {
  app.innerHTML = `
    <div class="tela-login">
      <form class="cartao-login" id="form-login">
        <div class="marca"><span class="marca-icone">▦</span>${ui.esc(SISTEMA)}</div>
        <h1>Entrar</h1>
        <p class="sub">Acesso com CPF/CNPJ e senha.</p>
        ${mensagem ? `<div class="erro">${ui.esc(mensagem)}</div>` : ''}
        <label class="campo"><span>CPF/CNPJ ou e-mail</span>
          <input name="documento" autocomplete="username" required autofocus></label>
        <label class="campo"><span>Senha</span>
          <input name="senha" type="password" autocomplete="current-password" required></label>
        <button class="botao-primario" style="width:100%" type="submit">Entrar</button>
      </form>
    </div>`;

  const form = document.getElementById('form-login');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const botao = form.querySelector('button');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      await entrar(form.documento.value, form.senha.value);
      perfil = await perfilAtual();
      if (!perfil) throw new Error('Sua conta não tem perfil de usuário.');
      perfil.permissoes = await minhasPermissoes();
      iniciarApp();
    } catch (erro) {
      await sair();
      telaLogin(erro.message);
    }
  });
}

function iniciarApp() {
  app.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="marca"><span class="marca-icone">▦</span>${ui.esc(SISTEMA)}</div>
        <nav>
          <a class="nav-item" href="#/dashboard"><span class="icone">▦</span>Dashboard</a>
          <a class="nav-item" href="#/sugestao"><span class="icone">✎</span>Sugestão de Pedido</a>
          <a class="nav-item" href="#/pedidos"><span class="icone">☰</span>Pedidos Sugeridos</a>
          <a class="nav-item" href="#/listas"><span class="icone">≡</span>Listas</a>
          ${LINKS.map((l) => `<a class="nav-item" href="${l.url}">
            <span class="icone">${l.icone}</span>${ui.esc(l.nome)}</a>`).join('')}
        </nav>
        <div class="sidebar-rodape">
          <div class="quem">${ui.esc(perfil.nome)}</div>
          <div class="papel">${ui.esc(ROTULOS[perfil.tipo] || perfil.tipo)}</div>
          <button type="button" id="sair">Sair</button>
        </div>
      </aside>
      <div class="conteudo">
        <header class="topbar"><h1 id="titulo">Dashboard</h1></header>
        <main id="view"><div class="carregando">Carregando…</div></main>
      </div>
    </div>`;

  document.getElementById('sair').addEventListener('click', async () => {
    await sair();
    perfil = null;
    telaLogin('Você saiu.');
  });

  if (!location.hash) location.hash = '#/dashboard';
  window.addEventListener('hashchange', navegar);
  navegar();
}

async function navegar() {
  const raiz = document.getElementById('view');
  if (!raiz) return;

  const caminho = (location.hash || '#/dashboard').replace(/^#\/?/, '');
  const partes = caminho.split('/');
  const segmento = partes[0];
  let id = null;
  if (partes.length > 1 && partes[1]) {
    try { id = decodeURIComponent(partes[1]); } catch (_) { id = partes[1]; }
  }

  for (const link of document.querySelectorAll('.nav-item')) {
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('#')) continue;
    const rota = href.replace(/^#\//, '').split('/')[0];
    link.classList.toggle('ativo', rota === segmento);
  }

  const ctx = {
    perfil,
    id,
    pode: (modulo, acao) => {
      const p = perfil.permissoes || {};
      if (p.admin) return true;
      const m = p[modulo];
      return !!(m && m[acao]);
    },
    irPara: (hash) => { location.hash = hash; },
    recarregar: () => navegar(),
    setTitulo: (texto) => {
      document.getElementById('titulo').textContent = texto;
      document.title = `${texto} · ${SISTEMA}`;
    },
  };

  raiz.innerHTML = '<div class="carregando">Carregando…</div>';

  try {
    if (segmento === 'sugestao') return await sugestao.render(raiz, ctx);
    if (segmento === 'pedidos') return await pedidos.render(raiz, ctx);
    if (segmento === 'listas') return await listas.render(raiz, ctx);
    return await dashboard.render(raiz, ctx);
  } catch (erro) {
    raiz.innerHTML = `<div class="cartao"><h2>Não foi possível carregar</h2>
      <p class="sub">${ui.esc(erro.message)}</p></div>`;
  }
}

sb.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT' && perfil) {
    perfil = null;
    telaLogin('Sessão encerrada.');
  }
});

(async function iniciar() {
  try {
    const s = await sessao();
    if (!s) return telaLogin();
    perfil = await perfilAtual();
    if (!perfil) {
      await sair();
      return telaLogin('Sua conta não tem perfil de usuário.');
    }
    perfil.permissoes = await minhasPermissoes();
    iniciarApp();
  } catch (erro) {
    telaLogin(erro.message);
  }
})();
