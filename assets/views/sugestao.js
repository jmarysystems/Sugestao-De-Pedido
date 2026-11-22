// Sugestão de Pedido: lista de sugestões (índice) e edição de uma sugestão.
import { listar, atualizar, criar, excluir, excluirOnde } from '../api.js?v=20261122s';
import * as ui from '../ui.js?v=20261122s';

const PLANILHA_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const normaliza = (v) => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().toUpperCase();

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};

const STATUS = {
  rascunho: { rotulo: 'Rascunho', cor: 'neutro' },
  enviada: { rotulo: 'Enviada', cor: 'azul' },
  aprovada: { rotulo: 'Aprovada', cor: 'verde' },
  cancelada: { rotulo: 'Cancelada', cor: 'vermelho' },
};

const MODOS = [
  { valor: 'es', rotulo: 'Estoque de Segurança' },
  { valor: 'es_dias', rotulo: 'ES + (Venda Média × Dias de Venda)' },
  { valor: 'es_prazo', rotulo: 'ES + (Venda Média × Prazo do Fornecedor)' },
  { valor: 'es_dias_prazo', rotulo: 'ES + (Venda Média × (Dias de Venda + Prazo))' },
];

const CAMPOS_POSICAO = ['gondola', 'ponto_extra', 'geladeira', 'ponta_gondola',
  'paredao_entrada', 'deposito'];

const estoqueSeguranca = (item) => CAMPOS_POSICAO
  .reduce((s, k) => s + (Number(item[k]) || 0), 0);

const estoqueTotal = (i) => {
  if (i.estoque_atual !== null && i.estoque_atual !== undefined && i.estoque_atual !== '') {
    return Number(i.estoque_atual) || 0;
  }
  return estoqueSeguranca(i);
};

function calcularEstoqueManter(item) {
  const es = estoqueSeguranca(item);
  const venda = Number(item.venda_media) || 0;
  const dias = Number(item.dias_venda) || 0;
  const prazo = Number(item.prazo_entrega) || 0;

  switch (item.modo_estoque || 'es_dias') {
    case 'es': return es;
    case 'es_prazo': return es + venda * prazo;
    case 'es_dias_prazo': return es + venda * (dias + prazo);
    default: return es + venda * dias;
  }
}

const sugeridaDe = (item) => Math.max(0,
  Math.round((calcularEstoqueManter(item) - estoqueTotal(item)) * 1000) / 1000);

const COLUNAS = {
  loja: ['LOJA'],
  codigo_categoria: ['COD CAT', 'CODIGO CATEGORIA', 'COD CATEGORIA'],
  categoria: ['CATEGORIA'],
  codigo_subcategoria: ['COD SUBCAT', 'CODIGO SUBCATEGORIA', 'COD SUBCATEGORIA'],
  subcategoria: ['SUBCATEGORIA'],
  codigo_familia: ['COD FAM', 'CODIGO FAMILIA', 'COD FAMILIA'],
  familia: ['FAMILIA'],
  sku: ['SKU'],
  ean: ['EAN', 'CODIGO DE BARRAS'],
  descricao: ['DESCRICAO DO PRODUTO', 'DESCRICAO', 'PRODUTO'],
  embalagem: ['EMBALAGEM', 'UNIDADE'],
  quantidade_por_embalagem: ['QUANTIDADE POR EMBALAGEM', 'QTD POR EMBALAGEM'],
  gondola: ['GONDOLA'],
  ponto_extra: ['PONTO EXTRA'],
  geladeira: ['GELADEIRA'],
  ponta_gondola: ['PONTA DE GONDOLA', 'PONTA GONDOLA'],
  paredao_entrada: ['PAREDAO DE ENTRADA', 'PAREDAO'],
  deposito: ['DEPOSITO'],
  fornecedor_codigo: ['CODIGO DO FORNECEDOR', 'COD FORNECEDOR'],
  fornecedor_nome: ['NOME DO FORNECEDOR', 'FORNECEDOR'],
  prazo_entrega: ['PRAZO DE ENTREGA DO FORNECEDOR', 'PRAZO DE ENTREGA', 'PRAZO'],
  dias_venda: ['PEDIDO PARA QUANTOS DIAS DE VENDA', 'DIAS DE VENDA', 'DIAS'],
  valor_unitario: ['VALOR UNITARIO', 'CUSTO', 'PRECO'],
  venda_media: ['VENDA MEDIA DIARIA', 'VENDA MEDIA', 'VENDA MEDIA DIA'],
  estoque_atual: ['ESTOQUE ATUAL', 'ESTOQUE'],
};

function mapearCabecalho(linhaCabecalho) {
  const mapa = {};
  linhaCabecalho.forEach((valor, indice) => {
    const chave = normaliza(valor);
    for (const [campo, aceitos] of Object.entries(COLUNAS)) {
      if (aceitos.includes(chave) && mapa[campo] === undefined) mapa[campo] = indice;
    }
  });
  return mapa;
}

// --------------------------------------------------------------------- índice
export async function render(raiz, ctx) {
  if (ctx.id) return renderEditor(raiz, ctx, ctx.id);
  return renderIndice(raiz, ctx);
}

