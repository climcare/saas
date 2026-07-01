const SUPABASE_URL = 'https://iaylyacrzurcjwvtecpu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pkzx4u5U9Xr407syiBE9yA_G7hUvGaw';

const STATUS = {
    EXCELENTE: "EXCELENTE",
    ATENCAO: "ATENÇÃO",
    CRITICO: "CRÍTICO"
};
const STATUS_GERAL = {
    CONFORME: "CONFORME",
    ATENCAO: "ATENÇÃO",
    CRITICO: "CRÍTICO"
};
const STATUS_ENGINE = {
    BOM: "BOM",
    ALERTA: "ALERTA",
    CRITICO: "CRITICO"
};
// STATUS é utilizado pela interface (UI).
// "BOM", "ALERTA" e "CRITICO" são retornados pelo Engine para análises internas.
let supabaseClient = null;
let domElements = {};

// WINDOW.ONLOAD ORIGINAL DO SISTEMA — UNIFICADO E INTEGRADO
window.onload = async () => {
    inicializarGerenciadorTema();
    if (typeof supabase !== "undefined") {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        inicializarCacheDOM();
        await processarCicloMonitoramento();
        setInterval(processarCicloMonitoramento, 15000);
    }
    // RC1.2B FINAL: Inicialização integrada nativamente ao final do fluxo principal
    initializeWorkspaceNavigation();
};

function inicializarGerenciadorTema() {
    const btn = document.getElementById('btnAlternarTema');
    const ico = document.getElementById('icoTema');
    const txt = document.getElementById('txtTema');
    const html = document.documentElement;

    if (!btn || !ico || !txt) return;

    const aplicarTema = (isDark) => {
        if (isDark) {
            html.classList.add('dark');
            ico.textContent = '☀️';
            txt.textContent = 'MODO CLARO';
            btn.setAttribute('aria-pressed', 'true');
        } else {
            html.classList.remove('dark');
            ico.textContent = '🌙';
            txt.textContent = 'MODO NOTURNO';
            btn.setAttribute('aria-pressed', 'false');
        }
    };

    const temaSalvo = localStorage.getItem('theme');
    const prefereDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const iniciarDark = temaSalvo === 'dark' || (!temaSalvo && prefereDark);
    aplicarTema(iniciarDark);

    btn.addEventListener('click', () => {
        const virarDark = !html.classList.contains('dark');
        aplicarTema(virarDark);
        localStorage.setItem('theme', virarDark ? 'dark' : 'light');
    });
}

function inicializarCacheDOM() {
    const ids = [
        'txtDeviceId', 'txtSignal', 'txtDataAtual', 'txtTimestamp',
        'lblScoreNumero', 'lblScoreStatus', 'barScoreProgresso',
        'panelStatusGeral', 'txtStatusGeral',
        'valTemperature', 'statusTemp', 'cardTemp',
        'valHumidity', 'statusHum', 'cardHum',
        'valCO2', 'statusCO2', 'cardCO2',
        'valPontoOrvalho', 'statusOrvalho', 'cardOrvalho',
        'panelTriagemMassaQuantidade', 'alertaInfoCritico', 'panelTriagem'
    ];
    ids.forEach(id => {
        domElements[id] = document.getElementById(id);
    });
}

