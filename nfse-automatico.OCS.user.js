// ==UserScript==
// @name         NFS-e - Preenchimento Automático
// @namespace    nfse-automacao-local
// @version      3.4
// @description  Pessoas, municipios, tributacao, ISSQN, NBS, PIS/COFINS, retencao, aliquota Simples e painel superior de sucesso
// @match        https://www.nfse.gov.br/EmissorNacional/*
// @match        https://nfse.gov.br/EmissorNacional/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const REGIME =
    'Regime de apuração dos tributos federais e municipal pelo Simples Nacional';

  const CODIGO = '07.09.01';
  const NBS = '124033200';
  const NBS_EXIBICAO = '1.2403.32.00';

  const MUNICIPIOS = [
    { nome: 'Diadema', busca: 'Diadema/SP', complementar: '07.09.01.001' },
    { nome: 'SBC', busca: 'São Bernardo do Campo/SP', complementar: '07.09.01.001' },
    { nome: 'São Paulo', busca: 'São Paulo/SP', complementar: '07.09.01.099' }
  ];

  const ID_PAINEL_MUNICIPIOS = 'nfse-municipios';
  const ID_PAINEL_SUCESSO = 'nfse-painel-sucesso-topo';

  const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function atualizarInput(campo, valor) {
    if (!campo) return;

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set;

    if (setter) {
      setter.call(campo, valor);
    } else {
      campo.value = valor;
    }

    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function textoVisivel(el) {
    return [
      el?.textContent,
      el?.value,
      el?.title,
      el?.getAttribute?.('aria-label'),
      el?.getAttribute?.('data-original-title'),
      el?.getAttribute?.('href')
    ]
      .filter(Boolean)
      .join(' ');
  }

  // =====================================
  // ETAPA 1 - PESSOAS
  // =====================================

  function marcarIBSCBS() {
    const radios = [...document.querySelectorAll('input[type="radio"]')];

    const radioNao = radios.find(radio => {
      const labels = radio.labels ? [...radio.labels].map(l => l.textContent) : [];
      const contexto = labels.join(' ');
      return normalizar(contexto) === 'nao' || normalizar(contexto).endsWith(' nao');
    });

    if (radioNao && !radioNao.checked) {
      radioNao.click();
    }
  }

  function preencherCompetencia() {
    const campo = [...document.querySelectorAll('input')].find(input => {
      const identificacao = [
        input.id,
        input.name,
        input.placeholder,
        input.getAttribute('aria-label'),
        ...(input.labels ? [...input.labels].map(l => l.textContent) : [])
      ].join(' ');

      return normalizar(identificacao).includes('competencia');
    });

    if (!campo || campo.disabled || campo.readOnly) return;

    const hoje = new Date();

    const valor = campo.type === 'date'
      ? [
          hoje.getFullYear(),
          String(hoje.getMonth() + 1).padStart(2, '0'),
          String(hoje.getDate()).padStart(2, '0')
        ].join('-')
      : [
          String(hoje.getDate()).padStart(2, '0'),
          String(hoje.getMonth() + 1).padStart(2, '0'),
          hoje.getFullYear()
        ].join('/');

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set;

    if (setter) {
      setter.call(campo, valor);
    } else {
      campo.value = valor;
    }

    ['input', 'change', 'blur'].forEach(evento => {
      campo.dispatchEvent(new Event(evento, { bubbles: true }));
    });
  }

  function selecionarRegime() {
    const alvo = normalizar(REGIME);

    const containers = [...document.querySelectorAll('.chosen-container-single')];

    for (const container of containers) {
      const select = container.previousElementSibling;

      if (!select || select.tagName !== 'SELECT') continue;

      const opcao = [...select.options].find(
        item => normalizar(item.textContent) === alvo
      );

      if (!opcao) continue;

      select.value = opcao.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      if (window.jQuery) {
        window.jQuery(select).trigger('chosen:updated').trigger('change');
      }

      console.log('[NFS-e] Regime selecionado.');
      return;
    }
  }

  // =====================================
  // SELECT2 - FUNÇÕES COMPARTILHADAS
  // =====================================

  function obterSelecionado(select) {
    if (!select) return '';

    if (window.jQuery && window.jQuery(select).data('select2')) {
      const dados = window.jQuery(select).select2('data');
      if (dados?.length) return dados[0].text || '';
    }

    return select.selectedOptions?.[0]?.textContent || '';
  }

  function localizarMunicipio() {
    const rotulos = [...document.querySelectorAll('label')];

    const rotulo = rotulos.find(el =>
      normalizar(el.textContent).replace(/\*/g, '').trim() === 'municipio'
    );

    if (rotulo) {
      if (rotulo.htmlFor) {
        const campo = document.getElementById(rotulo.htmlFor);
        if (campo?.tagName === 'SELECT') return campo;
      }

      const grupo = rotulo.closest('.form-group, [class*="col-"]') || rotulo.parentElement;
      const select = grupo?.querySelector('select');
      if (select) return select;
    }

    return [...document.querySelectorAll('select')].find(select =>
      normalizar(select.id + ' ' + select.name).includes('municipio')
    ) || null;
  }

  // =====================================
  // ETAPA 2 - MUNICÍPIOS
  // =====================================

  async function selecionarMunicipio(municipio) {
    const select = localizarMunicipio();
    if (!select) return false;

    const alvo = normalizar(municipio.busca);

    if (normalizar(obterSelecionado(select)) === alvo) return true;

    if (window.jQuery && window.jQuery(select).data('select2')) {
      window.jQuery(select).select2('open');
    } else {
      select.parentElement?.querySelector('.select2-selection')?.click();
    }

    await esperar(300);

    const pesquisa = document.querySelector(
      '.select2-container--open .select2-search__field'
    );

    if (!pesquisa) return false;

    atualizarInput(pesquisa, municipio.busca.split('/')[0]);

    for (let tentativa = 0; tentativa < 30; tentativa++) {
      await esperar(200);

      const opcoes = [...document.querySelectorAll(
        '.select2-container--open .select2-results__option--selectable'
      )];

      const opcao = opcoes.find(item =>
        normalizar(item.textContent) === alvo
      );

      if (!opcao) continue;

      opcao.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      }));

      await esperar(350);

      if (normalizar(obterSelecionado(select)) === alvo) {
        return true;
      }

      if (opcao.isConnected) {
        opcao.click();
        await esperar(250);
      }

      return normalizar(obterSelecionado(select)) === alvo;
    }

    return false;
  }

  function criarBotoesMunicipios() {
    if (document.getElementById(ID_PAINEL_MUNICIPIOS)) return;

    const painel = document.createElement('div');
    painel.id = ID_PAINEL_MUNICIPIOS;
    painel.style.cssText = `
      margin: 12px 0;
      padding: 14px;
      background: #f4f6fa;
      border: 1px solid #d7dce5;
      border-radius: 8px;
      font-family: Arial, sans-serif;
    `;

    const titulo = document.createElement('div');
    titulo.textContent = 'SELEÇÃO RÁPIDA DE MUNICÍPIO';
    titulo.style.cssText = `
      font-size: 12px;
      font-weight: bold;
      color: #40549a;
      margin-bottom: 10px;
    `;
    painel.appendChild(titulo);

    const grupo = document.createElement('div');
    grupo.style.cssText = `
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    `;

    const status = document.createElement('div');
    status.style.cssText = `
      font-size: 12px;
      margin-top: 10px;
      color: #475569;
    `;

    MUNICIPIOS.forEach(municipio => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.textContent = municipio.nome;
      botao.style.cssText = `
        padding: 10px 18px;
        background: white;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        color: #334155;
      `;

      botao.addEventListener('click', async () => {
        status.textContent = 'Selecionando ' + municipio.busca + '...';
        botao.disabled = true;

        try {
          const sucesso = await selecionarMunicipio(municipio);

          if (!sucesso) {
            status.textContent = 'Não foi possível confirmar o município.';
            return;
          }

          grupo.querySelectorAll('button').forEach(b => {
            b.style.background = 'white';
            b.style.color = '#334155';
          });

          botao.style.background = '#40549a';
          botao.style.color = 'white';

          status.textContent = 'Município selecionado: ' + municipio.busca;

          await preencherTributacao(false);
          const okComplementar = await preencherComplementarMunicipal(municipio);
          await preencherNBS();
          marcarNaoISSQN(true);

          status.textContent = okComplementar
            ? 'Município e complementar confirmados.'
            : 'Município selecionado. Confira o complementar.';
        } finally {
          botao.disabled = false;
        }
      });

      grupo.appendChild(botao);
    });

    painel.appendChild(grupo);
    painel.appendChild(status);

    const select = localizarMunicipio();

    if (select) {
      const grupoCampo = select.closest('.form-group, [class*="col-"]');
      if (grupoCampo) {
        grupoCampo.insertAdjacentElement('afterend', painel);
      } else {
        select.parentElement?.appendChild(painel);
      }
    } else {
      document.body.appendChild(painel);
    }
  }

  // =====================================
  // TRIBUTAÇÃO AUTOMÁTICA
  // =====================================

  let tributacaoEmAndamento = false;

  const identificarCodigo = texto =>
    normalizar(texto).startsWith(normalizar(CODIGO)) &&
    !/[0-9]/.test(normalizar(texto).charAt(CODIGO.length));

  function localizarTributacao() {
    let select = document.querySelector(
      'select[id*="CodigoTributacaoNacional"], select[name*="CodigoTributacaoNacional"]'
    );

    const visual = [...document.querySelectorAll(
      '[id*="CodigoTributacaoNacional"][id$="-container"]'
    )].find(el => el.closest('.select2-selection'));

    const container = visual?.closest('.select2-container');

    if (!select && container) {
      const anterior = container.previousElementSibling;
      if (anterior?.tagName === 'SELECT') select = anterior;
    }

    let gatilho = container?.querySelector('.select2-selection');

    if (!gatilho && select) {
      gatilho = document.getElementById('select2-' + select.id + '-container')
        ?.closest('.select2-selection');
    }

    if (!gatilho && select) {
      gatilho = select.parentElement?.querySelector('.select2-selection');
    }

    return { select, gatilho };
  }

  function textoTributacao(local) {
    const textos = [];

    if (local.select) textos.push(obterSelecionado(local.select));

    if (local.gatilho) {
      const exibido = local.gatilho.querySelector('.select2-selection__rendered');
      if (exibido) textos.push(exibido.textContent);
    }

    return textos.filter(Boolean).join(' | ');
  }

  function alterarStatusCodigo(mensagem) {
    console.log('[NFS-e] ' + mensagem);
  }

  async function abrirTributacao(local) {
    const $ = window.jQuery;

    if (local.select && $ && $(local.select).data('select2')) {
      $(local.select).select2('open');
    } else {
      local.gatilho?.click();
    }

    for (let i = 0; i < 15; i++) {
      const pesquisa = document.querySelector(
        '.select2-container--open .select2-search__field'
      );
      if (pesquisa) return pesquisa;
      await esperar(150);
    }

    return null;
  }

  async function procurarCodigo(local, termo) {
    const pesquisa = await abrirTributacao(local);
    if (!pesquisa) {
      alterarStatusCodigo('Campo de pesquisa da tributação não encontrado.');
      return false;
    }

    pesquisa.focus();
    atualizarInput(pesquisa, termo);

    if (window.jQuery) {
      window.jQuery(pesquisa).trigger('keyup');
    }

    for (let tentativa = 0; tentativa < 25; tentativa++) {
      await esperar(200);

      const resultados = [...document.querySelectorAll(
        '.select2-container--open .select2-results__option--selectable'
      )];

      const correspondentes = resultados.filter(item =>
        identificarCodigo(item.textContent) &&
        item.getClientRects().length > 0
      );

      if (correspondentes.length > 1) {
        alterarStatusCodigo('Mais de uma opção de tributação encontrada.');
        return false;
      }

      const opcao = correspondentes[0];
      if (!opcao) continue;

      opcao.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      }));

      await esperar(300);

      if (identificarCodigo(textoTributacao(local))) return true;

      if (opcao.isConnected) {
        opcao.click();
        await esperar(300);
      }

      if (identificarCodigo(textoTributacao(local))) return true;
    }

    return false;
  }

  async function preencherTributacao(manual = false) {
    if (tributacaoEmAndamento) return;

    const local = localizarTributacao();

    if (!local.select && !local.gatilho) {
      alterarStatusCodigo('Campo de tributação não localizado.');
      return;
    }

    const atual = textoTributacao(local);

    if (identificarCodigo(atual)) {
      alterarStatusCodigo('Código 07.09.01 já selecionado.');
      return;
    }

    if (!manual && atual && !/selecione|^\s*$/i.test(atual)) {
      alterarStatusCodigo('Outro código já selecionado. Não alterado.');
      return;
    }

    tributacaoEmAndamento = true;

    try {
      alterarStatusCodigo('Pesquisando código 07.09.01...');

      if (local.select) {
        const opcao = [...local.select.options].find(item =>
          identificarCodigo(item.textContent)
        );

        if (opcao) {
          local.select.value = opcao.value;

          if (window.jQuery) {
            window.jQuery(local.select).trigger('change');
          } else {
            local.select.dispatchEvent(new Event('change', { bubbles: true }));
          }

          await esperar(300);

          if (identificarCodigo(textoTributacao(local))) {
            alterarStatusCodigo('Código 07.09.01 selecionado.');
            return;
          }
        }
      }

      let sucesso = await procurarCodigo(local, 'varri');

      if (!sucesso) {
        sucesso = await procurarCodigo(local, CODIGO);
      }

      if (sucesso) {
        alterarStatusCodigo('Código 07.09.01 selecionado!');
      } else {
        alterarStatusCodigo('Não foi possível selecionar automaticamente.');
      }
    } catch (erro) {
      console.error('[NFS-e]', erro);
    } finally {
      tributacaoEmAndamento = false;
    }
  }

  // =====================================
  // CÓDIGO COMPLEMENTAR MUNICIPAL
  // =====================================

  function correspondeComplementar(texto, codigo) {
    const valor = normalizar(texto);
    const alvo = normalizar(codigo);

    return valor === alvo ||
      (valor.startsWith(alvo) && !/[0-9.]/.test(valor.charAt(alvo.length)));
  }

  async function preencherComplementarMunicipal(municipio) {
    const id = 'ServicoPrestado_CodigoComplementarMunicipal';
    const idChosen = id + '_chosen';
    const codigo = municipio.complementar;

    function cidadeConfere() {
      const selectCidade = localizarMunicipio();
      return !!selectCidade &&
        normalizar(obterSelecionado(selectCidade)) === normalizar(municipio.busca);
    }

    function selecionadoConfere(select, chosen) {
      const opcao = select?.selectedOptions?.[0];
      const textoOriginal = opcao?.textContent || '';
      const textoVisual = chosen?.querySelector('.chosen-single span')?.textContent || '';

      return !!select?.value &&
        correspondeComplementar(textoOriginal, codigo) &&
        correspondeComplementar(textoVisual, codigo);
    }

    if (!cidadeConfere()) return false;

    if (!identificarCodigo(textoTributacao(localizarTributacao()))) {
      console.warn('[NFS-e] Código nacional ainda não confirmado.');
      return false;
    }

    for (let tentativa = 0; tentativa < 36; tentativa++) {
      if (!cidadeConfere()) return false;

      const select = document.getElementById(id);
      const chosen = document.getElementById(idChosen);

      if (select?.tagName === 'SELECT' && chosen) {
        const opcoes = [...select.options].filter(opcao =>
          opcao.value &&
          correspondeComplementar(opcao.textContent, codigo)
        );

        if (opcoes.length === 1) {
          if (selecionadoConfere(select, chosen)) return true;

          select.value = opcoes[0].value;
          select.dispatchEvent(new Event('change', { bubbles: true }));

          if (window.jQuery) {
            window.jQuery(select).trigger('chosen:updated').trigger('change');
          }

          await esperar(250);

          if (selecionadoConfere(select, chosen)) {
            console.log('[NFS-e] Complementar confirmado:', codigo);
            return true;
          }

          chosen.querySelector('.chosen-single')?.click();
          await esperar(150);

          const resultado = [...chosen.querySelectorAll('.chosen-results li.active-result')].find(li =>
            correspondeComplementar(li.textContent, codigo)
          );

          if (resultado) {
            resultado.dispatchEvent(new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              view: window
            }));
            await esperar(250);
          }

          if (selecionadoConfere(select, chosen)) {
            console.log('[NFS-e] Complementar confirmado:', codigo);
            return true;
          }
        }
      }

      await esperar(250);
    }

    console.warn('[NFS-e] Complementar não confirmado:', municipio.busca, codigo);
    return false;
  }

  // =====================================
  // ISSQN = NÃO
  // =====================================

  function localizarGrupoISSQN() {
    const frase = 'o servico/fornecimento prestado e um caso de';

    const possiveis = [...document.querySelectorAll('label, legend, p, span, div, strong')]
      .filter(el => {
        const texto = normalizar(el.textContent);
        return texto.includes(frase) && texto.includes('issqn');
      })
      .sort((a, b) => a.textContent.length - b.textContent.length);

    for (const pergunta of possiveis) {
      let bloco = pergunta;

      for (let nivel = 0; nivel < 9 && bloco; nivel++, bloco = bloco.parentElement) {
        const radios = [...bloco.querySelectorAll('input[type="radio"]')];
        if (radios.length < 2 || radios.length > 4) continue;

        function rotulo(radio) {
          const labels = radio.labels ? [...radio.labels] : [];
          const nomes = labels.map(el => el.textContent).join(' ').trim();

          return normalizar(
            nomes ||
            radio.closest('label')?.textContent ||
            radio.parentElement?.textContent ||
            ''
          );
        }

        const nao = radios.find(r => rotulo(r) === 'nao');
        const sim = radios.find(r => rotulo(r) === 'sim');

        if (nao && sim && (!nao.name || !sim.name || nao.name === sim.name)) {
          return { nao, sim };
        }
      }
    }

    return null;
  }

  function marcarNaoISSQN(forcar = false) {
    const grupo = localizarGrupoISSQN();

    if (!grupo) {
      console.warn('[NFS-e] Opções Não/Sim do ISSQN não localizadas.');
      return false;
    }

    if (!forcar && grupo.sim.checked) return false;
    if (grupo.nao.checked) return true;

    grupo.nao.click();

    if (grupo.nao.checked) {
      console.log('[NFS-e] ISSQN: opção Não marcada.');
      return true;
    }

    return false;
  }

  function observarISSQN() {
    let agendado = null;

    const observer = new MutationObserver(() => {
      if (agendado !== null) clearTimeout(agendado);

      agendado = setTimeout(() => {
        agendado = null;
        const grupo = localizarGrupoISSQN();

        if (grupo && !grupo.nao.checked && !grupo.sim.checked) {
          marcarNaoISSQN(false);
        }
      }, 200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // =====================================
  // ITEM NBS
  // =====================================

  let nbsEmAndamento = false;

  function correspondeNBS(texto) {
    const valor = String(texto || '').trim();
    const prefixo = valor.match(/^(?:NBS\s*[:\-]\s*)?([0-9.]+)/i);
    if (!prefixo) return false;
    return prefixo[1].replace(/\D/g, '') === NBS;
  }

  function localizarNBS() {
    let select = [...document.querySelectorAll('select')].find(el =>
      /nbs/i.test(el.id + ' ' + el.name)
    ) || null;

    const label = [...document.querySelectorAll('label')].find(el =>
      normalizar(el.textContent).includes('item da nbs correspondente')
    );

    if (!select && label?.htmlFor) {
      const vinculado = document.getElementById(label.htmlFor);
      if (vinculado?.tagName === 'SELECT') select = vinculado;
    }

    if (!select && label) {
      const bloco = label.closest('.form-group, [class*="col-"]') || label.parentElement;
      select = bloco?.querySelector('select') || null;
    }

    if (!select) return null;

    const chosen = document.getElementById(select.id + '_chosen') ||
      (select.nextElementSibling?.classList.contains('chosen-container')
        ? select.nextElementSibling
        : null);

    const select2 = document.getElementById('select2-' + select.id + '-container')
      ?.closest('.select2-container') ||
      (select.nextElementSibling?.classList.contains('select2-container')
        ? select.nextElementSibling
        : null);

    return { select, chosen, select2 };
  }

  function NBSConfirmado(campo) {
    if (!campo?.select?.value) return false;

    const opcao = campo.select.selectedOptions?.[0];
    if (!opcao) return false;

    if (!correspondeNBS(opcao.textContent) && !correspondeNBS(opcao.value)) {
      return false;
    }

    if (campo.chosen) {
      const exibido = campo.chosen.querySelector('.chosen-single span')?.textContent || '';
      return normalizar(exibido) === normalizar(opcao.textContent);
    }

    if (campo.select2) {
      const exibido = campo.select2.querySelector('.select2-selection__rendered')?.textContent || '';
      return normalizar(exibido) === normalizar(opcao.textContent);
    }

    return true;
  }

  async function preencherNBS() {
    if (nbsEmAndamento) return false;
    nbsEmAndamento = true;

    try {
      let campo = null;

      for (let tentativa = 0; tentativa < 40; tentativa++) {
        campo = localizarNBS();
        if (campo?.select && !campo.select.disabled) break;
        await esperar(250);
      }

      if (!campo?.select || campo.select.disabled) {
        console.warn('[NFS-e] Campo NBS ainda não disponível.');
        return false;
      }

      if (NBSConfirmado(campo)) return true;

      const selecionado = campo.select.selectedOptions?.[0];

      if (
        campo.select.value &&
        selecionado &&
        !/selecione|escolha/i.test(selecionado.textContent) &&
        !correspondeNBS(selecionado.textContent) &&
        !correspondeNBS(selecionado.value)
      ) {
        console.warn('[NFS-e] Outro NBS já selecionado.');
        return false;
      }

      for (let tentativa = 0; tentativa < 24; tentativa++) {
        const opcoes = [...campo.select.options].filter(opt =>
          opt.value &&
          (correspondeNBS(opt.textContent) || correspondeNBS(opt.value))
        );

        if (opcoes.length === 1) {
          campo.select.value = opcoes[0].value;
          campo.select.dispatchEvent(new Event('change', { bubbles: true }));

          if (window.jQuery) {
            const $ = window.jQuery;
            if (campo.chosen) $(campo.select).trigger('chosen:updated');
            $(campo.select).trigger('change');
          }

          await esperar(250);

          if (NBSConfirmado(campo)) {
            console.log('[NFS-e] NBS preenchido:', NBS_EXIBICAO);
            return true;
          }
        }

        if (opcoes.length > 1) return false;
        await esperar(250);
      }

      if (campo.chosen) {
        campo.chosen.querySelector('.chosen-single')?.click();
        await esperar(200);

        const busca = campo.chosen.querySelector('.chosen-search input');

        if (busca) {
          busca.focus();
          atualizarInput(busca, NBS);
          if (window.jQuery) window.jQuery(busca).trigger('keyup');
        }

        for (let i = 0; i < 20; i++) {
          const opcoes = [...campo.chosen.querySelectorAll('.chosen-results li.active-result')]
            .filter(el => correspondeNBS(el.textContent));

          if (opcoes.length === 1) {
            opcoes[0].dispatchEvent(new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              view: window
            }));

            await esperar(250);

            if (NBSConfirmado(campo)) return true;

            if (opcoes[0].isConnected) opcoes[0].click();

            await esperar(250);
            return NBSConfirmado(campo);
          }

          if (opcoes.length > 1) return false;
          await esperar(200);
        }
      } else if (campo.select2) {
        const $ = window.jQuery;

        if ($ && $(campo.select).data('select2')) {
          $(campo.select).select2('open');
        } else {
          campo.select2.querySelector('.select2-selection')?.click();
        }

        await esperar(250);

        const busca = document.querySelector('.select2-container--open .select2-search__field');

        if (busca) {
          busca.focus();
          atualizarInput(busca, NBS);
          if ($) $(busca).trigger('keyup');
        }

        for (let i = 0; i < 25; i++) {
          const opcoes = [...document.querySelectorAll(
            '.select2-container--open .select2-results__option--selectable'
          )].filter(el => correspondeNBS(el.textContent));

          if (opcoes.length === 1) {
            opcoes[0].dispatchEvent(new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              view: window
            }));

            await esperar(250);

            if (NBSConfirmado(campo)) return true;

            if (opcoes[0].isConnected) opcoes[0].click();

            await esperar(250);
            return NBSConfirmado(campo);
          }

          if (opcoes.length > 1) return false;
          await esperar(200);
        }
      }

      console.warn('[NFS-e] NBS não confirmado:', NBS_EXIBICAO);
      return false;
    } catch (erro) {
      console.error('[NFS-e] Erro no campo NBS:', erro);
      return false;
    } finally {
      nbsEmAndamento = false;
    }
  }

  // =====================================
  // VALORES - PIS/COFINS = 00 - NENHUM
  // =====================================

  function opcaoNenhumPISCOFINS(opcao) {
    const nome = normalizar(opcao?.textContent);
    return /^00\s*[-–—:]\s*nenhum\b/.test(nome) ||
      (nome === 'nenhum' && /^(00|0)$/.test(opcao?.value || ''));
  }

  function localizarSituacaoPISCOFINS() {
    const labels = [...document.querySelectorAll('label')];

    const rotulo = labels.find(el =>
      normalizar(el.textContent).includes('situacao tributaria do pis/cofins')
    );

    if (rotulo?.htmlFor) {
      const vinculado = document.getElementById(rotulo.htmlFor);
      if (vinculado?.tagName === 'SELECT') return vinculado;
    }

    if (rotulo) {
      let bloco = rotulo.parentElement;
      for (let nivel = 0; nivel < 4 && bloco; nivel++) {
        const selects = [...bloco.querySelectorAll('select')];
        if (selects.length === 1) return selects[0];
        bloco = bloco.parentElement;
      }
    }

    return [...document.querySelectorAll('select')].find(s => {
      const identificador = normalizar(s.id + ' ' + s.name).replace(/[^a-z0-9]/g, '');
      return identificador.includes('situacaotributaria') &&
        (identificador.includes('pis') || identificador.includes('cofins'));
    }) || null;
  }

  function situacaoPISCOFINSConfirmada(select, opcao) {
    if (
      !select ||
      !opcao ||
      select.value !== opcao.value ||
      !opcaoNenhumPISCOFINS(select.selectedOptions?.[0])
    ) {
      return false;
    }

    const escolhido = document.getElementById(select.id + '_chosen') ||
      (select.nextElementSibling?.classList.contains('chosen-container')
        ? select.nextElementSibling
        : null);

    if (escolhido) {
      const texto = escolhido.querySelector('.chosen-single span')?.textContent;
      return !!texto && /^00\s*[-–—:]\s*nenhum\b/.test(normalizar(texto));
    }

    return true;
  }

  async function preencherSituacaoPISCOFINS() {
    for (let tentativa = 0; tentativa < 48; tentativa++) {
      const select = localizarSituacaoPISCOFINS();

      if (!select || select.disabled) {
        await esperar(250);
        continue;
      }

      const opcao = [...select.options].find(opcaoNenhumPISCOFINS);

      if (!opcao || !opcao.value) {
        await esperar(250);
        continue;
      }

      if (situacaoPISCOFINSConfirmada(select, opcao)) {
        console.log('[NFS-e] PIS/COFINS: 00 - Nenhum já selecionado.');
        return true;
      }

      if (select.value && select.value !== opcao.value) {
        console.log('[NFS-e] PIS/COFINS já preenchido. Não alterado.');
        return false;
      }

      select.value = opcao.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      if (window.jQuery) {
        window.jQuery(select).trigger('chosen:updated');
      }

      await esperar(300);

      if (situacaoPISCOFINSConfirmada(select, opcao)) {
        console.log('[NFS-e] PIS/COFINS: 00 - Nenhum selecionado.');
        return true;
      }

      const escolhido = document.getElementById(select.id + '_chosen') ||
        (select.nextElementSibling?.classList.contains('chosen-container')
          ? select.nextElementSibling
          : null);

      escolhido?.querySelector('.chosen-single')?.click();
      await esperar(150);

      const resultado = [...(escolhido?.querySelectorAll('.chosen-results li.active-result') || [])]
        .find(el => /^00\s*[-–—:]\s*nenhum\b/.test(normalizar(el.textContent)));

      resultado?.click();
      await esperar(250);

      if (situacaoPISCOFINSConfirmada(select, opcao)) {
        console.log('[NFS-e] PIS/COFINS: 00 - Nenhum confirmado.');
        return true;
      }

      return false;
    }

    console.warn('[NFS-e] Situação Tributária PIS/COFINS não localizada.');
    return false;
  }

  // =====================================
  // VALORES - RETENÇÃO = 0 - NÃO RETIDOS
  // =====================================

  function opcaoRetencaoNaoRetida(opcao) {
    return /^0\s*[-–—:]\s*pis\/cofins\/csll nao retidos\b/.test(
      normalizar(opcao?.textContent)
    );
  }

  function localizarRetencaoPISCOFINS() {
    const rotulo = [...document.querySelectorAll('label')].find(el =>
      normalizar(el.textContent).includes('tipo de retencao do pis/cofins/csll')
    );

    if (rotulo?.htmlFor) {
      const vinculado = document.getElementById(rotulo.htmlFor);
      if (vinculado?.tagName === 'SELECT') return vinculado;
    }

    if (rotulo) {
      let bloco = rotulo.parentElement;
      for (let nivel = 0; nivel < 4 && bloco; nivel++) {
        const campos = [...bloco.querySelectorAll('select')];
        if (campos.length === 1) return campos[0];
        bloco = bloco.parentElement;
      }
    }

    const identificados = [...document.querySelectorAll('select')].filter(s => {
      const chave = normalizar(s.id + ' ' + s.name).replace(/[^a-z0-9]/g, '');
      return chave.includes('retencao') &&
        (chave.includes('pis') || chave.includes('cofins') || chave.includes('csll')) &&
        !chave.includes('situacaotributaria');
    });

    if (identificados.length === 1) return identificados[0];

    const porOpcao = [...document.querySelectorAll('select')].filter(s =>
      [...s.options].some(opcaoRetencaoNaoRetida)
    );

    return porOpcao.length === 1 ? porOpcao[0] : null;
  }

  function retencaoConfirmada(select, opcao) {
    if (
      !select ||
      !opcao ||
      select.value !== opcao.value ||
      !opcaoRetencaoNaoRetida(select.selectedOptions?.[0])
    ) {
      return false;
    }

    const chosen = document.getElementById(select.id + '_chosen') ||
      (select.nextElementSibling?.classList.contains('chosen-container')
        ? select.nextElementSibling
        : null);

    if (!chosen) return true;

    return opcaoRetencaoNaoRetida({
      textContent: chosen.querySelector('.chosen-single span')?.textContent
    });
  }

  async function preencherRetencaoPISCOFINS() {
    for (let tentativa = 0; tentativa < 40; tentativa++) {
      const select = localizarRetencaoPISCOFINS();

      if (!select || select.disabled) {
        await esperar(250);
        continue;
      }

      const opcoes = [...select.options].filter(opcaoRetencaoNaoRetida);

      if (opcoes.length !== 1 || !opcoes[0].value) {
        await esperar(250);
        continue;
      }

      const opcao = opcoes[0];

      if (retencaoConfirmada(select, opcao)) return true;

      if (select.value && select.value !== opcao.value) {
        console.log('[NFS-e] Retenção já preenchida; não alterada.');
        return false;
      }

      select.value = opcao.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      if (window.jQuery) {
        window.jQuery(select).trigger('chosen:updated');
      }

      await esperar(250);

      if (retencaoConfirmada(select, opcao)) {
        console.log('[NFS-e] Retenção: 0 - Não Retidos confirmada.');
        return true;
      }

      const chosen = document.getElementById(select.id + '_chosen') ||
        (select.nextElementSibling?.classList.contains('chosen-container')
          ? select.nextElementSibling
          : null);

      chosen?.querySelector('.chosen-single')?.click();
      await esperar(150);

      const resultados = [...(chosen?.querySelectorAll('.chosen-results li.active-result') || [])]
        .filter(opcaoRetencaoNaoRetida);

      if (resultados.length === 1) {
        resultados[0].dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          view: window
        }));

        await esperar(250);

        if (retencaoConfirmada(select, opcao)) return true;

        if (resultados[0].isConnected) resultados[0].click();

        await esperar(250);
      }

      const ok = retencaoConfirmada(select, opcao);

      if (!ok) console.warn('[NFS-e] Retenção não confirmada.');

      return ok;
    }

    console.warn('[NFS-e] Campo de retenção não localizado.');
    return false;
  }

  // =====================================
  // VALORES - ALÍQUOTA DO SIMPLES NACIONAL
  // =====================================

  function localizarRadioAliquotaSimples() {
    const alvo = normalizar('Informar alíquota do Simples Nacional');

    const textos = [...document.querySelectorAll('label, span, div, p')]
      .filter(el => normalizar(el.textContent) === alvo)
      .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);

    for (const texto of textos) {
      const label = texto.closest('label');
      let radio = null;

      if (label?.htmlFor) {
        const vinculado = document.getElementById(label.htmlFor);
        if (vinculado?.matches('input[type="radio"]')) radio = vinculado;
      }

      if (!radio && label) {
        radio = label.querySelector('input[type="radio"]');
      }

      if (!radio) {
        const bloco = texto.closest('.radio, .radio-inline, .form-check, .custom-control, li') || texto.parentElement;
        const candidatos = bloco ? [...bloco.querySelectorAll('input[type="radio"]')] : [];
        if (candidatos.length === 1) radio = candidatos[0];
      }

      if (!radio && texto.previousElementSibling?.matches?.('input[type="radio"]')) {
        radio = texto.previousElementSibling;
      }

      if (radio && !radio.disabled) return radio;
    }

    return null;
  }

  async function marcarAliquotaSimplesNacional() {
    for (let tentativa = 0; tentativa < 40; tentativa++) {
      const radio = localizarRadioAliquotaSimples();

      if (!radio) {
        await esperar(250);
        continue;
      }

      if (radio.checked) {
        console.log('[NFS-e] Alíquota do Simples Nacional já marcada.');
        return true;
      }

      if (radio.name) {
        const relacionados = [...document.querySelectorAll('input[type="radio"]')]
          .filter(el => el.name === radio.name);

        if (relacionados.some(el => el !== radio && el.checked)) {
          console.log('[NFS-e] Outra opção já selecionada.');
          return false;
        }
      }

      radio.click();
      await esperar(150);

      if (radio.checked) {
        console.log('[NFS-e] Informar alíquota do Simples Nacional marcado.');
        return true;
      }
    }

    console.warn('[NFS-e] Não foi possível marcar alíquota do Simples Nacional.');
    return false;
  }

  // =====================================
  // PÁGINA FINAL - NFS-e EMITIDA
  // =====================================

  function ehPaginaSucessoNFSe() {
    const texto = normalizar(document.body?.innerText || '');
    return texto.includes('a nfs-e foi gerada com sucesso');
  }

  function extrairChaveAcesso() {
    const texto = document.body?.innerText || '';
    const match = texto.match(/Chave de Acesso:\s*([0-9]+)/i);
    return match ? match[1] : '';
  }

  function extrairNumeroNFSe() {
    const texto = document.body?.innerText || '';

    const padroes = [
      /Número\s+da\s+NFS-?e\s*[:\-]?\s*([0-9]+)/i,
      /NFS-?e\s+n[uú]mero\s*[:\-]?\s*([0-9]+)/i,
      /N[úu]mero\s*[:\-]?\s*([0-9]+)\s*(?:\r?\n|\s+)NFS-?e/i
    ];

    for (const padrao of padroes) {
      const match = texto.match(padrao);
      if (match) return match[1];
    }

    const elementos = [...document.querySelectorAll('td, th, div, span, p, strong, b, label')];

    for (const el of elementos) {
      const t = normalizar(el.textContent);
      if (!t.includes('numero') || !t.includes('nfs')) continue;

      const prox = el.nextElementSibling?.textContent?.trim();
      if (prox && /^\d+$/.test(prox)) return prox;

      const match = (el.textContent || '').match(/([0-9]{1,20})/);
      if (match) return match[1];
    }

    const clicaveis = [...document.querySelectorAll('a, button')];

    for (const el of clicaveis) {
      const fontes = [
        el.getAttribute('href'),
        el.getAttribute('onclick'),
        el.getAttribute('data-href'),
        el.getAttribute('data-url'),
        el.getAttribute('title'),
        el.textContent
      ].filter(Boolean);

      for (const fonte of fontes) {
        const match = String(fonte).match(/(?:numero|num|nfse)[^0-9]{0,10}([0-9]{1,20})/i);
        if (match) return match[1];
      }
    }

    return '';
  }

  function localizarAlertaSucesso() {
    return [...document.querySelectorAll('.alert, .alert-success, .messages, .message, div')]
      .find(el => normalizar(el.textContent).includes('a nfs-e foi gerada com sucesso')) || null;
  }

  function localizarBotoesDownload() {
    const alvos = [...document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')];

    return alvos.filter(el => {
      if (el.closest('#' + ID_PAINEL_SUCESSO)) return false;

      const texto = normalizar(textoVisivel(el));

      if (!texto) return false;

      const chaves = [
        'download',
        'baixar',
        'pdf',
        'danfse',
        'imprimir',
        'visualizar'
      ];

      return chaves.some(ch => texto.includes(ch));
    });
  }

  function criarBotaoEspelho(orig) {
    const bt = document.createElement('button');
    bt.type = 'button';
    bt.textContent = (orig.textContent || orig.value || orig.title || 'Abrir').trim();
    bt.style.cssText = `
      padding: 10px 14px;
      background: #40549a;
      color: #fff;
      border: 0;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    `;

    bt.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      orig.click();
    });

    return bt;
  }

  function atualizarPainelSucesso() {
    if (!ehPaginaSucessoNFSe()) return;

    const painelExistente = document.getElementById(ID_PAINEL_SUCESSO);
    const numero = extrairNumeroNFSe();
    const chave = extrairChaveAcesso();
    const downloads = localizarBotoesDownload();

    let painel = painelExistente;

    if (!painel) {
      painel = document.createElement('div');
      painel.id = ID_PAINEL_SUCESSO;
      painel.style.cssText = `
        margin: 14px 0;
        padding: 16px;
        background: #eef5ff;
        border: 1px solid #c8d7f2;
        border-radius: 8px;
        font-family: Arial, sans-serif;
      `;
    }

    painel.innerHTML = '';

    const titulo = document.createElement('div');
    titulo.textContent = 'ATALHOS DA NFS-e EMITIDA';
    titulo.style.cssText = `
      font-size: 14px;
      font-weight: 700;
      color: #40549a;
      margin-bottom: 10px;
    `;
    painel.appendChild(titulo);

    const info = document.createElement('div');
    info.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
      margin-bottom: 12px;
      font-size: 14px;
      color: #1f2937;
    `;

    const itemNumero = document.createElement('div');
    itemNumero.innerHTML = `<strong>Número da NFS-e:</strong> ${numero || 'não localizado na tela'}`;
    info.appendChild(itemNumero);

    if (chave) {
      const itemChave = document.createElement('div');
      itemChave.innerHTML = `<strong>Chave de acesso:</strong> ${chave}`;
      info.appendChild(itemChave);
    }

    painel.appendChild(info);

    const acoes = document.createElement('div');
    acoes.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    `;

    if (downloads.length) {
      const unicos = [];
      const vistos = new Set();

      for (const item of downloads) {
        const assinatura = normalizar(textoVisivel(item));
        if (!assinatura || vistos.has(assinatura)) continue;
        vistos.add(assinatura);
        unicos.push(item);
      }

      unicos.forEach(orig => {
        acoes.appendChild(criarBotaoEspelho(orig));
      });
    } else {
      const aviso = document.createElement('div');
      aviso.textContent = 'Botões de download ainda não localizados.';
      aviso.style.cssText = `
        color: #6b7280;
        font-size: 13px;
      `;
      acoes.appendChild(aviso);
    }

    painel.appendChild(acoes);

    const alerta = localizarAlertaSucesso();

    if (alerta) {
      alerta.insertAdjacentElement('afterend', painel);
    } else {
      const referencia = document.querySelector('.container, .container-fluid, main, body');
      referencia?.insertAdjacentElement('afterbegin', painel);
    }
  }

  function observarPaginaSucesso() {
    let timer = null;

    const rodar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        atualizarPainelSucesso();
      }, 250);
    };

    const observer = new MutationObserver(rodar);

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    rodar();
    setTimeout(rodar, 1000);
    setTimeout(rodar, 2500);
  }

  // =====================================
  // INICIALIZAÇÃO
  // =====================================

  async function iniciar() {
    const caminho = window.location.pathname;

    if (caminho.includes('/DPS/Pessoas')) {
      marcarIBSCBS();
      preencherCompetencia();
      selecionarRegime();
    }

    if (caminho.includes('/DPS/Servico')) {
      criarBotoesMunicipios();
      marcarNaoISSQN(true);
      observarISSQN();

      await esperar(800);
      await preencherTributacao(false);
      marcarNaoISSQN(false);
      await preencherNBS();
      marcarNaoISSQN(true);
    }

    if (caminho.includes('/DPS/Tributacao')) {
      await preencherSituacaoPISCOFINS();
      await esperar(350);
      await preencherRetencaoPISCOFINS();
      await marcarAliquotaSimplesNacional();
    }

    if (ehPaginaSucessoNFSe()) {
      atualizarPainelSucesso();
      observarPaginaSucesso();
    }
  }

  setTimeout(iniciar, 1500);
})();
