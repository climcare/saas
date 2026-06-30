
// ====================================================================
// CONFIGURAÇÃO DOS LIMITES OPERACIONAIS TÉCNICOS (ANVISA / NBR)
// ====================================================================
const NORMAS_QAI = {
    gases: {
        co2: { max: 1000 },    // ppm - Renovação do ar (Gás Carbônico)
        co: { max: 9.0 },      // ppm - Toxicidade imediata (Monóxido de Carbono)
        vocIndex: { max: 300 } // Índice - Carga química volátil (TVOC)
    },
    particulados: {
        pm25: { max: 15.0 },   // µg/m³ - Partículas finas respiráveis (OMS)
        pm10: { max: 50.0 }    // µg/m³ - Partículas grossas
    },
    contagem: {
        nc0_5: { max: 100 },   // pt/cm³ - Alerta para Faixa de Partículas Submicrométricas (Vírus e Bactérias)
        nc1_0: { max: 150 },   // pt/cm³ - Alerta para Fumaça/Aerossóis (Fumaça e Fuligem)
        nc2_5: { max: 200 },   // pt/cm³ - Alerta para Particulado Fino Interno (Poeira Fina)
        nc10_0: { max: 50 }    // pt/cm³ - Alerta para Alérgenos Grandes (Poeira, Ácaros e Pólen)
    },
    conforto: {
        temperature: { min: 20.0, max: 24.0 }, // °C - Faixa operacional padrão
        humidity: { min: 40.0, max: 65.0 }      // % - Controle microbiológico
    }
};

const TITULO_RESUMO_ANALISE =
    "Resumo da Análise Ambiental";

// ====================================================================
// MOTOR DE CÁLCULO: MATRIZ DE MAGNUS-TETENS (PONTO DE ORVALHO)
// ====================================================================
function calcularPontoOrvalho(t, rh) {
    const a = 17.625;
    const b = 243.04;

    if (rh <= 0 || rh > 100 || isNaN(t) || isNaN(rh)) return 0;

    const alfa = ((a * t) / (b + t)) + Math.log(rh / 100);
    const pontoOrvalho = (b * alfa) / (a - alfa);

    return parseFloat(pontoOrvalho.toFixed(1));
}

// ====================================================================
// MOTOR DE CÁLCULO CONTÍNUO + INJEÇÃO DE SINTOMAS CLÍNICOS
// ====================================================================
function calcularScoreQAI(leitura, analiseIndividual) {
    const temp = Number(leitura.temperature || 0);
    const hum = Number(leitura.humidity || 0);
    const co2 = Number(leitura.co2 || 0);
    const co = Number(leitura.co || 0);
    const voc = Number(leitura.vocIndex || 0);
    const pm25 = Number(leitura.pm25 || 0);
    const pm10 = Number(leitura.pm10 || 0);
    const nc05 = Number(leitura.nc0_5 || 0);
    const nc10 = Number(leitura.nc1_0 || 0);
    const nc100 = Number(leitura.nc10_0 || 0);

    let notaGases = 100;
    if (co2 > 700) notaGases -= (co2 - 700) * 0.12;
    if (co > 0) notaGases -= (co / NORMAS_QAI.gases.co.max) * 50;
    if (voc > NORMAS_QAI.gases.vocIndex.max) notaGases -= (voc - NORMAS_QAI.gases.vocIndex.max) * 0.2;
    notaGases = Math.max(0, Math.min(100, notaGases));

    let notaPoluentes = 100;
    if (pm25 > 0) notaPoluentes -= (pm25 / NORMAS_QAI.particulados.pm25.max) * 30;
    if (pm10 > 0) notaPoluentes -= (pm10 / NORMAS_QAI.particulados.pm10.max) * 15;
    if (nc05 > NORMAS_QAI.contagem.nc0_5.max) notaPoluentes -= 25;
    if (nc10 > NORMAS_QAI.contagem.nc1_0.max) notaPoluentes -= 15;
    if (nc100 > NORMAS_QAI.contagem.nc10_0.max) notaPoluentes -= 15;
    if (hum > 65) notaPoluentes -= (hum - 65) * 1.5;
    notaPoluentes = Math.max(0, Math.min(100, notaPoluentes));

    let notaConforto = 100;
    if (temp < 20 || temp > 24) notaConforto -= Math.abs(temp - 22) * 15;
    if (hum < 40 || hum > 65) notaConforto -= Math.abs(hum - 52.5) * 1.5;
    notaConforto = Math.max(0, Math.min(100, notaConforto));

    let scoreCalculado = (notaConforto * 0.25) + (notaGases * 0.35) + (notaPoluentes * 0.40);

    const piorCenarioMapeado = Math.min(notaConforto, notaGases, notaPoluentes);

    const possuiCritico = analiseIndividual.co2 === "CRÍTICO" ||
        analiseIndividual.temperatura === "CRÍTICO" ||
        analiseIndividual.nc05 === "CRÍTICO" ||
        co > NORMAS_QAI.gases.co.max ||
        pm25 > NORMAS_QAI.particulados.pm25.max;

    const possuiAlerta = analiseIndividual.co2 === "ALERTA" ||
        analiseIndividual.temperatura === "ALERTA" ||
        analiseIndividual.umidade === "ALERTA" ||
        analiseIndividual.nc10 === "ALERTA" ||
        analiseIndividual.nc25 === "ALERTA" ||
        analiseIndividual.nc100 === "ALERTA" ||
        voc > NORMAS_QAI.gases.vocIndex.max ||
        pm10 > NORMAS_QAI.particulados.pm10.max;

    if (possuiCritico || piorCenarioMapeado <= 45) {
        scoreCalculado = Math.min(scoreCalculado, 49);
    } else if (possuiAlerta || piorCenarioMapeado <= 72) {
        scoreCalculado = Math.min(scoreCalculado, 75);
    }

    return {
        scoreGeral: Math.max(0, Math.min(100, Math.round(scoreCalculado))),
        sintomas: {
            fadiga: Math.round(100 - notaGases),
            alergia: Math.round(100 - notaPoluentes),
            desconforto: Math.round(100 - notaConforto)
        }
    };
}