async function renderIndice(raiz, ctx) {
  ctx.setTitulo('Sugestão de Pedido');

  const podeCriar = ctx.pode('sugestao', 'cadastrar') || ctx.pode('sugestao', 'editar');
  const podeExcluir = ctx.pode('sugestao', 'excluir');

  const [itens, sugestoes] = await Promise.all([
    listar('lista_de_produtos', { ordem: 'ordem', limite: 5000 }),
    listar('sugestoes', { ordem: 'nome' }),
  ]);

  // listas disponíveis como base (qualquer lista com itens)
  const listasBase = new Set(itens.map((i) => i.lista));
  for (const s of sugestoes) listasBase.add(s.nome);

  // totais por lista
  const totais = new Map();
  for (const item of itens) {
    const atual = totais.get(item.lista) || {
      itens: 0, quantidade: 0, valor: 0, sugerida: 0, criado: null, lojas: new Set(),
    };
    atual.itens += 1;
    atual.quantidade += Number(item.quantidade) || 0;
    atual.sugerida += Number(item.quantidade_sugerida) || 0;
    atual.valor += (Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0);
    if (item.loja) atual.lojas.add(item.loja);
    if (item.importado_em && (!atual.criado || item.importado_em < atual.criado)) {
      atual.criado = item.importado_em;
    }
    totais.set(item.lista, atual);
  }

  const sugestaoPorNome = new Map(sugestoes.map((s) => [s.nome, s]));

  const linhas = [...sugestoes]
    .sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || ''))
    .map((s) => {
      const d = totais.get(s.nome) || {
        itens: 0, quantidade: 0, valor: 0, sugerida: 0, criado: null, lojas: new Set(),
      };
      const st = STATUS[s.status || 'rascunho'] || STATUS.rascunho;
      return `<tr>
      <td><strong>${ui.esc(s.nome)}</strong></td>
      <td>${ui.badge(st.rotulo, st.cor)}</td>
      <td class="num">${ui.num(d.itens, 0)}</td>
      <td class="num">${ui.num(d.sugerida, 0)}</td>
      <td class="num">${ui.brl(d.valor)}</td>
      <td>${d.lojas.size ? [...d.lojas].sort().join(', ') : '—'}</td>
      <td>${s.criado_em ? ui.dataBR(s.criado_em) : '—'}</td>
      <td class="acoes">
        <a class="botao-pequeno" href="#/sugestao/${encodeURIComponent(s.nome)}">Abrir</a>
        ${podeExcluir ? `<button type="button" class="botao-pequeno botao-perigo"
          data-apagar="${ui.esc(s.nome)}">Excluir</button>` : ''}
      </td>
    </tr>`;
    }).join('');

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo">
        <h2>${sugestoes.length} sugestão(ões)</h2>
        ${podeCriar ? '<button type="button" class="botao-primario" id="nova">Nova sugestão</button>' : ''}
      </div>
      <p class="sub">A sugestão nasce de uma lista já importada. Ao criar, escolha a lista
        base e o nome da nova sugestão — os itens são copiados.</p>
      ${sugestoes.length ? `<div class="tabela-rolagem"><table>
        <thead><tr><th>Sugestão</th><th>Status</th><th class="num">Itens</th>
          <th class="num">Qtd sugerida</th><th class="num">Valor</th>
          <th>Lojas</th><th>Criada em</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>`
        : ui.vazio('Nenhuma sugestão criada. Importe uma lista e clique em "Nova sugestão".')}
    </div>`;

  raiz.querySelector('#nova')?.addEventListener('click', () => {
    const { fechar, corpo } = ui.modal({
      titulo: 'Nova sugestão',
      largura: '560px',
      corpo: `
        <p class="sub">Escolha a lista que servirá de base. Os itens são copiados
          para a nova sugestão (a lista original não muda).</p>
        <label class="campo"><span>Lista base</span>
          <select id="base">
            ${[...listasBase].sort().map((l) => `<option value="${ui.esc(l)}">${
              ui.esc(l)} (${(totais.get(l)?.itens) || 0} itens)</option>`).join('')}
          </select></label>
        <label class="campo"><span>Nome da nova sugestão</span>
          <input id="nome" value="${ui.esc(`Sugestão ${new Date().toLocaleDateString('pt-BR')}`)}"></label>
        <div class="linha-acoes" style="margin-top:14px">
          <button type="button" class="botao-primario" id="criar">Criar e abrir</button>
          <button type="button" id="cancelar">Cancelar</button>
        </div>
        <div class="sub" id="info" style="margin-top:10px"></div>`,
    });

    corpo.querySelector('#cancelar').addEventListener('click', fechar);

    corpo.querySelector('#criar').addEventListener('click', async () => {
      const base = corpo.querySelector('#base').value;
      const nome = corpo.querySelector('#nome').value.trim();
      const info = corpo.querySelector('#info');

      if (!nome) { ui.toast('Informe o nome da sugestão.', 'erro'); return; }
      if (sugestaoPorNome.has(nome)) {
        ui.toast('Já existe uma sugestão com esse nome.', 'erro');
        return;
      }
      if (!base) { ui.toast('Escolha a lista base.', 'erro'); return; }

      const botao = corpo.querySelector('#criar');
      botao.disabled = true;
      botao.textContent = 'Criando…';

      try {
        const origem = itens.filter((i) => i.lista === base);
        const TAMANHO = 100;
        for (let i = 0; i < origem.length; i += TAMANHO) {
          const lote = origem.slice(i, i + TAMANHO).map((item) => {
            const copia = { ...item, lista: nome };
            delete copia.id;
            delete copia.criado_em;
            copia.importado_em = new Date().toISOString();
            return copia;
          });
          await criar('lista_de_produtos', lote);
          if (info) info.textContent = `copiando ${Math.min(i + TAMANHO, origem.length)}/${origem.length}…`;
        }

        await criar('sugestoes', { nome, status: 'rascunho', criado_por: ctx.perfil?.id || null });

        ui.toast(`Sugestão criada com ${origem.length} item(ns).`);
        fechar();
        ctx.irPara(`#/sugestao/${encodeURIComponent(nome)}`);
      } catch (erro) {
        ui.toast(erro.message, 'erro');
        if (info) info.textContent = erro.message;
        botao.disabled = false;
        botao.textContent = 'Criar e abrir';
      }
    });
  });

  for (const b of raiz.querySelectorAll('[data-apagar]')) {
    b.addEventListener('click', async () => {
      const nome = b.dataset.apagar;
      if (!window.confirm(`Excluir a sugestão "${nome}" e todos os seus itens?`)) return;
      try {
        await excluirOnde('lista_de_produtos', { lista: nome });
        const cab = sugestaoPorNome.get(nome);
        if (cab) await excluir('sugestoes', cab.id);
        ui.toast('Sugestão excluída.');
        ctx.recarregar();
      } catch (erro) { ui.toast(erro.message, 'erro'); }
    });
  }
}

