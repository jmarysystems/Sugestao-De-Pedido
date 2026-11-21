// Sugestão de Pedido: monta a lista, importa planilha e edita quantidades.
import { listar, criar, atualizar, excluir, excluirOnde } from '../api.js?v=20261121c';
import * as ui from '../ui.js?v=20261121c';

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

// Opções de cálculo do "Total do Estoque Para Manter"
const MODOS = [
  { valor: 'es', rotulo: 'Estoque de Segurança',
    descricao: 'ES' },
  { valor: 'es_dias', rotulo: 'ES + (Venda Média × Dias de Venda)',
    descricao: 'ES + vendas do período' },
  { valor: 'es_prazo', rotulo: 'ES + (Venda Média × Prazo do Fornecedor)',
    descricao: 'ES + vendas do prazo' },
  { valor: 'es_dias_prazo', rotulo: 'ES + (Venda Média × (Dias de Venda + Prazo))',
    descricao: 'ES + vendas de todo o ciclo' },
];

function calcularEstoqueManter(item) {
  const es = Number(item.estoque_seguranca) || 0;
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

export async function render(raiz, ctx) {
  ctx.setTitulo('Sugestão de Pedido');

  const podeEditar = ctx.pode('sugestao', 'editar') || ctx.pode('sugestao', 'cadastrar');
  const podeExcluir = ctx.pode('sugestao', 'excluir');

  const [itens, produtos] = await Promise.all([
    listar('lista_de_produtos', { ordem: 'ordem' }),
    listar('produtos', { select: 'id, sku, descricao, unidade', ordem: 'sku' }),
  ]);

  const listas = [...new Set(itens.map((i) => i.lista))].sort();
  const listaAtual = localStorage.getItem('sugestao.lista') || listas[0] || 'Sugestão de Pedido';

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo">
        <h2>Montar sugestão</h2>
        ${podeEditar ? '<button type="button" class="botao-primario" id="importar">Importar lista de arquivo</button>' : ''}
      </div>
      <p class="sub">Escolha a lista, procure os produtos e informe a quantidade a pedir.
        A importação aceita a planilha do ressuprimento (.xlsx, .xls ou .csv).</p>

      <div class="grade grade-2">
        <label class="campo"><span>Lista</span>
          <select id="lista">
            ${listas.map((l) => `<option value="${ui.esc(l)}" ${
              l === listaAtual ? 'selected' : ''}>${ui.esc(l)}</option>`).join('')}
            <option value="__nova">+ nova lista…</option>
          </select></label>
        <label class="campo"><span>Produto (SKU ou descrição)</span>
          <input type="search" id="busca-produto" placeholder="digite para procurar"></label>
      </div>

      <div id="resultados" class="sub" style="margin-top:8px"></div>
    </div>

    <div class="cartao">
      <div class="cartao-topo">
        <h2>Itens da lista <span id="nome-lista"></span></h2>
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
    </div>`;

  const selLista = raiz.querySelector('#lista');
  const busca = raiz.querySelector('#busca-produto');
  const resultados = raiz.querySelector('#resultados');
  const tabela = raiz.querySelector('#tabela');
  const nomeLista = raiz.querySelector('#nome-lista');
  const resumo = raiz.querySelector('#resumo');

  let lista = listaAtual;

  const itensDaLista = () => itens
    .filter((i) => i.lista === lista)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  const estoqueTotal = (i) => ['gondola', 'ponto_extra', 'geladeira', 'ponta_gondola',
    'paredao_entrada', 'deposito']
    .reduce((s, k) => s + (Number(i[k]) || 0), 0);

  function desenhar() {
    nomeLista.textContent = `— ${lista}`;
    const daLista = itensDaLista();

    const totalQtd = daLista.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
    const totalValor = daLista.reduce(
      (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0);

    resumo.textContent = daLista.length
      ? `${daLista.length} item(ns) · ${ui.num(totalQtd, 2)} un. · ${ui.brl(totalValor)}`
      : '';

    tabela.innerHTML = daLista.length ? `
      <div class="tabela-rolagem"><table>
        <thead><tr>
          <th>Loja</th><th>SKU</th><th>Descrição</th><th>Emb.</th>
          <th class="num">Estoque</th><th class="num">Segurança</th>
          <th class="num">Venda méd.</th><th>Total do Estoque Para Manter</th>
          <th class="num">Qtd sugerida</th><th class="num">Qtd a pedir</th><th></th>
        </tr></thead>
        <tbody>
          ${daLista.map((i) => {
            const manter = calcularEstoqueManter(i);
            const sugerida = Math.max(0, Math.round((manter - estoqueTotal(i)) * 1000) / 1000);
            return `<tr>
            <td>${ui.esc(i.loja || '—')}</td>
            <td class="mono">${ui.esc(i.sku || '')}</td>
            <td title="${ui.esc(i.fornecedor_nome || '')}">${ui.esc(i.descricao || '')}</td>
            <td>${ui.esc(i.embalagem || i.unidade || '')}</td>
            <td class="num">${ui.num(estoqueTotal(i), 0)}</td>
            <td class="num"><input type="number" step="0.001" value="${i.estoque_seguranca ?? 0}"
                  data-es="${ui.esc(i.id)}" style="width:80px;text-align:right"
                  ${podeEditar ? '' : 'disabled'}></td>
            <td class="num"><input type="number" step="0.001" value="${i.venda_media ?? ''}"
                  data-venda="${ui.esc(i.id)}" style="width:80px;text-align:right"
                  ${podeEditar ? '' : 'disabled'}></td>
            <td>
              <select data-modo="${ui.esc(i.id)}" style="max-width:260px"
                      ${podeEditar ? '' : 'disabled'}>
                ${MODOS.map((m) => `<option value="${m.valor}" ${
                  (i.modo_estoque || 'es_dias') === m.valor ? 'selected' : ''}>${
                  ui.esc(m.rotulo)}</option>`).join('')}
              </select>
              <div class="sub" style="font-size:11px">Total: <strong>${ui.num(manter, 2)}</strong></div>
            </td>
            <td class="num">${ui.num(sugerida, 2)}</td>
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
      </table></div>` : ui.vazio('Nenhum item nesta lista. Use a importação ou a busca acima.');

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

    async function salvarCalculo(item) {
      const manter = calcularEstoqueManter(item);
      const sugerida = Math.max(0,
        Math.round((manter - estoqueTotal(item)) * 1000) / 1000);
      item.estoque_manter = manter;
      item.quantidade_sugerida = sugerida;
      await atualizar('lista_de_produtos', item.id, {
        estoque_seguranca: Number(item.estoque_seguranca) || 0,
        venda_media: item.venda_media === '' ? null : Number(item.venda_media),
        modo_estoque: item.modo_estoque || 'es_dias',
        estoque_manter: manter,
        quantidade_sugerida: sugerida,
      });
      return sugerida;
    }

    for (const el of tabela.querySelectorAll('[data-es]')) {
      el.addEventListener('change', async () => {
        const item = itens.find((i) => i.id === el.dataset.es);
        if (!item) return;
        item.estoque_seguranca = Number(el.value) || 0;
        try { await salvarCalculo(item); desenhar(); }
        catch (erro) { ui.toast(erro.message, 'erro'); }
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

    for (const b of tabela.querySelectorAll('[data-remover]')) {
      b.addEventListener('click', async () => {
        if (!window.confirm('Remover este item da lista?')) return;
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

  raiz.querySelector('#aplicar-modo')?.addEventListener('click', async () => {
    const modo = raiz.querySelector('#modo-padrao').value;
    const status = raiz.querySelector('#calc-status');
    const daLista = itensDaLista();
    if (!daLista.length) return;

    if (status) status.textContent = `calculando ${daLista.length} linha(s)…`;
    try {
      for (const item of daLista) {
        item.modo_estoque = modo;
        const manter = calcularEstoqueManter(item);
        item.estoque_manter = manter;
        item.quantidade_sugerida = Math.max(0,
          Math.round((manter - estoqueTotal(item)) * 1000) / 1000);
        await atualizar('lista_de_produtos', item.id, {
          modo_estoque: modo,
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
    const daLista = itensDaLista();
    if (!daLista.length) return;
    if (!window.confirm(`Copiar a quantidade sugerida para "Qtd a pedir" em ${daLista.length} linha(s)?`)) return;

    try {
      for (const item of daLista) {
        const manter = calcularEstoqueManter(item);
        const sugerida = Math.max(0, Math.round((manter - estoqueTotal(item)) * 1000) / 1000);
        item.quantidade = sugerida;
        await atualizar('lista_de_produtos', item.id, {
          quantidade: sugerida, quantidade_sugerida: sugerida, estoque_manter: manter,
        });
      }
      ui.toast('Quantidade sugerida aplicada.');
      desenhar();
    } catch (erro) { ui.toast(erro.message, 'erro'); }
  });

  selLista.addEventListener('change', () => {
    if (selLista.value === '__nova') {
      const nome = window.prompt('Nome da nova lista:');
      if (!nome) { selLista.value = lista; return; }
      lista = nome.trim();
      const opt = document.createElement('option');
      opt.value = lista;
      opt.textContent = lista;
      selLista.insertBefore(opt, selLista.lastElementChild);
      selLista.value = lista;
    } else {
      lista = selLista.value;
    }
    localStorage.setItem('sugestao.lista', lista);
    desenhar();
  });

  // -------------------------------------------------------- busca produto
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
        if (!podeEditar) { ui.toast('Sem permissão para alterar a lista.', 'erro'); return; }
        if (itens.some((i) => i.lista === lista && i.produto_id === produto.id)) {
          ui.toast('Este produto já está na lista.', 'erro');
          return;
        }
        try {
          const novo = await criar('lista_de_produtos', {
            lista, sku: produto.sku, descricao: produto.descricao,
            unidade: produto.unidade || 'UN', quantidade: qtd,
            produto_id: produto.id, ordem: itensDaLista().length + 1,
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

  // ---------------------------------------------------------- importação
  raiz.querySelector('#importar')?.addEventListener('click', () => {
    const { fechar, corpo } = ui.modal({
      titulo: 'Importar lista de arquivo',
      largura: '620px',
      corpo: `
        <p class="sub">Aceita a planilha do ressuprimento (.xlsx, .xls) ou um .csv.
          As colunas são reconhecidas pelo título.</p>
        <label class="campo"><span>Arquivo</span>
          <input type="file" id="arquivo" accept=".xlsx,.xls,.csv"></label>
        <label class="campo"><span>Lista de destino</span>
          <input id="destino" value="${ui.esc(lista)}"></label>
        <label class="campo" style="flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" id="limpar"> <span>Limpar a lista antes de importar</span>
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
      const destino = corpo.querySelector('#destino').value.trim() || lista;
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

        // prefere a aba RELATORIO, se existir
        const nomeAba = livro.SheetNames.find((n) => normaliza(n) === 'RELATORIO')
          || livro.SheetNames[0];
        const linhas = XLSX.utils.sheet_to_json(livro.Sheets[nomeAba], { header: 1, defval: null });

        const cabecalho = linhas[0] || [];
        const mapa = mapearCabecalho(cabecalho);
        if (mapa.sku === undefined && mapa.descricao === undefined) {
          throw new Error('Não encontrei as colunas de SKU/descrição no arquivo.');
        }

        const registros = [];
        for (let i = 1; i < linhas.length; i += 1) {
          const linha = linhas[i];
          if (!linha || !linha.some((v) => v !== null && v !== '')) continue;
          const pegar = (campo) => (mapa[campo] !== undefined ? linha[mapa[campo]] : null);

          registros.push({
            lista: destino,
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
            quantidade: 0,
            ordem: i,
            importado_em: new Date().toISOString(),
          });
        }

        if (!registros.length) throw new Error('O arquivo não tem linhas de produto.');

        if (limpar) {
          await excluirOnde('lista_de_produtos', { lista: destino });
          for (let k = itens.length - 1; k >= 0; k -= 1) {
            if (itens[k].lista === destino) itens.splice(k, 1);
          }
        }

        botao.textContent = `Gravando 0/${registros.length}…`;
        const TAMANHO = 100;
        for (let i = 0; i < registros.length; i += TAMANHO) {
          const lote = registros.slice(i, i + TAMANHO);
          const criados = await criar('lista_de_produtos', lote);
          for (const c of (Array.isArray(criados) ? criados : [])) itens.push(c);
          botao.textContent = `Gravando ${Math.min(i + TAMANHO, registros.length)}/${registros.length}…`;
        }

        if (info) info.textContent = `${registros.length} item(ns) importado(s).`;
        ui.toast(`${registros.length} item(ns) importado(s) para "${destino}".`);
        lista = destino;
        localStorage.setItem('sugestao.lista', lista);
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