// ====================================================================
// ENGINE DE AVALIAÇÃO E FILTRAGEM DE VIOLAÇÕES SANITÁRIAS
// ====================================================================
function analisarLeituraQAI(leitura) {
    const co2Val = Number(leitura.co2 || 0);
    const coVal = Number(leitura.co || 0);
    const vocVal = Number(leitura.vocIndex || 0);
    const pm25Val = Number(leitura.pm25 || 0);
    const pm10Val = Number(leitura.pm10 || 0);
    const nc05Val = Number(leitura.nc0_5 || 0);
    const nc10Val = Number(leitura.nc1_0 || 0);
    const nc25Val = Number(leitura.nc2_5 || 0);
    const nc100Val = Number(leitura.nc10_0 || 0);
    const temp = Number(leitura.temperature || 0);
    const hum = Number(leitura.humidity || 0);

    const diagnostico = {
        dispositivoId: leitura.deviceId || leitura.device_id,
        carimbotempo: leitura.created_at || new Date().toISOString(),
        statusGeral: "CONFORME",
        scoreGeral: 100,
        pontoOrvalho: 0,
        violacoes: [],
        valoresAtuais: {},
        telemetriaAvancada: {},
        analiseIndividual: {},
        sintomas: {
            fadiga: 0,
            alergia: 0,
            desconforto: 0
        },
        conclusaoTecnica: {
            tipo: "conclusao",
            titulo: TITULO_RESUMO_ANALISE,
            texto: ""
        },
        corStatus:
            "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
    };

    if (!isNaN(temp) && !isNaN(hum)) {
        diagnostico.pontoOrvalho = calcularPontoOrvalho(temp, hum);
    }

    if (co2Val > NORMAS_QAI.gases.co2.max) {
        diagnostico.violacoes.push({
            parametro: "CO2", valor: co2Val, limite: NORMAS_QAI.gases.co2.max, unidade: "ppm", gravidade: "ATENÇÃO",
            mensagem: "Taxa de renovação de ar insuficiente. Alta concentração de bioefluentes humanos no ambiente."
        });
    }

    if (coVal > NORMAS_QAI.gases.co.max) {
        diagnostico.violacoes.push({
            parametro: "CO", valor: coVal, limite: NORMAS_QAI.gases.co.max, unidade: "ppm", gravidade: "CRÍTICO",
            mensagem: "Monóxido de Carbono acima do limite de segurança. Risco severo de asfixia química e toxicidade arterial."
        });
    }

    if (vocVal > NORMAS_QAI.gases.vocIndex.max) {
        diagnostico.violacoes.push({
            parametro: "VOC", valor: vocVal, limite: NORMAS_QAI.gases.vocIndex.max, unidade: "", gravidade: "ATENÇÃO",
            mensagem: "Concentração elevada de Compostos Orgânicos Voláteis. Indício de saturação por produtos de limpeza ou solventes."
        });
    }

    if (pm25Val > NORMAS_QAI.particulados.pm25.max) {
        diagnostico.violacoes.push({
            parametro: "PM2.5", valor: pm25Val, limite: NORMAS_QAI.particulados.pm25.max, unidade: "µg/m³", gravidade: "CRÍTICO",
            mensagem: "Partículas ultrafinas em nível perigoso. Risco de transporte de patógenos e saturação de vias respiratórias."
        });
    }

    if (pm10Val > NORMAS_QAI.particulados.pm10.max) {
        diagnostico.violacoes.push({
            parametro: "PM10", valor: pm10Val, limite: NORMAS_QAI.particulados.pm10.max, unidade: "µg/m³", gravidade: "ATENÇÃO",
            mensagem: "Partículas grossas em suspensão acima do limite normativo de purificação mecânica diária."
        });
    }

    if (nc05Val > NORMAS_QAI.contagem.nc0_5.max) {
        diagnostico.violacoes.push({
            parametro: "NC0.5", valor: nc05Val.toFixed(0), limite: NORMAS_QAI.contagem.nc0_5.max, unidade: " pt/cm³", gravidade: "CRÍTICO",
            mensagem: "Altíssima quantidade de micropartículas compatíveis com tamanho de vírus e bactérias em suspensão aeroespacial."
        });
    }

    if (nc10Val > NORMAS_QAI.contagem.nc1_0.max) {
        diagnostico.violacoes.push({
            parametro: "NC1.0", valor: nc10Val.toFixed(0), limite: NORMAS_QAI.contagem.nc1_0.max, unidade: " pt/cm³", gravidade: "ATENÇÃO",
            mensagem: "Densidade excessiva de partículas com o perfil molecular de fumaça, fuligem industrial ou aerosóis secos."
        });
    }

    if (nc100Val > NORMAS_QAI.contagem.nc10_0.max) {
        diagnostico.violacoes.push({
            parametro: "NC10.0", valor: nc100Val.toFixed(0), limite: NORMAS_QAI.contagem.nc10_0.max, unidade: " pt/cm³", gravidade: "ATENÇÃO",
            mensagem: "Presença física massiva de alérgenos pesados como fezes de ácaros domésticos, esporos de mofo ou grãos de pólen."
        });
    }

    if (temp < NORMAS_QAI.conforto.temperature.min || temp > NORMAS_QAI.conforto.temperature.max) {
        diagnostico.violacoes.push({
            parametro: "Temperatura", valor: temp, limite: `${NORMAS_QAI.conforto.temperature.min}-${NORMAS_QAI.conforto.temperature.max}`, unidade: "°C", gravidade: "ATENÇÃO",
            mensagem: "Gradiente térmico fora da faixa operacional recomendada para estabilidade metabólica e conforto."
        });
    }

    if (hum < NORMAS_QAI.conforto.humidity.min || hum > NORMAS_QAI.conforto.humidity.max) {
        diagnostico.violacoes.push({
            parametro: "Umidade", valor: hum, limite: `${NORMAS_QAI.conforto.humidity.min}-${NORMAS_QAI.conforto.humidity.max}`, unidade: "%", gravidade: "ATENÇÃO",
            mensagem: "Umidade relativa inadequada. Níveis altos aceleram mofo/fungos; níveis baixos ressecam mucosas protetoras."
        });
    }

    const possuiCritico = diagnostico.violacoes.some(v => v.gravidade === "CRÍTICO");
    const possuiAtencao = diagnostico.violacoes.some(v => v.gravidade === "ATENÇÃO");

    if (possuiCritico) {
        diagnostico.statusGeral = "CRÍTICO";
        diagnostico.corStatus = "bg-rose-500/10 border-rose-500/20 text-rose-500 dark:text-rose-400";
    } else if (possuiAtencao) {
        diagnostico.statusGeral = "ATENÇÃO";
        diagnostico.corStatus = "bg-amber-500/10 border-amber-500/20 text-amber-500 dark:text-amber-400";
    }

    diagnostico.valoresAtuais = {
        temperature: temp,
        humidity: hum,
        co2: co2Val,
        co: coVal,
        vocIndex: vocVal,
        pm25: pm25Val,
        pm10: pm10Val
    };

    diagnostico.telemetriaAvancada = {
        contagemParticulas: {
            nc0_5: nc05Val,
            nc1_0: nc10Val,
            nc2_5: nc25Val,
            nc10_0: nc100Val
        },
        tamanhoTipico: leitura.typicalSize || leitura.typical_size || leitura.tps || leitura.bpt || 0.45,
        sinalRede: leitura.signalStrength || leitura.signal || -65,
        nox: leitura.noxIndex || leitura.nox_index || 0
    };

    diagnostico.analiseIndividual = {
        temperatura: (temp >= NORMAS_QAI.conforto.temperature.min && temp <= NORMAS_QAI.conforto.temperature.max) ? "BOM" : (temp > 26) ? "CRÍTICO" : "ALERTA",
        umidade: (hum >= NORMAS_QAI.conforto.humidity.min && hum <= NORMAS_QAI.conforto.humidity.max) ? "BOM" : "ALERTA",
        co2: (co2Val <= 800) ? "BOM" : (co2Val > NORMAS_QAI.gases.co2.max) ? "CRÍTICO" : "ALERTA",
        nc05: (nc05Val <= NORMAS_QAI.contagem.nc0_5.max) ? "BOM" : "CRÍTICO",
        nc10: (nc10Val <= NORMAS_QAI.contagem.nc1_0.max) ? "BOM" : "ALERTA",
        nc25: (nc25Val <= NORMAS_QAI.contagem.nc2_5.max) ? "BOM" : "ALERTA",
        nc100: (nc100Val <= NORMAS_QAI.contagem.nc10_0.max) ? "BOM" : "ALERTA"
    };

    const resultadoCalculo = calcularScoreQAI(leitura, diagnostico.analiseIndividual);

    diagnostico.scoreGeral = resultadoCalculo.scoreGeral;
    diagnostico.sintomas = resultadoCalculo.sintomas;

    diagnostico.conclusaoTecnica =
        gerarConclusaoTecnica(diagnostico);

    return diagnostico;
}