// --------------------------------------------------------------------- editor
async function renderEditor(raiz, ctx, lista) {
  ctx.setTitulo(lista);

  const podeEditar = ctx.pode('sugestao', 'editar') || ctx.pode('sugestao', 'cadastrar');
  const podeExcluir = ctx.pode('sugestao', 'excluir');

  const [itens, produtos, cabecalhos, fornecedores, pedidosGerados] = await Promise.all([
    listar('lista_de_produtos', { ordem: 'ordem' }),
    listar('produtos', { select: 'id, sku, descricao, unidade', ordem: 'sku' }),
    listar('sugestoes', { ordem: 'nome' }),
    listar('fornecedores', { select: 'id, razao_social, email, whatsapp, contato_nome' }),
    listar('sugestoes_pedidos', {
      select: '*', eq: { sugestao: lista }, ordem: 'criado_em', asc: false,
    }),
  ]);

  const cabecalho = cabecalhos.find((c) => c.nome === lista) || null;
  const statusAtual = STATUS[cabecalho?.status || 'rascunho'] || STATUS.rascunho;
  const daLista = () => itens.filter((i) => i.lista === lista);

  const itensAtuais = daLista();
  const totalSugerido = itensAtuais.reduce((s, i) => s + sugeridaDe(i), 0);
  const totalPedir = itensAtuais.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
  const totalValor = itensAtuais.reduce(
    (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0);

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo">
        <div class="linha-acoes" style="align-items:flex-start;gap:12px">
          <div>
            <h2 style="display:flex;align-items:center;gap:10px;margin:0">
              ${ui.esc(lista)} ${ui.badge(statusAtual.rotulo, statusAtual.cor)}
            </h2>
            <p class="sub" style="margin:6px 0 0">
              criada em ${cabecalho?.criado_em ? ui.dataBR(cabecalho.criado_em) : '—'} ·
              ${itensAtuais.length} item(ns) ·
              sugerido ${ui.num(totalSugerido, 0)} · a pedir ${ui.num(totalPedir, 0)} ·
              ${ui.brl(totalValor)}
            </p>
          </div>
        </div>
        <div class="linha-acoes">
          <a class="botao-pequeno" href="#/sugestao">← Voltar</a>
          <button type="button" class="botao-pequeno" id="imprimir">Imprimir</button>
          ${podeEditar ? '<button type="button" class="botao-pequeno" id="editar-sugestao">Editar</button>' : ''}
          ${podeEditar ? '<button type="button" class="botao-pequeno" id="adicionar-item">Adicionar item</button>' : ''}
          ${podeEditar ? '<button type="button" class="botao-pequeno" id="importar">Importar lista</button>' : ''}
          ${podeEditar ? '<button type="button" class="botao-primario" id="finalizar">Finalizar</button>' : ''}
          ${podeExcluir ? '<button type="button" class="botao-pequeno botao-perigo" id="excluir-sugestao">Excluir</button>' : ''}
        </div>
      </div>
    </div>

    <div class="cartao">
      <div class="cartao-topo">
        <h2>Itens (${itensAtuais.length})</h2>
        <span class="sub" id="resumo"></span>
      </div>

      <div class="linha-acoes" style="margin-bottom:12px;flex-wrap:wrap">
        <label class="campo" style="max-width:420px;margin:0"><span>Calcular todas as linhas com</span>
          <select id="modo-padrao">
            ${MODOS.map((m) => `<option value="${m.valor}">${ui.esc(m.rotulo)}</option>`).join('')}
          </select></label>
        <button type="button" class="botao-pequeno" id="aplicar-modo">Aplicar a todas</button>
        <button type="button" class="botao-pequeno" id="aplicar-sugestao">Usar a quantidade sugerida</button>
        <span class="sub" id="calc-status"></span>
      </div>

      <div class="linha-acoes" style="margin-bottom:12px;flex-wrap:wrap">
        <label class="campo" style="max-width:190px;margin:0"><span>Dias de venda p/ todos</span>
          <input type="number" id="dias-todos" min="0" placeholder="ex.: 7"></label>
        <button type="button" class="botao-pequeno" id="aplicar-dias">Aplicar dias</button>
        <label class="campo" style="max-width:190px;margin:0"><span>Prazo do fornecedor p/ todos</span>
          <input type="number" id="prazo-todos" min="0" placeholder="ex.: 2"></label>
        <button type="button" class="botao-pequeno" id="aplicar-prazo">Aplicar prazo</button>
        <span class="sub" id="lote-status"></span>
      </div>

      <div id="tabela"></div>
    </div>

    <div class="cartao">
      <h2>Resumo por fornecedor</h2>
      <div id="resumo-fornecedor"></div>
    </div>

    <div class="cartao">
      <div class="cartao-topo">
        <h2>Pedido sugerido</h2>
        ${podeEditar ? '<button type="button" class="botao-primario" id="gerar-pedido">Gerar pedido sugerido</button>' : ''}
      </div>
      <p class="sub">O pedido só é criado quando você clicar no botão. Depois de gerado,
        pode ser enviado por WhatsApp ou e-mail usando o contato do fornecedor.</p>
      <div id="pedidos"></div>
    </div>`;

  const tabela = raiz.querySelector('#tabela');
  const resumo = raiz.querySelector('#resumo');

  function desenhar() {
    const listaItens = daLista().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const tQtd = listaItens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
    const tValor = listaItens.reduce(
      (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0);
    const tSug = listaItens.reduce((s, i) => s + sugeridaDe(i), 0);

    resumo.textContent = `sugerido ${ui.num(tSug, 0)} · a pedir ${ui.num(tQtd, 0)} · ${ui.brl(tValor)}`;

    tabela.innerHTML = listaItens.length ? `
      <div class="tabela-rolagem"><table>
        <thead><tr>
          <th>Loja</th><th>SKU</th><th>Descrição</th><th>Emb.</th>
          <th class="num">Estoque</th><th class="num">Segurança</th>
          <th class="num">Venda méd.</th><th class="num">Dias venda</th>
          <th class="num">Prazo forn.</th><th>Total do Estoque Para Manter</th>
          <th class="num">Qtd sugerida</th><th class="num">Qtd a pedir</th><th></th>
        </tr></thead>
        <tbody>
          ${listaItens.map((i) => {
            const manter = calcularEstoqueManter(i);
            return `<tr>
            <td>${ui.esc(i.loja || '—')}</td>
            <td class="mono">${ui.esc(i.sku || '')}</td>
            <td title="${ui.esc(i.fornecedor_nome || '')}">${ui.esc(i.descricao || '')}</td>
            <td>${ui.esc(i.embalagem || i.unidade || '')}</td>
            <td class="num">${ui.num(estoqueTotal(i), 0)}</td>
            <td class="num" title="gôndola + ponto extra + geladeira + ponta + paredão + depósito">
              ${ui.num(estoqueSeguranca(i), 0)}</td>
            <td class="num"><input type="number" step="0.001" value="${i.venda_media ?? ''}"
                  data-venda="${ui.esc(i.id)}" style="width:80px;text-align:right"
                  ${podeEditar ? '' : 'disabled'}></td>
            <td class="num"><input type="number" step="1" min="0" value="${i.dias_venda ?? ''}"
                  data-dias="${ui.esc(i.id)}" style="width:70px;text-align:right"
                  ${podeEditar ? '' : 'disabled'}></td>
            <td class="num"><input type="number" step="1" min="0" value="${i.prazo_entrega ?? ''}"
                  data-prazo="${ui.esc(i.id)}" style="width:70px;text-align:right"
                  ${podeEditar ? '' : 'disabled'}></td>
            <td>
              <select data-modo="${ui.esc(i.id)}" style="max-width:280px"
                      ${podeEditar ? '' : 'disabled'}>
                ${MODOS.map((m) => `<option value="${m.valor}" ${
                  (i.modo_estoque || 'es_dias') === m.valor ? 'selected' : ''}>${
                  ui.esc(m.rotulo)}</option>`).join('')}
              </select>
              <div class="sub" style="font-size:11px">Total: <strong>${ui.num(manter, 2)}</strong></div>
            </td>
            <td class="num">${ui.num(sugeridaDe(i), 2)}</td>
            <td class="num">
              <input type="number" step="0.001" value="${i.quantidade ?? 0}"
                     data-qtd="${ui.esc(i.id)}" style="width:100px;text-align:right"
                     ${podeEditar ? '' : 'disabled'}>
            </td>
            <td>${podeExcluir ? `<button type="button" class="botao-pequeno botao-perigo"
              data-remover="${ui.esc(i.id)}">Remover</button>` : ''}</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table></div>` : ui.vazio('Nenhum item nesta sugestão. Use "Adicionar item" ou "Importar lista".');

    // ------------------------------------------------ resumo por fornecedor
    const grupos = new Map();
    for (const item of listaItens) {
      const fornecedor = item.fornecedor_nome || 'Sem fornecedor';
      const atual = grupos.get(fornecedor) || { itens: 0, quantidade: 0, valor: 0, prazo: 0 };
      atual.itens += 1;
      atual.quantidade += Number(item.quantidade) || 0;
      atual.valor += (Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0);
      atual.prazo = Math.max(atual.prazo, Number(item.prazo_entrega) || 0);
      grupos.set(fornecedor, atual);
    }

    const alvoResumo = raiz.querySelector('#resumo-fornecedor');
    alvoResumo.innerHTML = grupos.size ? `<div class="tabela-rolagem"><table>
      <thead><tr><th>Fornecedor</th><th class="num">Itens</th>
        <th class="num">Quantidade</th><th class="num">Prazo</th><th class="num">Valor</th></tr></thead>
      <tbody>
        ${[...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([nome, d]) => `<tr>
          <td>${ui.esc(nome)}</td>
          <td class="num">${ui.num(d.itens, 0)}</td>
          <td class="num">${ui.num(d.quantidade, 0)}</td>
          <td class="num">${d.prazo ? `${d.prazo} dia(s)` : '—'}</td>
          <td class="num">${ui.brl(d.valor)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr><th>Total</th><th class="num">${ui.num(listaItens.length, 0)}</th>
        <th class="num">${ui.num(tQtd, 0)}</th><th></th>
        <th class="num">${ui.brl(tValor)}</th></tr></tfoot>
    </table></div>` : ui.vazio('Sem itens para resumir.');

    async function salvarCalculo(item) {
      item.estoque_seguranca = estoqueSeguranca(item);
      const manter = calcularEstoqueManter(item);
      const sugerida = Math.max(0, Math.round((manter - estoqueTotal(item)) * 1000) / 1000);
      item.estoque_manter = manter;
      item.quantidade_sugerida = sugerida;
      await atualizar('lista_de_produtos', item.id, {
        estoque_seguranca: item.estoque_seguranca,
        venda_media: item.venda_media === '' ? null : Number(item.venda_media),
        dias_venda: item.dias_venda === '' ? null : Number(item.dias_venda),
        prazo_entrega: item.prazo_entrega === '' ? null : Number(item.prazo_entrega),
        modo_estoque: item.modo_estoque || 'es_dias',
        estoque_manter: manter,
        quantidade_sugerida: sugerida,
      });
    }

    for (const el of tabela.querySelectorAll('[data-venda]')) {
      el.addEventListener('change', async () => {
        const item = itens.find((i) => i.id === el.dataset.venda);
        if (!item) return;
        item.venda_media = el.value === '' ? null : Number(el.value);
        try { await salvarCalculo(item); desenhar(); }
        catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }

    for (const el of tabela.querySelectorAll('[data-dias]')) {
      el.addEventListener('change', async () => {
        const item = itens.find((i) => i.id === el.dataset.dias);
        if (!item) return;
        item.dias_venda = el.value === '' ? null : Number(el.value);
        try { await salvarCalculo(item); desenhar(); }
        catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }

    for (const el of tabela.querySelectorAll('[data-prazo]')) {
      el.addEventListener('change', async () => {
        const item = itens.find((i) => i.id === el.dataset.prazo);
        if (!item) return;
        item.prazo_entrega = el.value === '' ? null : Number(el.value);
        try { await salvarCalculo(item); desenhar(); }
        catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }

    for (const el of tabela.querySelectorAll('[data-modo]')) {
      el.addEventListener('change', async () => {
        const item = itens.find((i) => i.id === el.dataset.modo);
        if (!item) return;
        item.modo_estoque = el.value;
        try { await salvarCalculo(item); desenhar(); }
        catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }

    for (const campo of tabela.querySelectorAll('[data-qtd]')) {
      campo.addEventListener('change', async () => {
        try {
          await atualizar('lista_de_produtos', campo.dataset.qtd,
            { quantidade: Number(campo.value) || 0 });
          const item = itens.find((i) => i.id === campo.dataset.qtd);
          if (item) item.quantidade = Number(campo.value) || 0;
          desenhar();
        } catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }

    for (const b of tabela.querySelectorAll('[data-remover]')) {
      b.addEventListener('click', async () => {
        if (!window.confirm('Remover este item da sugestão?')) return;
        try {
          await excluir('lista_de_produtos', b.dataset.remover);
          const idx = itens.findIndex((i) => i.id === b.dataset.remover);
          if (idx >= 0) itens.splice(idx, 1);
          ui.toast('Item removido.');
          ctx.recarregar();
        } catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }
  }

  // ----------------------------------------------------------------- editar
  raiz.querySelector('#editar-sugestao')?.addEventListener('click', () => {
    const { fechar, corpo } = ui.modal({
      titulo: 'Editar sugestão',
      largura: '520px',
      corpo: `
        <label class="campo"><span>Nome da sugestão</span>
          <input id="nome" value="${ui.esc(lista)}"></label>
        <label class="campo"><span>Status</span>
          <select id="status">
            ${Object.entries(STATUS).map(([valor, s]) => `<option value="${valor}" ${
              (cabecalho?.status || 'rascunho') === valor ? 'selected' : ''
            }>${ui.esc(s.rotulo)}</option>`).join('')}
          </select></label>
        <p class="sub">Os itens e as quantidades são mantidos.</p>
        <div class="linha-acoes" style="margin-top:12px">
          <button type="button" class="botao-primario" id="salvar">Salvar</button>
          <button type="button" id="cancelar">Cancelar</button>
        </div>
        <div class="sub" id="info" style="margin-top:8px"></div>`,
    });

    corpo.querySelector('#cancelar').addEventListener('click', fechar);

    corpo.querySelector('#salvar').addEventListener('click', async () => {
      const novo = corpo.querySelector('#nome').value.trim();
      const novoStatus = corpo.querySelector('#status').value;
      const info = corpo.querySelector('#info');

      if (!novo) { ui.toast('Informe o nome.', 'erro'); return; }

      const botao = corpo.querySelector('#salvar');
      botao.disabled = true;
      botao.textContent = 'Salvando…';

      try {
        if (novo !== lista) {
          const existentes = await listar('sugestoes', { eq: { nome: novo } });
          if (existentes.length) {
            throw new Error('Já existe uma sugestão com esse nome.');
          }
          for (const item of daLista()) {
            await atualizar('lista_de_produtos', item.id, { lista: novo });
          }
          if (info) info.textContent = 'itens renomeados';
        }

        if (cabecalho) {
          await atualizar('sugestoes', cabecalho.id, {
            nome: novo, status: novoStatus, atualizado_em: new Date().toISOString(),
          });
        } else {
          await criar('sugestoes', { nome: novo, status: novoStatus });
        }

        ui.toast('Sugestão atualizada.');
        fechar();
        ctx.irPara(`#/sugestao/${encodeURIComponent(novo)}`);
        ctx.recarregar();
      } catch (erro) {
        ui.toast(erro.message, 'erro');
        if (info) info.textContent = erro.message;
        botao.disabled = false;
        botao.textContent = 'Salvar';
      }
    });
  });

  // --------------------------------------------------------- adicionar item
  raiz.querySelector('#adicionar-item')?.addEventListener('click', () => {
    const { fechar, corpo } = ui.modal({
      titulo: 'Adicionar item',
      largura: '760px',
      corpo: `
        <label class="campo"><span>Produto (SKU ou descrição)</span>
          <input type="search" id="busca" placeholder="digite para procurar"></label>
        <div id="achados" class="sub" style="margin-top:8px"></div>`,
    });

    const busca = corpo.querySelector('#busca');
    const achados = corpo.querySelector('#achados');

    function procurar(termo) {
      const t = termo.trim().toLowerCase();
      if (t.length < 2) { achados.innerHTML = ''; return; }

      const listaAchados = produtos
        .filter((p) => `${p.sku} ${p.descricao}`.toLowerCase().includes(t))
        .slice(0, 12);

      achados.innerHTML = listaAchados.length
        ? `<div class="tabela-rolagem"><table>
            <thead><tr><th>SKU</th><th>Descrição</th><th>Un.</th>
              <th class="num">Qtd</th><th></th></tr></thead>
            <tbody>
              ${listaAchados.map((p) => `<tr>
                <td class="mono">${ui.esc(p.sku)}</td>
                <td>${ui.esc(p.descricao)}</td>
                <td>${ui.esc(p.unidade || '')}</td>
                <td class="num"><input type="number" step="0.001" value="1"
                       id="qtd-${ui.esc(p.id)}" style="width:90px;text-align:right"></td>
                <td><button type="button" class="botao-pequeno"
                      data-add="${ui.esc(p.id)}">Adicionar</button></td>
              </tr>`).join('')}
            </tbody></table></div>`
        : '<p class="sub">Nenhum produto encontrado.</p>';

      for (const b of achados.querySelectorAll('[data-add]')) {
        b.addEventListener('click', async () => {
          const produto = produtos.find((p) => p.id === b.dataset.add);
          const qtd = Number(achados.querySelector(`#qtd-${b.dataset.add}`)?.value) || 1;
          if (daLista().some((i) => i.produto_id === produto.id)) {
            ui.toast('Este produto já está na sugestão.', 'erro');
            return;
          }
          try {
            const novo = await criar('lista_de_produtos', {
              lista, sku: produto.sku, descricao: produto.descricao,
              unidade: produto.unidade || 'UN', quantidade: qtd,
              produto_id: produto.id, ordem: daLista().length + 1,
              modo_estoque: 'es_dias', estoque_seguranca: 0,
            });
            itens.push(novo);
            ui.toast('Produto adicionado.');
            fechar();
            ctx.recarregar();
          } catch (erro) { ui.toast(erro.message, 'erro'); }
        });
      }
    }

    busca.addEventListener('input', () => procurar(busca.value));
    busca.focus();
  });

  // ------------------------------------------------------------- finalizar
  raiz.querySelector('#finalizar')?.addEventListener('click', async () => {
    if (!window.confirm('Finalizar a sugestão e marcá-la como "Enviada"?')) return;
    try {
      if (cabecalho) {
        await atualizar('sugestoes', cabecalho.id,
          { status: 'enviada', atualizado_em: new Date().toISOString() });
      } else {
        await criar('sugestoes', { nome: lista, status: 'enviada' });
      }
      ui.toast('Sugestão finalizada (Enviada).');
      ctx.recarregar();
    } catch (erro) { ui.toast(erro.message, 'erro'); }
  });

  // --------------------------------------------------------------- excluir
  raiz.querySelector('#excluir-sugestao')?.addEventListener('click', async () => {
    if (!window.confirm(`Excluir a sugestão "${lista}" e todos os seus itens?`)) return;
    try {
      await excluirOnde('lista_de_produtos', { lista });
      if (cabecalho) await excluir('sugestoes', cabecalho.id);
      ui.toast('Sugestão excluída.');
      ctx.irPara('#/sugestao');
      ctx.recarregar();
    } catch (erro) { ui.toast(erro.message, 'erro'); }
  });

  // ------------------------------------------------------- ações em massa
  raiz.querySelector('#aplicar-modo')?.addEventListener('click', async () => {
    const modo = raiz.querySelector('#modo-padrao').value;
    const status = raiz.querySelector('#calc-status');
    const listaItens = daLista();
    if (!listaItens.length) return;

    if (status) status.textContent = `calculando ${listaItens.length} linha(s)…`;
    try {
      for (const item of listaItens) {
        item.modo_estoque = modo;
        item.estoque_seguranca = estoqueSeguranca(item);
        item.estoque_manter = calcularEstoqueManter(item);
        item.quantidade_sugerida = sugeridaDe(item);
        await atualizar('lista_de_produtos', item.id, {
          modo_estoque: modo,
          estoque_seguranca: item.estoque_seguranca,
          estoque_manter: item.estoque_manter,
          quantidade_sugerida: item.quantidade_sugerida,
        });
      }
      if (status) status.textContent = 'cálculo aplicado';
      ui.toast('Cálculo aplicado a todas as linhas.');
      ctx.recarregar();
    } catch (erro) {
      ui.toast(erro.message, 'erro');
      if (status) status.textContent = '';
    }
  });

  async function aplicarEmTodos(campo, valor, rotulo) {
    const listaItens = daLista();
    const status = raiz.querySelector('#lote-status');
    if (!listaItens.length) { ui.toast('Nenhum item na sugestão.', 'erro'); return; }

    if (valor === null || valor === '' || Number.isNaN(Number(valor))) {
      ui.toast(`Informe ${rotulo}.`, 'erro');
      return;
    }

    if (status) status.textContent = `aplicando ${rotulo} em ${listaItens.length} linha(s)…`;

    try {
      for (const item of listaItens) {
        item[campo] = Number(valor);
        item.estoque_seguranca = estoqueSeguranca(item);
        item.estoque_manter = calcularEstoqueManter(item);
        item.quantidade_sugerida = sugeridaDe(item);
        await atualizar('lista_de_produtos', item.id, {
          [campo]: Number(valor),
          estoque_seguranca: item.estoque_seguranca,
          estoque_manter: item.estoque_manter,
          quantidade_sugerida: item.quantidade_sugerida,
        });
      }
      if (status) status.textContent = `${rotulo} aplicado a ${listaItens.length} item(ns)`;
      ui.toast(`${rotulo} aplicado a todos os itens.`);
      ctx.recarregar();
    } catch (erro) {
      ui.toast(erro.message, 'erro');
      if (status) status.textContent = '';
    }
  }

  raiz.querySelector('#aplicar-dias')?.addEventListener('click', () => {
    aplicarEmTodos('dias_venda', raiz.querySelector('#dias-todos').value, 'dias de venda');
  });

  raiz.querySelector('#aplicar-prazo')?.addEventListener('click', () => {
    aplicarEmTodos('prazo_entrega', raiz.querySelector('#prazo-todos').value,
      'prazo do fornecedor');
  });

  raiz.querySelector('#aplicar-sugestao')?.addEventListener('click', async () => {
    const listaItens = daLista();
    if (!listaItens.length) return;
    if (!window.confirm(`Copiar a quantidade sugerida para "Qtd a pedir" em ${listaItens.length} linha(s)?`)) return;

    try {
      for (const item of listaItens) {
        const sugerida = sugeridaDe(item);
        item.quantidade = sugerida;
        await atualizar('lista_de_produtos', item.id, {
          quantidade: sugerida,
          quantidade_sugerida: sugerida,
          estoque_seguranca: estoqueSeguranca(item),
          estoque_manter: calcularEstoqueManter(item),
        });
      }
      ui.toast('Quantidade sugerida aplicada.');
      ctx.recarregar();
    } catch (erro) { ui.toast(erro.message, 'erro'); }
  });

  // ------------------------------------------------------------- importação
  raiz.querySelector('#importar')?.addEventListener('click', () => {
    const { fechar, corpo } = ui.modal({
      titulo: 'Importar lista de arquivo',
      largura: '620px',
      corpo: `
        <p class="sub">Aceita a planilha do ressuprimento (.xlsx, .xls) ou um .csv.
          As colunas são reconhecidas pelo título.</p>
        <label class="campo"><span>Arquivo</span>
          <input type="file" id="arquivo" accept=".xlsx,.xls,.csv"></label>
        <label class="campo" style="flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" id="limpar"> <span>Limpar a sugestão antes de importar</span>
        </label>
        <div class="linha-acoes" style="margin-top:14px">
          <button type="button" class="botao-primario" id="confirmar">Importar</button>
          <button type="button" id="cancelar">Cancelar</button>
        </div>
        <div class="sub" id="info" style="margin-top:10px"></div>`,
    });

    corpo.querySelector('#cancelar').addEventListener('click', fechar);

    corpo.querySelector('#confirmar').addEventListener('click', async () => {
      const arquivo = corpo.querySelector('#arquivo').files[0];
      const limpar = corpo.querySelector('#limpar').checked;
      const info = corpo.querySelector('#info');

      if (!arquivo) { ui.toast('Escolha o arquivo.', 'erro'); return; }

      const botao = corpo.querySelector('#confirmar');
      botao.disabled = true;
      botao.textContent = 'Lendo…';

      try {
        const XLSX = await import(PLANILHA_URL);
        const buffer = await arquivo.arrayBuffer();
        const livro = XLSX.read(buffer, { type: 'array' });

        const nomeAba = livro.SheetNames.find((n) => normaliza(n) === 'RELATORIO')
          || livro.SheetNames[0];
        const linhas = XLSX.utils.sheet_to_json(livro.Sheets[nomeAba], { header: 1, defval: null });

        const mapa = mapearCabecalho(linhas[0] || []);
        if (mapa.sku === undefined && mapa.descricao === undefined) {
          throw new Error('Não encontrei as colunas de SKU/descrição no arquivo.');
        }


        // ---------- cadastros: cria o que não existe e guarda o vínculo
        const [cats, subs, fams, lojas, todosProdutos] = await Promise.all([
          listar('arm_categorias', { ordem: 'descricao' }),
          listar('arm_subcategorias', { ordem: 'descricao' }),
          listar('arm_familias', { ordem: 'descricao' }),
          listar('arm_lojas', { ordem: 'nome' }),
          listar('produtos', { select: 'id, sku', ordem: 'sku' }),
        ]);

        const porCodigo = (lista) => new Map(
          lista.map((x) => [String(x.codigo_auxiliar ?? '').trim(), x]));
        const catPorCod = porCodigo(cats);
        const subPorCod = porCodigo(subs);
        const famPorCod = porCodigo(fams);
        const prodPorSku = new Map((todosProdutos || [])
          .map((p) => [String(p.sku).trim(), p]));
        const lojasNorm = lojas.map((l) => ({
          loja: l, fantasia: normaliza(l.nome_fantasia), razao: normaliza(l.nome),
        }));

        function acharLoja(chave) {
          if (!chave) return null;
          const exata = lojasNorm.find((x) => x.fantasia === chave || x.razao === chave);
          if (exata) return exata.loja;
          const prefixo = lojasNorm.find((x) =>
            (x.fantasia && x.fantasia.startsWith(`${chave} `))
            || (x.razao && x.razao.startsWith(`${chave} `))
            || (x.fantasia && x.fantasia.startsWith(`${chave}-`))
            || (x.razao && x.razao.startsWith(`${chave}-`)));
          return prefixo ? prefixo.loja : null;
        }

        if (info) info.textContent = 'verificando cadastros…';

        async function obterCategoria(codigo, descricao) {
          const chave = String(codigo ?? '').trim();
          if (chave && catPorCod.has(chave)) return catPorCod.get(chave).id;
          const nome = (descricao || '').trim() || (chave ? `Categoria ${chave}` : 'Sem Categoria');
          const novo = await criar('arm_categorias', {
            codigo_auxiliar: chave || null, descricao: nome,
          });
          catPorCod.set(String(novo.codigo_auxiliar ?? '').trim(), novo);
          return novo.id;
        }

        async function obterSubcategoria(codigo, descricao, categoriaId) {
          const chave = String(codigo ?? '').trim();
          if (chave && subPorCod.has(chave)) return subPorCod.get(chave).id;
          const nome = (descricao || '').trim() || (chave ? `Subcategoria ${chave}` : 'Sem Subcategoria');
          const novo = await criar('arm_subcategorias', {
            codigo_auxiliar: chave || null, descricao: nome, categoria_id: categoriaId,
          });
          subPorCod.set(String(novo.codigo_auxiliar ?? '').trim(), novo);
          return novo.id;
        }

        async function obterFamilia(codigo, descricao, categoriaId, subcategoriaId) {
          const chave = String(codigo ?? '').trim();
          if (chave && famPorCod.has(chave)) return famPorCod.get(chave).id;
          const nome = (descricao || '').trim() || (chave ? `Família ${chave}` : 'Sem Família');
          const novo = await criar('arm_familias', {
            codigo_auxiliar: chave || null, descricao: nome,
            categoria_id: categoriaId, subcategoria_id: subcategoriaId,
          });
          famPorCod.set(String(novo.codigo_auxiliar ?? '').trim(), novo);
          return novo.id;
        }

        async function obterLoja(nome) {
          const chave = normaliza(nome);
          if (!chave) return null;

          const existente = acharLoja(chave);
          if (existente) return existente.id;

          const nova = await criar('arm_lojas', {
            nome: String(nome).trim(), nome_fantasia: String(nome).trim(), ativa: true,
          });
          lojasNorm.push({ loja: nova, fantasia: chave, razao: chave });
          return nova.id;
        }

        async function obterProduto(registro, vinculos) {
          const sku = String(registro.sku ?? '').trim();
          if (!sku) return null;
          if (prodPorSku.has(sku)) return prodPorSku.get(sku).id;

          // a lista em memória pode vir truncada (limite de 1000 no PostgREST)
          const achados = await listar('produtos', { select: 'id, sku', eq: { sku } });
          if (achados.length) {
            prodPorSku.set(sku, achados[0]);
            return achados[0].id;
          }

          const base = {
            sku,
            descricao: registro.descricao || sku,
            unidade: registro.embalagem || 'UN',
            ativo: true,
            origem: 'sugestao',
            categoria_id: vinculos.categoria_id,
            subcategoria_id: vinculos.subcategoria_id,
            familia_id: vinculos.familia_id,
          };

          for (const ean of [registro.ean || sku, sku, null]) {
            try {
              const novo = await criar('produtos', { ...base, ean });
              prodPorSku.set(sku, novo);
              return novo.id;
            } catch (erro) {
              if (!/existe/i.test(erro.message)) throw erro;
            }
          }

          throw new Error(`Não foi possível criar o produto SKU ${sku}.`);
        }

        const registros = [];
        for (let i = 1; i < linhas.length; i += 1) {
          const linha = linhas[i];
          if (!linha || !linha.some((v) => v !== null && v !== '')) continue;
          const pegar = (campo) => (mapa[campo] !== undefined ? linha[mapa[campo]] : null);

          const registro = {
            lista,
            loja: pegar('loja') ? String(pegar('loja')).trim() : null,
            codigo_categoria: pegar('codigo_categoria'),
            categoria: pegar('categoria'),
            codigo_subcategoria: pegar('codigo_subcategoria'),
            subcategoria: pegar('subcategoria'),
            codigo_familia: pegar('codigo_familia'),
            familia: pegar('familia'),
            sku: pegar('sku') != null ? String(pegar('sku')).trim() : null,
            ean: pegar('ean') != null ? String(pegar('ean')).trim() : null,
            descricao: pegar('descricao') != null ? String(pegar('descricao')).trim() : null,
            embalagem: pegar('embalagem'),
            unidade: pegar('embalagem') || 'UN',
            quantidade_por_embalagem: num(pegar('quantidade_por_embalagem')),
            gondola: num(pegar('gondola')),
            ponto_extra: num(pegar('ponto_extra')),
            geladeira: num(pegar('geladeira')),
            ponta_gondola: num(pegar('ponta_gondola')),
            paredao_entrada: num(pegar('paredao_entrada')),
            deposito: num(pegar('deposito')),
            fornecedor_codigo: pegar('fornecedor_codigo'),
            fornecedor_nome: pegar('fornecedor_nome'),
            prazo_entrega: num(pegar('prazo_entrega')),
            dias_venda: num(pegar('dias_venda')),
            valor_unitario: num(pegar('valor_unitario')),
            venda_media: num(pegar('venda_media')),
            estoque_atual: num(pegar('estoque_atual')),
            modo_estoque: 'es_dias',
            ordem: i,
            importado_em: new Date().toISOString(),
          };

          // cria/recupera os cadastros e guarda os vínculos
          const categoriaId = await obterCategoria(registro.codigo_categoria, registro.categoria);
          const subcategoriaId = await obterSubcategoria(
            registro.codigo_subcategoria, registro.subcategoria, categoriaId);
          const familiaId = await obterFamilia(
            registro.codigo_familia, registro.familia, categoriaId, subcategoriaId);

          registro.loja_id = await obterLoja(registro.loja);
          registro.produto_id = await obterProduto(registro, {
            categoria_id: categoriaId,
            subcategoria_id: subcategoriaId,
            familia_id: familiaId,
          });

          registro.estoque_seguranca = CAMPOS_POSICAO
            .reduce((s, k) => s + (Number(registro[k]) || 0), 0);
          registro.estoque_manter = calcularEstoqueManter(registro);
          registro.quantidade_sugerida = sugeridaDe(registro);
          registro.quantidade = registro.quantidade_sugerida;

          registros.push(registro);
        }

        if (!registros.length) throw new Error('O arquivo não tem linhas de produto.');

        if (limpar) {
          await excluirOnde('lista_de_produtos', { lista });
        }

        const TAMANHO = 100;
        for (let i = 0; i < registros.length; i += TAMANHO) {
          const lote = registros.slice(i, i + TAMANHO);
          await criar('lista_de_produtos', lote);
          botao.textContent = `Gravando ${Math.min(i + TAMANHO, registros.length)}/${registros.length}…`;
        }

        if (!cabecalho) await criar('sugestoes', { nome: lista, status: 'rascunho' });

        ui.toast(`${registros.length} item(ns) importado(s).`);
        fechar();
        ctx.recarregar();
      } catch (erro) {
        ui.toast(erro.message, 'erro');
        if (info) info.textContent = erro.message;
        botao.disabled = false;
        botao.textContent = 'Importar';
      }
    });
  });

  // ------------------------------------------------------- pedido sugerido
  function montarGrupos() {
    const grupos = new Map();
    for (const item of daLista()) {
      const fornecedor = item.fornecedor_nome || 'Sem fornecedor';
      const atual = grupos.get(fornecedor) || { itens: [], quantidade: 0, valor: 0 };
      atual.itens.push(item);
      atual.quantidade += Number(item.quantidade) || 0;
      atual.valor += (Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0);
      grupos.set(fornecedor, atual);
    }
    return grupos;
  }

  const fornecedorPorNome = new Map(
    fornecedores.map((f) => [(f.razao_social || '').toUpperCase(), f]));

  function textoDoPedido(fornecedor, dados) {
    const linhas = dados.itens.map((i, n) => {
      const qtd = Number(i.quantidade) || 0;
      return `${n + 1}. ${i.sku || ''} - ${i.descricao || ''} — ${ui.num(qtd, 0)} ${i.unidade || ''}`;
    });
    return [
      `*Pedido sugerido — ${lista}*`,
      `Fornecedor: ${fornecedor}`,
      `Data: ${new Date().toLocaleDateString('pt-BR')}`,
      '',
      ...linhas,
      '',
      `Total: ${ui.num(dados.quantidade, 0)} unidade(s) · ${ui.brl(dados.valor)}`,
    ].join('\n');
  }

  async function registrarPedido(fornecedor, dados) {
    const cab = fornecedorPorNome.get(fornecedor.toUpperCase());
    return criar('sugestoes_pedidos', {
      sugestao: lista,
      fornecedor_nome: fornecedor,
      fornecedor_id: cab?.id || null,
      itens: dados.itens.map((i) => ({
        sku: i.sku, descricao: i.descricao, unidade: i.unidade,
        quantidade: Number(i.quantidade) || 0,
        valor_unitario: Number(i.valor_unitario) || 0,
      })),
      total_itens: dados.itens.length,
      quantidade: dados.quantidade,
      valor_total: dados.valor,
      status: 'gerado',
      criado_por: ctx.perfil?.id || null,
    });
  }

  function desenharPedidos() {
    const alvo = raiz.querySelector('#pedidos');
    if (!alvo) return;

    const gerados = pedidosGerados.filter((p) => p.status !== 'cancelado');

    if (!gerados.length) {
      alvo.innerHTML = ui.vazio('Nenhum pedido gerado ainda.');
      return;
    }

    alvo.innerHTML = `<div class="tabela-rolagem"><table>
      <thead><tr><th>Fornecedor</th><th class="num">Itens</th>
        <th class="num">Quantidade</th><th class="num">Valor</th>
        <th>Status</th><th>Enviado</th><th></th></tr></thead>
      <tbody>
        ${gerados.map((p) => `<tr>
          <td>${ui.esc(p.fornecedor_nome || '—')}</td>
          <td class="num">${ui.num(p.total_itens, 0)}</td>
          <td class="num">${ui.num(p.quantidade, 0)}</td>
          <td class="num">${ui.brl(p.valor_total)}</td>
          <td>${p.status === 'enviado'
            ? ui.badge('enviado', 'verde') : ui.badge('gerado', 'azul')}</td>
          <td>${p.enviado_em
            ? `${ui.dataBR(p.enviado_em)} · ${ui.esc(p.enviado_canal || '')}` : '—'}</td>
          <td class="acoes">
            <button type="button" class="botao-pequeno"
              data-whats="${ui.esc(p.id)}">WhatsApp</button>
            <button type="button" class="botao-pequeno"
              data-email="${ui.esc(p.id)}">E-mail</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;

    async function marcarEnviado(pedidoId, canal) {
      await atualizar('sugestoes_pedidos', pedidoId, {
        status: 'enviado', enviado_em: new Date().toISOString(), enviado_canal: canal,
      });
      ctx.recarregar();
    }

    for (const b of alvo.querySelectorAll('[data-whats]')) {
      b.addEventListener('click', async () => {
        const pedido = gerados.find((p) => p.id === b.dataset.whats);
        if (!pedido) return;

        const dados = {
          itens: pedido.itens || [],
          quantidade: pedido.quantidade,
          valor: pedido.valor_total,
        };
        const cab = fornecedorPorNome.get((pedido.fornecedor_nome || '').toUpperCase());

        let telefone = (cab?.whatsapp || '').replace(/\D/g, '');
        if (!telefone) {
          const digitado = window.prompt(`WhatsApp de ${pedido.fornecedor_nome} (com DDD):`, '');
          if (digitado === null) return;
          telefone = digitado.replace(/\D/g, '');
        }
        if (!telefone) { ui.toast('Informe o WhatsApp.', 'erro'); return; }
        if (telefone.length <= 11) telefone = `55${telefone}`;

        window.open(ui.linkWhatsapp(telefone, textoDoPedido(pedido.fornecedor_nome, dados)), '_blank');
        try { await marcarEnviado(pedido.id, 'whatsapp'); } catch (_) { /* opcional */ }
      });
    }

    for (const b of alvo.querySelectorAll('[data-email]')) {
      b.addEventListener('click', async () => {
        const pedido = gerados.find((p) => p.id === b.dataset.email);
        if (!pedido) return;

        const dados = {
          itens: pedido.itens || [],
          quantidade: pedido.quantidade,
          valor: pedido.valor_total,
        };
        const cab = fornecedorPorNome.get((pedido.fornecedor_nome || '').toUpperCase());

        let email = cab?.email || '';
        if (!email) {
          const digitado = window.prompt(`E-mail de ${pedido.fornecedor_nome}:`, '');
          if (digitado === null) return;
          email = digitado.trim();
        }
        if (!email) { ui.toast('Informe o e-mail.', 'erro'); return; }

        window.open(ui.linkEmail(email, `Pedido sugerido — ${lista}`,
          textoDoPedido(pedido.fornecedor_nome, dados)), '_blank');
        try { await marcarEnviado(pedido.id, 'email'); } catch (_) { /* opcional */ }
      });
    }
  }

  raiz.querySelector('#gerar-pedido')?.addEventListener('click', async () => {
    const grupos = montarGrupos();
    if (!grupos.size) { ui.toast('A sugestão não tem itens.', 'erro'); return; }

    const pendentes = [...grupos.entries()]
      .filter(([fornecedor]) => !pedidosGerados.some((p) => p.fornecedor_nome === fornecedor));

    if (!pendentes.length) {
      ui.toast('Todos os fornecedores já têm pedido gerado.');
      return;
    }

    if (!window.confirm(
      `Gerar pedido sugerido para ${pendentes.length} fornecedor(es)?`)) return;

    try {
      for (const [fornecedor, dados] of pendentes) {
        await registrarPedido(fornecedor, dados);
      }
      ui.toast(`${pendentes.length} pedido(s) gerado(s).`);
      ctx.recarregar();
    } catch (erro) { ui.toast(erro.message, 'erro'); }
  });

  // ------------------------------------------------------------- imprimir
  function imprimirSugestao() {
    document.querySelectorAll('.area-impressao').forEach((n) => n.remove());

    const listaItens = daLista().sort((a, b) => (a.loja || '').localeCompare(b.loja || '')
      || (a.fornecedor_nome || '').localeCompare(b.fornecedor_nome || '')
      || (a.descricao || '').localeCompare(b.descricao || ''));

    const tQtd = listaItens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
    const tValor = listaItens.reduce(
      (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0);

    const el = document.createElement('div');
    el.className = 'area-impressao';
    el.innerHTML = `
      <div class="print-topo">
        <div>
          <h1>SUGESTÃO DE PEDIDO</h1>
          <div class="print-linha"><strong>${ui.esc(lista)}</strong></div>
          <div class="print-linha">Emitida em: <strong>${ui.dataBR(new Date().toISOString())}</strong></div>
        </div>
        <div style="text-align:right">
          <div class="print-linha">Status: <strong>${ui.esc(statusAtual.rotulo)}</strong></div>
          <div class="print-linha">Itens: <strong>${listaItens.length}</strong></div>
          <div class="print-linha">Quantidade: <strong>${ui.num(tQtd, 0)}</strong></div>
          <div class="print-linha">Valor total: <strong>${ui.brl(tValor)}</strong></div>
        </div>
      </div>

      <h2>Produtos</h2>
      <table>
        <thead>
          <tr>
            <th style="width:14%">Fornecedor</th>
            <th style="width:9%">Loja</th>
            <th style="width:8%">SKU</th>
            <th>Descrição</th>
            <th style="width:9%">Emb.</th>
            <th class="num" style="width:8%">Qtd</th>
            <th class="num" style="width:11%">Valor un.</th>
            <th class="num" style="width:11%">Total</th>
          </tr>
        </thead>
        <tbody>
          ${listaItens.map((i) => `<tr>
            <td>${ui.esc(i.fornecedor_nome || '—')}</td>
            <td>${ui.esc(i.loja || '—')}</td>
            <td>${ui.esc(i.sku || '—')}</td>
            <td>${ui.esc(i.descricao || '')}</td>
            <td>${ui.esc(i.embalagem || i.unidade || '')}</td>
            <td class="num">${ui.num(i.quantidade, 0)}</td>
            <td class="num">${ui.brl(i.valor_unitario)}</td>
            <td class="num">${ui.brl((Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0))}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="5" class="num">TOTAL GERAL</th>
            <th class="num">${ui.num(tQtd, 0)}</th>
            <th></th>
            <th class="num">${ui.brl(tValor)}</th>
          </tr>
        </tfoot>
      </table>

      <div class="print-rodape">
        <div>Aprovado por: _______________________________________</div>
        <div>Data: ____ / ____ / ________</div>
      </div>
      <div class="print-observacao">Documento gerado pelo sistema Sugestão de Pedido em ${
        ui.dataHoraBR(new Date().toISOString())}.</div>
    `;

    document.body.appendChild(el);

    const limpar = () => {
      el.remove();
      window.removeEventListener('afterprint', limpar);
    };
    window.addEventListener('afterprint', limpar);
    setTimeout(limpar, 30000);

    window.print();
  }

  raiz.querySelector('#imprimir')?.addEventListener('click', imprimirSugestao);

  desenhar();
  desenharPedidos();
}