async function processarCicloMonitoramento() {
    try {
        if (!supabaseClient) return;
        const { data, error } = await supabaseClient
            .from('sensor_readings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;
        if (!data || data.length === 0) {
            exibirEstadoSemDados();
            return;
        }

        const registro = data[0];
        atualizarMetadadosDispositivo(registro);
        
        if (typeof window.AnalisarQualidadeAmbiental === 'function') {
            const analise = window.AnalisarQualidadeAmbiental(registro);
            renderizarDashboard(registro, analise);
        }
    } catch (err) {
        console.error('Erro no ciclo de monitoramento:', err);
    }
}

function exibirEstadoSemDados() {
    if (domElements.txtStatusGeral) {
        domElements.txtStatusGeral.textContent = "Sem dados de telemetria disponíveis";
    }
}

function atualizarMetadadosDispositivo(reg) {
    if (domElements.txtDeviceId) domElements.txtDeviceId.textContent = reg.deviceId || '--';
    if (domElements.txtSignal) domElements.txtSignal.textContent = reg.signalStrength ? `${reg.signalStrength} dBm` : '-- dBm';
    
    if (reg.created_at) {
        const dataObj = new Date(reg.created_at);
        if (domElements.txtDataAtual) {
            domElements.txtDataAtual.textContent = dataObj.toLocaleDateString('pt-BR');
        }
        if (domElements.txtTimestamp) {
            domElements.txtTimestamp.textContent = dataObj.toLocaleTimeString('pt-BR');
        }
    }
}

function renderizarDashboard(reg, analise) {
    atualizarComponenteScore(analise.score);
    atualizarBarraStatusGeral(analise.statusGeral, analise.subStatusGeral);
    
    atualizarCardMetrica('Temp', reg.temperature, '°C', analise.metricas.temperatura);
    atualizarCardMetrica('Hum', reg.humidity, '%', analise.metricas.umidade);
    atualizarCardMetrica('CO2', reg.co2, ' PPM', analise.metricas.co2);
    atualizarCardMetrica('Orvalho', analise.pontoOrvalho, '°C', analise.metricas.pontoOrvalho);

    renderizarPainelParticulas(reg, analise.metricas);
    
    if (domElements.alertaInfoCritico) {
        if (analise.statusGeral === STATUS_GERAL.CRITICO) {
            domElements.alertaInfoCritico.classList.remove('hidden');
        } else {
            domElements.alertaInfoCritico.classList.add('hidden');
        }
    }

    atualizarIndicadoresSintomas(analise.potenciaisSintomas);
    renderizarRecomendações(analise.planoMitigacao);
}

function atualizarComponenteScore(score) {
    if (domElements.lblScoreNumero) domElements.lblScoreNumero.textContent = score;
    if (domElements.barScoreProgresso) domElements.barScoreProgresso.style.width = `${score}%`;
    
    let corBorda = 'border-emerald-500';
    let corTexto = 'text-emerald-500';
    let bgScore = 'bg-emerald-500/5';
    let statusTexto = STATUS.EXCELENTE;

    if (score < 50) {
        corBorda = 'border-rose-500';
        corTexto = 'text-rose-500';
        bgScore = 'bg-rose-500/5';
        statusTexto = STATUS.CRITICO;
    } else if (score < 85) {
        corBorda = 'border-amber-500';
        corTexto = 'text-amber-500';
        bgScore = 'bg-amber-500/5';
        statusTexto = STATUS.ATENCAO;
    }

    if (domElements.lblScoreStatus) {
        domElements.lblScoreStatus.textContent = statusTexto;
        domElements.lblScoreStatus.className = `text-[9px] sm:text-[10px] font-black uppercase shrink-0 ${corTexto}`;
    }
    if (domElements.scoreContainer) {
        domElements.scoreContainer.className = `w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 flex flex-col items-center justify-center shrink-0 transition-all ${corBorda} ${bgScore}`;
    }
}

function atualizarBarraStatusGeral(status, substatus) {
    if (!domElements.panelStatusGeral || !domElements.txtStatusGeral) return;

    let cfg = {
        bg: 'bg-white dark:bg-slate-900',
        border: 'border-slate-200 dark:border-slate-800',
        texto: 'text-slate-500 dark:text-slate-400',
        icon: '🔬'
    };

    if (status === STATUS_GERAL.CONFORME) {
        cfg = { bg: 'bg-emerald-500/10 dark:bg-emerald-500/[0.03]', border: 'border-emerald-500/20', texto: 'text-emerald-600 dark:text-emerald-400', icon: '🛡️' };
    } else if (status === STATUS_GERAL.ATENCAO) {
        cfg = { bg: 'bg-amber-500/10 dark:bg-amber-500/[0.03]', border: 'border-amber-500/20', texto: 'text-amber-600 dark:text-amber-400', icon: '⚠️' };
    } else if (status === STATUS_GERAL.CRITICO) {
        cfg = { bg: 'bg-rose-500/10 dark:bg-rose-500/[0.03]', border: 'border-rose-500/20', texto: 'text-rose-600 dark:text-rose-400', icon: '🚨' };
    }

    domElements.panelStatusGeral.className = `md:col-span-7 rounded-2xl p-4 shadow-sm border transition-all duration-300 flex items-center justify-between gap-3 ${cfg.bg} ${cfg.border}`;
    
    domElements.txtStatusGeral.className = `text-xs font-black uppercase tracking-wider leading-tight ${cfg.texto}`;
    domElements.txtStatusGeral.innerHTML = `<span class="font-mono opacity-60 mr-1">[${status}]</span> ${substatus}`;
    
    const iconSlot = domElements.panelStatusGeral.querySelector('.icon-slot');
    if (iconSlot) iconSlot.textContent = cfg.icon;
}

function atualizarCardMetrica(sufixo, valor, unidade, status) {
    const mapa = {
        Temp: {
            valor: domElements.valTemperature,
            status: domElements.statusTemp,
            card: domElements.cardTemp
        },
        Hum: {
            valor: domElements.valHumidity,
            status: domElements.statusHum,
            card: domElements.cardHum
        },
        CO2: {
            valor: domElements.valCO2,
            status: domElements.statusCO2,
            card: domElements.cardCO2
        },
        Orvalho: {
            valor: domElements.valPontoOrvalho,
            status: domElements.statusOrvalho,
            card: domElements.cardOrvalho
        }
    };

    const elVal = mapa[sufixo]?.valor;
    const elStatus = mapa[sufixo]?.status;
    const elCard = mapa[sufixo]?.card;

    if (!elVal || !elStatus || !elCard) return;

    if (elVal) {
        const numero = Number(valor);
        const valFormatado = Number.isFinite(numero)
            ? numero.toFixed(1)
            : valor;
            
        if (valor !== undefined && valor !== null) {
            elVal.innerHTML = `${valFormatado}<span class="text-lg font-light opacity-40">${unidade}</span>`;
        } else {
            elVal.innerHTML = `--.-<span class="text-lg font-light opacity-40">${unidade}</span>`;
        }
    }

    let clsCard = 'border-transparent';
    let clsStatus = 'bg-slate-100 dark:bg-slate-800 text-slate-500';
    let txtStatus = 'ANALISANDO';

    if (status === STATUS_ENGINE.BOM) {
        clsCard = 'border-transparent';
        clsStatus = 'bg-emerald-500/10 text-emerald-500';
        txtStatus = 'CONFORME';
    } else if (status === STATUS_ENGINE.ALERTA) {
        clsCard = 'border-amber-500/30 dark:border-amber-500/20';
        clsStatus = 'bg-amber-500/10 text-amber-500';
        txtStatus = 'ATENÇÃO';
    } else if (status === STATUS_ENGINE.CRITICO) {
        clsCard = 'border-rose-500/30 dark:border-rose-500/20';
        clsStatus = 'bg-rose-500/10 text-rose-500';
        txtStatus = 'CRÍTICO';
    }

    if (elCard) elCard.className = `bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border-2 transition-all flex flex-col justify-between min-h-[125px] ${clsCard}`;
    if (elStatus) {
        elStatus.className = `text-[9px] font-black uppercase py-0.5 px-2 rounded w-fit ${clsStatus}`;
        elStatus.textContent = txtStatus;
    }
}

function renderizarPainelParticulas(reg, metricas) {
    const container = domElements.panelTriagemMassaQuantidade;
    if (!container) return;

    const dados = [
        { label: 'PM 0.5', massa: undefined, conta: reg.nc0_5, status: metricas.nc05 },
        { label: 'PM 1.0', massa: reg.pm1_0, conta: reg.nc1_0, status: metricas.nc10 },
        { label: 'PM 2.5', massa: reg.pm25, conta: reg.nc2_5, status: metricas.nc25 },
        { label: 'PM 10.0', massa: reg.pm10, conta: reg.nc10_0, status: metricas.nc100 }
    ];

    let html = `<div class="grid grid-cols-1 sm