function gerarConclusaoTecnica(diagnostico) {
    const possuiCO =
        diagnostico.violacoes.some(v => v.parametro === "CO");

    const possuiCO2 =
        diagnostico.violacoes.some(v => v.parametro === "CO2");

    const possuiVOC =
        diagnostico.violacoes.some(v => v.parametro === "VOC");

    const possuiPM25 =
        diagnostico.violacoes.some(v => v.parametro === "PM2.5");

    const possuiPM10 =
        diagnostico.violacoes.some(v => v.parametro === "PM10");

    const possuiNC05 =
        diagnostico.violacoes.some(v => v.parametro === "NC0.5");

    const possuiNC10 =
        diagnostico.violacoes.some(v => v.parametro === "NC1.0");

    const possuiNC100 =
        diagnostico.violacoes.some(v => v.parametro === "NC10.0");

    const possuiUmidade =
        diagnostico.violacoes.some(v => v.parametro === "Umidade");

    const possuiTemperatura =
        diagnostico.violacoes.some(v => v.parametro === "Temperatura");

    const possuiMaterialParticulado =
        possuiPM25 ||
        possuiPM10 ||
        possuiNC05 ||
        possuiNC10 ||
        possuiNC100;

    if (possuiCO) {
        return {
            tipo: "co",
            titulo: TITULO_RESUMO_ANALISE,
            texto:
                "Foi identificada concentração de Monóxido de Carbono acima do nível seguro. Recomenda-se interromper a ocupação do ambiente até a eliminação da fonte emissora."
        };
    }

    if (possuiMaterialParticulado) {
        return {
            tipo: "particulas",
            titulo: TITULO_RESUMO_ANALISE,
            texto:
                "A análise identificou aumento da concentração de partículas em suspensão. Esse comportamento indica degradação da qualidade do ar e recomenda investigação das possíveis fontes emissoras."
        };
    }

    if (possuiCO2) {
        return {
            tipo: "co2",
            titulo: TITULO_RESUMO_ANALISE,
            texto:
                "O principal fator identificado foi a renovação insuficiente do ar. A concentração elevada de CO₂ indica acúmulo do ar exalado pelos ocupantes e redução da qualidade ambiental."
        };
    }

    if (possuiVOC) {
        return {
            tipo: "voc",
            titulo: TITULO_RESUMO_ANALISE,
            texto:
                "A análise identificou aumento da concentração de Compostos Orgânicos Voláteis. Esse comportamento pode indicar acúmulo de produtos químicos presentes no ambiente."
        };
    }

    if (possuiUmidade) {
        return {
            tipo: "umidade",
            titulo: TITULO_RESUMO_ANALISE,
            texto:
                "A análise identificou condições favoráveis à umidade excessiva. Esse cenário aumenta a probabilidade de condensação, mofo e degradação do ambiente."
        };
    }

    if (possuiTemperatura) {
        return {
            tipo: "temperatura",
            titulo: TITULO_RESUMO_ANALISE,
            texto:
                "A análise identificou temperatura fora da faixa recomendada para este ambiente. Esse comportamento reduz o conforto térmico dos ocupantes."
        };
    }

    return {
        tipo: "conforme",
        titulo: TITULO_RESUMO_ANALISE,
        texto:
            "Os parâmetros monitorados encontram-se dentro das referências adotadas para este ambiente. Nenhuma anomalia relevante foi identificada."
    };
}
