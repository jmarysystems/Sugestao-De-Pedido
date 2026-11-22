// Sugestão de Pedido: lista de sugestões (índice) e edição de uma sugestão.
import { listar, criar, atualizar, excluir, excluirOnde } from '../api.js?v=20261122c';
import * as ui from '../ui.js?v=20261122c';

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

const MODOS = [
  { valor: 'es', rotulo: 'Estoque de Segurança' },
  { valor: 'es_dias', rotulo: 'ES + (Venda Média × Dias de Venda)' },
  { valor: 'es_prazo', rotulo: 'ES + (Venda Média × Prazo do Fornecedor)' },
  { valor: 'es_dias_prazo', rotulo: 'ES + (Venda Média × (Dias de Venda + Prazo))' },
];

const CAMPOS_POSICAO = ['gondola', 'ponto_extra', 'geladeira', 'ponta_gondola',
  'paredao_entrada', 'deposito'];

// Estoque de segurança = soma das posições na loja
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

  const itens = await listar('lista_de_produtos', { ordem: 'ordem' });

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
    .map(([nome, d]) => `<tr>
      <td><strong>${ui.esc(nome)}</strong></td>
      <td class="num">${ui.num(d.itens, 0)}</td>
      <td class="num">${ui.num(d.sugerida, 0)}</td>
      <td class="num">${ui.brl(d.valor)}</td>
      <td>${d.lojas.size ? [...d.lojas].sort().join(', ') : '—'}</td>
      <td>${d.criado ? ui.dataBR(d.criado) : '—'}</td>
      <td class="acoes">
        <a class="botao-pequeno" href="#/sugestao/${encodeURIComponent(nome)}">Abrir</a>
        ${podeExcluir ? `<button type="button" class="botao-pequeno botao-perigo"
          data-apagar="${ui.esc(nome)}">Excluir</button>` : ''}
      </td>
    </tr>`).join('');

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo">
        <h2>${grupos.size} sugestão(ões)</h2>
        ${podeCriar ? '<button type="button" class="botao-primario" id="nova">Nova sugestão</button>' : ''}
      </div>
      <p class="sub">Cada sugestão é uma lista de produtos com as quantidades a pedir.
        Abra para editar ou crie uma nova a partir de uma lista existente.</p>
      ${grupos.size ? `<div class="tabela-rolagem"><table>
        <thead><tr><th>Sugestão</th><th class="num">Itens</th>
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
          ui.toast('Sugestão vazia criada — busque os produtos para adicionar.');
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

  for (const b of raiz.querySelectorAll('[data-apagar]')) {
    b.addEventListener('click', async () => {
      const nome = b.dataset.apagar;
      if (!window.confirm(`Excluir a sugestão "${nome}" e todos os seus itens?`)) return;
      try {
        await excluirOnde('lista_de_produtos', { lista: nome });
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

  const [itens, produtos] = await Promise.all([
    listar('lista_de_produtos', { ordem: 'ordem' }),
    listar('produtos', { select: 'id, sku, descricao, unidade', ordem: 'sku' }),
  ]);

  const daLista = () => itens.filter((i) => i.lista === lista);

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo">
        <h2>${ui.esc(lista)}</h2>
        <div class="linha-acoes">
          <a class="botao-pequeno" href="#/sugestao">← Voltar</a>
          ${podeEditar ? '<button type="button" class="botao-pequeno" id="importar">Importar lista de arquivo</button>' : ''}
        </div>
      </div>
      <p class="sub">Procure os produtos para adicionar, ajuste a venda média e escolha o
        cálculo do estoque a manter. A quantidade sugerida aparece na tabela.</p>

      <label class="campo" style="max-width:520px"><span>Adicionar produto (SKU ou descrição)</span>
        <input type="search" id="busca-produto" placeholder="digite para procurar"></label>
      <div id="resultados" class="sub" style="margin-top:8px"></div>
    </div>

    <div class="cartao">
      <div class="cartao-topo">
        <h2>Itens <span id="resumo" class="sub"></span></h2>
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
    </div>`;

  const busca = raiz.querySelector('#busca-produto');
  const resultados = raiz.querySelector('#resultados');
  const tabela = raiz.querySelector('#tabela');
  const resumo = raiz.querySelector('#resumo');

  function desenhar() {
    const lista_itens = daLista().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const totalQtd = lista_itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
    const totalValor = lista_itens.reduce(
      (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0);
    const totalSug = lista_itens.reduce((s, i) => s + sugeridaDe(i), 0);

    resumo.textContent = lista_itens.length
      ? `${lista_itens.length} item(ns) · sugerido ${ui.num(totalSug, 0)} · a pedir ${ui.num(totalQtd, 0)} · ${ui.brl(totalValor)}`
      : '';

    tabela.innerHTML = lista_itens.length ? `
      <div class="tabela-rolagem"><table>
        <thead><tr>
          <th>Loja</th><th>SKU</th><th>Descrição</th><th>Emb.</th>
          <th class="num">Estoque</th><th class="num">Segurança</th>
          <th class="num">Venda méd.</th><th>Total do Estoque Para Manter</th>
          <th class="num">Qtd sugerida</th><th class="num">Qtd a pedir</th><th></th>
        </tr></thead>
        <tbody>
          ${lista_itens.map((i) => {
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
      </table></div>` : ui.vazio('Nenhum item nesta sugestão.');

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
          desenhar();
        } catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }
  }

  // ------------------------------------------------------- busca produto
  function desenharResultados(termo) {
    const t = termo.trim().toLowerCase();
    if (t.length < 2) { resultados.innerHTML = ''; return; }

    const achados = produtos
      .filter((p) => `${p.sku} ${p.descricao}`.toLowerCase().includes(t))
      .slice(0, 12);

    resultados.innerHTML = achados.length
      ? `<div class="tabela-rolagem"><table>
          <thead><tr><th>SKU</th><th>Descrição</th><th>Un.</th><th class="num">Qtd</th><th></th></tr></thead>
          <tbody>
            ${achados.map((p) => `<tr>
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

    for (const b of resultados.querySelectorAll('[data-add]')) {
      b.addEventListener('click', async () => {
        const produto = produtos.find((p) => p.id === b.dataset.add);
        const qtd = Number(resultados.querySelector(`#qtd-${b.dataset.add}`)?.value) || 1;
        if (!podeEditar) { ui.toast('Sem permissão para alterar a sugestão.', 'erro'); return; }
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
          busca.value = '';
          resultados.innerHTML = '';
          desenhar();
        } catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }
  }

  busca.addEventListener('input', () => desenharResultados(busca.value));

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
      desenhar();
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
      desenhar();
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
          for (let k = itens.length - 1; k >= 0; k -= 1) {
            if (itens[k].lista === lista) itens.splice(k, 1);
          }
        }

        const TAMANHO = 100;
        for (let i = 0; i < registros.length; i += TAMANHO) {
          const lote = registros.slice(i, i + TAMANHO);
          const criados = await criar('lista_de_produtos', lote);
          for (const c of (Array.isArray(criados) ? criados : [])) itens.push(c);
          botao.textContent = `Gravando ${Math.min(i + TAMANHO, registros.length)}/${registros.length}…`;
        }

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

  desenhar();
}
