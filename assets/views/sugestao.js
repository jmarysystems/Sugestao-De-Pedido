// Sugestão de Pedido: lista de sugestões (índice) e edição de uma sugestão.
import { listar, atualizar, criar, excluir, excluirOnde } from '../api.js?v=20261122g';
import * as ui from '../ui.js?v=20261122g';

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

  const [itens, cabecalhos] = await Promise.all([
    listar('lista_de_produtos', { ordem: 'ordem' }),
    listar('sugestoes', { ordem: 'nome' }),
  ]);

  const statusPorNome = new Map(cabecalhos.map((c) => [c.nome, c]));
  const grupos = new Map();

  for (const item of itens) {
    const atual = grupos.get(item.lista) || {
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
    grupos.set(item.lista, atual);
  }

  const linhas = [...grupos.entries()]
    .sort((a, b) => (b[1].criado || '').localeCompare(a[1].criado || ''))
    .map(([nome, d]) => {
      const cab = statusPorNome.get(nome);
      const st = STATUS[cab?.status || 'rascunho'] || STATUS.rascunho;
      return `<tr>
      <td><strong>${ui.esc(nome)}</strong></td>
      <td>${ui.badge(st.rotulo, st.cor)}</td>
      <td class="num">${ui.num(d.itens, 0)}</td>
      <td class="num">${ui.num(d.sugerida, 0)}</td>
      <td class="num">${ui.brl(d.valor)}</td>
      <td>${d.lojas.size ? [...d.lojas].sort().join(', ') : '—'}</td>
      <td>${d.criado ? ui.dataBR(d.criado) : '—'}</td>
      <td class="acoes">
        <a class="botao-pequeno" href="#/sugestao/${encodeURIComponent(nome)}">Abrir</a>
        ${podeCriar ? `<button type="button" class="botao-pequeno"
          data-editar="${ui.esc(nome)}">Editar</button>` : ''}
        ${podeExcluir ? `<button type="button" class="botao-pequeno botao-perigo"
          data-apagar="${ui.esc(nome)}">Excluir</button>` : ''}
      </td>
    </tr>`;
    }).join('');

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo">
        <h2>${grupos.size} sugestão(ões)</h2>
        ${podeCriar ? '<button type="button" class="botao-primario" id="nova">Nova sugestão</button>' : ''}
      </div>
      <p class="sub">Cada sugestão é uma lista de produtos com as quantidades a pedir.
        Abra para editar ou crie uma nova a partir de uma lista existente.</p>
      ${grupos.size ? `<div class="tabela-rolagem"><table>
        <thead><tr><th>Sugestão</th><th>Status</th><th class="num">Itens</th>
          <th class="num">Qtd sugerida</th><th class="num">Valor</th>
          <th>Lojas</th><th>Criada em</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>` : ui.vazio('Nenhuma sugestão criada ainda.')}
    </div>`;

  raiz.querySelector('#nova')?.addEventListener('click', () => {
    const { fechar, corpo } = ui.modal({
      titulo: 'Nova sugestão',
      largura: '560px',
      corpo: `
        <p class="sub">Escolha a lista que servirá de base. Os itens são copiados
          para a nova sugestão (a original não muda).</p>
        <label class="campo"><span>Lista base</span>
          <select id="base">
            <option value="">— lista vazia —</option>
            ${[...grupos.keys()].sort().map((l) => `<option value="${ui.esc(l)}">${
              ui.esc(l)} (${grupos.get(l).itens} itens)</option>`).join('')}
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
      if (grupos.has(nome)) {
        ui.toast('Já existe uma sugestão com esse nome.', 'erro');
        return;
      }

      const botao = corpo.querySelector('#criar');
      botao.disabled = true;
      botao.textContent = 'Criando…';

      try {
        await criar('sugestoes', { nome, status: 'rascunho' });

        if (base) {
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
          ui.toast(`${origem.length} item(ns) copiado(s).`);
        } else {
          ui.toast('Sugestão vazia criada — adicione os produtos.');
        }

        fechar();
        ctx.irPara(`#/sugestao/${encodeURIComponent(nome)}`);
        ctx.recarregar();
      } catch (erro) {
        ui.toast(erro.message, 'erro');
        if (info) info.textContent = erro.message;
        botao.disabled = false;
        botao.textContent = 'Criar e abrir';
      }
    });
  });

  for (const b of raiz.querySelectorAll('[data-editar]')) {
    b.addEventListener('click', () => {
      const atual = b.dataset.editar;
      const { fechar, corpo } = ui.modal({
        titulo: 'Editar sugestão',
        largura: '520px',
        corpo: `
          <label class="campo"><span>Nome da sugestão</span>
            <input id="nome" value="${ui.esc(atual)}"></label>
          <label class="campo"><span>Status</span>
            <select id="status">
              ${Object.entries(STATUS).map(([valor, s]) => `<option value="${valor}" ${
                (statusPorNome.get(atual)?.status || 'rascunho') === valor ? 'selected' : ''
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
        const cab = statusPorNome.get(atual);

        if (!novo) { ui.toast('Informe o nome.', 'erro'); return; }
        if (novo !== atual && grupos.has(novo)) {
          ui.toast('Já existe uma sugestão com esse nome.', 'erro');
          return;
        }

        const botao = corpo.querySelector('#salvar');
        botao.disabled = true;
        botao.textContent = 'Salvando…';

        try {
          if (novo !== atual) {
            const afetados = itens.filter((i) => i.lista === atual);
            for (const item of afetados) {
              await atualizar('lista_de_produtos', item.id, { lista: novo });
            }
            if (info) info.textContent = `${afetados.length} item(ns) renomeado(s).`;
          }

          if (cab) {
            await atualizar('sugestoes', cab.id, {
              nome: novo, status: novoStatus, atualizado_em: new Date().toISOString(),
            });
          } else {
            await criar('sugestoes', { nome: novo, status: novoStatus });
          }

          ui.toast(`Sugestão atualizada (${STATUS[novoStatus]?.rotulo || novoStatus}).`);
          fechar();
          ctx.recarregar();
        } catch (erro) {
          ui.toast(erro.message, 'erro');
          if (info) info.textContent = erro.message;
          botao.disabled = false;
          botao.textContent = 'Salvar';
        }
      });
    });
  }

  for (const b of raiz.querySelectorAll('[data-apagar]')) {
    b.addEventListener('click', async () => {
      const nome = b.dataset.apagar;
      if (!window.confirm(`Excluir a sugestão "${nome}" e todos os seus itens?`)) return;
      try {
        await excluirOnde('lista_de_produtos', { lista: nome });
        const cab = statusPorNome.get(nome);
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

      <div id="tabela"></div>
    </div>

    <div class="cartao">
      <h2>Resumo por fornecedor</h2>
      <div id="resumo-fornecedor"></div>
    </div>

    <div class="cartao">
      <div class="cartao-topo">
        <h2>Pedido sugerido</h2>
        <button type="button" class="botao-primario" id="gerar-todos">
          Gerar pedido de todos os fornecedores
        </button>
      </div>
      <p class="sub">Gere o pedido por fornecedor e envie por WhatsApp ou e-mail.
        O envio usa o contato cadastrado no fornecedor.</p>
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
          <th class="num">Venda méd.</th><th>Total do Estoque Para Manter</th>
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

  async function registrarPedido(fornecedor, dados, status = 'gerado') {
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
      status,
      criado_por: ctx.perfil?.id || null,
    });
  }

  function desenharPedidos() {
    const alvo = raiz.querySelector('#pedidos');
    if (!alvo) return;

    const grupos = montarGrupos();
    if (!grupos.size) {
      alvo.innerHTML = ui.vazio('Adicione itens para gerar o pedido sugerido.');
      return;
    }

    const linhas = [...grupos.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fornecedor, dados]) => {
        const cab = fornecedorPorNome.get(fornecedor.toUpperCase());
        const gerado = pedidosGerados.find((p) => p.fornecedor_nome === fornecedor);
        return `<tr>
          <td>${ui.esc(fornecedor)}</td>
          <td class="num">${ui.num(dados.itens.length, 0)}</td>
          <td class="num">${ui.num(dados.quantidade, 0)}</td>
          <td class="num">${ui.brl(dados.valor)}</td>
          <td>${gerado
            ? (gerado.status === 'enviado'
              ? ui.badge('enviado', 'verde')
              : ui.badge('gerado', 'azul'))
            : '—'}</td>
          <td class="acoes">
            <button type="button" class="botao-pequeno"
                    data-gerar="${ui.esc(fornecedor)}">Gerar</button>
            <button type="button" class="botao-pequeno"
                    data-whats="${ui.esc(fornecedor)}">WhatsApp</button>
            <button type="button" class="botao-pequeno"
                    data-email="${ui.esc(fornecedor)}">E-mail</button>
          </td>
        </tr>`;
      }).join('');

    alvo.innerHTML = `<div class="tabela-rolagem"><table>
      <thead><tr><th>Fornecedor</th><th class="num">Itens</th>
        <th class="num">Quantidade</th><th class="num">Valor</th>
        <th>Pedido</th><th></th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>`;

    const gruposAgora = montarGrupos();

    for (const b of alvo.querySelectorAll('[data-gerar]')) {
      b.addEventListener('click', async () => {
        const fornecedor = b.dataset.gerar;
        const dados = gruposAgora.get(fornecedor);
        if (!dados) return;
        b.disabled = true;
        try {
          await registrarPedido(fornecedor, dados);
          ui.toast(`Pedido de ${fornecedor} gerado.`);
          ctx.recarregar();
        } catch (erro) {
          ui.toast(erro.message, 'erro');
          b.disabled = false;
        }
      });
    }

    for (const b of alvo.querySelectorAll('[data-whats]')) {
      b.addEventListener('click', async () => {
        const fornecedor = b.dataset.whats;
        const dados = gruposAgora.get(fornecedor);
        if (!dados) return;

        const cab = fornecedorPorNome.get(fornecedor.toUpperCase());
        let telefone = (cab?.whatsapp || '').replace(/\D/g, '');
        if (!telefone) {
          const digitado = window.prompt(
            `WhatsApp de ${fornecedor} (com DDD):`, '');
          if (digitado === null) return;
          telefone = digitado.replace(/\D/g, '');
        }
        if (!telefone) { ui.toast('Informe o WhatsApp.', 'erro'); return; }
        if (telefone.length <= 11) telefone = `55${telefone}`;

        const texto = textoDoPedido(fornecedor, dados);
        window.open(ui.linkWhatsapp(telefone, texto), '_blank');

        try {
          const gerado = pedidosGerados.find((p) => p.fornecedor_nome === fornecedor);
          if (gerado) {
            await atualizar('sugestoes_pedidos', gerado.id, {
              status: 'enviado', enviado_em: new Date().toISOString(),
              enviado_canal: 'whatsapp',
            });
          } else {
            const novo = await registrarPedido(fornecedor, dados, 'enviado');
            if (novo) {
              await atualizar('sugestoes_pedidos', novo.id, {
                enviado_em: new Date().toISOString(), enviado_canal: 'whatsapp',
              });
            }
          }
          ctx.recarregar();
        } catch (_) { /* envio já foi aberto */ }
      });
    }

    for (const b of alvo.querySelectorAll('[data-email]')) {
      b.addEventListener('click', async () => {
        const fornecedor = b.dataset.email;
        const dados = gruposAgora.get(fornecedor);
        if (!dados) return;

        const cab = fornecedorPorNome.get(fornecedor.toUpperCase());
        let email = cab?.email || '';
        if (!email) {
          const digitado = window.prompt(`E-mail de ${fornecedor}:`, '');
          if (digitado === null) return;
          email = digitado.trim();
        }
        if (!email) { ui.toast('Informe o e-mail.', 'erro'); return; }

        const texto = textoDoPedido(fornecedor, dados);
        window.open(ui.linkEmail(email, `Pedido sugerido — ${lista}`, texto), '_blank');

        try {
          const gerado = pedidosGerados.find((p) => p.fornecedor_nome === fornecedor);
          if (gerado) {
            await atualizar('sugestoes_pedidos', gerado.id, {
              status: 'enviado', enviado_em: new Date().toISOString(),
              enviado_canal: 'email',
            });
          } else {
            const novo = await registrarPedido(fornecedor, dados, 'enviado');
            if (novo) {
              await atualizar('sugestoes_pedidos', novo.id, {
                enviado_em: new Date().toISOString(), enviado_canal: 'email',
              });
            }
          }
          ctx.recarregar();
        } catch (_) { /* envio já foi aberto */ }
      });
    }
  }

  raiz.querySelector('#gerar-todos')?.addEventListener('click', async () => {
    const grupos = montarGrupos();
    if (!grupos.size) return;
    if (!window.confirm(`Gerar pedido sugerido para ${grupos.size} fornecedor(es)?`)) return;

    try {
      for (const [fornecedor, dados] of grupos.entries()) {
        if (pedidosGerados.some((p) => p.fornecedor_nome === fornecedor)) continue;
        await registrarPedido(fornecedor, dados);
      }
      ui.toast('Pedidos gerados.');
      ctx.recarregar();
    } catch (erro) { ui.toast(erro.message, 'erro'); }
  });

  desenhar();
  desenharPedidos();
}
